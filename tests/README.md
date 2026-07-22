# Honda Hub — Autonomous User Testing System

## Overview

This system tests Honda Hub **exactly as real customers would use it** — through real browser sessions using [Playwright](https://playwright.dev). It does NOT merely inspect the database or code.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  External (Playwright — runs in real browsers)           │
│                                                         │
│  tests/playwright.config.js    ← Config & device projects│
│  tests/helpers/test-data.js     ← Test accounts & data   │
│  tests/helpers/base44-reporter.js ← Results reporter     │
│  tests/journeys/01-account.spec.js                      │
│  tests/journeys/02-social.spec.js                       │
│  tests/journeys/03-marketplace.spec.js                  │
│  tests/journeys/04-events.spec.js                        │
│  tests/journeys/05-garage.spec.js                        │
│  tests/journeys/06-navigation.spec.js                   │
│  tests/journeys/07-exploratory.spec.js                  │
│  tests/journeys/08-edge-cases.spec.js                   │
│                                                         │
│  Browser → Honda Hub app → Buttons, forms, uploads      │
│                    ↓                                     │
│  Results → fetch() → test-runner function → Entities    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Native (Base44 — dashboard & data)                      │
│                                                         │
│  Testing Command Centre (/testing)                      │
│    ← TestResult & Bug entities                           │
│    ← DB Smoke Tests (run natively)                      │
│    ← Cleanup test data                                  │
└─────────────────────────────────────────────────────────┘
```

### Why External?

Base44 backend functions are HTTP endpoints (Deno deploy handlers), **not browser environments** — they cannot launch browsers, click buttons, or type into fields. The platform cannot natively execute real browser automation. Playwright runs externally (your machine, CI/CD) against the deployed app and reports results back.

---

## Setup

### 1. Install Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. Create Test Accounts

In your Base44 dashboard, invite these test users (Settings → Invite Users):

| Account | Email | Role |
|---------|-------|------|
| Admin | TEST_admin@hondahub.test | admin |
| Buyer | TEST_buyer@hondahub.test | user |
| Seller | TEST_seller@hondahub.test | user |

All test accounts are prefixed with `TEST_`. **Never use real customer accounts.**

### 3. Set Environment Variables

```bash
export HONDA_HUB_URL="https://your-app.base44.app"
export TEST_ADMIN_EMAIL="TEST_admin@hondahub.test"
export TEST_ADMIN_PASSWORD="TestAdmin123!"
export TEST_USER1_EMAIL="TEST_buyer@hondahub.test"
export TEST_USER1_PASSWORD="TestUser123!"
export TEST_USER2_EMAIL="TEST_seller@hondahub.test"
export TEST_USER2_PASSWORD="TestUser123!"
```

### 4. Run Tests

```bash
# Run all suites (all devices)
npx playwright test

# Run one suite
npx playwright test tests/journeys/01-account.spec.js

# Run on mobile only
npx playwright test --project=mobile-safari

# Run a specific test by name
npx playwright test --grep "should register"

# View HTML report
npx playwright show-report
```

---

## Test Suites

### 1. Account Testing (`01-account.spec.js`)
- Register new account, verify registration
- Login, logout, password reset
- Edit profile, upload/replace profile photos
- Invalid login, duplicate email registration

### 2. Social Platform Testing (`02-social.spec.js`)
- Create text/image/video posts, like/unlike, comments (add/edit/delete)
- Share, save posts, follow/unfollow, tag users, hashtags & mentions
- Stories & reels, direct messages, notifications
- Report/block users, feed updates

### 3. Marketplace Testing (`03-marketplace.spec.js`)
- Create car & parts listings, upload photos, edit/delete
- Search, filters (category, price, location, vehicle)
- Submit offers, accept/reject/counter, marketplace messages
- Mark as sold, Buy Now & auction functions
- Notification verification

### 4. Event Testing (`04-events.spec.js`)
- Create events, open from every location
- Event Details page completeness
- Mark interested/attending, cancel attendance
- Share, invite, save events
- Location/map, comments, expired/cancelled events

### 5. Garage Testing (`05-garage.spec.js`)
- Add vehicle, upload photos, engine/transmission/modification details
- Edit/remove vehicles, build updates
- Share to social feed, listing/profile connections

### 6. Navigation Testing (`06-navigation.spec.js`)
- Crawls every page, clicks every safe button/link/card/menu
- Detects: dead buttons, broken links, missing pages, blank pages
- Detects: broken redirects, broken back buttons, forms that don't submit
- Detects: failed uploads, missing loading indicators, missing success/error messages
- Detects: mobile layout issues, content hidden behind nav, slow pages, console/API errors

### 7. Exploratory Testing (`07-exploratory.spec.js`)
- Random navigation like an unpredictable customer
- Different buttons, filters, profiles, listings, actions

### 8. Edge-Case Testing (`08-edge-cases.spec.js`)
- Empty fields, incorrect data, long text
- Unsupported files, large images, repeated clicks
- Expired sessions, interrupted connections, unauthorised access

---

## Device Testing

| Project | Device | Viewport |
|---------|--------|----------|
| desktop-chrome | Desktop Chrome | 1440×900 |
| desktop-firefox | Desktop Firefox | 1440×900 |
| mobile-safari | iPhone 15 Pro | 393×852 |
| mobile-chrome | Pixel 7 | 412×915 |
| tablet | iPad Pro 11 | 834×1194 |

---

## Bug Reporting

Every failed test automatically creates a **Bug** record containing:
- Bug title, date/time, test account, device & screen size
- Page URL, actions performed, expected vs actual result
- Error message, console/API errors, screenshot
- Severity (Critical / High / Medium / Low)
- Responsible specialist agent
- Repair status & retest result

Bugs are visible in the **Testing Command Centre** (`/testing`) in the app.

### Severity Classification

| Severity | Criteria |
|----------|----------|
| **Critical** | Prevents login, security failure, data loss, payment failure, major outage |
| **High** | Major feature or customer journey does not work |
| **Medium** | Feature works partially or creates confusion |
| **Low** | Visual, wording, or minor usability issue |

---

## Test Data Safety

- ✅ All test accounts prefixed with `TEST_`
- ✅ All test content marked with `[AUTOMATED TEST]`
- ✅ Never contacts real users
- ✅ Never charges real payment methods (uses test card `4242 4242 4242 4242` when needed)
- ✅ Automatic cleanup via "Cleanup Test Data" button in Testing Command Centre
- ✅ Failed test data retained for investigation until manually cleaned

---

## Automatic Repair Workflow

1. Test fails → Bug record created automatically
2. Bug assigned to specialist agent (auto-assigned based on test suite)
3. Bug visible in Testing Command Centre with "Start Repair" button
4. After fix, mark as "Fixed" → status changes to "retesting"
5. Re-run the same test → if pass, mark as "Resolved"
6. Run regression suite to confirm no regressions

---

## Test Schedule

| Frequency | Tests |
|-----------|-------|
| After every significant update | Critical customer journey tests |
| Nightly | Complete platform test (all suites) |
| Regular intervals | Marketplace, social, messaging, event smoke tests |
| Before public release | Full regression testing |

### Running on a Schedule (CI/CD)

```yaml
# .github/workflows/honda-hub-tests.yml
name: Honda Hub Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install -D @playwright/test
      - run: npx playwright install --with-deps
      - run: npx playwright test
        env:
          HONDA_HUB_URL: ${{ secrets.HONDA_HUB_URL }}
          TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
          TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Integration Requirements

To connect the external Playwright suite to the native Testing Command Centre:

1. **Deploy the app** — the Playwright tests need a live URL to test against
2. **Create test accounts** — invite `TEST_` prefixed users as admin/user
3. **Set environment variables** — see Setup above
4. **Run tests** — results auto-report to the Testing Command Centre via the `test-runner` backend function
5. **View results** — navigate to `/testing` in the app

The `test-runner` function accepts these actions:
- `report` — receive test results & bugs from Playwright
- `smoke` — run database-level smoke tests (native)
- `cleanup` — delete all test data
- `stats` — get dashboard statistics