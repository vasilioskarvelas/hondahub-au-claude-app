const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

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

const PAGES = ['/', '/market', '/community', '/events', '/garage', '/giveaway', '/shop', '/pricing'];

test.describe('Exploratory — Random Navigation', () => {
  test('should navigate randomly without crashing', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);

    // Visit 5 random pages
    const visited = [];
    for (let i = 0; i < 5; i++) {
      const route = PAGES[Math.floor(Math.random() * PAGES.length)];
      visited.push(route);
      await page.goto(route);
      await waitForLoadingToFinish(page);
      await page.waitForTimeout(1000);

      // Page should not be blank
      const content = await page.locator('body').textContent();
      expect(content.trim().length, `Page ${route} was blank`).toBeGreaterThan(10);
    }

    console.log('Visited:', visited.join(' → '));
  });

  test('should click random visible buttons without crashing', async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user1);
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    // Find visible buttons
    const buttons = page.locator('button:visible');
    const count = await buttons.count();

    // Click 3 random buttons
    for (let i = 0; i < 3 && count > 0; i++) {
      const idx = Math.floor(Math.random() * Math.min(count, 10));
      const btn = buttons.nth(idx);
      const text = await btn.textContent().catch(() => '');

      try {
        await btn.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        // Should not crash
        const content = await page.locator('body').textContent();
        expect(content.trim().length).toBeGreaterThan(0);

        // Go back if we navigated away
        if (!page.url().includes('/market')) {
          await page.goto('/market');
          await waitForLoadingToFinish(page);
        }
      } catch {
        // Button might require specific state, skip
      }
    }
  });

  test('should click random listing cards', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const listings = page.locator('a[href*="/listing/"]');
    const count = await listings.count();

    if (count > 0) {
      const idx = Math.floor(Math.random() * count);
      await listings.nth(idx).click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/listing\//);
    }
  });

  test('should navigate between sections rapidly', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);

    // Rapid navigation
    for (const route of ['/market', '/community', '/events', '/garage', '/market']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
    }

    await waitForLoadingToFinish(page);
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);

    // Should not have excessive errors from rapid navigation
    const criticalErrors = getErrors().filter(e => !e.includes('favicon') && !e.includes('manifest'));
    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('should randomly use filters and search', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    // Random search term
    const searchTerms = ['Honda', 'Civic', 'Type R', 'K20', 'B16', ' turbo', 'manual'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill(term);
      await page.waitForTimeout(2000);
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
      await searchInput.fill('');
      await page.waitForTimeout(1000);
    }

    // Random filter click
    const filterBtns = page.locator('button:visible').filter({ hasText: /All|Cars|Parts|K-Club|B-Club/i });
    const filterCount = await filterBtns.count();
    if (filterCount > 0) {
      const idx = Math.floor(Math.random() * filterCount);
      await filterBtns.nth(idx).click();
      await page.waitForTimeout(1000);
    }
  });

  test('should explore user profiles randomly', async ({ page }) => {
    await page.goto('/community');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const userLinks = page.locator('a[href*="/user/"]');
    const count = await userLinks.count();

    if (count > 0) {
      const idx = Math.floor(Math.random() * count);
      await userLinks.nth(idx).click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/user\//);
    }
  });

  test('should randomly switch between feed and reels', async ({ page }) => {
    await page.goto('/community');
    await waitForLoadingToFinish(page);

    const toggle = page.locator('button:has-text("Reels"), button:has-text("Feed")');
    const count = await toggle.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const idx = Math.floor(Math.random() * count);
      try {
        await toggle.nth(idx).click();
        await page.waitForTimeout(1000);
      } catch { /* skip */ }
    }
  });
});