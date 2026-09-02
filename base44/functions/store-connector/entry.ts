import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { json, err } from "../../shared/http.ts";
import {
  requireStoreImportAdmin, StorePlatform, ConnectionStatus,
  STORE_PLATFORM_VALUES,
} from "../../shared/store-import.ts";
import { encryptToken } from "../../shared/store-crypto.ts";

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
 *
 * The access token is encrypted with STORE_TOKEN_ENC_KEY before it is persisted
 * (shared/store-crypto.ts), as BusinessStoreConnection's schema requires. The
 * callback fails closed with a 503 when that secret is absent rather than
 * falling back to storing the token in plaintext.
 *
 * OAuth state consumption is FAIL-CLOSED: the state is cleared BEFORE the
 * authorization code is exchanged, so a failed exchange cannot leave a
 * replayable state alive for the remainder of its TTL. The cost is that a
 * transient exchange failure requires restarting the connection, which is one
 * click. Base44 exposes no atomic compare-and-set, so two callbacks arriving in
 * the same instant can both pass the state lookup before either clears it; that
 * residual race is narrowed to the width of a single entity update, and
 * Shopify's authorization codes are themselves single-use. It is not eliminated,
 * and this comment exists so nobody assumes otherwise.
 */

const SHOPIFY_SCOPES = "read_products"; // Read-only: product catalog access for Phase 1 import. No write scopes.
const SHOPIFY_API_VERSION = "2024-01";
// OAuth state must be short-lived (ADR-046 §2). 10 minutes measured from
// `oauth_state_created_at` — the exact moment the state was generated — NOT from
// the connection's created_date, which may predate the OAuth attempt whenever a
// state is re-issued on an existing row. Expired state is rejected in the
// callback before any secret is touched.
const STATE_TTL_MS = 10 * 60 * 1000;

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

// Shopify HMAC verification (official mechanism): the OAuth callback is
// unauthenticated, so the HMAC signature — computed by Shopify over the
// callback query params with the app secret — is what proves the params were
// not tampered with. Verified with the secret BEFORE the authorization code is
// exchanged. Timing-safe comparison. Returns false if hmac is missing/invalid.
async function verifyShopifyHmac(url: URL, apiSecret: string): Promise<boolean> {
  const params = new URLSearchParams(url.search);
  const hmac = params.get("hmac");
  if (!hmac) return false;
  // Shopify excludes both `hmac` and the legacy `signature` from the signed
  // canonical string; leaving `signature` in would fail verification whenever
  // Shopify sends it.
  params.delete("hmac");
  params.delete("signature");
  const queryString = [...params.keys()].sort().map((k) => `${k}=${params.get(k)}`).join("&");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(queryString));
  const digest = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (digest.length !== hmac.length) return false;
  const a = enc.encode(digest), b = enc.encode(hmac);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Strip sensitive credentials from any connection object returned to the
