# Honda Hub — QA Execution Runbook

How to actually run the Playwright suite that lives in `tests/` and feed results into the QA freeze. The harness is built (8 journey suites × 5 device profiles, auto bug-reporting to `/testing`); it just hasn't been run. This closes punch-list items A6 and Section D.

## One-time setup

1. **Deploy the app to a stable QA URL.** The Playwright tests hit a live deployment, not the code. Note the URL (e.g. `https://hondahub-au.base44.app`).

2. **Create the test accounts** in the Base44 dashboard (Settings → Invite Users). All must be `TEST_` prefixed — never real customers:

   | Role | Email | Password (example — set your own) |
   |---|---|---|
   | Admin | `TEST_admin@hondahub.test` | `TestAdmin123!` |
   | Buyer | `TEST_buyer@hondahub.test` | `TestUser123!` |
   | Seller | `TEST_seller@hondahub.test` | `TestUser123!` |

3. **Add Playwright as a dev dependency** (if not already): `npm install -D @playwright/test` and commit the lockfile change.

## Running locally

```bash
export HONDA_HUB_URL="https://your-app.base44.app"
export TEST_ADMIN_EMAIL="TEST_admin@hondahub.test"
export TEST_ADMIN_PASSWORD="TestAdmin123!"
export TEST_USER1_EMAIL="TEST_buyer@hondahub.test"
export TEST_USER1_PASSWORD="TestUser123!"
export TEST_USER2_EMAIL="TEST_seller@hondahub.test"
export TEST_USER2_PASSWORD="TestUser123!"

npx playwright install          # first time only
npx playwright test             # all suites, all devices
npx playwright show-report      # open the HTML report
```

Useful subsets:

```bash
npx playwright test tests/journeys/01-account.spec.js   # one suite
npx playwright test --project=mobile-safari             # one device
npx playwright test --grep "should register"            # one test by name
```

## Running in CI

Add `honda-hub-tests.yml` to `.github/workflows/`, then add these repo secrets under **Settings → Secrets and variables → Actions**: `HONDA_HUB_URL`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_USER1_EMAIL`, `TEST_USER1_PASSWORD`, `TEST_USER2_EMAIL`, `TEST_USER2_PASSWORD`. It runs nightly, on push to `main`, and on demand from the Actions tab.

## Triage workflow (respect the QA freeze rules)

The freeze permits only: writing/running tests, documenting defects, fixing **approved** defects, and re-running regression. So:

1. Run the full suite. Every failure auto-creates a Bug in the Testing Command Centre (`/testing`).
2. For each failure, add an entry to `QA_DEFECTS.md` with: `id`, `area`, `repro`, `severity` (Critical/High/Medium/Low), `status: new`.
3. Triage severity. **Critical** = login broken, security failure, data loss, payment failure, outage. **High** = a major journey doesn't work.
4. Only fix defects you explicitly approve. Apply the **minimal** change, re-run the relevant regression, update the defect status (`fixed` → re-run → `regressed-pass`), and note the regression result. Don't touch unrelated code.
5. Repeat until the Critical/High list is empty and Medium/Low are triaged (fix-now / fix-later / accept).

## Definition of "QA pass" for launch

- [ ] All 8 journey suites executed on all 5 device profiles.
- [ ] Zero open **Critical** or **High** defects.
- [ ] Every **Medium/Low** defect has a conscious disposition logged in `QA_DEFECTS.md`.
- [ ] The two launch-critical reconciliation jobs sit at a **green baseline** (ties to punch-list A2).
- [ ] Seed/demo data purged from the production environment before go-live.
- [ ] Nightly CI green for at least one full run before the founder GO decision.
