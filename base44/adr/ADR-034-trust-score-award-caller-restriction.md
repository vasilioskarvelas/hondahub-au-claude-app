# ADR-034 — Restrict `trust-score award` to Moderator/Admin

- **Status:** Accepted
- **Date:** 2026-07-23
- **Phase:** 13 (Security Hardening) / 01 (TrustScoreService)
- **Supersedes/Clarifies:** Phase 01 TrustScoreService `award` action permission model

## Context

The Phase 14/999 evidence audit (verified defect B1) found that the `trust-score`
backend function's `award` action accepted any authenticated caller and awarded a
trust signal to the *calling* user, taking the audit `actor` string from the
request body. This let any member — and by extension any AI integration holding a
user credential — self-award `vehicle_verified`, `business_verified`,
`quality_post`, `marketplace_success`, `garage_completed`, `email_verified`, and
`phone_verified`, raising their own `User.account_tier` past the Vehicle/Business
verification gates with a spoofed `actor`.

This directly violates Security Checklist item 5 ("AI cannot write a TrustScoreEvent
directly (only propose one)") and the locked permission rule that verification
signals originate only from the owning verification service.

## Decision

1. The `trust-score` HTTP `award` action is restricted to Moderator/Admin callers.
   A non-Mod/Admin caller receives `PERMISSION_DENIED` (403).
2. The audit `actor` is derived from the authenticated principal
   (`admin:<id>` / `moderator:<id>`), never from the request body.
3. The HTTP `award` action accepts an optional `target_user_id` (the recipient),
   so a Mod/Admin may award a signal to a user other than themselves (the intended
   operational use, e.g. manually confirming a verified contact method).

## Why this is minimal and breaks no verification flow

The verification services that award `vehicle_verified` / `business_verified` /
`marketplace_success` — `vehicle/entry.ts` `approveVerification`,
`shared/business-verified.ts` `onBusinessVerified`, and
`shared/marketplace.ts` `onListingCompleted` — call `awardSignalToUser` **directly**
via the shared module, not through the `trust-score` HTTP `award` endpoint.
Restricting the HTTP endpoint therefore does not affect any verification flow.

No frontend page calls the `award` action (Profile.jsx calls `init` only; Settings
does not call `trust-score`). The previous self-award path for
`email_verified`/`phone_verified` was already a manual/admin action with no
platform webhook (documented Phase 01 known-issue); this ADR formalises it as
Mod/Admin-only. A future platform email/phone-verification webhook, if exposed,
would call `awardSignalToUser` directly via the shared module.

## Consequences

- Security Checklist item 5 passes: no authenticated user or AI integration can
  create a `TrustScoreEvent` or raise `account_tier` via the HTTP endpoint.
- Single-Writer Rule preserved: `awardSignalToUser` (shared/trust-score.ts) remains
  the sole writer of `TrustScoreEvent`, `TrustScore`, and `User.account_tier`.
- `TrustScoreEvent` remains append-only (no update/delete path introduced).
- Idempotency preserved: `awardSignalToUser` still no-ops on an already-awarded
  signal.