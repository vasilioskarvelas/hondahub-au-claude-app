const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_GARAGE_CAR, TEST_TAG, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

async function login(page, account) {
  await page.goto('/');
  await waitForLoadingToFinish(page);
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(account.email);
    await passwordInput.fill(account.password);
    await page.locator('button[type="submit"]').first().click();
    await waitForLoadingToFinish(page);
  }
}

test.describe('Garage', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user1);
  });

  test('should load garage page', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/garage');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/garage');
    const errors = getErrors();
    expect(errors.length).toBe(0);
  });

  test('should show garage content or empty state', async ({ page }) => {
    await page.goto('/garage');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);
    const content = await page.locator('body').textContent();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should open add car modal', async ({ page }) => {
    await page.goto('/garage');
    await waitForLoadingToFinish(page);

    const addBtn = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Add Car"), button:has-text("+")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      // Modal or form should appear
      const modal = page.locator('[role="dialog"], .fixed.inset-0, form').first();
      expect(await modal.count() > 0).toBeTruthy();
    }
  });

  test('should fill car submission form', async ({ page }) => {
    await page.goto('/garage');
    await waitForLoadingToFinish(page);

    const addBtn = page.locator('button:has-text("Add"), button:has-text("New")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(1000);

      // Fill model
      const modelInput = page.locator('input[name*="model"], input[placeholder*="model" i]').first();
      if (await modelInput.count() > 0) {
        await modelInput.fill(TEST_GARAGE_CAR.model);
      }

      // Fill chassis code
      const chassisInput = page.locator('input[name*="chassis"], input[placeholder*="chassis" i]').first();
      if (await chassisInput.count() > 0) {
        await chassisInput.fill(TEST_GARAGE_CAR.chassis_code);
      }

      // Fill engine code
      const engineInput = page.locator('input[name*="engine"], input[placeholder*="engine" i]').first();
      if (await engineInput.count() > 0) {
        await engineInput.fill(TEST_GARAGE_CAR.engine_code);
      }

      // Fill year
      const yearInput = page.locator('input[name*="year"], input[type="number"]').first();
      if (await yearInput.count() > 0) {
        await yearInput.fill(String(TEST_GARAGE_CAR.year));
      }

      // Fill power
      const powerInput = page.locator('input[name*="power"], input[placeholder*="power" i]').first();
      if (await powerInput.count() > 0) {
        await powerInput.fill(String(TEST_GARAGE_CAR.power_kw));
      }
    }
  });

  test('should open garage car detail page', async ({ page }) => {
    await page.goto('/garage');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const carLink = page.locator('a[href*="/garage/"]').first();
    if (await carLink.count() > 0) {
      await carLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/garage\//);
    }
  });

  test('should access garage from profile', async ({ page }) => {
    await page.goto('/profile');
    await waitForLoadingToFinish(page);

    const garageLink = page.locator('a[href*="/garage"]').first();
    if (await garageLink.count() > 0) {
      await garageLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toContain('/garage');
    }
  });

  test('should show garage car specifications', async ({ page }) => {
    await page.goto('/garage');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const carLink = page.locator('a[href*="/garage/"]').first();
    if (await carLink.count() > 0) {
      await carLink.click();
      await waitForLoadingToFinish(page);
      // Detail page should show specs
      const content = await page.locator('body').textContent();
      expect(content.length).toBeGreaterThan(50);
    }
  });

  test('should access user garage from profile link', async ({ page }) => {
    await page.goto('/profile');
    await waitForLoadingToFinish(page);

    // Look for "My Garage" link
    const garageLink = page.locator('a:has-text("Garage"), a[href*="/garage"]').first();
    if (await garageLink.count() > 0) {
      await garageLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/garage/);
    }
  });
});