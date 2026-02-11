/**
 * k6 Load Test — WebSocket Connections
 *
 * Tests concurrent WebSocket connections for the metrics stream.
 * Run: k6 run tests/load/websocket.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { BASE_URL, login, authHeaders } from './helpers.js';

const errorRate = new Rate('ws_errors');
const messagesReceived = new Counter('ws_messages');

const WS_URL = BASE_URL.replace('http', 'ws');

export const options = {
  scenarios: {
    // 50 concurrent connections
    baseline: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
    },
    // Ramp to 200 connections
    ramp: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '1m', target: 200 },
        { duration: '2m', target: 200 },
        { duration: '30s', target: 0 },
      ],
      startTime: '2m30s',
    },
  },
  thresholds: {
    ws_errors: ['rate<0.05'],
  },
};

export function setup() {
  const tokens = login();
  return { token: tokens.accessToken };
}

export default function (data) {
  const url = `${WS_URL}/api/v1/ws?token=${data.token}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Subscribe to metrics stream
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'metrics' }));
    });

    socket.on('message', (msg) => {
      messagesReceived.add(1);
      try {
        const data = JSON.parse(msg);
        check(data, {
          'has type': (d) => d.type !== undefined,
        });
      } catch {
        // binary or non-JSON message
      }
    });

    socket.on('error', (e) => {
      errorRate.add(1);
    });

    // Keep connection open for 30 seconds
    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
  sleep(1);
}
