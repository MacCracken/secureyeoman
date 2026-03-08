/**
 * E2E: Settings / Administration Page
 *
 * Tests the settings page tabs, API key management, and theme switching.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('navigates to settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('shows settings tabs', async ({ page }) => {
    await page.goto('/settings');
    // Look for tab-like buttons (License, Backup, Security, API Keys, etc.)
    const tabs = page
      .getByRole('button')
      .filter({ hasText: /license|backup|security|api key|theme|provider/i });
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('API keys tab shows create button', async ({ page }) => {
    await page.goto('/settings');
    // Click API Keys tab
    const apiKeysTab = page.getByRole('button', { name: /api key/i }).first();
    if (await apiKeysTab.isVisible()) {
      await apiKeysTab.click();
      const createBtn = page.getByRole('button', { name: /create|generate|new/i }).first();
      await expect(createBtn).toBeVisible({ timeout: 5000 });
    }
  });

  test('theme tab is accessible', async ({ page }) => {
    await page.goto('/settings');
    const themeTab = page.getByRole('button', { name: /theme/i }).first();
    if (await themeTab.isVisible()) {
      await themeTab.click();
      // Should show theme options (dark, light, system)
      const themeOption = page.getByText(/dark|light|system/i).first();
      await expect(themeOption).toBeVisible({ timeout: 5000 });
    }
  });
});
