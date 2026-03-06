/**
 * E2E: Metrics / Mission Control Page
 *
 * Tests the main dashboard overview page after login.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Metrics page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('loads the metrics overview', async ({ page }) => {
    // Navigate to metrics (may already be the default route)
    await page.goto('/metrics');
    // Should display some form of dashboard content
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('displays KPI cards or statistics', async ({ page }) => {
    await page.goto('/metrics');
    // Look for stat cards, numbers, or health indicators
    const statsArea = page.locator(
      '[data-testid="kpi"], .stat-card, .card, [class*="grid"]',
    ).first();
    await expect(statsArea).toBeVisible({ timeout: 10000 });
  });

  test('shows connected status indicator', async ({ page }) => {
    await page.goto('/metrics');
    // The sidebar or header should show connection status
    const connected = page.getByText(/connected|online|healthy/i).first();
    await expect(connected).toBeVisible({ timeout: 10000 });
  });
});
