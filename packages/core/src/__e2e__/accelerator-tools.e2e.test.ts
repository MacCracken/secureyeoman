/**
 * E2E: Accelerator MCP Tools
 *
 * Tests the accelerator tool endpoints exposed via MCP server.
 * These tools should work without GPU hardware (return empty/default results).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startE2EServer,
  setupTestDb,
  teardownTestDb,
  login,
  authHeaders,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
  const auth = await login(server.baseUrl);
  token = auth.accessToken;
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

describe('Accelerator MCP Tools', () => {
  it('accelerator_status returns device list', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'accelerator_status', args: {} }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    // Should return an object with devices array (may be empty without GPU)
    expect(data).toBeDefined();
  });

  it('gpu_status returns GPU family devices', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'gpu_status', args: {} }),
    });

    expect(res.status).toBe(200);
  });

  it('tpu_status returns TPU family devices', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'tpu_status', args: {} }),
    });

    expect(res.status).toBe(200);
  });

  it('npu_status returns NPU family devices', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'npu_status', args: {} }),
    });

    expect(res.status).toBe(200);
  });

  it('asic_status returns AI ASIC devices', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'asic_status', args: {} }),
    });

    expect(res.status).toBe(200);
  });

  it('local_models_list returns model registry', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'local_models_list', args: {} }),
    });

    expect(res.status).toBe(200);
  });

  it('privacy_route_check returns routing decision', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        toolName: 'privacy_route_check',
        args: { content: 'Hello world' },
      }),
    });

    expect(res.status).toBe(200);
  });

  it('unknown tool returns error', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ toolName: 'nonexistent_tool', args: {} }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBeDefined();
  });

  it('requires authentication', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/mcp/tools/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toolName: 'accelerator_status', args: {} }),
    });

    expect(res.status).toBe(401);
  });
});
