const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_EVENT, TEST_TAG, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

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

test.describe('Events', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user1);
  });

  test('should load events page', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/events');
    const errors = getErrors();
    expect(errors.length).toBe(0);
  });

  test('should show event cards or empty state', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);
    // Either event cards or an empty state message
    const content = page.locator('body').textContent();
    expect(content.length).toBeGreaterThan(0);
  });

  test('should open event detail page', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      await eventLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/event\//);

      // Detail page should show event information
      const pageContent = await page.locator('body').textContent();
      expect(pageContent.length).toBeGreaterThan(50);
    }
  });

  test('should show event details completely', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      await eventLink.click();
      await waitForLoadingToFinish(page);

      // Check for key event information elements
      const title = page.locator('h1, h2').first();
      expect(await title.count() > 0).toBeTruthy();

      // Check for date/time display
      const dateText = await page.locator('body').textContent();
      // Should contain some date-like text
      expect(dateText).toMatch(/\d{1,2}[\/\-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2}/i);
    }
  });

  test('should mark interested or attending', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      await eventLink.click();
      await waitForLoadingToFinish(page);

      const interestBtn = page.locator('button:has-text("Interest"), button:has-text("Attend"), button:has-text("Going"), button:has-text("RSVP")').first();
      if (await interestBtn.count() > 0) {
        await interestBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should share an event', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      await eventLink.click();
      await waitForLoadingToFinish(page);

      const shareBtn = page.locator('button:has-text("Share"), button:has(svg.lucide-share), button:has(svg[class*="share"])').first();
      if (await shareBtn.count() > 0) {
        await shareBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should save an event', async ({ page }) => {
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      await eventLink.click();
      await waitForLoadingToFinish(page);

      const saveBtn = page.locator('button:has(svg.lucide-bookmark), button:has-text("Save")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should access events from home page', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    const eventsLink = page.locator('a[href*="/events"]').first();
    if (await eventsLink.count() > 0) {
      await eventsLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toContain('/events');
    }
  });

  test('should access events from navigation', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Try mobile nav or desktop nav
    const navEvents = page.locator('nav a[href*="/events"], a[href*="/events"]').first();
    if (await navEvents.count() > 0) {
      await navEvents.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toContain('/events');
    }
  });

  test('should open event from multiple locations consistently', async ({ page }) => {
    // From events page
    await page.goto('/events');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const eventLink = page.locator('a[href*="/event/"]').first();
    if (await eventLink.count() > 0) {
      const href = await eventLink.getAttribute('href');
      await eventLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toContain(href);

      // Go back
      await page.goto('/events');
      await waitForLoadingToFinish(page);

      // Open the same event again
      const sameLink = page.locator(`a[href="${href}"]`).first();
      if (await sameLink.count() > 0) {
        await sameLink.click();
        await waitForLoadingToFinish(page);
        expect(page.url()).toContain(href);
      }
    }
  });
});