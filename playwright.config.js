// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for Honda Hub autonomous user testing.
 *
 * PREREQUISITES:
 *   npm install -D @playwright/test
 *   npx playwright install
 *
 * Set these environment variables before running:
 *   HONDA_HUB_URL       — your deployed app URL (e.g. https://your-app.base44.app)
 *   TEST_ADMIN_EMAIL    — admin test account email
 *   TEST_ADMIN_PASSWORD  — admin test account password
 *
 * Run:
 *   npx playwright test                    — run all suites
 *   npx playwright test tests/journeys/01-account.spec.js   — run one suite
 *   npx playwright test --project=mobile-safari  — run on one device
 *   npx playwright test --grep "should register"  — run by name pattern
 */
module.exports = defineConfig({
  testDir: './tests/journeys',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Sequential — test accounts interact with shared data
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./tests/helpers/base44-reporter.js'],
  ],
  use: {
    baseURL: process.env.HONDA_HUB_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    // ── Desktop browsers ──
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    // ── iPhone-sized mobile ──
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 15 Pro'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    // ── Tablet ──
    {
      name: 'tablet',
      use: { ...devices['iPad Pro 11'] },
    },
  ],
});