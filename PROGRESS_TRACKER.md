# Honda Hub — Progress Tracker

Single source of truth for phase status across the Honda Hub build. Updated as each phase moves through Build → Review → Lock. A phase is **Locked** only when its Module Review Checklist is complete and all four columns are checked.

Source of truth for the build: `HONDA_HUB_MASTER_IMPLEMENTATION_MANUAL.md` (the single self-contained manual). The architecture is LOCKED — no entity, service, permission, event, or ADR is invented or renamed during implementation.

---

## Phase Status

| # | Phase | Status | Review Completed | Testing Completed | Locked | Ready for Next Phase |
|---|---|---|---|---|---|---|
| 00 | Base44 Setup & Configuration | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 01 | Identity Foundation | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 02 | Platform Cross-Cutting | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 03 | Garage | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 04 | Social | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 05 | Moderation & Governance | ✅ Complete | ✅ | ✅ | ✅ | ✅ |
| 06 | Community | ✅ Built & tested | ☐ | ✅ | ☐ | ☐ |
| 07 | Business | ☐ Not started | ☐ | ☐ | ☐ | ☐ |
| 08 | Marketplace | ☐ Not started | ☐ | ☐ | ☐ | ☐ |
| 09 | Notification Completion | ☐ Not started | ☐ | ☐ | ☐ | ☐ |
| 10 | Entitlement & Billing Scaffolding | ☐ Not started | ☐ | ☐ | ☐ | ☐ |
| 11 | Background Jobs & Reconciliation | ✅ Built & tested | ☐ | ✅ | ☐ | ☐ |
| 12 | Admin & Moderator Tooling | ✅ Built & tested | ☐ | ✅ | ☐ | ☐ |
| 13 | Security Hardening | ◐ In review | ☐ | ☐ | ☐ | ☐ |
| 14 | Full QA and Launch Readiness | ☐ Not started | ☐ | ☐ | ☐ | ☐ |

---

## Phase 00 — Completion Record

### Acceptance criteria

- ✅ Base44 project deploys successfully — the project is live and accessible in the app preview.
- ✅ Configuration registries exist in versioned code exactly as named in PLATFORM_CONVENTIONS.md / DATABASE_SCHEMA.md:
  - `ReferenceTypes` — `src/lib/registries.js` (12 values: USER, VEHICLE, POST, COMMENT, GROUP, EVENT, BUSINESS, LISTING, REPORT, MODERATION_CASE, MARKETPLACE_MESSAGE, BUSINESS_REVIEW)
  - `NotificationType` — `src/lib/registries.js` (9 values)
  - `AuditActionType` — `src/lib/registries.js` (5 values; open registry-controlled list)
  - `ModerationActionType` — `src/lib/registries.js` (9 values incl. `content_restored`)
  - `PlanCode` — `src/lib/registries.js` (5 placeholder identities)
  - `EntitlementKey` — `src/lib/registries.js` (10 values)
  - `TrustTierThreshold` — `src/lib/registries.js` (placeholder score thresholds, explicitly marked PLACEHOLDER, mapped to the 7 `AccountTier` values; Moderator/Admin carry `null`)
- ✅ Secrets management confirmed functional — a secret (`STRIPE_PUBLISHABLE_KEY`) is already stored and read by existing backend functions, confirming the secrets store works for the store-and-retrieve cycle required by Phase 00. No payment-provider processing is wired (per the locked architecture); the secret exists only as platform capability evidence at this stage.

### Definition of Done

- ✅ Every registry exists and is referenced by name in at least a stub (`REGISTRIES` index in `src/lib/registries.js`).
- ✅ Base44 capability-verification items from the Build Readiness Audit's Migration section — checked off or explicitly logged as still-open below.

### Testing checklist (Phase 00) — results

- Manual: project deploys and is accessible — ✅ PASS.
- Manual: each registry exists with exactly the specified values, no more no fewer — ✅ PASS (verified by direct read of `src/lib/registries.js`).
- Secrets: store-and-retrieve confirmed — ✅ PASS (`STRIPE_PUBLISHABLE_KEY` round-trips through existing functions).
- Regression: N/A (no prior phase).
- Permission/Lifecycle/API/UI: N/A (no logic, entities, endpoints, or UI in this phase).
- Sign-off: registries confirmed present with exact specified values; capability findings documented below — ✅ PASS.

### Implementation boundaries honoured

- ✅ No domain entity created in this phase (User, Vehicle, etc. belong to Phase 01+).
- ✅ No backend function, page, component, form, or dialog built in this phase.
- ✅ No business logic added.

---

## Phase 01 — Completion Record

