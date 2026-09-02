import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { json, err } from "../../shared/http.ts";
import {
  requireBusinessStoreAccess, accessibleBusinessIds, canAccessBusiness,
  ConnectionStatus, SyncStatus, ImportItemStatus,
  FieldProvenance,
  StorePlatform, SYNC_MAX_PRODUCTS, SYNC_FETCH_TIMEOUT_MS,
  mapShopifyProduct, detectDuplicate, stageStatus, detectOtherMarque,
} from "../../shared/store-import.ts";
import { normaliseWebsite, fingerprintPlatform, recommendImportMethod } from "../../shared/platform-detect.ts";
import { parseCsv, detectColumns, mapCsvRow, previewCsv, CSV_MAX_BYTES, CSV_MAX_ROWS } from "../../shared/csv-import.ts";
import { mapWooProduct, wooPageUrl, wooPagination } from "../../shared/woo-import.ts";
import { buildCompatPrompt, validateCompatResult, COMPAT_SCHEMA, COMPAT_BATCH } from "../../shared/compat-extract.ts";
import {
  parseSitemapUrls, isSitemapIndexEntry, looksLikeProductUrl,
  extractJsonLdBlocks, findJsonLdProduct, fromJsonLdProduct, fromMetaTags,
  buildExtractionPrompt, mapExtractedProduct, EXTRACTION_SCHEMA, EXTRACT_MAX_PAGES,
} from "../../shared/web-extract.ts";

import { decryptToken } from "../../shared/store-crypto.ts";
import { createImportedListing } from "../../shared/marketplace.ts";

/** Identify honestly to the stores we read, rather than impersonating a browser. */
const UA = "HondaHubStoreImport/1.0 (+https://hondahub-au-claude-app.base44.app)";

