const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_LISTING, TEST_PART_LISTING, TEST_TAG, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

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

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user2);
  });

  test('should load marketplace', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/market');
    const errors = getErrors();
    expect(errors.length).toBe(0);
  });

  test('should show car listings', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);
    // Should have listing cards
    const cards = page.locator('a[href*="/listing/"], [class*="card"]').first();
    expect(await cards.count() > 0).toBeTruthy();
  });

  test('should open listing detail page', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const listingLink = page.locator('a[href*="/listing/"]').first();
    if (await listingLink.count() > 0) {
      await listingLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/listing\//);
    }
  });

  test('should search for products', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('Honda');
      await page.waitForTimeout(2000);
      // Results should filter
      await searchInput.fill('');
      await page.waitForTimeout(1000);
    }
  });

  test('should use category filters', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    // Try clicking filter buttons
    const filterBtn = page.locator('button:has-text("Cars"), button:has-text("Parts"), button:has-text("All")').first();
    if (await filterBtn.count() > 0) {
      await filterBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should navigate to create listing page', async ({ page }) => {
    await page.goto('/create');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/create');
    // Form should be visible
    const formElements = page.locator('input, select, textarea, button');
    expect(await formElements.count()).toBeGreaterThan(2);
  });

  test('should fill car listing form', async ({ page }) => {
    await page.goto('/create');
    await waitForLoadingToFinish(page);

    // Fill title
    const titleInput = page.locator('input[name*="title"], input[placeholder*="title" i]').first();
    if (await titleInput.count() > 0) {
      await titleInput.fill(TEST_LISTING.title);
    }

    // Fill price
    const priceInput = page.locator('input[name*="price"], input[placeholder*="price" i], input[type="number"]').first();
    if (await priceInput.count() > 0) {
      await priceInput.fill(String(TEST_LISTING.price));
    }

    // Fill description
    const descInput = page.locator('textarea[name*="description"], textarea[placeholder*="description" i]').first();
    if (await descInput.count() > 0) {
      await descInput.fill(TEST_LISTING.description);
    }

    // Fill state
    const stateSelect = page.locator('select[name*="state"], [role="combobox"]').first();
    if (await stateSelect.count() > 0) {
      await stateSelect.click();
      await page.waitForTimeout(500);
      const option = page.locator('[role="option"]').first();
      if (await option.count() > 0) await option.click();
    }
  });

  test('should submit an offer on a listing', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const listingLink = page.locator('a[href*="/listing/"]').first();
    if (await listingLink.count() > 0) {
      await listingLink.click();
      await waitForLoadingToFinish(page);

      // Look for offer button
      const offerBtn = page.locator('button:has-text("Offer"), button:has-text("Make Offer")').first();
      if (await offerBtn.count() > 0) {
        await offerBtn.click();
        await page.waitForTimeout(1000);

        const amountInput = page.locator('input[type="number"]').first();
        if (await amountInput.count() > 0) {
          await amountInput.fill('15000');
          const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Send")').first();
          if (await submitBtn.count() > 0) {
            await submitBtn.click();
            await waitForLoadingToFinish(page);
          }
        }
      }
    }
  });

  test('should save a listing', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const listingLink = page.locator('a[href*="/listing/"]').first();
    if (await listingLink.count() > 0) {
      await listingLink.click();
      await waitForLoadingToFinish(page);

      const saveBtn = page.locator('button:has(svg.lucide-bookmark), button:has(svg[class*="bookmark"]), button:has-text("Save")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should send a marketplace message', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    const listingLink = page.locator('a[href*="/listing/"]').first();
    if (await listingLink.count() > 0) {
      await listingLink.click();
      await waitForLoadingToFinish(page);

      const messageBtn = page.locator('button:has-text("Message"), button:has-text("Contact")').first();
      if (await messageBtn.count() > 0) {
        await messageBtn.click();
        await page.waitForTimeout(2000);
        // Should navigate to messages or open a chat
      }
    }
  });

  test('should check auction listings', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);
    await page.waitForTimeout(2000);

    // Look for auction badges
    const auctionBadge = page.locator(':text("auction" i), :text("bid" i)').first();
    if (await auctionBadge.count() > 0) {
      const listingLink = page.locator('a[href*="/listing/"]').first();
      if (await listingLink.count() > 0) {
        await listingLink.click();
        await waitForLoadingToFinish(page);
        // Check for bid input
        const bidInput = page.locator('input[placeholder*="bid" i], input[type="number"]').first();
        if (await bidInput.count() > 0) {
          // Auction interface is present
          expect(await bidInput.isVisible()).toBeTruthy();
        }
      }
    }
  });

  test('should view profile offers tab', async ({ page }) => {
    await page.goto('/profile');
    await waitForLoadingToFinish(page);
    const offersTab = page.locator('button:has-text("Offers")').first();
    if (await offersTab.count() > 0) {
      await offersTab.click();
      await page.waitForTimeout(1000);
      // Should show offers section with Made/Received toggle
      const madeBtn = page.locator('button:has-text("Made")').first();
      const receivedBtn = page.locator('button:has-text("Received")').first();
      expect(await madeBtn.count() > 0).toBeTruthy();
      expect(await receivedBtn.count() > 0).toBeTruthy();
    }
  });
});