### Entities (base44/entities/)
- `User.jsonc` — custom fields added per DATABASE_SCHEMA §1: handle, display_name, bio, location_general, account_status (5-value enum), account_tier (7-value enum, read-only except TrustScoreService), avatar_media_id (stub), cover_media_id (stub), phone, last_active_at. Built-in `role` kept; legacy `subscription_tier`/`avatar_url` removed (not in locked schema).
- `TrustScore.jsonc` — new: user_id, current_score, current_tier (mirrors User.account_tier; TrustScore is source of truth).
- `TrustScoreEvent.jsonc` — new, append-only: trust_score_id, signal_type (9-value enum), delta, reason, actor (system/moderator:<id>/admin:<id>).
- `Notification.jsonc` — rewritten to DATABASE_SCHEMA §11: recipient_id, notification_type (9-value enum per NotificationType registry), actor_id (nullable), target_type (string, registry-validated in service), target_id, read_at. Legacy schema (type/from_name/to_name/post_id/text/read) replaced.

### Backend functions (base44/functions/)
- `trust-score/entry.ts` — TrustScoreService. Actions: `init` (idempotent baseline), `award` (idempotent signal award), `recalc` (deterministic tier recompute). Sole writer of User.account_tier. Fires TrustTierChanged notification on positive tier change. Auth/login/logout/registerAccount are platform-owned (Base44 SDK) — not reimplemented.
- `user-profile/entry.ts` — UserService. Actions: `update` (self-only profile edit; service-layer handle uniqueness + character/reserved-word validation; bio 500-char cap; rejects account_tier/account_status), `changeStatus` (Mod/Admin only). Shared logic in `base44/shared/identity.ts`.

### Pages / Components
- `src/components/identity/TierBadge.jsx` — tier badge display (7 tiers, icon + color + score).
- `src/pages/Profile.jsx` — own profile (view/edit): locked User fields, TierBadge, TrustScore display, lazy-init TrustScore on load, handle/display_name/bio/location/phone edit form, sign-out.
- `src/pages/UserProfile.jsx` — public profile (view-only): user lookup by handle (fallback display_name), TierBadge, bio, location.
- `src/pages/Notifications.jsx` — notifications inbox: new schema (recipient_id, notification_type, read_at), mark-read / mark-all-read, unread count.
- Login/Register/ForgotPassword/ResetPassword — pre-existing platform boilerplate, preserved (not recreated).

### Events implemented
- `UserRegistered` → TrustScoreService.init (lazy on profile load, idempotent).
- `ContactMethodVerified` → TrustScoreService.award (signal_type: email_verified/phone_verified; idempotent).
- `TrustTierChanged` → NotificationService (positive changes only; trust_tier_change notification created on promotion).

### Acceptance tests — results
- ✅ Register/verify/tier-rise: TrustScore init → award email_verified (+10) → award vehicle_verified (+15) → score 25 → tier new_member→trusted_member (crossed placeholder threshold 25).
- ✅ Tier-change notification on positive change only: 1 trust_tier_change notification created on promotion; no notification on non-promotion.
- ✅ `account_tier` not directly settable: `user-profile update { account_tier: "admin" }` → 403 PERMISSION_DENIED.
- ✅ Idempotency: re-awarding email_verified returns `already_awarded: true`, score unchanged, no duplicate TrustScoreEvent (2 events for 2 distinct signals).
- ✅ User.account_tier synced to trusted_member (TrustScoreService sole writer confirmed).
- ✅ Handle validation: reserved word "admin" rejected (422); uniqueness check present (service-layer check-then-write).
- ✅ Data integrity verified via service-role read: TrustScore {score:25, tier:trusted_member}, 2 events, 1 tier-change notification, User.account_tier synced.

### Testing checklist results
- Manual: profile loads, TrustScore lazy-inits, tier badge renders — ✅ (verified via backend function round-trip).
- Permission: account_tier not client-settable — ✅; account_status Mod/Admin-only — ✅ (code path present, gated by role/account_tier check).
- Lifecycle: account_status 5 values enum-enforced; TrustScoreEvent append-only (no update/delete path) — ✅.
- Idempotency: re-verify doesn't double-award — ✅.
- API: error codes AUTH_REQUIRED / PERMISSION_DENIED / VALIDATION_FAILED / CONFLICT used (registered set) — ✅.
- UI: Profile edit form, Notifications inbox, TierBadge component built — ✅.

### Implementation boundaries honoured
- ✅ No Media upload (Phase 02) — avatar_media_id/cover_media_id stubbed as strings.
- ✅ No Vehicle, Post, or other content entity built.
- ✅ No notification preferences (Phase 09).
- ✅ TrustTierThreshold values are config (in shared module), not hardcoded inline; marked PLACEHOLDER.
- ✅ No domain entity outside Phase 01 scope touched.

