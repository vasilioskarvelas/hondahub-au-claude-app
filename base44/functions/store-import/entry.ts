import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { json, err } from "../../shared/http.ts";
import {
  requireBusinessStoreAccess, accessibleBusinessIds, canAccessBusiness,
  ConnectionStatus, SyncStatus, ImportItemStatus,
  StorePlatform, SYNC_MAX_PRODUCTS, SYNC_FETCH_TIMEOUT_MS,
  mapShopifyProduct, detectDuplicate, stageStatus,
} from "../../shared/store-import.ts";
import { normaliseWebsite, fingerprintPlatform, recommendImportMethod } from "../../shared/platform-detect.ts";
import { decryptToken } from "../../shared/store-crypto.ts";
import { createImportedListing } from "../../shared/marketplace.ts";

/**
 * StoreImportService (ADR-046 Phase 1 — product import pipeline).
 *
 * Admin-only (Phase 1 feature flag), same gate as StoreConnectorService.
 *
 * Actions:
 *   - startSync     : begin a sync on a VERIFIED connection; stages the first page.
 *   - continueSync  : stage the next page of an in-progress sync.
 *   - cancelSync    : request cancellation; the next batch stops cleanly.
 *   - listImportItems / getImportItem
 *   - approveItem   : create a DRAFT MarketplaceListing via the approved path.
 *   - rejectItem
 *
 * Sync is PAGINATED ACROSS INVOCATIONS rather than looping to completion in one
 * request. A store with hundreds of products would otherwise risk hitting the
 * function timeout partway through, leaving state inconsistent. Each call stages
 * one Shopify page, persists `sync_cursor`, and returns `has_more`; the caller
 * repeats until it is false. This is what the entity's sync_cursor/sync_status
 * fields were designed for.
 *
 * Concurrency: one active sync per connection, guarded by current_sync_run_id.
 * Every state write re-checks that the run id still matches, so a stale worker
 * cannot overwrite a newer run's progress. Base44 offers no atomic
 * compare-and-set, so two syncs started in the same instant could both pass the
 * initial check; the guard narrows that window but does not close it.
 *
 * Publication: approving an item creates a listing in DRAFT. Nothing here ever
 * publishes to the marketplace — that stays a separate, explicit human act.
 */

const SHOPIFY_API_VERSION = "2024-01";
const PAGE_SIZE = 250;

function nowIso(): string {
  return new Date().toISOString();
}

/** Fetch with a hard timeout so a hanging store cannot wedge the function. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SYNC_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the `page_info` cursor from Shopify's Link header, if any. */
function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const next = linkHeader.split(",").map((s) => s.trim()).find((s) => s.endsWith('rel="next"'));
  if (!next) return null;
  const url = (next.match(/<([^>]+)>/) || [])[1];
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("page_info");
  } catch {
    return null;
  }
}

