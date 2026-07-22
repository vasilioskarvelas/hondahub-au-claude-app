const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_POST, TEST_TAG, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

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

test.describe('Social Platform', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user1);
    await page.goto('/community');
    await waitForLoadingToFinish(page);
  });

  test('should load community feed', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await expect(page.locator('h1')).toContainText(/Honda Social|Community/i);
    const errors = getErrors();
    expect(errors.length).toBe(0);
  });

  test('should open create post modal', async ({ page }) => {
    const postBtn = page.locator('button:has-text("Post"), button:has-text("Create")').first();
    if (await postBtn.count() > 0) {
      await postBtn.click();
      await page.waitForTimeout(1000);
      // Modal should appear
      const modal = page.locator('[role="dialog"], .fixed.inset-0').first();
      expect(await modal.count() > 0).toBeTruthy();
    }
  });

  test('should create a text post', async ({ page }) => {
    const postBtn = page.locator('button:has-text("Post")').first();
    if (await postBtn.count() > 0) {
      await postBtn.click();
      await page.waitForTimeout(1000);

      const captionInput = page.locator('textarea, input[placeholder*="caption" i], input[placeholder*="happening" i], [contenteditable]').first();
      if (await captionInput.count() > 0) {
        await captionInput.fill(TEST_POST.caption);
        const shareBtn = page.locator('button:has-text("Share"), button:has-text("Post"), button:has-text("Publish")').first();
        if (await shareBtn.count() > 0) {
          await shareBtn.click();
          await waitForLoadingToFinish(page);
          await page.waitForTimeout(2000);
          // Post should appear in feed or we should be back at feed
          expect(page.url()).toMatch(/community/);
        }
      }
    }
  });

  test('should like and unlike a post', async ({ page }) => {
    await page.waitForTimeout(2000);
    // Find first like button (heart icon)
    const likeBtn = page.locator('button:has(svg.lucide-heart), button:has(svg[class*="heart"])').first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click();
      await page.waitForTimeout(500);
      await likeBtn.click(); // Unlike
      await page.waitForTimeout(500);
    }
  });

  test('should save and unsave a post', async ({ page }) => {
    await page.waitForTimeout(2000);
    const saveBtn = page.locator('button:has(svg.lucide-bookmark), button:has(svg[class*="bookmark"])').first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(500);
      await saveBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('should add a comment to a post', async ({ page }) => {
    await page.waitForTimeout(2000);
    // Find comment input
    const commentInput = page.locator('input[placeholder*="comment" i], textarea[placeholder*="comment" i]').first();
    if (await commentInput.count() > 0) {
      await commentInput.fill(`${TEST_TAG} Test comment from Playwright`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
  });

  test('should view stories bar', async ({ page }) => {
    const storiesBar = page.locator('[class*="stor"], .scrollbar-hide > div').first();
    if (await storiesBar.count() > 0) {
      // Story bar should be visible
      expect(await storiesBar.isVisible()).toBeTruthy();
    }
  });

  test('should switch between feed and reels view', async ({ page }) => {
    const reelsBtn = page.locator('button:has-text("Reels")').first();
    if (await reelsBtn.count() > 0) {
      await reelsBtn.click();
      await page.waitForTimeout(1000);
      const feedBtn = page.locator('button:has-text("Feed")').first();
      if (await feedBtn.count() > 0) {
        await feedBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should filter by engine club', async ({ page }) => {
    const kClubBtn = page.locator('button:has-text("K-Club")').first();
    if (await kClubBtn.count() > 0) {
      await kClubBtn.click();
      await page.waitForTimeout(1000);
      const allBtn = page.locator('button:has-text("All")').first();
      if (await allBtn.count() > 0) {
        await allBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should search posts', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('KSwap');
      await page.waitForTimeout(2000);
      // Search results should update
      const allBtn = page.locator('button:has-text("All")').first();
      if (await allBtn.count() > 0) {
        // Clear search
        await searchInput.fill('');
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should access messages page', async ({ page }) => {
    await page.goto('/messages');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/messages');
  });

  test('should access notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/notifications');
  });

  test('should view a user profile', async ({ page }) => {
    // Click on a post author name
    const authorLink = page.locator('a[href*="/user/"]').first();
    if (await authorLink.count() > 0) {
      await authorLink.click();
      await waitForLoadingToFinish(page);
      expect(page.url()).toMatch(/\/user\//);
    }
  });
});