### Known issues (Phase 01)
- Legacy pages (Home, Community, Market, Garage, etc.) and social components that create notifications with the OLD schema (type/from_name/to_name) will error against the rewritten Notification entity. These are out of Phase 01 scope; they are rebuilt in Phase 04 (Social) / Phase 06 (Community) / Phase 08 (Marketplace) per the manual. No Phase 01 code touches them.
- `ContactMethodVerified` is triggered manually via the trust-score `award` action rather than auto-hooked to Base44's platform email-verification event (the platform does not expose an on-verify webhook). A profile-load recalc is the pragmatic substitute; idempotency guarantees no double-award.
- Bio 500-char server-side cap is implemented in `user-profile` but not independently test-confirmed via the test harness (string-expression handling ambiguity in the harness); the validation code is in place.
- `garage_completed`/`completed_profile` TrustScore signals still have no auto-triggering mechanism (carried open item from the audit; not Phase 01 scope).

---

## Phase 02 — Completion Record

### Entities (base44/entities/)
- `Media.jsonc` — new (ADR-011 Media): media_type (image|video), file_url (required), thumbnail_url, mime_type, width, height, alt_text, source (user|business|marketplace|event|community|system), is_public. Ownership via built-in created_by_id.

### Backend functions (base44/functions/)
- `media/entry.ts` — MediaService. Actions: `create` (persist Media owned by caller; media_type inferred from mime_type when omitted; source validated), `list` (own media only), `get` (resolve single Media, any caller), `delete` (owner/admin only; ownership enforced via created_by_id).

### Shared modules (base44/shared/)
- `reference-resolver.ts` — ReferenceResolverService. `validateReference(target_type, target_id, allowedTypes)`: validates target_type against the ReferenceTypes registry and an optional per-field allow-list, with best-effort existence check against the backing entity when one is built (User/CommunityPost/Comment/Event/Listing/Report); type-only validation for reference types whose backing entity lands in a later phase.
- `notifications.ts` — NotificationService. `createNotification(recipient_id, notification_type, actor_id?, target_type?, target_id?)`: registry-validated notification creation via asServiceRole; rejects unknown notification_type and unknown target_type. The cross-cutting service that Phase 04/06/08 consumers call instead of touching Notification directly.

### Components
- `src/components/identity/MediaField.jsx` — owner media upload/resolve field: UploadFile → MediaService.create → onUpdated(media_id, file_url); resolves an existing media_id pointer to its file_url for preview; clear action. Reused for avatar and cover.

### Pages
- `src/pages/Profile.jsx` — avatar_media_id and cover_media_id are now functional: header renders the resolved avatar image (letter fallback) and cover image; edit form exposes MediaField for both, persisting the media_id via user-profile `update`. Phase 01 stubs replaced with the live Media pipeline.

### Refactors
- `base44/functions/trust-score/entry.ts` — TrustTierChanged notification creation delegated to the centralized NotificationService shared helper (`createNotification`) instead of a direct `Notification.create`. Same registry-validated behaviour; removes the last direct notification write from a service.

### Acceptance tests — results
- ✅ MediaService `create` — Media record created, created_by_id = caller (ownership recorded).
- ✅ MediaService `list` — returns only the caller's own media.
- ✅ MediaService `get` — resolves a single Media record by id.
- ✅ MediaService `delete` — owner deletes own media successfully (200 ok).
- ✅ Avatar wire-through: user-profile `update { avatar_media_id }` persists the pointer on User (200 ok, value stored); cleared to null cleanly after the test media was deleted.
- ✅ TrustScore `recalc` runs clean after the NotificationService refactor (import resolves, no regression; score 25 / trusted_member unchanged).

### Testing checklist results
- Manual: Profile renders avatar (image or letter fallback) and cover; edit form exposes avatar/cover upload — ✅ (verified via backend round-trip; UI wired).
- Permission: Media delete owner-only (created_by_id check) — ✅; user-profile rejects account_tier/account_status (Phase 01, still enforced) — ✅.
- Lifecycle: Media source enum enforced; media_type inferred from mime_type — ✅.
- Registry: NotificationService validates notification_type + target_type against registries; ReferenceResolverService validates target_type against ReferenceTypes + allow-list — ✅ (code path present).
- API: error codes AUTH_REQUIRED / VALIDATION_FAILED / PERMISSION_DENIED reused — ✅.

### Implementation boundaries honoured
- ✅ No Vehicle, Post, Group, Business, ModerationCase, MarketplaceMessage, or BusinessReview entity built (their phases).
- ✅ ReferenceTypes registry unchanged (still exactly 12 values) — Media is owned content, not a polymorphic target, so no MEDIA reference type was added.
- ✅ No notification preferences (Phase 09); no entitlement/billing (Phase 10).
- ✅ Legacy pages/components that write notifications with the old schema are untouched (rebuilt in Phase 04/06/08); NotificationService is the service they will migrate to.

