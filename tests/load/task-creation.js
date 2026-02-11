/**
 * k6 Load Test — Task Creation Throughput
 *
 * Tests task submission throughput under load.
 * Run: k6 run tests/load/task-creation.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, login, authHeaders } from './helpers.js';

const errorRate = new Rate('errors');
const taskLatency = new Trend('task_creation_latency', true);
const tasksCreated = new Counter('tasks_created');

export const options = {
  scenarios: {
    throughput: {
      executor: 'constant-arrival-rate',
      rate: 100,         // 100 tasks per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    task_creation_latency: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'],
  },
};

export function setup() {
  const tokens = login();
  return { token: tokens.accessToken };
}

export default function (data) {
  const headers = authHeaders(data.token);

  const payload = JSON.stringify({
    type: 'query',
    name: `Load test task ${Date.now()}`,
    description: 'Automated load test task',
    input: { text: 'test query' },
  });

  const res = http.post(`${BASE_URL}/api/v1/tasks`, payload, { headers });

  const ok = check(res, {
    'task created': (r) => r.status === 201 || r.status === 200,
  });

  if (ok) {
    tasksCreated.add(1);
  }
  errorRate.add(!ok);
  taskLatency.add(res.timings.duration);

  sleep(0.01);
}
