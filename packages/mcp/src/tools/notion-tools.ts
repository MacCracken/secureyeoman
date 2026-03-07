/**
 * Notion Tools — MCP tools for interacting with Notion pages and databases.
 *
 * All tools proxy through the core API's /api/v1/integrations/notion/* endpoints.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool } from './tool-utils.js';

export function registerNotionTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── notion_search ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_search',
    description:
      'Search across all Notion pages and databases. Returns matching pages and databases with titles and IDs.',
    inputSchema: {
      query: z.string().describe('Search query text'),
      filter: z
        .enum(['page', 'database'])
        .optional()
        .describe('Restrict results to pages or databases only'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of results to return (default 10)'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/notion/search',
    buildBody: (args) => ({
      query: args.query,
      filter: args.filter,
      pageSize: args.pageSize ?? 10,
    }),
  });

  // ── notion_get_page ────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_get_page',
    description:
      'Retrieve a Notion page by its ID. Returns the page properties and metadata.',
    inputSchema: {
      pageId: z.string().describe('Notion page ID (UUID)'),
    },
    buildPath: (args) => `/api/v1/integrations/notion/pages/${args.pageId}`,
  });

  // ── notion_create_page ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_create_page',
    description:
      'Create a new page in a Notion database. Returns the created page with its ID.',
    inputSchema: {
      parentDatabaseId: z.string().describe('Parent database ID to create the page in'),
      title: z.string().describe('Page title'),
      properties: z
        .string()
        .optional()
        .describe('Additional page properties as a JSON object string'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/notion/pages',
    buildBody: (args) => ({
      parentDatabaseId: args.parentDatabaseId,
      title: args.title,
      properties: args.properties ? JSON.parse(args.properties as string) : undefined,
    }),
  });

  // ── notion_update_page ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_update_page',
    description:
      'Update properties of an existing Notion page. Returns the updated page.',
    inputSchema: {
      pageId: z.string().describe('Notion page ID (UUID)'),
      properties: z
        .string()
        .describe('Page properties to update as a JSON object string'),
    },
    method: 'put',
    buildPath: (args) => `/api/v1/integrations/notion/pages/${args.pageId}`,
    buildBody: (args) => ({
      pageId: args.pageId,
      properties: JSON.parse(args.properties as string),
    }),
  });

  // ── notion_get_page_blocks ─────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_get_page_blocks',
    description:
      'Get the content blocks of a Notion page. Returns an array of block objects representing the page content.',
    inputSchema: {
      pageId: z.string().describe('Notion page ID (UUID)'),
    },
    buildPath: (args) => `/api/v1/integrations/notion/pages/${args.pageId}/blocks`,
  });

  // ── notion_append_blocks ───────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_append_blocks',
    description:
      'Append content blocks to a Notion page. Returns the appended block objects.',
    inputSchema: {
      pageId: z.string().describe('Notion page ID (UUID)'),
      children: z
        .string()
        .describe('JSON array of Notion block objects to append'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/notion/pages/${args.pageId}/blocks`,
    buildBody: (args) => ({
      pageId: args.pageId,
      children: JSON.parse(args.children as string),
    }),
  });

  // ── notion_query_database ──────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'notion_query_database',
    description:
      'Query a Notion database with optional filters and sorts. Returns matching pages from the database.',
    inputSchema: {
      databaseId: z.string().describe('Notion database ID (UUID)'),
      filter: z
        .string()
        .optional()
        .describe('Notion filter object as a JSON string'),
      sorts: z
        .string()
        .optional()
        .describe('Notion sorts array as a JSON string'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of results to return (default 25)'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/notion/databases/${args.databaseId}/query`,
    buildBody: (args) => ({
      databaseId: args.databaseId,
      filter: args.filter ? JSON.parse(args.filter as string) : undefined,
      sorts: args.sorts ? JSON.parse(args.sorts as string) : undefined,
      pageSize: args.pageSize ?? 25,
    }),
  });
}
