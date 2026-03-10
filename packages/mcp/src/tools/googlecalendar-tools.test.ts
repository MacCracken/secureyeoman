/**
 * Google Calendar MCP Tools — unit tests
 *
 * Verifies that all 7 gcal_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGoogleCalendarTools } from './googlecalendar-tools.js';
import { globalToolRegistry } from './tool-utils.js';
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
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleCalendarTools(server, client, noopMiddleware());
  });

  it('registers all 7 gcal_* tools in globalToolRegistry', () => {
    const tools = [
      'gcal_list_events',
      'gcal_get_event',
      'gcal_create_event',
      'gcal_quick_add',
      'gcal_update_event',
      'gcal_delete_event',
      'gcal_list_calendars',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── gcal_list_events ────────────────────────────────────────────

  it('gcal_list_events calls GET with query params', async () => {
    const handler = globalToolRegistry.get('gcal_list_events')!;
    const result = await handler({
      calendarId: 'primary',
      timeMin: '2026-03-01T00:00:00Z',
      timeMax: '2026-03-31T23:59:59Z',
      maxResults: 50,
      q: 'meeting',
    });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/events',
      expect.objectContaining({
        calendarId: 'primary',
        timeMin: '2026-03-01T00:00:00Z',
        maxResults: '50',
        q: 'meeting',
      })
    );
  });

  it('gcal_list_events with no filters', async () => {
    const handler = globalToolRegistry.get('gcal_list_events')!;
    await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/integrations/googlecalendar/events', {});
  });

  // ── gcal_get_event ──────────────────────────────────────────────

  it('gcal_get_event calls GET with eventId in path', async () => {
    const handler = globalToolRegistry.get('gcal_get_event')!;
    const result = await handler({ eventId: 'evt-1', calendarId: 'secondary' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/events/evt-1',
      { calendarId: 'secondary' }
    );
  });

  // ── gcal_create_event ───────────────────────────────────────────

  it('gcal_create_event calls POST with body', async () => {
    const handler = globalToolRegistry.get('gcal_create_event')!;
    const result = await handler({
      summary: 'Team standup',
      start: '2026-03-10T09:00:00Z',
      end: '2026-03-10T09:30:00Z',
      description: 'Daily standup',
      location: 'Room A',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/googlecalendar/events', {
      summary: 'Team standup',
      start: '2026-03-10T09:00:00Z',
      end: '2026-03-10T09:30:00Z',
      description: 'Daily standup',
      location: 'Room A',
      calendarId: undefined,
    });
  });

  // ── gcal_quick_add ──────────────────────────────────────────────

  it('gcal_quick_add calls POST with text body', async () => {
    const handler = globalToolRegistry.get('gcal_quick_add')!;
    const result = await handler({ text: 'Lunch with Alice tomorrow at noon' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/googlecalendar/events/quick', {
      text: 'Lunch with Alice tomorrow at noon',
      calendarId: undefined,
    });
  });

  // ── gcal_update_event ───────────────────────────────────────────

  it('gcal_update_event calls PUT with eventId in path', async () => {
    const handler = globalToolRegistry.get('gcal_update_event')!;
    const result = await handler({
      eventId: 'evt-1',
      summary: 'Updated Meeting',
      start: '2026-03-10T10:00:00Z',
      end: '2026-03-10T11:00:00Z',
    });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/events/evt-1',
      expect.objectContaining({ summary: 'Updated Meeting' })
    );
  });

  // ── gcal_delete_event ───────────────────────────────────────────

  it('gcal_delete_event calls DELETE with eventId in path', async () => {
    const handler = globalToolRegistry.get('gcal_delete_event')!;
    const result = await handler({ eventId: 'evt-1' });
    expect(result.isError).toBeFalsy();
    expect(client.delete).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/events/evt-1'
    );
  });

  it('gcal_delete_event appends calendarId as query param', async () => {
    const handler = globalToolRegistry.get('gcal_delete_event')!;
    await handler({ eventId: 'evt-1', calendarId: 'work' });
    expect(client.delete).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/events/evt-1?calendarId=work'
    );
  });

  // ── gcal_list_calendars ─────────────────────────────────────────

  it('gcal_list_calendars calls GET', async () => {
    const handler = globalToolRegistry.get('gcal_list_calendars')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/googlecalendar/calendars',
      undefined
    );
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('OAuth expired'));
    const handler = globalToolRegistry.get('gcal_list_events')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OAuth expired');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ events: [{ id: 'e1' }] });
    const handler = globalToolRegistry.get('gcal_list_events')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.events).toHaveLength(1);
  });
});
