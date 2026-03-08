/**
 * Google Calendar Tools — MCP tools for managing Google Calendar events.
 *
 * All tools proxy through the core API's /api/v1/integrations/googlecalendar/*
 * endpoints, which handle OAuth and per-personality integration access modes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool, wrapToolHandler } from './tool-utils.js';

export function registerGoogleCalendarTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── gcal_list_events ────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_list_events',
    description:
      'List events from a Google Calendar. Supports time range filtering and text search. Returns event stubs with IDs; use gcal_get_event to fetch full details.',
    inputSchema: {
      calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
      timeMin: z
        .string()
        .optional()
        .describe('Lower bound (inclusive) for event start time as ISO 8601 datetime'),
      timeMax: z
        .string()
        .optional()
        .describe('Upper bound (exclusive) for event start time as ISO 8601 datetime'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(250)
        .optional()
        .describe('Maximum number of events to return (1–250, default 10)'),
      q: z.string().optional().describe('Free text search terms to find events'),
    },
    buildPath: () => '/api/v1/integrations/googlecalendar/events',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.calendarId) q.calendarId = args.calendarId as string;
      if (args.timeMin) q.timeMin = args.timeMin as string;
      if (args.timeMax) q.timeMax = args.timeMax as string;
      if (args.maxResults) q.maxResults = String(args.maxResults);
      if (args.q) q.q = args.q as string;
      return q;
    },
  });

  // ── gcal_get_event ──────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_get_event',
    description:
      'Get the full details of a single Google Calendar event by its ID. Returns summary, start/end times, description, location, attendees, and other metadata.',
    inputSchema: {
      eventId: z.string().describe('Google Calendar event ID'),
      calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
    },
    buildPath: (args) => `/api/v1/integrations/googlecalendar/events/${args.eventId}`,
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.calendarId) q.calendarId = args.calendarId as string;
      return q;
    },
  });

  // ── gcal_create_event ───────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_create_event',
    description:
      'Create a new event on a Google Calendar. Requires a summary and start/end datetimes. Returns the created event with its ID.',
    inputSchema: {
      summary: z.string().describe('Event title/summary'),
      start: z.string().describe('Event start time as ISO 8601 datetime'),
      end: z.string().describe('Event end time as ISO 8601 datetime'),
      description: z.string().optional().describe('Detailed description of the event'),
      location: z.string().optional().describe('Event location (address or place name)'),
      calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/googlecalendar/events',
    buildBody: (args) => ({
      summary: args.summary,
      start: args.start,
      end: args.end,
      description: args.description,
      location: args.location,
      calendarId: args.calendarId,
    }),
  });

  // ── gcal_quick_add ──────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_quick_add',
    description:
      'Quickly add a Google Calendar event using natural language text (e.g. "Lunch with Alice tomorrow at noon"). Google parses the text to determine date, time, and summary.',
    inputSchema: {
      text: z
        .string()
        .describe('Natural language description of the event (e.g. "Team meeting Friday 3pm")'),
      calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/googlecalendar/events/quick',
    buildBody: (args) => ({
      text: args.text,
      calendarId: args.calendarId,
    }),
  });

  // ── gcal_update_event ───────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_update_event',
    description:
      'Update an existing Google Calendar event. Only the fields provided will be changed; omitted fields remain unchanged. Returns the updated event.',
    inputSchema: {
      eventId: z.string().describe('Google Calendar event ID to update'),
      summary: z.string().optional().describe('Updated event title/summary'),
      start: z.string().optional().describe('Updated start time as ISO 8601 datetime'),
      end: z.string().optional().describe('Updated end time as ISO 8601 datetime'),
      description: z.string().optional().describe('Updated event description'),
      location: z.string().optional().describe('Updated event location'),
      calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
    },
    method: 'put',
    buildPath: (args) => `/api/v1/integrations/googlecalendar/events/${args.eventId}`,
    buildBody: (args) => ({
      summary: args.summary,
      start: args.start,
      end: args.end,
      description: args.description,
      location: args.location,
      calendarId: args.calendarId,
    }),
  });

  // ── gcal_delete_event ───────────────────────────────────────────
  // Uses wrapToolHandler directly because client.delete() does not accept
  // query params, and we need to pass the optional calendarId.
  const deleteSchema = {
    eventId: z.string().describe('Google Calendar event ID to delete'),
    calendarId: z.string().optional().describe('Calendar ID (default "primary")'),
  };

  server.registerTool(
    'gcal_delete_event',
    {
      description:
        'Delete a Google Calendar event by its ID. This action is permanent and cannot be undone.',
      inputSchema: deleteSchema,
    },
    wrapToolHandler('gcal_delete_event', middleware, async (args: Record<string, unknown>) => {
      const eventId = args.eventId as string;
      const calendarId = args.calendarId as string | undefined;
      let path = `/api/v1/integrations/googlecalendar/events/${eventId}`;
      if (calendarId) {
        path += `?calendarId=${encodeURIComponent(calendarId)}`;
      }
      const result = await client.delete(path);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gcal_list_calendars ─────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gcal_list_calendars',
    description:
      'List all Google Calendars available to the connected account. Returns calendar IDs, names, access roles, and time zones.',
    inputSchema: {},
    buildPath: () => '/api/v1/integrations/googlecalendar/calendars',
  });
}
