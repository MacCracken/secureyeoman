/**
 * E2E: Security Page
 *
 * Tests the security dashboard, event log, and tab navigation.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Security page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('navigates to security page', async ({ page }) => {
    await page.goto('/security');
    await expect(page).toHaveURL(/\/security/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('displays security tabs', async ({ page }) => {
    await page.goto('/security');
    // Security page should have multiple tabs
    const tabs = page.getByRole('button').filter({
      hasText: /overview|nodes|automations|autonomy|reports|risk|scope|capture/i,
    });
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('overview tab shows event list or empty state', async ({ page }) => {
    await page.goto('/security');
    // The default tab (overview) should show events or an empty state
    const content = page.locator(
      'table, [data-testid="event-list"], [class*="empty"], .card',
    ).first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});