/** Resolve the import poster: the business's active owner (ADR-046 Decision 1). */
async function resolvePosterId(base44: any, businessId: string): Promise<string | null> {
  if (!businessId) return null;
  const memberships = await base44.asServiceRole.entities.BusinessMembership.filter({
    business_id: businessId, role: "owner", status: "active",
  });
  return memberships.length ? memberships[0].user_id : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const guard = await requireBusinessStoreAccess(base44, user);
    if (guard) return guard;
    // Resolved once per request; every resource touched below is checked against
    // it, so a member of business A can never reach business B's data.
    const allowed = await accessibleBusinessIds(base44, user);

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const S = base44.asServiceRole.entities;

    // ---- detectPlatform ----
    // Scans a business's website and reports the fastest import route available.
    // Read-only and side-effect free: it stores nothing and creates no connection.
    if (action === "detectPlatform") {
      const site = normaliseWebsite(body.website);
      if (!site) return err("VALIDATION_FAILED", 422, { website: "enter a valid website address" });
      let res: Response;
      try {
        res = await fetchWithTimeout(site, {
          redirect: "follow",
          headers: {
            // Identify honestly rather than impersonating a browser.
            "User-Agent": "HondaHubStoreImport/1.0 (+https://hondahub-au-claude-app.base44.app)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
      } catch (e) {
        return json({
          ok: true, reachable: false, website: site,
          message: `Could not reach ${site}. Check the address, or upload a product spreadsheet instead.`,
          detail: String(e.message).slice(0, 200),
        });
      }
      if (!res.ok) {
        return json({
          ok: true, reachable: false, website: site, status: res.status,
          message: `${site} responded with ${res.status}. Check the address, or upload a product spreadsheet instead.`,
        });
      }
      // Cap the body we read: fingerprints live in the head and early markup, and
      // an unbounded read of an arbitrary URL is a memory risk.
      const html = (await res.text()).slice(0, 400_000);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      const fp = fingerprintPlatform(html, headers, res.url || site);
      return json({ ok: true, reachable: true, website: site, ...recommendImportMethod(fp) });
    }

    // ---- startSync / continueSync ----
    if (action === "startSync" || action === "continueSync") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await S.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, conn.business_id)) return err("PERMISSION_DENIED", 403);
      if (conn.connection_status !== ConnectionStatus.VERIFIED) {
        return err("CONNECTION_NOT_VERIFIED", 409, { connection_status: conn.connection_status });
      }
      if (conn.platform !== StorePlatform.SHOPIFY) {
        return err("PLATFORM_NOT_SUPPORTED", 422, { platform: conn.platform, supported: [StorePlatform.SHOPIFY] });
      }
      const encKey = secrets.get("STORE_TOKEN_ENC_KEY");
      if (!encKey) return err("ENCRYPTION_NOT_CONFIGURED", 503, { secret: "STORE_TOKEN_ENC_KEY" });
      if (!conn.shopify_access_token) return err("CONNECTION_NOT_AUTHENTICATED", 409);

      let runId: string;
      let cursor: string | null;
      if (action === "startSync") {
        // Concurrency guard: refuse to start over a live run.
        if (conn.sync_status === SyncStatus.SYNCING && conn.current_sync_run_id) {
          return err("SYNC_ALREADY_RUNNING", 409, { current_sync_run_id: conn.current_sync_run_id });
        }
        runId = crypto.randomUUID();
        cursor = null;
        await S.BusinessStoreConnection.update(conn.id, {
          sync_status: SyncStatus.SYNCING, current_sync_run_id: runId,
          sync_cursor: null, sync_total: 0, sync_processed: 0, sync_failed: 0,
          sync_cancel_requested_at: null, last_sync_started_at: nowIso(),
          last_sync_finished_at: null, last_error: null,
        });
      } else {
        if (!conn.current_sync_run_id) return err("NO_ACTIVE_SYNC", 409);
        if (body.run_id && body.run_id !== conn.current_sync_run_id) {
          return err("STALE_SYNC_RUN", 409, { current_sync_run_id: conn.current_sync_run_id });
        }
        runId = conn.current_sync_run_id;
        cursor = conn.sync_cursor || null;
        // Cancellation is checked before the next batch, per the schema's design.
        if (conn.sync_cancel_requested_at) {
          await S.BusinessStoreConnection.update(conn.id, {
            sync_status: SyncStatus.CANCELLED, current_sync_run_id: null,
            last_sync_finished_at: nowIso(),
          });
          return json({ ok: true, cancelled: true, processed: conn.sync_processed, failed: conn.sync_failed });
        }
      }

      // ---- fetch one page from Shopify ----
      let token: string;
      try {
        token = await decryptToken(conn.shopify_access_token, encKey);
      } catch (e) {
        await S.BusinessStoreConnection.update(conn.id, {
          sync_status: SyncStatus.FAILED, current_sync_run_id: null,
          last_sync_finished_at: nowIso(), last_error: `credential decrypt failed: ${e.message}`,
        });
        return err("CREDENTIAL_DECRYPT_FAILED", 500);
      }

      const url = `https://${conn.store_domain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${PAGE_SIZE}` +
        (cursor ? `&page_info=${encodeURIComponent(cursor)}` : "");
      let res: Response;
      try {
        res = await fetchWithTimeout(url, { headers: { "X-Shopify-Access-Token": token, Accept: "application/json" } });
      } catch (e) {
        await S.BusinessStoreConnection.update(conn.id, {
          sync_status: SyncStatus.FAILED, current_sync_run_id: null,
          last_sync_finished_at: nowIso(), last_error: `fetch failed: ${e.message}`,
        });
        return err("STORE_FETCH_FAILED", 502, { message: String(e.message).slice(0, 200) });
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        await S.BusinessStoreConnection.update(conn.id, {
          sync_status: SyncStatus.FAILED, current_sync_run_id: null,
          last_sync_finished_at: nowIso(), last_error: `store returned ${res.status}`,
        });
        return err("STORE_FETCH_FAILED", 502, { status: res.status, body: txt.slice(0, 200) });
      }
      const payload: any = await res.json();
      const products: any[] = Array.isArray(payload?.products) ? payload.products : [];
      let nextCursor = nextPageInfo(res.headers.get("link"));

      // ---- stage the page ----
      // Existing items for this connection, used for the duplicate waterfall.
      const existing = await S.StoreImportItem.filter({ connection_id: conn.id }, "-created_date", 1000);
      const seen = existing.slice();
      let processed = conn.sync_processed || 0;
      let failed = conn.sync_failed || 0;
      let staged = 0;
      let skipped = 0;

      for (const product of products) {
        if (processed + failed >= SYNC_MAX_PRODUCTS) { nextCursor = null; break; }
        try {
          const mapped = mapShopifyProduct(product, conn);
          if (!mapped.external_id || !mapped.title) { failed++; continue; }
          // Re-sync of a product we already staged: leave the existing row alone
          // rather than creating a second one or silently overwriting reviewer edits.
          const already = seen.find((e: any) => String(e.external_id) === mapped.external_id);
          if (already) { skipped++; processed++; continue; }
          const dup = detectDuplicate(mapped, seen);
          const created = await S.StoreImportItem.create({
            ...mapped,
            status: stageStatus(mapped, dup),
            ...(dup ? { duplicate_of_item_id: dup.duplicate_of_item_id, duplicate_match_method: dup.duplicate_match_method } : {}),
            last_scanned_at: nowIso(),
          });
          seen.push(created);
          staged++;
          processed++;
        } catch (e) {
          // Per-item failure isolation: one bad product must not end the sync.
          failed++;
        }
      }

      // Re-read to confirm this run still owns the connection before writing state.
      const fresh = await S.BusinessStoreConnection.get(conn.id).catch(() => null);
      if (!fresh || fresh.current_sync_run_id !== runId) {
        return json({ ok: true, superseded: true, staged, failed, message: "a newer sync run owns this connection" });
      }
      const done = !nextCursor;
      await S.BusinessStoreConnection.update(conn.id, {
        sync_cursor: nextCursor,
        sync_total: (fresh.sync_total || 0) + products.length,
        sync_processed: processed,
        sync_failed: failed,
        ...(done
          ? { sync_status: SyncStatus.COMPLETED, current_sync_run_id: null, last_sync_finished_at: nowIso() }
          : {}),
      });
      return json({
        ok: true, run_id: runId, has_more: !done, staged, skipped, failed,
        processed, page_size: products.length,
        capped: processed + failed >= SYNC_MAX_PRODUCTS,
      });
    }

    // ---- cancelSync ----
    if (action === "cancelSync") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await S.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, conn.business_id)) return err("PERMISSION_DENIED", 403);
      if (conn.sync_status !== SyncStatus.SYNCING) return err("NO_ACTIVE_SYNC", 409, { sync_status: conn.sync_status });
      await S.BusinessStoreConnection.update(conn.id, { sync_cancel_requested_at: nowIso() });
      return json({ ok: true, cancel_requested: true });
    }

    // ---- listImportItems ----
    if (action === "listImportItems") {
      const filter: any = {};
      if (body.connection_id) filter.connection_id = body.connection_id;
      if (body.status) filter.status = body.status;
      if (body.business_id) {
        if (!canAccessBusiness(allowed, body.business_id)) return err("PERMISSION_DENIED", 403);
        filter.business_id = body.business_id;
      } else if (allowed !== "all" && allowed.length === 1) {
        // Narrow at the query rather than relying only on the post-filter below.
        filter.business_id = allowed[0];
      }
      const limit = Number.isInteger(body.limit) && body.limit > 0 && body.limit <= 200 ? body.limit : 50;
      const rows = await S.StoreImportItem.filter(filter, "-created_date", limit);
      // Post-filter regardless: a caller can pass any connection_id, and a member
      // of several businesses cannot be narrowed by a single query above.
      const items = allowed === "all" ? rows : rows.filter((r: any) => canAccessBusiness(allowed, r.business_id));
      return json({ ok: true, items });
    }

    // ---- getImportItem ----
    if (action === "getImportItem") {
      const { item_id } = body;
      if (!item_id) return err("VALIDATION_FAILED", 422, { item_id: "required" });
      const item = await S.StoreImportItem.get(item_id).catch(() => null);
      if (!item) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, item.business_id)) return err("PERMISSION_DENIED", 403);
      return json({ ok: true, item });
    }

    // ---- approveItem ----
    if (action === "approveItem") {
      const { item_id } = body;
      if (!item_id) return err("VALIDATION_FAILED", 422, { item_id: "required" });
      const item = await S.StoreImportItem.get(item_id).catch(() => null);
      if (!item) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, item.business_id)) return err("PERMISSION_DENIED", 403);
      if (item.status === ImportItemStatus.APPROVED || item.status === ImportItemStatus.REJECTED) {
        return err("ITEM_ALREADY_RESOLVED", 409, { status: item.status });
      }
      const conn = await S.BusinessStoreConnection.get(item.connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404, { connection_id: "not found" });

      // Reviewer-supplied corrections are applied before creation and recorded
      // as business_edited provenance, so an edited field is never mistaken for
      // one the source confirmed.
      const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
      const EDITABLE = [
        "title", "description", "price_cents", "category", "condition", "brand",
        "oem_or_aftermarket", "compatible_models", "compatible_chassis_codes",
        "compatible_engine_families", "compatible_year_from", "compatible_year_to",
      ];
      const applied: any = {};
      const provenance = { ...(item.field_provenance || {}) };
      for (const k of EDITABLE) {
        if (overrides[k] !== undefined) {
          applied[k] = overrides[k];
          provenance[k] = "business_edited";
        }
      }
      const effective = { ...item, ...applied };

      const posterId = await resolvePosterId(base44, conn.business_id);
      const result = await createImportedListing(base44, { item: effective, connection: conn, posterId: posterId || "" });
      if (!result.ok) {
        // Not a sync failure — the item stays reviewable so it can be corrected.
        await S.StoreImportItem.update(item.id, {
          ...applied, field_provenance: provenance,
          status: ImportItemStatus.NEEDS_ATTENTION,
          sync_error: `${result.error.code}${result.error.field ? ` (${result.error.field})` : ""}: ${result.error.message}`,
        });
        return err(result.error.code, 422, { field: result.error.field, message: result.error.message });
      }
      const updated = await S.StoreImportItem.update(item.id, {
        ...applied,
        field_provenance: provenance,
        status: ImportItemStatus.APPROVED,
        approved_listing_id: result.listing.id,
        approved_at: nowIso(),
        sync_error: null,
      });
      return json({ ok: true, item: updated, listing_id: result.listing.id, listing_status: result.listing.status });
    }

    // ---- rejectItem ----
    if (action === "rejectItem") {
      const { item_id } = body;
      if (!item_id) return err("VALIDATION_FAILED", 422, { item_id: "required" });
      const item = await S.StoreImportItem.get(item_id).catch(() => null);
      if (!item) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, item.business_id)) return err("PERMISSION_DENIED", 403);
      if (item.status === ImportItemStatus.APPROVED || item.status === ImportItemStatus.REJECTED) {
        return err("ITEM_ALREADY_RESOLVED", 409, { status: item.status });
      }
      const updated = await S.StoreImportItem.update(item.id, {
        status: ImportItemStatus.REJECTED,
        rejected_at: nowIso(),
        rejected_reason: body.reason ? String(body.reason).slice(0, 500) : null,
      });
      return json({ ok: true, item: updated });
    }

    return err("VALIDATION_FAILED", 422, { action: "unknown" });
  } catch (error) {
    return json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } }, 500);
  }
});
