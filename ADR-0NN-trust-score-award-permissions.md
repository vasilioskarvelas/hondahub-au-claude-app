# ADR-0NN: Restrict TrustScore award authority and remove client-supplied actor

> **Assign the next free ADR number before merging.** Existing ADRs referenced in the repo include ADR-011, ADR-029, ADR-032, ADR-039, ADR-044 — pick the next sequential number in your ADR log.

**Status:** Proposed
**Date:** 2026-08-08
**Deciders:** Vas (product owner / builder), external security reviewer
**Supersedes / amends:** The Phase 01 TrustScoreService permission model (locked)
**Related:** Phase 01 (Identity Foundation), Phase 13 (Security Hardening), Security Checklist item "AI cannot write TrustScoreEvent directly"

---

## Context

The `trust-score` backend function's `award` action is the sole writer of `TrustScoreEvent` rows and, transitively, of `User.account_tier`. As currently implemented (confirmed against `base44/shared/trust-score.ts`):

- The action gates only on `!user` — i.e. **any authenticated user** may call it.
- It awards the signal to the **calling user** (`target_user_id = user.id`).
- It accepts the **`actor` string from the request body** (client-supplied).

The consequence is a privilege-escalation vulnerability. A regular member can call `award` once for each positive signal — `email_verified`, `phone_verified`, `vehicle_verified`, `business_verified`, `quality_post`, `marketplace_success`, `garage_completed` — and:

1. Raise their own `TrustScore` and cross tier thresholds up to `verified_member` / `business_verified`, **without ever passing the Mod/Admin verification gates** those tiers are supposed to require.
2. Write an **audit trail with a spoofed `actor`** (e.g. `"admin:someone"`), corrupting the integrity of the append-only audit log.

This defeats the purpose of the Vehicle and Business verification workflows and is the sole reason the Security Checklist item *"AI cannot write TrustScoreEvent directly"* fails. It is the top launch blocker (punch-list A1 / assessment B1).

Because the current behavior is a **locked** permission rule from Phase 01, changing it requires an ADR (per Phase 13 rules) before any code is altered.

---

## Decision

We change the TrustScore award model as follows.

### 1. Signals are classified by their trust source

| Signal | Source of truth | Who may cause the award |
|---|---|---|
| `email_verified` | Platform email-verification state | System, on verified state (idempotent, server-checked) |
| `phone_verified` | Platform/contact verification state | System, on verified state (idempotent, server-checked) |
| `vehicle_verified` | `VehicleService` approve action | Mod/Admin only, via VehicleService (not the client) |
| `business_verified` | `BusinessService` verification approve | Mod/Admin only, via BusinessService (not the client) |
| `quality_post`, `marketplace_success`, `garage_completed`, `completed_profile` | Domain events in owning services | The owning service only, fired from a server-verified event |

### 2. `award` is no longer a directly client-callable escalation path

- The `award` action **rejects direct calls from a non-service, non-admin caller.** It is invoked only:
  - by another **backend service** (service-to-service / `asServiceRole`), or
  - by a **Mod/Admin** for the explicitly Mod/Admin-gated signals.
- Any authenticated end-user calling `award` directly receives `PERMISSION_DENIED`.

### 3. `actor` is server-derived, never client-supplied

- The `actor` recorded on each `TrustScoreEvent` is derived server-side from the authenticated principal (`system`, `moderator:<id>`, `admin:<id>`, or `service:<name>`).
- The `actor` field in the request body is **ignored** (and its presence may be logged as a rejected input).

### 4. `target_user_id` is derived from the triggering event, not the caller

- For service-fired signals, the target is the subject of the domain event (e.g. the owner of the verified vehicle), not `user.id`.
- Self-award of verification-class signals is structurally impossible.

### 5. Idempotency is preserved

- The existing idempotency guarantee (one event per (user, signal) where applicable; `already_awarded: true` on repeat) is retained unchanged.

---

## Consequences

**Positive**
- Closes the privilege-escalation hole; the verified tiers again require the real Mod/Admin gates.
- Restores audit-log integrity (no spoofable actor).
- Flips the Security Checklist item *"AI cannot write TrustScoreEvent directly"* to PASS and unblocks Phase 13.
- Makes `TrustScoreService` a true single-writer driven by server-verified events only.

**Negative / cost**
- Requires wiring the domain-event triggers that currently don't exist: `garage_completed` / `completed_profile` have **no auto-triggering mechanism today** (a pre-existing open item) — this ADR is the moment to design those triggers or explicitly defer those two signals.
- `email_verified` / `phone_verified` rely on a platform state check rather than an on-verify webhook (Base44 exposes no verify webhook); keep the profile-load recalc substitute, now server-guarded.
- Touches a locked Phase 01 rule, so Phase 01's acceptance tests must be re-run after the change.

**Neutral**
- No schema change to `TrustScore` / `TrustScoreEvent` is required — only the permission and actor-derivation logic changes.

---

## Implementation checklist (post-approval)

- [ ] Assign the ADR number and mark Status: Accepted.
- [ ] Gate `award` to service-role / Mod-Admin callers; return `PERMISSION_DENIED` for direct end-user calls.
- [ ] Derive `actor` and `target_user_id` server-side; ignore client `actor`.
- [ ] Route `vehicle_verified` through `VehicleService` approve; `business_verified` through `BusinessService` verification approve.
- [ ] Decide: implement `garage_completed` / `completed_profile` triggers now, or defer those two signals (record the choice here).
- [ ] Re-run Phase 01 acceptance tests + the security static audit.
- [ ] Add a regression test: an ordinary authenticated user calling `award` (any signal, any actor string) → `PERMISSION_DENIED`, no `TrustScoreEvent` written.
- [ ] Update `PROGRESS_TRACKER.md` (Phase 13 finding closed) and note the regression result in `QA_DEFECTS.md`.
