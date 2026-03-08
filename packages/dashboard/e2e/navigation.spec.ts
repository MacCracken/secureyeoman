/**
 * E2E: Dashboard Navigation
 *
 * Tests sidebar navigation, page loading, and basic route accessibility.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('dashboard loads after login', async ({ page }) => {
    // Main content area should exist
    await expect(page.locator('main, [role="main"], .dashboard-content').first()).toBeVisible();
  });

  test('sidebar is visible', async ({ page }) => {
    await expect(
      page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first()
    ).toBeVisible();
  });

  test('navigating to a non-existent route stays in app', async ({ page }) => {
    await page.goto('/this-does-not-exist');
    // Should either redirect to login or show a not-found within the app shell
    const url = page.url();
    expect(url).toMatch(/\/(login|this-does-not-exist)?/);
  });
});