/**
 * StoreImportService (ADR-046 Phase 1 — product import pipeline).
 *
 * Business-scoped: partners manage their own catalogue, admins may act on any.
 *
 * Actions:
 *   - detectPlatform / connectWebsite : identify a store and connect it in one step
 *   - startSync / continueSync / cancelSync : paginated catalogue import
 *   - previewCsv / importCsv          : the manual fallback route
 *   - extractCompatibility            : AI fitment suggestions for staged items
 *   - listImportItems / getImportItem
 *   - approveItem                     : create a DRAFT MarketplaceListing
 *   - rejectItem
 *
 * Import routes, in the order a business should meet them: a platform API
 * (Shopify OAuth, WooCommerce Store API), then reading the website page by
 * page, and only then a spreadsheet. Automation first; CSV is the last resort.
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

/** Parse a stored JSON blob without throwing on malformed content. */
function safeJson(s: unknown): Record<string, any> {
  try { const v = JSON.parse(String(s || "{}")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

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

/** How many product pages one website-scan batch reads. Kept small: each page is
 * a fetch and possibly an LLM call, so a large batch risks the function timeout. */
const WEBSITE_BATCH = 8;

/**
 * Read one page of a WooCommerce catalogue via the public Store API.
 * `cursor` is the page number as a string.
 */
async function fetchWooBatch(conn: any, cursor: string | null): Promise<{ mapped: any[]; nextCursor: string | null; total: number | null }> {
  const page = cursor ? Number(cursor) : 1;
  const origin = /^https?:\/\//i.test(conn.store_domain) ? conn.store_domain : `https://${conn.store_domain}`;
  const res = await fetchWithTimeout(wooPageUrl(origin, page), {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`store returned ${res.status}`);
  const products: any[] = await res.json();
  const list = Array.isArray(products) ? products : [];
  const { total, totalPages } = wooPagination(res.headers);
  // Where the pagination headers are absent, stop on the first empty page
  // rather than assuming a single page exists.
  const more = totalPages !== null ? page < totalPages : list.length > 0;
  return {
    mapped: list.map((p) => mapWooProduct(p, conn)).filter(Boolean),
    nextCursor: more ? String(page + 1) : null,
    total,
  };
}

/**
 * Read one batch of product pages from a bespoke website.
 *
 * Product URLs come from sitemap.xml, which is re-fetched each batch and sliced
 * by index. That costs one extra request per batch but avoids stashing hundreds
 * of URLs in `sync_cursor`, which is a single string field.
 *
 * Each page is read in preference order — JSON-LD, then meta tags, then the
 * model — so we only pay for an LLM call on pages that publish nothing
 * structured.
 */
async function fetchWebsiteBatch(
  base44: any, conn: any, cursor: string | null,
): Promise<{ mapped: any[]; nextCursor: string | null; total: number | null }> {
  const start = cursor ? Number(cursor) || 0 : 0;
  const origin = /^https?:\/\//i.test(conn.store_domain) ? conn.store_domain : `https://${conn.store_domain}`;

  const smRes = await fetchWithTimeout(`${origin.replace(/\/+$/, "")}/sitemap.xml`, {
    headers: { Accept: "application/xml,text/xml", "User-Agent": UA },
  });
  if (!smRes.ok) throw new Error(`no sitemap at ${origin}/sitemap.xml (${smRes.status})`);
  const urls = parseSitemapUrls(await smRes.text())
    .filter((u) => !isSitemapIndexEntry(u))
    .filter(looksLikeProductUrl)
    .slice(0, EXTRACT_MAX_PAGES);
  if (!urls.length) throw new Error("no product pages found in sitemap.xml");

  const slice = urls.slice(start, start + WEBSITE_BATCH);
  const mapped: any[] = [];

  for (const pageUrl of slice) {
    try {
      const pRes = await fetchWithTimeout(pageUrl, { headers: { Accept: "text/html", "User-Agent": UA } });
      if (!pRes.ok) continue;
      const html = (await pRes.text()).slice(0, 400_000);

      // 1. structured data the site published itself
      let data = fromJsonLdProduct(findJsonLdProduct(extractJsonLdBlocks(html)));
      let source = "json_ld";
      // 2. meta tags
      if (!data || data.price_cents === null) {
        const meta = fromMetaTags(html);
        if (meta && (meta.price_cents !== null || !data)) { data = meta; source = "meta_tags"; }
      }
      // 3. the model, only for pages that expose nothing usable
      if (!data || data.price_cents === null) {
        const llm = await base44.integrations.Core.InvokeLLM({
          prompt: buildExtractionPrompt(pageUrl, html),
          response_json_schema: EXTRACTION_SCHEMA,
        }).catch(() => null);
        const out = llm?.is_product_page === false ? null : llm;
        if (out?.title) { data = out; source = "ai"; }
      }
      if (!data) continue;
      const item = mapExtractedProduct(data, pageUrl, conn, source);
      if (item) mapped.push(item);
    } catch {
      // Per-page isolation: one unreachable or malformed page must not end the run.
    }
  }

  const next = start + WEBSITE_BATCH;
  return { mapped, nextCursor: next < urls.length ? String(next) : null, total: urls.length };
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
      const SYNCABLE = [StorePlatform.SHOPIFY, StorePlatform.WOOCOMMERCE, StorePlatform.WEBSITE];
      if (!SYNCABLE.includes(conn.platform)) {
        // CSV connections are populated by upload, not by a sync run.
        return err("PLATFORM_NOT_SYNCABLE", 422, { platform: conn.platform, syncable: SYNCABLE });
      }
      // Only Shopify holds a stored credential, so only Shopify needs the
      // encryption key. WooCommerce and website scanning read public data.
      let encKey: string | undefined;
      if (conn.platform === StorePlatform.SHOPIFY) {
        encKey = secrets.get("STORE_TOKEN_ENC_KEY");
        if (!encKey) return err("ENCRYPTION_NOT_CONFIGURED", 503, { secret: "STORE_TOKEN_ENC_KEY" });
        if (!conn.shopify_access_token) return err("CONNECTION_NOT_AUTHENTICATED", 409);
      }

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

      // ---- fetch one batch, however this store is read ----
      let batch: { mapped: any[]; nextCursor: string | null; total: number | null };
      try {
        if (conn.platform === StorePlatform.SHOPIFY) {
          const token = await decryptToken(conn.shopify_access_token, encKey!);
          const url = `https://${conn.store_domain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${PAGE_SIZE}` +
            (cursor ? `&page_info=${encodeURIComponent(cursor)}` : "");
          const res = await fetchWithTimeout(url, { headers: { "X-Shopify-Access-Token": token, Accept: "application/json" } });
          if (!res.ok) throw new Error(`store returned ${res.status}`);
          const payload: any = await res.json();
          const products: any[] = Array.isArray(payload?.products) ? payload.products : [];
          batch = {
            mapped: products.map((p) => mapShopifyProduct(p, conn)).filter((m) => m && m.external_id && m.title),
            nextCursor: nextPageInfo(res.headers.get("link")),
            total: null,
          };
        } else if (conn.platform === StorePlatform.WOOCOMMERCE) {
          batch = await fetchWooBatch(conn, cursor);
        } else {
          batch = await fetchWebsiteBatch(base44, conn, cursor);
        }
      } catch (e) {
        await S.BusinessStoreConnection.update(conn.id, {
          sync_status: SyncStatus.FAILED, current_sync_run_id: null,
          last_sync_finished_at: nowIso(), last_error: String(e.message).slice(0, 300),
        });
        return err("STORE_FETCH_FAILED", 502, { message: String(e.message).slice(0, 200) });
      }
      const products = batch.mapped;
      let nextCursor = batch.nextCursor;

      // ---- stage the page ----
      // Existing items for this connection, used for the duplicate waterfall.
      const existing = await S.StoreImportItem.filter({ connection_id: conn.id }, "-created_date", 1000);
      const seen = existing.slice();
      let processed = conn.sync_processed || 0;
      let failed = conn.sync_failed || 0;
      let staged = 0;
      let skipped = 0;

      for (const mapped of products) {
        if (processed + failed >= SYNC_MAX_PRODUCTS) { nextCursor = null; break; }
        try {
          if (!mapped || !mapped.external_id || !mapped.title) { failed++; continue; }
          // Re-sync of a product we already staged: leave the existing row alone
          // rather than creating a second one or silently overwriting reviewer edits.
          const already = seen.find((e: any) => String(e.external_id) === mapped.external_id);
          if (already) { skipped++; processed++; continue; }
          // Honda Hub is a Honda marketplace. A product that clearly belongs to
          // another make is stored REJECTED with a reason rather than dropped,
          // so the call is visible and reversible under the Rejected filter.
          const otherMarque = detectOtherMarque(mapped);
          const dup = otherMarque ? null : detectDuplicate(mapped, seen);
          const created = await S.StoreImportItem.create({
            ...mapped,
            status: otherMarque ? ImportItemStatus.REJECTED : stageStatus(mapped, dup),
            ...(otherMarque
              ? { rejected_at: nowIso(), rejected_reason: `Not a Honda part (matched "")` }
              : {}),
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
        // Woo and website scans know the real catalogue size up front; Shopify's
        // cursor pagination does not, so there we accumulate what we have seen.
        sync_total: batch.total !== null ? batch.total : (fresh.sync_total || 0) + products.length,
        sync_processed: processed,
        sync_failed: failed,
        ...(done
          ? { sync_status: SyncStatus.COMPLETED, current_sync_run_id: null, last_sync_finished_at: nowIso() }
          : {}),
      });
      return json({
        ok: true, run_id: runId, has_more: !done, staged, skipped, failed,
        processed, page_size: products.length,
      });
    }

    // ---- connectWebsite ----
    // One-step onboarding: the business gives their website and nothing else.
    // We fingerprint it, pick the best route, and create a connection that is
    // immediately syncable — no API key, no OAuth, no spreadsheet.
    //
    // Shopify is the exception: its Admin API needs OAuth, so a detected Shopify
    // store is handed back for the OAuth flow rather than connected here.
    //
    // Ownership rests on the business already being verified by a moderator.
    // Reading a public catalogue proves nothing about who owns it, so the method
    // is recorded as self_declared, not as proved ownership.
    if (action === "connectWebsite") {
      const { business_id } = body;
      if (!business_id) return err("VALIDATION_FAILED", 422, { business_id: "required" });
      if (!canAccessBusiness(allowed, business_id)) return err("PERMISSION_DENIED", 403);
      const site = normaliseWebsite(body.website);
      if (!site) return err("VALIDATION_FAILED", 422, { website: "enter a valid website address" });
      const business = await S.Business.get(business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404, { business_id: "not found" });

      let res: Response;
      try {
        res = await fetchWithTimeout(site, { redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html" } });
      } catch (e) {
        return err("SITE_UNREACHABLE", 502, { website: site, message: String(e.message).slice(0, 200) });
      }
      if (!res.ok) return err("SITE_UNREACHABLE", 502, { website: site, status: res.status });
      const html = (await res.text()).slice(0, 400_000);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      const rec = recommendImportMethod(fingerprintPlatform(html, headers, res.url || site));

      if (rec.platform === "shopify") {
        return json({
          ok: true, requires_oauth: true, ...rec,
          message: "This is a Shopify store — connect it with the Shopify button so we can read it securely.",
        });
      }

      const platform = rec.platform === "woocommerce" ? StorePlatform.WOOCOMMERCE : StorePlatform.WEBSITE;
      const host = new URL(site).hostname;
      const existing = (await S.BusinessStoreConnection.filter({ business_id, platform }))
        .find((c: any) => c.connection_status !== ConnectionStatus.DISCONNECTED);
      const now = nowIso();
      const conn = existing
        ? await S.BusinessStoreConnection.update(existing.id, { store_domain: host, sync_status: SyncStatus.IDLE, last_error: null })
        : await S.BusinessStoreConnection.create({
          business_id, platform, store_domain: host,
          store_name: business.name || host,
          connection_status: ConnectionStatus.VERIFIED,
          ownership_verified_at: now,
          ownership_verification_method: "self_declared",
          sync_status: SyncStatus.IDLE,
        });

      return json({
        ok: true, requires_oauth: false, connection_id: conn.id, ...rec,
        message: rec.platform === "woocommerce"
          ? "Connected. We can read your catalogue directly — start the import when you're ready."
          : "Connected. We'll read your product pages one by one, which takes a little longer.",
      });
    }

    // ---- previewCsv ----
    // Dry run: parse and summarise an uploaded file without staging anything, so
    // a business can confirm their columns mapped correctly before committing.
    if (action === "previewCsv") {
      const text = typeof body.csv === "string" ? body.csv : "";
      if (!text) return err("VALIDATION_FAILED", 422, { csv: "required" });
      if (text.length > CSV_MAX_BYTES) {
        return err("FILE_TOO_LARGE", 413, { max_bytes: CSV_MAX_BYTES, got: text.length });
      }
      return json({ ok: true, ...previewCsv(text) });
    }

    // ---- importCsv ----
    // The universal route: a business uploads their own catalogue export. No API
    // and no scraping, so it works whatever their site runs on.
    //
    // Ownership here is `self_declared`: the uploader is an active member of the
    // business and is asserting this is their own catalogue. That is a weaker
    // claim than Shopify OAuth, which is why it is recorded as a distinct
    // verification method rather than being passed off as verified ownership.
    if (action === "importCsv") {
      const { business_id } = body;
      if (!business_id) return err("VALIDATION_FAILED", 422, { business_id: "required" });
      if (!canAccessBusiness(allowed, business_id)) return err("PERMISSION_DENIED", 403);
      const text = typeof body.csv === "string" ? body.csv : "";
      if (!text) return err("VALIDATION_FAILED", 422, { csv: "required" });
      if (text.length > CSV_MAX_BYTES) {
        return err("FILE_TOO_LARGE", 413, { max_bytes: CSV_MAX_BYTES, got: text.length });
      }
      const business = await S.Business.get(business_id).catch(() => null);
      if (!business) return err("RESOURCE_NOT_FOUND", 404, { business_id: "not found" });

      const rows = parseCsv(text);
      if (rows.length < 2) return err("VALIDATION_FAILED", 422, { csv: "no data rows found" });
      const headers = rows[0].map((h: string) => String(h || "").trim());
      const { mapping } = detectColumns(headers);
      if (mapping.title === undefined) {
        return err("VALIDATION_FAILED", 422, { csv: "no product name column (Title, Name or Product)" });
      }
      const dataRows = rows.slice(1).filter((r: string[]) => r.some((c) => String(c || "").trim() !== ""));
      if (dataRows.length > CSV_MAX_ROWS) {
        return err("TOO_MANY_ROWS", 413, { max_rows: CSV_MAX_ROWS, got: dataRows.length });
      }

      // One CSV connection per business: re-uploading updates the same source
      // rather than accumulating a new connection per upload.
      const label = String(body.source_label || business.name || "Spreadsheet upload").slice(0, 120);
      const existing = (await S.BusinessStoreConnection.filter({ business_id, platform: StorePlatform.CSV }))
        .find((c: any) => c.connection_status !== ConnectionStatus.DISCONNECTED);
      const now = nowIso();
      const conn = existing || await S.BusinessStoreConnection.create({
        business_id,
        platform: StorePlatform.CSV,
        store_domain: normaliseWebsite(body.website) || `csv:${business_id}`,
        store_name: label,
        connection_status: ConnectionStatus.VERIFIED,
        ownership_verified_at: now,
        ownership_verification_method: "self_declared",
        sync_status: SyncStatus.IDLE,
      });

      const seen = await S.StoreImportItem.filter({ connection_id: conn.id }, "-created_date", 1000);
      const pool = seen.slice();
      let staged = 0, skipped = 0, failed = 0;

      for (let i = 0; i < dataRows.length; i++) {
        try {
          const mapped = mapCsvRow(dataRows[i], mapping, conn, i + 1);
          if (!mapped) { skipped++; continue; }
          // Re-upload of a product already staged: leave the existing row alone
          // rather than duplicating it or discarding a reviewer's edits.
          if (pool.find((e: any) => String(e.external_id) === mapped.external_id)) { skipped++; continue; }
          const dup = detectDuplicate(mapped, pool);
          const created = await S.StoreImportItem.create({
            ...mapped,
            status: stageStatus(mapped, dup),
            ...(dup ? { duplicate_of_item_id: dup.duplicate_of_item_id, duplicate_match_method: dup.duplicate_match_method } : {}),
            last_scanned_at: now,
          });
          pool.push(created);
          staged++;
        } catch {
          failed++; // per-row isolation: one bad row must not abort the upload
        }
      }

      await S.BusinessStoreConnection.update(conn.id, {
        sync_status: SyncStatus.COMPLETED,
        last_sync_started_at: now,
        last_sync_finished_at: nowIso(),
        sync_total: dataRows.length,
        sync_processed: staged + skipped,
        sync_failed: failed,
        last_error: null,
      });
      return json({
        ok: true, connection_id: conn.id, total_rows: dataRows.length,
        staged, skipped, failed,
        unmapped_columns: detectColumns(headers).unmapped,
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

    // ---- extractCompatibility ----
    // Works out which Hondas each staged product fits, so a reviewer confirms a
    // suggestion instead of filling every field by hand. Run in batches: each
    // item is one LLM call, so a whole catalogue cannot go through in one
    // request. The caller repeats while has_more is true.
    //
    // This NEVER approves anything. At best it moves an item from
    // needs_attention to ready_for_approval — a human still approves every
    // product before it can be listed. Fitment is exactly the kind of claim that
    // hurts someone when it is wrong, so the model advises and a person decides.
    if (action === "extractCompatibility") {
      const { connection_id } = body;
      if (!connection_id) return err("VALIDATION_FAILED", 422, { connection_id: "required" });
      const conn = await S.BusinessStoreConnection.get(connection_id).catch(() => null);
      if (!conn) return err("RESOURCE_NOT_FOUND", 404);
      if (!canAccessBusiness(allowed, conn.business_id)) return err("PERMISSION_DENIED", 403);

      // Only items still awaiting a decision, and only those not already scored.
      const pool = await S.StoreImportItem.filter({ connection_id }, "-created_date", 500);
      const pending = pool.filter((i: any) =>
        i.status !== ImportItemStatus.APPROVED &&
        i.status !== ImportItemStatus.REJECTED &&
        (i.compatibility_confidence_score === null || i.compatibility_confidence_score === undefined)
      );
      const batch = pending.slice(0, COMPAT_BATCH);

      let updated = 0, skipped = 0, failed = 0;
      for (const item of batch) {
        try {
          const raw = await base44.integrations.Core.InvokeLLM({
            prompt: buildCompatPrompt(item),
            response_json_schema: COMPAT_SCHEMA,
          }).catch(() => null);
          const result = validateCompatResult(raw);
          // A reply we cannot trust leaves the item untouched rather than
          // overwriting it with nothing.
          if (!result) { skipped++; continue; }

          const { reasoning, ...fields } = result;
          const merged = { ...item, ...fields };
          const provenance = { ...(item.field_provenance || {}) };
          for (const f of [
            "compatible_models", "compatible_chassis_codes", "compatible_engine_families",
            "compatible_year_from", "compatible_year_to", "honda_compatibility_status",
          ]) provenance[f] = FieldProvenance.AI_INFERRED;

          await S.StoreImportItem.update(item.id, {
            ...fields,
            field_provenance: provenance,
            // A flagged duplicate stays flagged: compatibility does not resolve that.
            status: item.status === ImportItemStatus.POSSIBLE_DUPLICATE
              ? item.status
              : stageStatus(merged, null),
            // Deliberately NOT written to sync_error: reasoning is not a failure,
            // and the UI renders that field as one. The reviewer sees the derived
            // status and confidence instead, which is the actionable part.
            source_raw: JSON.stringify({
              ...(safeJson(item.source_raw)),
              ai_fitment_reasoning: reasoning || null,
            }).slice(0, 4000),
          });
          updated++;
        } catch {
          failed++; // per-item isolation
        }
      }

      return json({
        ok: true, updated, skipped, failed,
        remaining: Math.max(0, pending.length - batch.length),
        has_more: pending.length > batch.length,
      });
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
