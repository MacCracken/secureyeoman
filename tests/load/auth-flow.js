/**
 * k6 Load Test — Auth Flow
 *
 * Tests login/refresh/logout cycle and rate limit enforcement.
 * Run: k6 run tests/load/auth-flow.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { BASE_URL, authHeaders } from './helpers.js';

const errorRate = new Rate('errors');
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'test-admin-password-32chars!!';

export const options = {
  scenarios: {
    auth_cycle: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 50,
    },
    rate_limit_test: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      startTime: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'],
  },
};

export default function () {
  // Login
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    password: ADMIN_PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginOk = check(loginRes, { 'login 200': (r) => r.status === 200 });
  errorRate.add(!loginOk);

  if (!loginOk) {
    sleep(1);
    return;
  }

  const { accessToken, refreshToken } = JSON.parse(loginRes.body);

  // Use token for a request
  const metricsRes = http.get(`${BASE_URL}/api/v1/metrics`, {
    headers: authHeaders(accessToken),
  });
  check(metricsRes, { 'metrics with token': (r) => r.status === 200 });

  // Refresh
  const refreshRes = http.post(`${BASE_URL}/api/v1/auth/refresh`, JSON.stringify({
    refreshToken,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(refreshRes, { 'refresh 200': (r) => r.status === 200 });

  if (refreshRes.status === 200) {
    const newToken = JSON.parse(refreshRes.body).accessToken;

    // Logout
    const logoutRes = http.post(`${BASE_URL}/api/v1/auth/logout`, null, {
      headers: authHeaders(newToken),
    });
    check(logoutRes, { 'logout 200': (r) => r.status === 200 });
  }

  sleep(0.2);
}

// Rate limit verification scenario
export function rateLimitTest() {
  const results = [];
  // Fire 20 login attempts rapidly (should hit rate limit)
  for (let i = 0; i < 20; i++) {
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
      password: 'wrong-password',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    results.push(res.status);
  }

  // At least some should be rate limited (429)
  const rateLimited = results.filter((s) => s === 429);
  check(null, {
    'rate limiting works': () => rateLimited.length > 0,
  });
}
