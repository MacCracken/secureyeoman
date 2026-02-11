/**
 * k6 Load Test Helpers
 *
 * Shared utilities for all load test scripts.
 * Run with: k6 run tests/load/<script>.js
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'test-admin-password-32chars!!';

/**
 * Login and return access + refresh tokens
 */
export function login(password = ADMIN_PASSWORD) {
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${res.body}`);
  }

  const body = JSON.parse(res.body);
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

/**
 * Get auth headers with Bearer token
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

import http from 'k6/http';
