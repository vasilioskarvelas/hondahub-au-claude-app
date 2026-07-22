/**
 * Test data and helpers for Honda Hub Playwright test suite.
 *
 * All test accounts are prefixed with TEST_ and all content is marked [AUTOMATED TEST].
 * NEVER use real customer accounts, real payments, or production communications.
 */

// Test account credentials — create these in the Base44 dashboard as test users
const TEST_ACCOUNTS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'TEST_admin@hondahub.test',
    password: process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!',
    displayName: 'TEST_Admin',
    role: 'admin',
  },
  user1: {
    email: process.env.TEST_USER1_EMAIL || 'TEST_buyer@hondahub.test',
    password: process.env.TEST_USER1_PASSWORD || 'TestUser123!',
    displayName: 'TEST_Buyer',
    role: 'user',
  },
  user2: {
    email: process.env.TEST_USER2_EMAIL || 'TEST_seller@hondahub.test',
    password: process.env.TEST_USER2_PASSWORD || 'TestUser123!',
    displayName: 'TEST_Seller',
    role: 'user',
  },
};

// Prefix for all test content — enables automatic cleanup
const TEST_PREFIX = 'TEST_';
const TEST_TAG = '[AUTOMATED TEST]';

// Sample test data for listings, posts, events, etc.
const TEST_LISTING = {
  title: `${TEST_PREFIX}2008 Honda Civic Type R FD2 — ${TEST_TAG}`,
  description: `${TEST_TAG} Automated test listing. This is a test vehicle for Playwright testing. Low mileage, well maintained.`,
  type: 'car',
  price: 18500,
  condition: 'used',
  brand: 'Honda',
  model: 'Civic Type R',
  chassis_code: 'FD2',
  engine_code: 'K20A',
  transmission: 'manual',
  state: 'NSW',
  location: 'Sydney',
  postcode: '2000',
  year: 2008,
  kilometres: 45000,
  car_type: 'street',
};

const TEST_PART_LISTING = {
  title: `${TEST_PREFIX}Recaro SR3 Seats — ${TEST_TAG}`,
  description: `${TEST_TAG} Automated test listing for parts. Pair of Recaro SR3 seats in good condition.`,
  type: 'part',
  price: 1200,
  condition: 'used',
  brand: 'Recaro',
  state: 'VIC',
  location: 'Melbourne',
  postcode: '3000',
  oem_aftermarket: 'aftermarket',
};

const TEST_POST = {
  caption: `${TEST_TAG} Just finished my K-swap build! Testing the social feed. #KSwap #Honda #Build ${TEST_TAG}`,
  vehicle_model: 'Honda Civic EK',
  chassis_code: 'EK9',
  engine_family: 'K',
};

const TEST_EVENT = {
  title: `${TEST_PREFIX}Sydney Honda Meet — ${TEST_TAG}`,
  type: 'meet',
  date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], // 14 days from now
  time: '10:00',
  location: 'Sydney Opera House Car Park',
  state: 'NSW',
  description: `${TEST_TAG} Automated test event for Playwright testing. All Honda enthusiasts welcome!`,
};

const TEST_GARAGE_CAR = {
  model: `${TEST_PREFIX}EK9 Civic Type R`,
  chassis_code: 'EK9',
  engine_code: 'B16B',
  engine_family: 'B',
  induction_type: 'na',
  gearbox: 'S4C',
  power_kw: 136,
  year: 1998,
  modifications: `${TEST_TAG} Built B16B, intake, exhaust, tuned ECU`,
};

// ─── Helper functions ───

/** Generate a unique test ID for this run */
function generateRunId() {
  return `playwright-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique email for registration tests */
function generateTestEmail() {
  return `TEST_${Date.now()}@hondahub.test`;
}

/** Capture console errors during a test */
function setupConsoleCapture(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });
  return () => errors;
}

/** Take a screenshot and return a data URL (for reporting) */
async function captureScreenshot(page, name) {
  try {
    const buffer = await page.screenshot({ path: `tests/screenshots/${name}-${Date.now()}.png`, fullPage: false });
    return `tests/screenshots/${name}-${Date.now()}.png`;
  } catch {
    return '';
  }
}

/** Report test results to the Honda Hub backend */
async function reportResults(page, results, bugs, runId) {
  try {
    // Execute in browser context to use the user's auth session
    await page.evaluate(async ({ results, bugs, runId }) => {
      await fetch('/api/functions/test-runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', results, bugs, run_id: runId }),
      });
    }, { results, bugs, runId });
  } catch (e) {
    console.log(`[Reporter] Failed to send results: ${e.message}`);
  }
}

/** Wait for loading spinners to disappear */
async function waitForLoadingToFinish(page) {
  // Wait for spinners
  const spinners = page.locator('.animate-spin');
  const count = await spinners.count();
  for (let i = 0; i < count; i++) {
    try {
      await spinners.nth(i).waitFor({ state: 'hidden', timeout: 10_000 });
    } catch { /* spinner might have been removed */ }
  }
  await page.waitForLoadState('networkidle');
}

/** Safely click an element, waiting for it to be visible and enabled */
async function safeClick(page, selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
  await page.click(selector);
  await waitForLoadingToFinish(page);
}

/** Fill a field and verify the value was entered */
async function fillField(page, selector, value) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
  await page.fill(selector, value);
  const actualValue = await page.inputValue(selector);
  if (actualValue !== value) throw new Error(`Field ${selector} did not accept value "${value}"`);
}

module.exports = {
  TEST_ACCOUNTS,
  TEST_PREFIX,
  TEST_TAG,
  TEST_LISTING,
  TEST_PART_LISTING,
  TEST_POST,
  TEST_EVENT,
  TEST_GARAGE_CAR,
  generateRunId,
  generateTestEmail,
  setupConsoleCapture,
  captureScreenshot,
  reportResults,
  waitForLoadingToFinish,
  safeClick,
  fillField,
};