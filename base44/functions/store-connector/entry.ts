import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { json, err } from "../../shared/http.ts";
import {
  requireStoreImportAdmin, StorePlatform, ConnectionStatus,
  STORE_PLATFORM_VALUES,
} from "../../shared/store-import.ts";

/**
 * StoreConnectorService (ADR-046 Phase 1, Section 2 — Shopify Connector). [redeploy]
 *
 * Admin-only (Phase 1 feature flag). Two surfaces:
 *
 *  1. JSON action handlers (POST, admin-authenticated):
 *     - connectStore: create a BusinessStoreConnection (unverified) + start the
 *       Shopify OAuth flow (generates oauth_state, returns the authorize URL).
 *     - listConnections / getConnection / disconnectStore.
 *
 *  2. Shopify OAuth callback (GET, no user auth — verified by oauth_state):
 *     - verifyStoreOwnership: exchanges the Shopify code for an access token,
 *       fetches shop info, marks the connection verified.
 *
 * The callback is a webhook-style endpoint: anyone can reach it, so the oauth_state
 * token (a random UUID only the admin-initiated connectStore could have written)
 * is the authenticity boundary — NOT user auth. A mismatched/missing state is
 * rejected before any secret is touched.
 *
 * Credential-dependent path (the real Shopify OAuth round-trip) requires
 * SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET to be set. When unset, connectStore
 * still creates the connection but returns credentials_configured=false, and the
 * callback returns a 503 credentials-not-configured page — so the connector is
 * fully exercisable for credential-independent regression.
 */

const SHOPIFY_SCOPES = "read_products,read_product_listings";
const SHOPIFY_API_VERSION = "2024-01";