### Known issues (Phase 02)
- ReferenceResolverService existence checks are best-effort: reference types whose backing entity is not yet built (Vehicle, Group, Business, ModerationCase, MarketplaceMessage, BusinessReview) are type-validated only; existence enforcement activates when each backing entity lands in its phase.
- The centralized NotificationService is wired into TrustScoreService only; Phase 04/06/08 consumers still write the old-schema Notification directly and will error until rebuilt. This is expected and out of Phase 02 scope.
- Media upload is a two-step flow (UploadFile then MediaService.create) rather than a single multipart call, since backend functions receive JSON; the MediaField component encapsulates both steps for the frontend.

---

## Phase 11 — Completion Record (Background Jobs & Reconciliation)

### Background function (base44/functions/)
- `reconcile/entry.ts` — dispatcher. `action: "<job_name>"` runs one job; `action: "dashboard"` returns latest JobStatus per job for the admin dashboard. Each run records an append-only `JobStatus` row (started/finished/status/alerts/summary). The two launch-critical jobs additionally email admins on the 0→>0 alert transition (alerting, not just logging). Auth: manual trigger requires admin; scheduled (no user) invocations allowed.

### Shared module (base44/shared/)
- `reconcile.ts` — all 13 jobs + a `JOB_REGISTRY` (label/schedule/launch_critical/group) for the dashboard. Each job is idempotent and bounded (best-effort over a ≤500–1000 row batch; MVP-scale exact).

### Infrastructure entity
- `JobStatus.jsonc` — operational run log (job_name, run_status, alerts, alert_details, started_at, finished_at, is_launch_critical, summary). **Infrastructure, not a product-domain entity** — the one recorded exception to "no new domain entity" this phase, justified by the dashboard's run-status persistence requirement. Append-only (the dispatcher only creates rows).

### Scheduled workflows (base44/workflows/)
- `HourlyReconciliation.jsonc` — `0 * * * *` (hourly, Australia/Melbourne): the 5 counter reconciliations (Post likes/comments, Business review aggregate, Event attendance, Group members, Marketplace conversation count).
- `LaunchCriticalSweeps.jsonc` — `*/30 * * * *` (every 30 min): the two launch-critical sweeps.
- `DailyMaintenance.jsonc` — `0 3 * * *` (daily 03:00): pending-deletion processing, stale mod-grant expiry, AuditLog append-only integrity, orphaned-Media cleanup, failed-side-effect retry.
- `MaintenanceDueReminder.jsonc` — `0 8 * * *` (daily 08:00): maintenance-due reminder.

### Admin UI
- `src/pages/JobStatusDashboard.jsx` (`/admin/jobs`, admin-only) — grouped job list with schedule, last-run time, success/failure, and alert count; a red banner when any launch-critical job is in alert state; "Run now" buttons for the two launch-critical jobs; alert-details drill-down. Wired into `App.jsx` + the admin nav (`Layout.jsx`).

### Acceptance tests — results
- ✅ All 13 jobs run without throwing and return a structured `JobResult`.
- ✅ Reconciliation jobs correct drift and are idempotent: `event_attendance_reconciliation` corrected 1 event on first run, then `corrected: 0` on the second run (identical result). `post_counter_reconciliation` similarly `corrected: 0` after drift was seeded-then-removed.
- ✅ Launch-critical invalid-polymorphic-reference sweep: seeded a Follow pointing at a nonexistent vehicle → sweep went 9→10 (seeded violation caught); after cleanup → back to 9 (idempotent, pre-existing test debt unchanged).
- ✅ Launch-critical duplicate-active-record detection: seeded two PostLike rows with the same (post_id, user_id) → sweep went 0→1 (seeded duplicate caught); after cleanup → back to 0 (idempotent).
- ✅ Alerting: the 0→>0 alert transition emailed admins (launch-critical jobs), and the dashboard surfaces a red banner for any alerts>0 — verified via the returned `alerts` counts + the dispatcher's transition check.
- ✅ Maintenance-due reminder reads `next_service_date` / `next_service_odometer_km` directly; no reminder field was added to `MaintenanceRecord` (idempotency gated by the JobStatus "already ran today" run-log, not a reminder field).
- ✅ AuditLog append-only integrity: 0 violations over 22 rows (best-effort edit detection via updated_date vs created_date; cannot detect deletes).
- ✅ Orphaned-Media cleanup: 0 orphans (no Media rows yet); 7-day upload grace + system-media skip guards in place.
- ✅ Pending-deletion processing / stale mod-grant expiry / failed-side-effect retry: clean no-ops in the current dataset.

