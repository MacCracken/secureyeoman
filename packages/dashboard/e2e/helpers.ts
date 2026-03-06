/**
 * Playwright E2E Helpers
 *
 * Shared utilities for dashboard end-to-end tests.
 */

import { type Page, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'test-admin-password-32chars!!';

/**
 * Log in via the login page. Waits for redirect to dashboard.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  // Wait for redirect away from login
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Assert that the page has redirected to login (unauthenticated).
 */
export async function expectLoginRedirect(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Wait for the dashboard shell to be visible (post-login).
 */
export async function waitForDashboard(page: Page): Promise<void> {
  // The sidebar or main layout should be present
  await expect(
    page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first(),
  ).toBeVisible({ timeout: 10000 });
}