// frontend. Access tokens / API keys live only in backend storage (admin-only
// RLS) and are used server-side for sync — never exposed to the client or logs.
function sanitizeConnection(c: any): any {
  if (!c) return c;
  const { shopify_access_token, woocommerce_consumer_key, woocommerce_consumer_secret, ...rest } = c;
  return rest;
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
      // Required params — shop is mandatory (bound to the connection, never
      // trusted from the query alone). No business_id/owner/connection id is
      // accepted from the query; identity comes only from the stored state record.
      if (!code || !state || !shop) {
        return new Response(htmlPage("Connection failed", "Missing OAuth parameters (code/state/shop).", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const base44 = createClientFromRequest(req);
      const conns = await base44.asServiceRole.entities.BusinessStoreConnection.filter({ oauth_state: state });
      if (!conns.length) {
        return new Response(htmlPage("Connection failed", "Invalid or expired OAuth state. No matching pending connection.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const conn = conns[0];
      // Single-use: a null oauth_state means the flow was already completed or
      // invalidated — reject any replay. (The filter above already excludes
      // null states, so this is a belt-and-braces guard.)
      if (!conn.oauth_state) {
        return new Response(htmlPage("Connection failed", "This OAuth state has already been used.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Short-lived: reject state older than STATE_TTL_MS, measured from the
      // moment the state was generated. A row carrying a state but no
      // oauth_state_created_at cannot have its age established, so it is
      // rejected rather than falling back to created_date.
      const issuedAtRaw = conn.oauth_state_created_at ? Date.parse(conn.oauth_state_created_at) : NaN;
      if (!Number.isFinite(issuedAtRaw) || Date.now() - issuedAtRaw > STATE_TTL_MS) {
        return new Response(htmlPage("Connection failed", "OAuth state expired. Please restart the connection.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Bind the callback to the exact shop that initiated the flow — the
      // query shop must match the connection's stored domain. The token
      // exchange always targets conn.store_domain (never the query shop).
      const normalizedShop = normalizeDomain(shop);
      if (normalizedShop !== conn.store_domain) {
        return new Response(htmlPage("Connection failed", "Shop mismatch — the redirecting shop does not match this connection.", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      const clientId = secrets.get("SHOPIFY_CLIENT_ID");
      const clientSecret = secrets.get("SHOPIFY_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return new Response(htmlPage("Not configured", "Shopify credentials are not configured. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, then retry the connection.", true), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // The access token must be encrypted at rest. Without the key we fail
      // closed BEFORE the exchange rather than obtaining a live token we would
      // have to store in plaintext.
      const encKey = secrets.get("STORE_TOKEN_ENC_KEY");
      if (!encKey) {
        return new Response(htmlPage("Not configured", "Credential encryption is not configured. Set the STORE_TOKEN_ENC_KEY app secret, then retry the connection.", true), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Verify Shopify's HMAC signature over the callback params (official
      // mechanism) BEFORE exchanging the code. Tampered/unsigned requests are
      // rejected. Requires the secret (checked above).
      const hmacOk = await verifyShopifyHmac(url, clientSecret);
      if (!hmacOk) {
        return new Response(htmlPage("Connection failed", "Invalid callback signature (HMAC verification failed).", true), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      // Consume the state BEFORE the exchange (fail-closed). Once cleared, this
      // callback cannot be replayed even if the exchange below fails — the cost
      // is that the admin restarts the connection, which is one click. Doing
      // this after the exchange would leave a captured callback replayable for
      // the remainder of the TTL.
      await base44.asServiceRole.entities.BusinessStoreConnection.update(conn.id, {
        oauth_state: null,
        oauth_state_created_at: null,
      });
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
        // AES-GCM ciphertext, never the plaintext token (see store-crypto.ts).
        shopify_access_token: await encryptToken(accessToken, encKey),
        shopify_shop_id: shopId,
        store_name: shopName,
        oauth_state: null,
        oauth_state_created_at: null,
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
        // Stamped at state generation — this, not created_date, is what the
        // callback measures the 10-minute TTL against.
        oauth_state_created_at: new Date().toISOString(),
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
      return json({ ok: true, connection_id: conn.id, connection: sanitizeConnection(conn), authorize_url, credentials_configured });
    }

    // ---- listConnections ----
    if (action === "listConnections") {
      const filter: any = {};
      if (body.business_id) filter.business_id = body.business_id;
      if (body.platform && STORE_PLATFORM_VALUES.includes(body.platform)) filter.platform = body.platform;
      const conns = await base44.entities.BusinessStoreConnection.filter(filter, "-created_date", 200);
      return json({ ok: true, connections: conns.map(sanitizeConnection) });
    }

    // ---- getConnection ----
    if (action === "getConnection") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await base44.entities.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      return json({ ok: true, connection: sanitizeConnection(conn) });
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
        oauth_state_created_at: null,
      });
      return json({ ok: true, connection: sanitizeConnection(updated) });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, 500);
  }
});