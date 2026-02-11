/**
 * k6 Load Test — API Endpoint Throughput
 *
 * Tests sustained load, spike, and stress scenarios against core API endpoints.
 * Run: k6 run tests/load/api-endpoints.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, login, authHeaders } from './helpers.js';

const errorRate = new Rate('errors');
const latency = new Trend('endpoint_latency', true);

// ── Scenarios ─────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Sustained load: 50 VUs for 5 minutes
    sustained: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      startTime: '0s',
    },
    // Spike: ramp from 0 to 200 VUs in 30s, hold 1m, ramp down
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      startTime: '5m30s',
    },
    // Stress: 500 VUs for 2 minutes
    stress: {
      executor: 'constant-vus',
      vus: 500,
      duration: '2m',
      startTime: '8m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'],
  },
};

// ── Setup ─────────────────────────────────────────────────────

export function setup() {
  const tokens = login();
  return { token: tokens.accessToken };
}

// ── Default Function ──────────────────────────────────────────

export default function (data) {
  const headers = authHeaders(data.token);

  // Health check (unauthenticated)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health 200': (r) => r.status === 200 });
  errorRate.add(healthRes.status !== 200);
  latency.add(healthRes.timings.duration);

  // Metrics endpoint
  const metricsRes = http.get(`${BASE_URL}/api/v1/metrics`, { headers });
  check(metricsRes, { 'metrics 200': (r) => r.status === 200 });
  errorRate.add(metricsRes.status !== 200);
  latency.add(metricsRes.timings.duration);

  // Tasks list
  const tasksRes = http.get(`${BASE_URL}/api/v1/tasks`, { headers });
  check(tasksRes, { 'tasks 200': (r) => r.status === 200 });
  errorRate.add(tasksRes.status !== 200);
  latency.add(tasksRes.timings.duration);

  // Integrations list
  const intRes = http.get(`${BASE_URL}/api/v1/integrations`, { headers });
  check(intRes, { 'integrations 200': (r) => r.status === 200 });
  errorRate.add(intRes.status !== 200);
  latency.add(intRes.timings.duration);

  // Audit query
  const auditRes = http.get(`${BASE_URL}/api/v1/audit`, { headers });
  check(auditRes, { 'audit 200': (r) => r.status === 200 });
  errorRate.add(auditRes.status !== 200);

  sleep(0.5);
}
