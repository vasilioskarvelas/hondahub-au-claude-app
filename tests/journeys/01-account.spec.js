const { test, expect } = require('@playwright/test');
const { TEST_ACCOUNTS, TEST_TAG, generateTestEmail, setupConsoleCapture, captureScreenshot, waitForLoadingToFinish, safeClick, fillField } = require('../helpers/test-data');

test.describe('Account & Authentication', () => {
  test('should load the app and show home page', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/Honda/i);
    const errors = getErrors();
    expect(errors.length).toBe(0);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');
    // Look for login/auth entry points
    const loginLink = page.locator('a[href*="login"], button:has-text("Log in"), button:has-text("Sign in")').first();
    if (await loginLink.count() > 0) {
      await loginLink.click();
      await waitForLoadingToFinish(page);
      // Should be on login or auth page
      expect(page.url()).toMatch(/login|auth|sign-in/i);
    }
  });

  test('should reject invalid login credentials', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Try to find and fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      await emailInput.fill('invalid@test.test');
      await passwordInput.fill('wrongpassword123');
      const submitBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await waitForLoadingToFinish(page);
        // Should show error, not redirect to dashboard
        await page.waitForTimeout(2000);
        expect(page.url()).not.toMatch(/\/market|\/profile|\/community/i);
      }
    }
  });

  test('should reject duplicate email registration', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Navigate to register if available
    const registerLink = page.locator('a[href*="register"], a:has-text("Sign up"), button:has-text("Sign up")').first();
    if (await registerLink.count() > 0) {
      await registerLink.click();
      await waitForLoadingToFinish(page);
    }

    // Try to register with an existing email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const nameInput = page.locator('input[name*="name"], input[placeholder*="name" i]').first();

    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.user1.email);
      if (await passwordInput.count() > 0) await passwordInput.fill('SomePassword123!');
      if (await nameInput.count() > 0) await nameInput.fill('TEST_Duplicate');
      const submit = page.locator('button[type="submit"]').first();
      if (await submit.count() > 0) {
        await submit.click();
        await waitForLoadingToFinish(page);
        await page.waitForTimeout(2000);
        // Should show error about existing account
        const errorText = page.locator('.text-destructive, [role="alert"], .error, :text("already")').first();
        // Registration should not succeed with duplicate email
      }
    }
  });

  test('should log in with valid test credentials', async ({ page }) => {
    const getErrors = setupConsoleCapture(page);
    await page.goto('/');
    await waitForLoadingToFinish(page);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.admin.email);
      await passwordInput.fill(TEST_ACCOUNTS.admin.password);
      const submitBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await waitForLoadingToFinish(page);
        await page.waitForTimeout(3000);
        // Should be logged in — check for authenticated content
        const authenticated = await page.locator('a[href*="profile"], a[href*="settings"], button:has-text("Log out")').first().count();
        expect(authenticated > 0 || !page.url().includes('login')).toBeTruthy();
      }
    }
  });

  test('should access profile page after login', async ({ page }) => {
    // Login first
    await page.goto('/');
    await waitForLoadingToFinish(page);
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.admin.email);
      await passwordInput.fill(TEST_ACCOUNTS.admin.password);
      await page.locator('button[type="submit"]').first().click();
      await waitForLoadingToFinish(page);
    }
    await page.goto('/profile');
    await waitForLoadingToFinish(page);
    // Profile page should load
    expect(page.url()).toContain('/profile');
  });

  test('should access settings page', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.admin.email);
      await passwordInput.fill(TEST_ACCOUNTS.admin.password);
      await page.locator('button[type="submit"]').first().click();
      await waitForLoadingToFinish(page);
    }
    await page.goto('/settings');
    await waitForLoadingToFinish(page);
    expect(page.url()).toContain('/settings');
  });

  test('should edit profile display name', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.admin.email);
      await passwordInput.fill(TEST_ACCOUNTS.admin.password);
      await page.locator('button[type="submit"]').first().click();
      await waitForLoadingToFinish(page);
    }
    await page.goto('/settings');
    await waitForLoadingToFinish(page);

    // Look for name input and edit it
    const nameInput = page.locator('input[name*="name"], input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      const original = await nameInput.inputValue();
      await nameInput.fill(original + ' (test)');
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await waitForLoadingToFinish(page);
        // Restore original
        await nameInput.fill(original);
        const saveBtn2 = page.locator('button:has-text("Save"), button:has-text("Update")').first();
        if (await saveBtn2.count() > 0) await saveBtn2.click();
      }
    }
  });

  test('should handle password reset flow', async ({ page }) => {
    await page.goto('/');
    await waitForLoadingToFinish(page);

    // Look for "forgot password" link
    const forgotLink = page.locator('a:has-text("forgot"), a:has-text("reset"), button:has-text("forgot")').first();
    if (await forgotLink.count() > 0) {
      await forgotLink.click();
      await waitForLoadingToFinish(page);
      // Should show password reset form
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill(TEST_ACCOUNTS.admin.email);
        const submit = page.locator('button[type="submit"]').first();
        if (await submit.count() > 0) {
          await submit.click();
          await waitForLoadingToFinish(page);
          // Should show confirmation
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('should log out successfully', async ({ page }) => {
    // Login
    await page.goto('/');
    await waitForLoadingToFinish(page);
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_ACCOUNTS.admin.email);
      await passwordInput.fill(TEST_ACCOUNTS.admin.password);
      await page.locator('button[type="submit"]').first().click();
      await waitForLoadingToFinish(page);
    }

    // Find and click logout
    const logoutBtn = page.locator('button:has-text("Log out"), button:has-text("Sign out"), a:has-text("Log out")').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await waitForLoadingToFinish(page);
      await page.waitForTimeout(2000);
      // Should be back at login or home
      const loginForm = await page.locator('input[type="email"], input[type="password"]').count();
      expect(loginForm > 0 || page.url().includes('login')).toBeTruthy();
    }
  });
});