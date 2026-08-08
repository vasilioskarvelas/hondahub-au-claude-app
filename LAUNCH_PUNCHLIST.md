# Honda Hub (claude-app) - Launch Punch-List

> **CORRECTION (8 Aug 2026):** Re-verified against the live backend code today. **A1 and A3 are already FIXED in code**, so the A1/A3 entries further down (written from the 23 Jul tracker notes) are historical. A1 (trust-score self-escalation) is closed under **ADR-034** - `base44/functions/trust-score/entry.ts` gates `award` to moderator/admin and derives the actor server-side. A3 (notification `delivery_status`) - `base44/shared/notifications.ts` now writes `"sent"` on create. What remains on those two is verification + a one-off data backfill, not new code. The genuinely open work is QA execution, data cleanup, human sign-offs (security review, legal, founder GO), and the Phase 06-14 Review->Lock ceremonies.

---


**Prepared:** 8 Aug 2026
**Target repo:** `vasilioskarvelas/hondahub-au-claude-app`
**Current state:** QA Freeze active (`v2026.08.06-qa-baseline`). Last formal launch assessment (23 Jul 2026) verdict: **NO-GO**.

This is the ordered list of what stands between the app and launch, drawn from the repo's own `PROGRESS_TRACKER.md`, `QA_BASELINE.md`, `QA_DEFECTS.md`, and the test harness in `tests/`. Items are grouped by type and ordered so the critical path is clear. Nothing here invents new scope — it consolidates what the project has already flagged.

---

## Snapshot: where things actually stand

The engineering foundation is strong. Phases 00–05 (Setup, Identity, Platform Cross-Cutting, Garage, Social, Moderation) are **built, tested, and Locked**. There is a real TypeScript service layer (24 backend functions), a locked architecture, append-only audit logging, permission gating, idempotent background jobs, and a proper Playwright test harness.

The gap to launch is **not "build the rest of the app"** — most modules exist. The gap is **hardening, verification, formal sign-off, and closing three concrete technical defects.** Three things are true at once:

1. A handful of real defects are open (one is a security hole).
2. Most phases are built but have **not been run through Review → Lock**, so nothing past Phase 05 is formally signed off.
3. The human/legal/founder gates (security review, legal docs, GO decision) haven't happened.

---

## Section A — Hard launch blockers (must close)

These are the blocking items (B1–B10) from the 23 Jul "999" assessment. Launch cannot proceed until each is closed or explicitly waived by you as owner.

### A1. Trust-score self-escalation security flaw *(B1 — highest priority)*
**What:** The `trust-score` `award` action only requires *any* authenticated user. A regular member can self-award every positive trust signal (`vehicle_verified`, `business_verified`, `quality_post`, `marketplace_success`, etc.) with a spoofed `actor` string — escalating their own account tier to `verified_member` / `business_verified` **without the required Mod/Admin verification**. This bypasses the vehicle and business verification gates entirely.
**Why blocking:** Direct privilege-escalation / trust-integrity failure. Also the single reason the security checklist item "AI cannot write TrustScoreEvent directly" fails.
**Action:** Write an ADR to change the Phase 01 TrustScoreService permission model (who may call `award`; remove client-supplied `actor`; award only via server-verified events). Then apply the scoped fix. *This is a locked-permission change, so it needs the ADR first.*
**Owner:** You (ADR decision) → implementation.

### A2. Data-integrity violations flagged by launch-critical sweep *(B2 / F1)*
**What:** The `invalid_polymorphic_reference_sweep` reports **9–10 real violations every run**, and `duplicate_active_record_detection` flags a duplicate "RevHard Performance" Business. Some are old Phase 05 test-target placeholders and test-cleanup dangling refs; the duplicate business is live data.
**Why blocking:** A launch-critical job sitting in permanent alert state means you can't distinguish a real incident from baseline noise on day one.
**Action:** Clean or correct the deletable bad rows (Reports/ModerationCases/Notifications with dangling `target_id`s), de-duplicate the RevHard Performance business, and confirm the sweep returns to a **green baseline**. Append-only rows (ModerationAction/AuditLog) that can't be deleted should be documented as known-benign and excluded from the alert.
**Owner:** Data-integrity / owning services.

### A3. Notification `delivery_status` not initialized *(B3 / F2)*
**What:** All live notifications read `delivery_status` as `null`/"unknown" instead of the schema default `"sent"`. Phase 09's "createNotification writes sent" invariant isn't holding.
**Why blocking:** Breaks delivery-retry accounting and the admin dashboard's accuracy — you can't trust notification health metrics.
**Action:** Fix the Phase 09 notifications shared module so `createNotification` sets `delivery_status = "sent"` on create; backfill existing rows.
**Owner:** Phase 09 / notifications shared module.

