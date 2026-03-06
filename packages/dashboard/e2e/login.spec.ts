/**
 * E2E: Login Flow
 *
 * Tests the dashboard login page, authentication, and redirect behavior.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, expectLoginRedirect } from './helpers';

test.describe('Login page', () => {
  test('shows login form when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expectLoginRedirect(page);
    await expect(page.getByRole('textbox')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in|continue/i })).toBeVisible();
  });

  test('displays SecureYeoman branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('SecureYeoman')).toBeVisible();
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox').fill('wrong-password');
    await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
    await expect(page.getByText(/invalid password/i)).toBeVisible();
  });

  test('login with correct password redirects to dashboard', async ({ page }) => {
    await loginViaUI(page);
    // Should no longer be on /login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('prevents empty password submission', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.getByRole('button', { name: /sign in|log in|continue/i });
    await submitBtn.click();
    // Should remain on login (no redirect)
    await expect(page).toHaveURL(/\/login/);
  });
});
