# QA Baseline — HondaHub AU

> **QA Freeze active.** No new features, page redesigns, architecture refactors, or
> business-rule changes. Permitted work only: testing, defect documentation,
> fixing *approved* bugs, and re-running regression tests.

---

## Baseline record

| Field | Value |
| --- | --- |
| Baseline version | `v2026.08.06-qa-baseline` |
| Declared | 2026-08-06 14:28 AEST |
| Declared by | QA freeze (user request) |
| Source of truth | `src/App.jsx` route table + `base44/entities/` + `base44/functions/` at this snapshot |

## Freeze rules (in effect)

1. **No new features.** A feature request is logged as a defect/wish only; not built.
2. **No redesigns.** Visual/layout changes are out of scope unless approved as a bug fix.
3. **No refactors.** Internal restructuring is deferred until freeze lifts.
4. **No business-rule changes.** Service logic, validation, and state transitions are frozen.
5. **Allowed:** write/run tests, document defects in `QA_DEFECTS.md`, fix only defects
   explicitly approved in this thread, re-run regression after each approved fix.
6. **Every approved fix** must be followed by a regression re-run and a note in `QA_DEFECTS.md`.

## Baseline surface inventory (regression targets)

### Frontend routes (`src/App.jsx`)
Public auth: `/login`, `/register`, `/forgot-password`, `/reset-password`
Authenticated (under `Layout`):
`/`, `/market`, `/listing/:id`, `/create`, `/events`, `/event/:id`, `/messages`,
`/profile`, `/settings`, `/pricing`, `/community`, `/shop`, `/giveaway`, `/garage`,
`/garage/:id`, `/vehicle/create`, `/vehicle/:id`, `/verification-queue`,
`/user/:name/garage`, `/groups`, `/group/create`, `/group/:id`, `/event/create`,
`/feed`, `/post/:id`, `/connections`, `/connections/:name`, `/moderation`,
`/moderation/case/:id`, `/admin/audit`, `/marketplace`, `/marketplace/create`,
`/marketplace/:id`, `/marketplace/:id/edit`, `/conversations`, `/conversation/:id`,
`/notifications`, `/user/:name`, `/ai-command-center`, `/testing`,
`/admin/entitlements`, `/admin/jobs`, `/admin/business-verification`, `/admin`
Catch-all: `*` → `PageNotFound`

### Backend functions (`base44/functions/`)
admin-overview, auto-sweep, business, create-checkout-session,
daily-executive-report, data-manager, entitlement, event, group, maintenance,
marketplace, media, moderation, modification, notification-retry, performance,
reconcile, social, stripe-webhook, test-runner, timeline, trust-score,
user-profile, vehicle

### Entities (`base44/entities/`)
User (built-in), MarketplaceListing, MarketplaceConversation, MarketplaceMessage,
Notification, ModerationCase, ModerationCaseNote, ModerationAction, Report,
AuditLog, JobStatus, UserBlock, Subscription, EntitlementOverride, Business,
BusinessMembership, BusinessReview, Event, EventAttendance, Group,
GroupMembership, Post, PostLike, Comment, Follow, Vehicle, GarageCar, Media,
TimelineEntry, Modification, MaintenanceRecord, PerformanceRecord, TrustScore,
TrustScoreEvent, Listing, Bid, Story, Message, Profile, Offer, PartnerDiscount,
Giveaway, GiveawayEntry, TestResult, CommunityPost, Bug, GameResult, Conversation

### Key flows to regress
- **Auth** — register→OTP→verify, login (email + Google), forgot/reset, protected routes.
- **Garage** — vehicle CRUD, cover media, timeline entries, modifications, maintenance,
  performance records, verification queue.
- **Social** — feed, post create/edit, comments, likes, follow/unfollow, connections.
- **Groups** — create, join/leave, membership roles, private visibility.
- **Events** — create, RSVP (going/interested), organiser (user/business/group).
- **Marketplace (ADR-044 wizard)** — Vehicle/Part selection → flow-specific steps →
  auto-save (between steps + 30s) → draft resume at first incomplete step →
  preview & publish; listing detail; conversations; messages; block list;
  contact-sharing warning; expiry/renew; reserve/complete.
- **Moderation** — report filing, case queue, assign, actions, appeals, audit log.
- **Business** — profile create/edit, membership, verification submit/approve/reject,
  reviews + business response, experience-verified flag.
- **Notifications** — create, read tracking, delivery retry workflow.
- **Admin** — entitlement overrides, job status dashboard, business verification queue,
  audit log browser, admin overview.
- **Billing** — Stripe checkout session (features/auction), webhook → listing flags.

### Known open items carried into freeze
- Two parallel listing systems exist: legacy `Listing` (`/create`, `/market`) and
  ADR-044 `MarketplaceListing` (`/marketplace/create`, `/marketplace`). Both are
  frozen as-is; consolidation is out of scope during freeze.

## How to log work during freeze
- New defect → add to `QA_DEFECTS.md` with id, area, repro, severity, status.
- Approved fix → apply minimal change, re-run regression, update defect status,
  note the regression result. Do not touch unrelated code.