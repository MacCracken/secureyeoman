/**
 * E2E: Health Check
 *
 * Verifies the dashboard can reach the backend health endpoint.
 * This confirms the Vite proxy and backend connectivity.
 */

import { test, expect } from '@playwright/test';

test.describe('Health check', () => {
  test('backend health endpoint is reachable via proxy', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('API endpoint returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/v1/metrics');
    expect(res.status()).toBe(401);
  });
});
