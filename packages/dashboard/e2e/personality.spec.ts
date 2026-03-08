/**
 * E2E: Personality Page
 *
 * Tests personality listing, creation form, and basic interactions.
 */

import { test, expect } from '@playwright/test';
import { loginViaUI, waitForDashboard } from './helpers';

test.describe('Personality page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await waitForDashboard(page);
  });

  test('navigates to personality page', async ({ page }) => {
    await page.goto('/personality');
    await expect(page).toHaveURL(/\/personality/);
    // Should display personality content area
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('shows create personality button', async ({ page }) => {
    await page.goto('/personality');
    const createBtn = page.getByRole('button', { name: /create|new|add/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('displays personality list or empty state', async ({ page }) => {
    await page.goto('/personality');
    // Either shows personality cards or an empty state message
    const content = page
      .locator('[data-testid="personality-list"], .card, [class*="empty"], [class*="grid"]')
      .first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('opens create personality form', async ({ page }) => {
    await page.goto('/personality');
    const createBtn = page.getByRole('button', { name: /create|new|add/i }).first();
    await createBtn.click();
    // Should show a form with name and system prompt fields
    const nameInput = page.getByRole('textbox', { name: /name/i }).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });
});
