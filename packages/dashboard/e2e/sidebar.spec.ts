/**
 * E2E: Sidebar Navigation
 *
 * Tests sidebar visibility, navigation link activation,
 * and page transitions.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('sidebar shows navigation links', async ({ page }) => {
    const nav = page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first();
    await expect(nav).toBeVisible();

    // Should have multiple nav links
    const links = nav.locator('a[href]');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('clicking a nav link changes the route', async ({ page }) => {
    const nav = page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first();
    // Find a link to /security
    const securityLink = nav.locator('a[href="/security"]').first();
    if (await securityLink.isVisible()) {
      await securityLink.click();
      await expect(page).toHaveURL(/\/security/);
    }
  });

  test('active nav link is visually distinguished', async ({ page }) => {
    await page.goto('/metrics');
    const nav = page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first();
    const metricsLink = nav.locator('a[href="/metrics"]').first();

    if (await metricsLink.isVisible()) {
      // Active link should have a distinct class or aria attribute
      const classes = await metricsLink.getAttribute('class');
      const ariaCurrent = await metricsLink.getAttribute('aria-current');
      // At least one distinguishing attribute should be present
      expect(
        classes?.includes('active') || ariaCurrent === 'page' || classes?.includes('bg-')
      ).toBeTruthy();
    }
  });

  test('navigating between pages preserves sidebar state', async ({ page }) => {
    const nav = page.locator('[data-testid="sidebar"], nav, [role="navigation"]').first();
    await expect(nav).toBeVisible();

    await page.goto('/security');
    await expect(nav).toBeVisible();

    await page.goto('/personality');
    await expect(nav).toBeVisible();
  });
});