function normalizeDomain(d: string): string {
  return String(d || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function validShopifyDomain(d: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d);
}

function defaultRedirectUri(): string {
  return "https://hondahub-au-claude-app.base44.app/functions/store-connector";
}

function htmlPage(title: string, message: string, isError: boolean): string {
  const color = isError ? "#dc2626" : "#22c55e";
  const icon = isError ? "⚠️" : "✅";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HondaHub Store Import</title></head><body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b0b0d;color:#fafafa"><div style="max-width:440px;text-align:center;padding:24px"><div style="font-size:44px;margin-bottom:12px">${icon}</div><h1 style="font-size:20px;margin:0 0 8px;color:${color}">${title}</h1><p style="color:#a1a1aa;line-height:1.5">${message}</p><p style="margin-top:18px"><a href="/admin/store-import" style="color:#e11d48;font-weight:600">Back to Store Import</a></p></div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    // ============ Shopify OAuth callback (browser GET — no user auth) ============
    if (method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const shop = url.searchParams.get("shop");
      if (!code || !state) {
        return new Response(htmlPage("Connection failed", "Missing OAuth parameters (code/state).", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const base44 = createClientFromRequest(req);
      const conns = await base44.asServiceRole.entities.BusinessStoreConnection.filter({ oauth_state: state });
      if (!conns.length) {
        return new Response(htmlPage("Connection failed", "Invalid or expired OAuth state. No matching pending connection.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const conn = conns[0];
      const normalizedShop = normalizeDomain(shop || "");
      if (normalizedShop && normalizedShop !== conn.store_domain) {
        return new Response(htmlPage("Connection failed", "Shop mismatch — the redirecting shop does not match this connection.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const clientId = secrets.get("SHOPIFY_CLIENT_ID");
      const clientSecret = secrets.get("SHOPIFY_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return new Response(htmlPage("Not configured", "Shopify credentials are not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, then retry the connection.", true), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Exchange the authorization code for a permanent access token.
      const tokenRes = await fetch(`https://${conn.store_domain}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      if (!tokenRes.ok) {
        const txt = await tokenRes.text().catch(() => "");
        return new Response(htmlPage("Connection failed", `Shopify token exchange failed (${tokenRes.status}). ${txt.slice(0, 200)}`, true), { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const tokenJson: any = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        return new Response(htmlPage("Connection failed", "Shopify response did not contain an access token.", true), { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Fetch shop info to confirm the token and enrich store_name + shopify_shop_id.
      let shopName: string | null = conn.store_name || null;
      let shopId: string | null = conn.shopify_shop_id || null;
      try {
        const shopInfoRes = await fetch(`https://${conn.store_domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
          headers: { "X-Shopify-Access-Token": accessToken, "Accept": "application/json" },
        });
        if (shopInfoRes.ok) {
          const shopInfo: any = await shopInfoRes.json();
          shopName = shopInfo?.shop?.name || shopName;
          shopId = shopInfo?.shop?.id != null ? String(shopInfo.shop.id) : shopId;
        }
      } catch {}
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.BusinessStoreConnection.update(conn.id, {
        connection_status: ConnectionStatus.VERIFIED,
        ownership_verified_at: now,
        ownership_verification_method: "shopify_oauth",
        shopify_access_token: accessToken,
        shopify_shop_id: shopId,
        store_name: shopName,
        oauth_state: null,
      });
      return new Response(htmlPage("Store connected", "Your Shopify store is now verified and ready for import.", false), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ============ JSON action handlers (POST, admin-only) ============
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const guard = requireStoreImportAdmin(user);
    if (guard) return guard;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- connectStore ----
    if (action === "connectStore") {
      const { business_id, platform, store_domain } = body;
      if (!business_id) return err("VALIDATION_FAILED", 422, { business_id: "required" });
      if (!STORE_PLATFORM_VALUES.includes(platform)) return err("VALIDATION_FAILED", 422, { platform: "invalid" });
      const domain = normalizeDomain(store_domain);
      if (!domain) return err("VALIDATION_FAILED", 422, { store_domain: "required" });
      if (platform === StorePlatform.SHOPIFY && !validShopifyDomain(domain)) {
        return err("VALIDATION_FAILED", 422, { store_domain: "must be a *.myshopify.com domain" });
      }
      // Validate the business exists.
      const business = await base44.asServiceRole.entities.Business.get(business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404, { business_id: "not found" });
      // Duplicate check: one active (non-disconnected) connection per business+platform+domain.
      const existing = await base44.entities.BusinessStoreConnection.filter({ business_id, platform, store_domain: domain });
      const active = existing.find((c: any) => c.connection_status !== ConnectionStatus.DISCONNECTED);
      if (active) return err("CONNECTION_ALREADY_EXISTS", 409, { connection_id: active.id, connection_status: active.connection_status });
      // Create the unverified connection + start the OAuth flow.
      const oauthState = crypto.randomUUID();
      const conn = await base44.entities.BusinessStoreConnection.create({
        business_id, platform, store_domain: domain,
        connection_status: ConnectionStatus.UNVERIFIED,
        sync_status: "idle",
        oauth_state: oauthState,
      });
      // Build the Shopify authorize URL only if the client ID is configured.
      const clientId = secrets.get("SHOPIFY_CLIENT_ID");
      const redirectUri = secrets.get("SHOPIFY_REDIRECT_URI") || defaultRedirectUri();
      let authorize_url: string | null = null;
      let credentials_configured = false;
      if (platform === StorePlatform.SHOPIFY) {
        if (clientId) {
          credentials_configured = true;
          authorize_url = `https://${domain}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(oauthState)}`;
        }
      }
      return json({ ok: true, connection_id: conn.id, connection: conn, authorize_url, credentials_configured });
    }

    // ---- listConnections ----
    if (action === "listConnections") {
      const filter: any = {};
      if (body.business_id) filter.business_id = body.business_id;
      if (body.platform && STORE_PLATFORM_VALUES.includes(body.platform)) filter.platform = body.platform;
      const conns = await base44.entities.BusinessStoreConnection.filter(filter, "-created_date", 200);
      return json({ ok: true, connections: conns });
    }

    // ---- getConnection ----
    if (action === "getConnection") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await base44.entities.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      return json({ ok: true, connection: conn });
    }

    // ---- disconnectStore ----
    if (action === "disconnectStore") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await base44.entities.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      const updated = await base44.entities.BusinessStoreConnection.update(connection_id, {
        connection_status: ConnectionStatus.DISCONNECTED,
        shopify_access_token: null,
        shopify_shop_id: null,
        woocommerce_consumer_key: null,
        woocommerce_consumer_secret: null,
        oauth_state: null,
      });
      return json({ ok: true, connection: updated });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, 500);
  }
});