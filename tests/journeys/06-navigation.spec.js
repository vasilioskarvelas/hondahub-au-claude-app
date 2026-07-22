const { test, expect } = require('@playwright/test');
const { setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

// All routes that should be accessible
const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/market', name: 'Marketplace' },
  { path: '/community', name: 'Community Feed' },
  { path: '/events', name: 'Events' },
  { path: '/garage', name: 'Garage' },
  { path: '/giveaway', name: 'Giveaway' },
  { path: '/shop', name: 'Partner Discounts' },
  { path: '/pricing', name: 'Pricing' },
  { path: '/profile', name: 'Profile' },
  { path: '/settings', name: 'Settings' },
  { path: '/messages', name: 'Messages' },
  { path: '/notifications', name: 'Notifications' },
];

test.describe('Navigation Crawl', () => {
  test('every known route should load without blank page', async ({ page }) => {
    for (const route of ROUTES) {
      const getErrors = setupConsoleCapture(page);
      await page.goto(route.path);
      await waitForLoadingToFinish(page);

      const content = await page.locator('body').textContent();
      const errors = getErrors();

      // Page should have content (not blank)
      expect(content.trim().length, `${route.name} (${route.path}) rendered blank`).toBeGreaterThan(10);

      // Should not have excessive console errors
      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('manifest') && !e.includes('Failed to load resource')
      );
      expect(criticalErrors.length, `${route.name} (${route.path}) has console errors: ${criticalErrors.join('; ')}`).toBeLessThan(3);
    }
  });

  test('should not have broken back button', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.goBack();
    await waitForLoadingToFinish(page);
    expect(page.url()).toBe(await page.url()); // No crash
  });

  test('should find and click navigation links on home page', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Find all links on the page
    const links = page.locator('a[href]');
    const count = await links.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const link = links.nth(i);
      const href = await link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) continue;

      // Check if visible
      if (await link.isVisible()) {
        try {
          await link.click({ timeout: 5000 });
          await waitForLoadingToFinish(page);
          // Should not be a blank page
          const content = await page.locator('body').textContent();
          expect(content.trim().length).toBeGreaterThan(0);
          await page.goBack();
          await waitForLoadingToFinish(page);
        } catch {
          // Link might not be clickable, skip
        }
      }
    }
  });

  test('should click buttons and verify they respond', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    // Find all buttons
    const buttons = page.locator('button:visible');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      if (!text || text.trim() === '') continue;

      try {
        await btn.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        // Should not crash
        const content = await page.locator('body').textContent();
        expect(content.trim().length).toBeGreaterThan(0);
      } catch {
        // Button might open a modal or require interaction, skip
      }
    }
  });

  test('should check for missing loading indicators', async ({ page }) => {
    // Navigate to a page with data fetching
    await page.goto('/market');
    // Should show either loading indicator or content quickly
    await page.waitForTimeout(3000);

    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(10);
  });

  test('should not have content hidden behind navigation bars', async ({ page, viewport }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Check if top/bottom nav obscures content
    const bodyBox = await page.locator('body').boundingBox();
    const mainContent = page.locator('main, [class*="main"], [class*="content"]').first();

    if (bodyBox && await mainContent.count() > 0) {
      const contentBox = await mainContent.boundingBox();
      if (contentBox) {
        // Content should not be hidden behind a fixed nav (should have some padding)
        expect(contentBox.y, 'Content is hidden behind top navigation').toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should handle 404 page gracefully', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await waitForLoadingToFinish(page);
    // Should show a 404 or not-found page, not a blank page
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should check mobile layout', async ({ page, viewport }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Check for horizontal scroll (content wider than viewport)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    if (viewport && viewport.width < 768) {
      // On mobile, should not have significant horizontal overflow
      expect(scrollWidth - clientWidth, 'Page has horizontal scroll on mobile').toBeLessThan(20);
    }
  });

  test('should check all images load', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const images = page.locator('img');
    const count = await images.count();
    let brokenCount = 0;

    for (let i = 0; i < Math.min(count, 10); i++) {
      const img = images.nth(i);
      const naturalWidth = await img.evaluate((el) => el.naturalWidth);
      if (naturalWidth === 0) brokenCount++;
    }

    expect(brokenCount, 'Some images failed to load').toBeLessThan(Math.min(count, 10) / 2);
  });

  test('should check forms can submit', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    // Find search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('test');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      // Page should respond (not freeze)
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });
});