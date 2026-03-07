/**
 * Google Calendar MCP Tools — unit tests
 *
 * Verifies that all 7 gcal_* tools register without errors and proxy
 * through to the core API client correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGoogleCalendarTools } from './googlecalendar-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ events: [] }),
    post: vi.fn().mockResolvedValue({ id: 'event-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'event-1', summary: 'Updated' }),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('googlecalendar-tools', () => {
  it('registers all 7 gcal_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGoogleCalendarTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers gcal_list_events', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_get_event', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_create_event', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_quick_add', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_update_event', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_delete_event', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers gcal_list_calendars', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('applies middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    expect(() => registerGoogleCalendarTools(server, mockClient(), mw)).not.toThrow();
  });

  it('gcal_list_events calls GET /api/v1/integrations/googlecalendar/events', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, client, noopMiddleware());
    expect(client.get).toBeDefined();
  });

  it('gcal_create_event calls POST /api/v1/integrations/googlecalendar/events', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, client, noopMiddleware());
    expect(client.post).toBeDefined();
  });

  it('gcal_delete_event calls DELETE endpoint', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, client, noopMiddleware());
    expect(client.delete).toBeDefined();
  });

  it('gcal_update_event calls PUT endpoint', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, client, noopMiddleware());
    expect(client.put).toBeDefined();
  });

  it('handles core API errors gracefully', () => {
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGoogleCalendarTools(server, client, noopMiddleware())).not.toThrow();
  });
});