### A4. External human security review sign-off *(B4)*
**What:** No written external security review exists. Phase 13 (Security Hardening) is human-gated and its Definition of Done *is* this sign-off.
**Action:** Commission an independent security review (not the builder). Feed it A1 specifically. Obtain written sign-off.
**Owner:** You + external reviewer.

### A5. PERMISSION_MATRIX independent re-verification *(B5)*
**What:** The permission matrix has only been verified by the builder. It needs an independent pass by a non-builder.
**Action:** Have a second party walk the permission matrix against the actual gates in code.
**Owner:** Non-builder reviewer.

### A6. Full acceptance-test regression + manual click-throughs *(B6)*
**What:** The full acceptance-test regression has not been run, nor have manual core-user and moderation click-throughs. (See Section D — the automated harness exists but hasn't been executed under the freeze.)
**Action:** Run the Playwright suite end-to-end + do the manual core-journey and moderation walk-throughs. Log every failure in `QA_DEFECTS.md`.
**Owner:** QA.

### A7. Realistic-load performance verification *(B7)*
**What:** No performance testing against realistic data volumes has been done.
**Action:** Seed realistic data volumes and verify page loads, feed queries, and marketplace search hold up. Confirm denormalized counters stay O(1).
**Owner:** Engineering.

### A8. Rate-limit tuning *(B8)*
**What:** Rate limits are placeholder values, not tuned against realistic traffic.
**Action:** Set and test real rate limits on auth, posting, messaging, and marketplace actions.
**Owner:** Engineering.

### A9. Legal & policy publication *(B9)*
**What:** Terms of Service, Privacy Policy, and trade-promotion compliance (relevant because the app runs a **Giveaway**) are not published. Australian trade-promotion rules may require permits depending on how the giveaway works.
**Action:** Publish ToS + Privacy Policy; get the giveaway mechanics reviewed for AU trade-promotion compliance.
**Owner:** You + legal.

### A10. Founder / product-owner GO decision *(B10)*
**What:** The final go/no-go has not been given.
**Action:** Make the call once A1–A9 are closed.
**Owner:** You.

---

## Section B — Phase Lock ceremonies outstanding

Only Phases 00–05 are Locked. Everything built afterward needs its Review → Lock pass so it's formally signed off, **and the status table needs reconciling** (see note).

| Phase | Module | Built? | Needs |
|---|---|---|---|
| 06 | Community (Groups/Events) | ✅ built & tested | Review → Lock |
| 07 | Business | ✅ built (per notes log) | Review → Lock; close AQ1/AQ3 gaps |
| 08 | Marketplace (ADR-044 wizard) | ✅ built (per QA baseline) | Review → Lock |
| 09 | Notification Completion | ✅ built (per F2 reference) | Fix A3, then Review → Lock |
| 10 | Entitlement & Billing Scaffolding | ✅ scaffolded (0 Subscription rows as designed) | Review → Lock |
| 11 | Background Jobs & Reconciliation | ✅ built & tested | Review → Lock |
| 12 | Admin & Moderator Tooling | ✅ built & tested | Review → Lock |
| 13 | Security Hardening | ◐ in review | Close A1 + A4; Lock |
| 14 | Full QA & Launch Readiness | ◐ in review | Close all blockers; Lock |

> **⚠ Tracker inconsistency to fix first:** the phase-status table at the top of `PROGRESS_TRACKER.md` still marks 07/08/09/10 as "Not started," but the notes log, `QA_BASELINE.md` surface inventory, and the 24 deployed backend functions show they *are* implemented. Reconcile the table to reality before the Review passes, so "done" means the same thing everywhere.

---

## Section C — Known tech-debt & accepted risks to decide on

These were logged as "ACCEPTED tracked risk" or open items. Each needs an explicit **fix-now / fix-later / accept** decision from you before launch — accepting is fine, but it should be a conscious call, not a default.

1. **Two parallel listing systems** — legacy `Listing` (`/create`, `/market`) and ADR-044 `MarketplaceListing` (`/marketplace/create`, `/marketplace`) both exist and are frozen as-is. Decide whether to consolidate before launch or ship with both (user-confusion risk).
2. **Moderation "account_restricted"** has no structured temp-restriction scope/duration field.
3. **`garage_completed` / `completed_profile` trust signals** have no auto-triggering mechanism (compounded by A1).
4. **Base44 capability assumptions** — RLS cross-entity behavior and export/migration depth not independently verified; multi-entity transactions confirmed *not* native (designed around with compensating actions).
5. **Business (P07) gaps** — no suspend/restore, `respondToReview` has no removal path, unverified-business-organises-events path, directory sort, `submitVerification` evidence handling.
6. **Method-level request/response schemas** — envelopes spot-checked, full per-method diff not performed.
7. **Seed/demo data** present in the QA environment — must be purged before production.

---

## Section D — QA execution (the harness is ready; it just needs to run)

`tests/` contains a complete Playwright system: 8 journey suites (account, social, marketplace, events, garage, navigation, exploratory, edge-cases) across 5 device profiles (desktop Chrome/Firefox, mobile Safari/Chrome, tablet), with auto bug-reporting into the in-app Testing Command Centre (`/testing`) and a ready CI/CD workflow template.

**It has not been run under the freeze** — `QA_DEFECTS.md` is empty. To execute:

1. Deploy the app to a stable QA URL.
2. Create the `TEST_` prefixed accounts (admin, buyer, seller) in the Base44 dashboard.
3. Set the environment variables (`HONDA_HUB_URL`, test creds).
4. `npx playwright test` (all suites, all devices).
5. Triage every failure into `QA_DEFECTS.md`; fix approved defects one at a time with a regression re-run after each (per freeze rules).
6. Wire the nightly CI workflow (`.github/workflows/honda-hub-tests.yml`) so regressions are caught automatically.

---

## Suggested critical path

A sensible order that unblocks the most downstream work first:

1. **Reconcile the phase-status table** (Section B note) — 30 min, removes confusion.
2. **A1 — trust-score ADR + fix** — the security blocker; also unblocks Phase 13 and the security checklist.
3. **A2 + A3** — data-integrity cleanup and notification `delivery_status` fix; gets launch-critical jobs to a green baseline.
4. **A6 + D — run the full Playwright suite**, triage into `QA_DEFECTS.md`, fix, regress. This surfaces whatever else is hiding.
5. **A7 + A8** — performance + rate-limit tuning against realistic/seeded load.
6. **Phase 06–12 Review → Lock** ceremonies (now that defects are closing).
7. **A4 + A5** — external security review + independent permission-matrix verification (can run in parallel with 4–6).
8. **A9** — publish ToS/Privacy + giveaway compliance (start early; legal has lead time).
9. **Purge seed data**, Lock Phases 13 & 14.
10. **A10 — founder GO/NO-GO.**

---

## Definition of "launch ready"

Per the tracker's final sign-off block, all three must be true:

- ☐ All 15 phases marked **Locked**
- ☐ Launch Checklist complete in full (A1–A9 closed or consciously waived)
- ☐ Founder / Product Owner final GO given (dated/signed)
# Honda Hub (claude-app) — Launch Punch-List

**Prepared:** 8 Aug 2026
**Target repo:** `vasilioskarvelas/hondahub-au-claude-app`
**Current state:** QA Freeze active (`v2026.08.06-qa-baseline`). Last formal launch assessment (23 Jul 2026) verdict: **NO-GO**.

This is the ordered list of what stands between the app and launch, drawn from the repo's own `PROGRESS_TRACKER.md`, `QA_BASELINE.md`, `QA_DEFECTS.md`, and the test harness in `tests/`. Items are grouped by type and ordered so the critical path is clear. Nothing here invents new scope — it consolidates what the project has already flagged.

---

## Snapshot: where things actually stand

The engineering foundation is strong. Phases 00–05 (Setup, Identity, Platform Cross-Cutting, Garage, Social, Moderation) are **built, tested, and Locked**. There is a real TypeScript service layer (24 backend functions), a locked architecture, append-only audit logging, permission gating, idempotent background jobs, and a proper Playwright test harness.

The gap to launch is **not "build the rest of the app"** — most modules exist. The gap is **hardening, verification, formal sign-off, and closing three concrete technical defects.** Three things are true at once:

1. A handful of real defects are open (one is a security hole).
2. Most phases are built but have **not been run through Review → Lock**, so nothing past Phase 05 is formally signed off.
3. The human/legal/founder gates (security review, legal docs, GO decision) haven't happened.

---

## Section A — Hard launch blockers (must close)

These are the blocking items (B1–B10) from the 23 Jul "999" assessment. Launch cannot proceed until each is closed or explicitly waived by you as owner.

### A1. Trust-score self-escalation security flaw *(B1 — highest priority)*
**What:** The `trust-score` `award` action only requires *any* authenticated user. A regular member can self-award every positive trust signal (`vehicle_verified`, `business_verified`, `quality_post`, `marketplace_success`, etc.) with a spoofed `actor` string — escalating their own account tier to `verified_member` / `business_verified` **without the required Mod/Admin verification**. This bypasses the vehicle and business verification gates entirely.
**Why blocking:** Direct privilege-escalation / trust-integrity failure. Also the single reason the security checklist item "AI cannot write TrustScoreEvent directly" fails.
**Action:** Write an ADR to change the Phase 01 TrustScoreService permission model (who may call `award`; remove client-supplied `actor`; award only via server-verified events). Then apply the scoped fix. *This is a locked-permission change, so it needs the ADR first.*
**Owner:** You (ADR decision) → implementation.

### A2. Data-integrity violations flagged by launch-critical sweep *(B2 / F1)*
**What:** The `invalid_polymorphic_reference_sweep` reports **9–10 real violations every run**, and `duplicate_active_record_detection` flags a duplicate "RevHard Performance" Business. Some are old Phase 05 test-target placeholders and test-cleanup dangling refs; the duplicate business is live data.
**Why blocking:** A launch-critical job sitting in permanent alert state means you can't distinguish a real incident from baseline noise on day one.
**Action:** Clean or correct the deletable bad rows (Reports/ModerationCases/Notifications with dangling `target_id`s), de-duplicate the RevHard Performance business, and confirm the sweep returns to a **green baseline**. Append-only rows (ModerationAction/AuditLog) that can't be deleted should be documented as known-benign and excluded from the alert.
**Owner:** Data-integrity / owning services.

### A3. Notification `delivery_status` not initialized *(B3 / F2)*
**What:** All live notifications read `delivery_status` as `null`/"unknown" instead of the schema default `"sent"`. Phase 09's "createNotification writes sent" invariant isn't holding.
**Why blocking:** Breaks delivery-retry accounting and the admin dashboard's accuracy — you can't trust notification health metrics.
**Action:** Fix the Phase 09 notifications shared module so `createNotification` sets `delivery_status = "sent"` on create; backfill existing rows.
**Owner:** Phase 09 / notifications shared module.

### A4. External human security review sign-off *(B4)*
**What:** No written external security review exists. Phase 13 (Security Hardening) is human-gated and its Definition of Done *is* this sign-off.
**Action:** Commission an independent security review (not the builder). Feed it A1 specifically. Obtain written sign-off.
**Owner:** You + external reviewer.

### A5. PERMISSION_MATRIX independent re-verification *(B5)*
**What:** The permission matrix has only been verified by the builder. It needs an independent pass by a non-builder.
**Action:** Have a second party walk the permission matrix against the actual gates in code.
**Owner:** Non-builder reviewer.

### A6. Full acceptance-test regression + manual click-throughs *(B6)*
**What:** The full acceptance-test regression has not been run, nor have manual core-user and moderation click-throughs. (See Section D — the automated harness exists but hasn't been executed under the freeze.)
**Action:** Run the Playwright suite end-to-end + do the manual core-journey and moderation walk-throughs. Log every failure in `QA_DEFECTS.md`.
**Owner:** QA.

### A7. Realistic-load performance verification *(B7)*
**What:** No performance testing against realistic data volumes has been done.
**Action:** Seed realistic data volumes and verify page loads, feed queries, and marketplace search hold up. Confirm denormalized counters stay O(1).
**Owner:** Engineering.

### A8. Rate-limit tuning *(B8)*
**What:** Rate limits are placeholder values, not tuned against realistic traffic.
**Action:** Set and test real rate limits on auth, posting, messaging, and marketplace actions.
**Owner:** Engineering.

### A9. Legal & policy publication *(B9)*
**What:** Terms of Service, Privacy Policy, and trade-promotion compliance (relevant because the app runs a **Giveaway**) are not published. Australian trade-promotion rules may require permits depending on how the giveaway works.
**Action:** Publish ToS + Privacy Policy; get the giveaway mechanics reviewed for AU trade-promotion compliance.
**Owner:** You + legal.

### A10. Founder / product-owner GO decision *(B10)*
**What:** The final go/no-go has not been given.
**Action:** Make the call once A1–A9 are closed.
**Owner:** You.

---

## Section B — Phase Lock ceremonies outstanding

Only Phases 00–05 are Locked. Everything built afterward needs its Review → Lock pass so it's formally signed off, **and the status table needs reconciling** (see note).

| Phase | Module | Built? | Needs |
|---|---|---|---|
| 06 | Community (Groups/Events) | ✅ built & tested | Review → Lock |
| 07 | Business | ✅ built (per notes log) | Review → Lock; close AQ1/AQ3 gaps |
| 08 | Marketplace (ADR-044 wizard) | ✅ built (per QA baseline) | Review → Lock |
| 09 | Notification Completion | ✅ built (per F2 reference) | Fix A3, then Review → Lock |
| 10 | Entitlement & Billing Scaffolding | ✅ scaffolded (0 Subscription rows as designed) | Review → Lock |
| 11 | Background Jobs & Reconciliation | ✅ built & tested | Review → Lock |
| 12 | Admin & Moderator Tooling | ✅ built & tested | Review → Lock |
| 13 | Security Hardening | ◐ in review | Close A1 + A4; Lock |
| 14 | Full QA & Launch Readiness | ◐ in review | Close all blockers; Lock |

> **⚠ Tracker inconsistency to fix first:** the phase-status table at the top of `PROGRESS_TRACKER.md` still marks 07/08/09/10 as "Not started," but the notes log, `QA_BASELINE.md` surface inventory, and the 24 deployed backend functions show they *are* implemented. Reconcile the table to reality before the Review passes, so "done" means the same thing everywhere.

---

## Section C — Known tech-debt & accepted risks to decide on

These were logged as "ACCEPTED tracked risk" or open items. Each needs an explicit **fix-now / fix-later / accept** decision from you before launch — accepting is fine, but it should be a conscious call, not a default.

1. **Two parallel listing systems** — legacy `Listing` (`/create`, `/market`) and ADR-044 `MarketplaceListing` (`/marketplace/create`, `/marketplace`) both exist and are frozen as-is. Decide whether to consolidate before launch or ship with both (user-confusion risk).
2. **Moderation "account_restricted"** has no structured temp-restriction scope/duration field.
3. **`garage_completed` / `completed_profile` trust signals** have no auto-triggering mechanism (compounded by A1).
4. **Base44 capability assumptions** — RLS cross-entity behavior and export/migration depth not independently verified; multi-entity transactions confirmed *not* native (designed around with compensating actions).
5. **Business (P07) gaps** — no suspend/restore, `respondToReview` has no removal path, unverified-business-organises-events path, directory sort, `submitVerification` evidence handling.
6. **Method-level request/response schemas** — envelopes spot-checked, full per-method diff not performed.
7. **Seed/demo data** present in the QA environment — must be purged before production.

---

## Section D — QA execution (the harness is ready; it just needs to run)

`tests/` contains a complete Playwright system: 8 journey suites (account, social, marketplace, events, garage, navigation, exploratory, edge-cases) across 5 device profiles (desktop Chrome/Firefox, mobile Safari/Chrome, tablet), with auto bug-reporting into the in-app Testing Command Centre (`/testing`) and a ready CI/CD workflow template.

**It has not been run under the freeze** — `QA_DEFECTS.md` is empty. To execute:

1. Deploy the app to a stable QA URL.
2. Create the `TEST_` prefixed accounts (admin, buyer, seller) in the Base44 dashboard.
3. Set the environment variables (`HONDA_HUB_URL`, test creds).
4. `npx playwright test` (all suites, all devices).
5. Triage every failure into `QA_DEFECTS.md`; fix approved defects one at a time with a regression re-run after each (per freeze rules).
6. Wire the nightly CI workflow (`.github/workflows/honda-hub-tests.yml`) so regressions are caught automatically.

---

## Suggested critical path

A sensible order that unblocks the most downstream work first:

1. **Reconcile the phase-status table** (Section B note) — 30 min, removes confusion.
2. **A1 — trust-score ADR + fix** — the security blocker; also unblocks Phase 13 and the security checklist.
3. **A2 + A3** — data-integrity cleanup and notification `delivery_status` fix; gets launch-critical jobs to a green baseline.
4. **A6 + D — run the full Playwright suite**, triage into `QA_DEFECTS.md`, fix, regress. This surfaces whatever else is hiding.
5. **A7 + A8** — performance + rate-limit tuning against realistic/seeded load.
6. **Phase 06–12 Review → Lock** ceremonies (now that defects are closing).
7. **A4 + A5** — external security review + independent permission-matrix verification (can run in parallel with 4–6).
8. **A9** — publish ToS/Privacy + giveaway compliance (start early; legal has lead time).
9. **Purge seed data**, Lock Phases 13 & 14.
10. **A10 — founder GO/NO-GO.**

---

## Definition of "launch ready"

Per the tracker's final sign-off block, all three must be true:

- ☐ All 15 phases marked **Locked**
- ☐ Launch Checklist complete in full (A1–A9 closed or consciously waived)
- ☐ Founder / Product Owner final GO given (dated/signed)