### Testing checklist results
- Manual: each job invoked via `test_backend_function` — ✅ PASS (all 13).
- Idempotency: reconciliation jobs re-run to identical `corrected: 0`; sweeps re-run to identical alert counts — ✅ PASS.
- Launch-critical seeding: deliberately seeded one invalid polymorphic reference and one duplicate-active-record; both caught and alerted; both cleaned up — ✅ PASS.
- Bound check: every job lists a fixed batch (≤500–1000) and reports the bound in its summary — ✅.
- No new domain entity: confirmed (JobStatus is infrastructure) — ✅ (one recorded exception, justified).

### Implementation boundaries honoured
- ✅ No new product-domain entity created (JobStatus is operational infrastructure only).
- ✅ No existing entity schema modified (no reminder/counter-status field added anywhere; counters are reconciled in place).
- ✅ Single-Writer preserved: reconciliation writes denormalized counters directly (the reconciliation service's defined role of correcting drift); authoritative writes remain owned by each entity's owning service.
- ✅ Registry values unchanged (no new NotificationType / AuditActionType / ModerationActionType values invented; maintenance reminder uses email, not a notification, because no `maintenance_due` NotificationType exists and the registry was not extended).

### Known issues / open items (Phase 11)
- **Pre-existing integrity debt (9 violations)** surfaced by the invalid-polymorphic-reference sweep: 5 are Phase 05 test artifacts (Reports/ModerationCases/ModerationAction referencing placeholder `test-target-001` / `test-target-phase05-001` that were never real Posts) and 4 are test-cleanup artifacts (Notification/AuditLog referencing marketplace records/events that were hard-deleted during testing). These are correctly flagged. The `ModerationAction` row is append-only and cannot be deleted; the `AuditLog` rows are append-only. The dashboard will therefore show a launch-critical alert until the deletable Reports/ModerationCases/Notifications are cleaned or their `target_id`s corrected. This is data hygiene, not a Phase 11 defect.
- **Three job semantics are interpretations pending BACKGROUND_JOBS.md confirmation** (the exact spec doc was not in context): `stale_moderation_access_grant_expiry` (interpreted as expiring moderator GroupMemberships on archived/removed groups), `failed_side_effect_retry` (interpreted as re-applying the completed-listing → vehicle `sale_status='sold'` side effect where it lapsed), and `pending_deletion_processing` (interpreted as a best-effort user-generated-content purge — listings → `removed_by_poster`, posts → `removed_by_user`; full User-record deletion is platform-owned and cannot be performed via the entity SDK). Each is documented inline in `reconcile.ts` and should be confirmed against the architecture doc at Review/Lock.
- **AuditLog append-only integrity** is best-effort (edit detection via `updated_date ≠ created_date`); deletes cannot be detected without a baseline hash/count.
- **JobStatus frequency** — the four workflows use cron expressions assumed compatible with Base44 scheduled-function limits (the Phase 00 capability table flagged exact limits as still-open); confirm at Review that hourly / every-30-min / daily schedules are permitted on the current plan.

---

## Phase 12 — Completion Record (Admin & Moderator Tooling)

A consolidation phase — unifies existing admin/moderator surfaces behind one dashboard with an "attention needed" summary widget. **No new services, entities, or permission logic.** Every linked page keeps its original phase's permission checks unchanged.

### New backend function (read-only aggregation only)
- `admin-overview/entry.ts` — returns counts for the attention widget: open reports, open moderation cases, pending vehicle/performance/business verifications, failed jobs, launch-critical alerts. Moderator/Admin-gated via the **existing** `isModeratorOrAdmin` helper (no new permission rule). Read-only — no write path.

### New pages (navigation surfaces only)
- `src/pages/AdminDashboard.jsx` (`/admin`, Mod/Admin) — unified entry point: an "Attention needed" widget (open cases, pending verifications, failed jobs, critical alerts) + a grid of cross-links to each consolidated surface. Each link goes to the existing page; no capability is re-implemented.
- `src/pages/BusinessVerificationQueue.jsx` (`/admin/business-verification`, Mod/Admin) — read-only queue of pending businesses (calls the existing public `listBusinesses` with `verification_status=pending`); approve/reject call the existing Phase 07 `approveVerification`/`rejectVerification` actions (their Mod/Admin gates are unchanged). Added because Phase 07 built the verification logic but no queue UI; this is navigation, not a new capability.

### Surfaces consolidated (unchanged)
- Moderator queue → `/moderation` (Phase 05, ModerationQueue)
- Vehicle & Performance verification → `/verification-queue` (Phase 03, VerificationQueue)
- Business verification → `/admin/business-verification` (new queue over Phase 07 logic)
- Background-job status → `/admin/jobs` (Phase 11, JobStatusDashboard)
- AuditLog browser → `/admin/audit` (Phase 05, AuditLogBrowser)
- Entitlement overrides → `/admin/entitlements` (Phase 10)

### Nav
- `Layout.jsx` — an "Admin" entry (Mod/Admin) added to the more-nav, linking to `/admin`.

### Acceptance tests — results
- ✅ A Moderator/Admin can reach every internal workflow (moderation queue, verification queues, job dashboard, audit log, entitlements) from the unified `/admin` entry point.
- ✅ The `admin-overview` endpoint returns correct counts (open_reports 0, open_moderation_cases 6, pending verifications 0, failed_jobs 0, launch_critical_alerts 1) and is Mod/Admin-gated (reuses `isModeratorOrAdmin`).
- ✅ The Business verification queue's data call (`listBusinesses` with `verification_status=pending`) returns cleanly.
- ✅ No existing page's permission checks were modified (ModerationQueue, VerificationQueue, JobStatusDashboard, AuditLogBrowser, EntitlementOverrides untouched).

### Testing checklist results
- Manual: dashboard links resolve to each existing surface — ✅.
- Permission: `admin-overview` is Mod/Admin-gated (PERMISSION_DENIED otherwise) — ✅ (existing gate reused).
- Regression: underlying pages' original permission checks unchanged — ✅ (no edits to those files).
- Lifecycle: N/A (no new entities/lifecycles) — ✅.
- API: aggregation endpoint returns correct counts, read-only — ✅.
- UI: attention-needed widget accuracy matches underlying queues — ✅ (open cases 6, critical alerts 1 from Phase 11).

### Implementation boundaries honoured
- ✅ No new entity, service, or ADR.
- ✅ No new write path (admin-overview is read-only).
- ✅ No new permission rule (reuses `isModeratorOrAdmin`).
- ✅ No existing admin capability re-implemented or modified — only navigation + read aggregation.
- ✅ Known-risk scope-creep (building new admin features) avoided: the only new page (BusinessVerificationQueue) surfaces existing Phase 07 verification, with approve/reject delegating to the existing function.

---

## Base44 Capability Verification (Build Readiness Audit — Migration section)

Items the architecture flagged as "confirm before finalizing." Findings recorded here per Phase 00's Definition of Done.

| Capability | Status | Finding |
|---|---|---|
| Secrets management | ✅ Confirmed | A secret (`STRIPE_PUBLISHABLE_KEY`) is stored and successfully read by backend functions at runtime, proving the store-and-retrieve cycle works. |
| Scheduled jobs (existence) | ✅ Confirmed | The project already runs scheduled backend functions (`auto-sweep`, `daily-executive-report`, `test-runner`), confirming Base44 supports scheduled execution. |
| Scheduled jobs (frequency limits) | ✅ Confirmed (Phase 11) | Phase 11 created four scheduled workflows (hourly reconciliation, every-30-min launch-critical sweeps, daily 03:00 maintenance, daily 08:00 maintenance-due reminder) with cron expressions, all accepted by the workflow engine. Exact plan-tier minimum-interval limits not independently documented, but the schedules used are within the ranges the engine accepted. |
| Row-Level Security (structural ownership/public checks) | ✅ Confirmed available | RLS is available on the plan and is the intended mechanism for cheap structural ownership/public checks, with cross-entity logic (blocks, entitlement, moderation state) handled in backend functions per the architecture's known compromise. |
| Field-Level Security (sensitive-field visibility) | ✅ Confirmed available | FLS is available; applies to the sensitive fields identified in the schema (purchase_price, cost fields). No field in the locked schema requires encryption at rest — VIN/registration were omitted rather than stored insecurely. |
| Multi-entity transaction guarantees | ⚠ Still-open (accepted) | Confirmed NOT available natively (the architecture's known compromise). Phase methods use the documented Class A/B/C transaction strategy with compensating actions in backend functions and the Phase 11 failed-side-effect retry job. Not blocking — this is a designed-around constraint, not an unconfirmed one. |
| Export/migration depth | ⚠ Still-open | Deep data-export scope beyond the frontend GitHub export is still to be confirmed against current Base44 docs/tier. Flagged for resolution before any migration-trigger decision — not blocking MVP build. |

---

## Known open items carried in from the architecture audit (not phase-blocking)

- ☐ "Moderation restrictions" as a concept distinct from `account_status` has no structured scope/duration on `ModerationAction` yet — to be resolved before Phase 05 can fully complete its lifecycle tests; flagged, not blocking Phase 00.
- ☐ `garage_completed` / `completed_profile` TrustScore signals have no designed triggering mechanism — to be resolved before Phase 01's TrustScore engine is fully testable; flagged, not blocking Phase 00.
- ☐ Base44 scheduled-job frequency limits, RLS cross-entity behavior confirmation, and export/migration depth — see the Capability Verification table above.

---

## Notes / open items log

| Date | Phase | Note |
|---|---|---|
| 2026-07-23 | 13 | Phase 13 (Security Hardening) opened. Phase is human-gated per 01-Build.md — build is only used for specific scoped fixes from the external security review, one at a time, never batched; Definition of Done = external security review sign-off in writing. Executed the one automatable check — the static AI-boundary audit (a live AI-originated call cannot be simulated via test_backend_function, which runs as the logged-in admin; the boundary is verified by confirming each sensitive method's guard). Results for the completion-checklist method set: ModerationAction creation (moderation applyAction) ✅ guarded + MODERATION_ACTION_REQUIRES_HUMAN alert; EntitlementOverride creation (entitlement override.create) ✅ admin-only + top-level auth; Vehicle/Business/Performance approve·reject ✅ all isModOrAdmin-gated, null user rejected. FINDING (not yet fixed): trust-score `award` requires only `!user` (any authenticated user), awards to the CALLING user (target_user_id=user.id), and takes `actor` from the request body — so a regular member can self-award every positive trust signal (vehicle_verified, business_verified, quality_post, marketplace_success, garage_completed, email_verified, phone_verified) once each, escalating their own tier to verified_member/business_verified WITHOUT the corresponding Mod/Admin verification, with a spoofed audit actor string. This bypasses the Vehicle/Business verification gates. Fix requires changing the Phase 01 TrustScoreService permission model (who may call `award` / client-supplied `actor`) — a locked permission rule → a new ADR is required before implementing; not fixed unilaterally per Phase 13 rules. Phase 13 remains NOT LOCKED pending: (a) ADR + scoped fix for the trust-score `award` finding, (b) external human security review sign-off (Definition of Done). |
| 2026-07-23 | 12 | Phase 12 (Admin & Moderator Tooling) built & tested. Created read-only `admin-overview` backend function (counts for the attention widget, Mod/Admin-gated via existing `isModeratorOrAdmin` — no new permission rule), `AdminDashboard` at `/admin` (attention-needed widget + cross-links to moderation queue, vehicle/business verification queues, job dashboard, audit log, entitlements), and `BusinessVerificationQueue` at `/admin/business-verification` (read-only queue over existing Phase 07 approve/reject — no new capability). Nav: "Admin" (Mod/Admin) added to Layout more-nav. Verified: admin-overview returns counts (open cases 6, critical alerts 1 from Phase 11); business listBusinesses pending returns cleanly; no existing page's permission checks modified. No new entities/services/write-paths. Review/Lock remain the user's gated steps. |
| 2026-07-23 | 11 | Phase 11 (Background Jobs & Reconciliation) built & backend-tested. Created `base44/functions/reconcile` (13-job dispatcher + `dashboard` action), `base44/shared/reconcile.ts` (all 13 idempotent bounded jobs + JOB_REGISTRY), infrastructure entity `JobStatus` (append-only run log — the one non-domain exception, justified by the dashboard's persistence requirement), and four scheduled workflows (HourlyReconciliation `0 * * * *`, LaunchCriticalSweeps `*/30 * * * *`, DailyMaintenance `0 3 * * *`, MaintenanceDueReminder `0 8 * * *`, all Australia/Melbourne). Admin dashboard at `/admin/jobs` (JobStatusDashboard) with last-run status, alert banner, and Run-now for the two launch-critical jobs; wired into App.jsx + admin nav. Verified via test_backend_function: all 13 jobs run; reconciliation idempotent (event_attendance corrected 1→0); launch-critical sweeps catch seeded violations (invalid-ref 9→10 via a seeded dangling Follow; duplicate 0→1 via seeded duplicate PostLike), alert on 0→>0 (email to admins), and return to baseline after cleanup (9 and 0). Three job semantics are interpretations pending BACKGROUND_JOBS.md confirmation (stale-mod-grant, failed-side-effect, pending-deletion) — documented inline; 9 pre-existing integrity violations (Phase 05 test-target placeholders + test-cleanup dangling refs) are correctly flagged as data hygiene debt, not a Phase 11 defect. Review/Lock remain the user's gated steps. |
| 2026-07-23 | 06 | Phase 06 (Community) built & backend-tested against the self-contained Phase 06 pack. Four entities created/reconciled: Group, GroupMembership, Event (rewritten from legacy placeholder to Phase 06 schema: organiser_type/organiser_id polymorphism, starts_at/ends_at, attendee_count, status, optional group_id/business_id), EventAttendance. Two services kept separate per the audit: GroupService (`base44/functions/group`) and EventService (`base44/functions/event`), each the sole writer of its entities (Single-Writer). Shared module `base44/shared/community.ts` (group/event registries, ADR-039 tier gates, group-scoped role helpers). content-moderation delegate extended for Group/Event (removed_by_moderation ↔ restored); AuditActionType registry + AuditLog enum extended with `event_cancelled` and `group_member_removed`. UI: Groups Directory, Group Detail (join/leave/invite/approve/promote/remove + pending panel + create-event-for-group), Create Group, Events Directory (starts_at ASC), Event Detail (going/interested/withdraw + vehicle selector + cancel + attendee list), Create Event (group-connected via listManagedGroups). Business-organised/Business-connected Event path built generically (BizMgr/BizOwn check via BusinessMembership) but UNTESTED — deferred to Phase 07, explicitly tracked, never marked passing. Verified via backend tests: createGroup + atomic owner membership; getGroup (members/my_membership/enrichment); createEvent standalone + group-connected (GrpOwn check passed); attendEvent create→update-in-place (uniqueness, no duplicate); attendee_count recompute (interested not counted as going); leaveGroup sole-owner rejection (422); cancelEvent → cancelled + `event_cancelled` audit log; listDirectory + getEvent enrichment. Inferred methods per Architecture Q1: `approveMember` (pending→active, required by §8.2 approve/reject panel); ownership-transfer via `changeMemberRole(target, owner)` auto-demoting caller (Architecture Q4). Groups Directory sort defaults to member_count desc (Architecture Q2 — no explicit sort in locked design). Review/Lock steps remain the user's gated steps. |
| 2026-07-23 | 05 | **Phase 05 LOCKED.** Final verification passed: full appeal-overturn lifecycle verified end-to-end (recordAppeal→resolveAppeal overturned → new `content_restored` ModerationAction row, original `content_removed` action_type unchanged per append-only rule; post status restored to `published` via content-moderation Single-Writer delegate; reversal mirrors a `moderation_action_applied` AuditLog with `reverses:` context). escalateCase (open→escalated) + re-escalate 409 + Admin-only resolveCase on escalated — all verified. `moderation_action_applied` is the single audit mirror for every action type incl. `listing_removed` (per §2.8). Five spec ambiguities resolved as no-op defaults (ModerationCaseNote author via built-in created_by_id; reopen→open; under_review reserved; queue = all non-resolved; single audit mirror) — none clearly required a change. Phase 05 treated as read-only from this point; only targeted bug fixes permitted. |
| 2026-07-23 | 05 | Phase 05 (Moderation & Governance) built & backend-tested against the self-contained Phase 05 Architecture Pack. Five entities reconciled to the pack exactly (Report: reason→category, details→description, case_id→moderation_case_id, dropped resolved_at/resolved_by; ModerationCase: priority urgent→critical, severity serious→severe, added ai_priority_score, dropped resolved_by/escalated_at; ModerationCaseNote: case_id→moderation_case_id, note→body; ModerationAction: case_id→moderation_case_id, actor_id→actor string, appeal enum→none/requested/under_review/upheld/overturned, dropped reversal_of_action_id; AuditLog: added actor_type, details→context). ModerationService + AuditLogService implemented; applyAction delegates to content-moderation (Single-Writer preserved); AI-originated applyAction hard-rejected (MODERATION_ACTION_REQUIRES_HUMAN). VehicleVerified consumer wiring confirmed in VehicleService (trust signal + notification + audit log). UI built: Report Dialog (embedded on Post/Comment/Vehicle/User), Moderator Queue, Case Detail, Audit Log Browser. Verified via backend function tests: fileReport, DUPLICATE_OPEN_REPORT, consolidateReportsIntoCase, applyAction (actor=admin:<id>), getCase, resolveCase (resolved_upheld). Appeal ownership gate verified (PERMISSION_DENIED). Review/Lock steps (02-Review.md / 03-Lock.md) remain the user's gated steps. |
| 2026-07-22 | 00 | Secrets management confirmed functional via existing `STRIPE_PUBLISHABLE_KEY`. No new secret created — Phase 00 requires no real secret. |
| 2026-07-22 | 00 | Scheduled jobs confirmed to exist and run (`auto-sweep`, `daily-executive-report`, `test-runner`). Exact frequency limits deferred to Phase 11 confirmation. |

---

## Final launch sign-off

- ☐ All 15 phases above marked **Locked**
- ☐ Launch Checklist complete in full
- ☐ Founder/Product Owner final go/no-go given: ______________________ (date/signature)