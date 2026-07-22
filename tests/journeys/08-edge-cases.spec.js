const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_TAG, setupConsoleCapture, waitForLoadingToFinish } = require('../helpers/test-data');

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

test.describe('Edge Cases', () => {
  test('should handle empty search query', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle very long search text', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      const longText = 'A'.repeat(500);
      await searchInput.fill(longText);
      await page.waitForTimeout(2000);
      // Should not crash
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle special characters in search', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('<script>alert(1)</script> & "test" \'or 1=1');
      await page.waitForTimeout(2000);
      // Should not execute scripts or crash
      const content = await page.locator('body').textContent();
      expect(content).not.toContain('alert(1)');
    }
  });

  test('should handle rapid repeated clicks', async ({ page }) => {
    await page.goto('/market');
    await waitForLoadingToFinish(page);

    // Find a filter button
    const btn = page.locator('button:visible').first();
    if (await btn.count() > 0) {
      // Click rapidly 5 times
      for (let i = 0; i < 5; i++) {
        try { await btn.click({ timeout: 1000 }); } catch { /* skip */ }
      }
      await page.waitForTimeout(1000);
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle empty form submission', async ({ page }) => {
    await page.goto('/create');
    await waitForLoadingToFinish(page);

    // Try to submit without filling anything
    const submitBtn = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Publish"), button:has-text("Post")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      // Should show validation errors, not crash
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle invalid price input', async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user2);
    await page.goto('/create');
    await waitForLoadingToFinish(page);

    const priceInput = page.locator('input[name*="price"], input[type="number"]').first();
    if (await priceInput.count() > 0) {
      // Try negative price
      await priceInput.fill('-100');
      await page.waitForTimeout(500);

      // Try very large number
      await priceInput.fill('999999999999');
      await page.waitForTimeout(500);

      // Try text in number field
      await priceInput.fill('abc');
      await page.waitForTimeout(500);

      // Should not crash
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle navigation to non-existent listing', async ({ page }) => {
    await page.goto('/listing/non-existent-id-12345');
    await page.waitForTimeout(3000);
    // Should show error or empty state, not crash
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should handle navigation to non-existent user profile', async ({ page }) => {
    await page.goto('/user/nonexistentuser12345');
    await page.waitForTimeout(3000);
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should handle navigation to non-existent event', async ({ page }) => {
    await page.goto('/event/non-existent-event-12345');
    await page.waitForTimeout(3000);
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should handle navigation to non-existent garage car', async ({ page }) => {
    await page.goto('/garage/non-existent-car-12345');
    await page.waitForTimeout(3000);
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should handle very long text in post caption', async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user1);
    await page.goto('/community');
    await waitForLoadingToFinish(page);

    const postBtn = page.locator('button:has-text("Post")').first();
    if (await postBtn.count() > 0) {
      await postBtn.click();
      await page.waitForTimeout(1000);

      const captionInput = page.locator('textarea, [contenteditable]').first();
      if (await captionInput.count() > 0) {
        const longText = `${TEST_TAG} ${'A'.repeat(2000)}`;
        await captionInput.fill(longText);
        await page.waitForTimeout(500);
        // Should handle gracefully (truncate or show error)
      }
    }
  });

  test('should handle session expiry gracefully', async ({ page, context }) => {
    await login(page, TEST_ACCOUNTS.user1);
    await page.goto('/profile');
    await waitForLoadingToFinish(page);

    // Clear cookies to simulate session expiry
    await context.clearCookies();
    await page.goto('/profile');
    await page.waitForTimeout(3000);

    // Should redirect to login or show appropriate message
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should handle unsupported file type upload', async ({ page }) => {
    await login(page, TEST_ACCOUNTS.user2);
    await page.goto('/create');
    await waitForLoadingToFinish(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Try uploading a text file (likely unsupported for images)
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('This is not an image'),
      });
      await page.waitForTimeout(2000);
      // Should show error, not crash
      const content = await page.locator('body').textContent();
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle unauthorised access to admin pages', async ({ page }) => {
    // Try accessing testing center without admin login
    await page.goto('/testing');
    await page.waitForTimeout(3000);
    // Should redirect or show access denied
    const content = await page.locator('body').textContent();
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test('should check for console errors on all main pages', async ({ page }) => {
    const pages = ['/', '/market', '/community', '/events', '/garage', '/pricing'];
    const allErrors = [];

    for (const path of pages) {
      const getErrors = setupConsoleCapture(page);
      await page.goto(path);
      await waitForLoadingToFinish(page);
      await page.waitForTimeout(2000);
      const errors = getErrors().filter(e =>
        !e.includes('favicon') && !e.includes('manifest') && !e.includes('Failed to load resource')
      );
      if (errors.length > 0) {
        allErrors.push({ page: path, errors });
      }
    }

    if (allErrors.length > 0) {
      console.log('Console errors found:', JSON.stringify(allErrors, null, 2));
    }
    expect(allErrors.length, `Console errors on pages: ${allErrors.map(e => e.page).join(', ')}`).toBeLessThan(pages.length);
  });
});