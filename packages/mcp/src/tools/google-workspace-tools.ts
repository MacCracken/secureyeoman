/**
 * Google Workspace Tools — MCP tools for Google Drive, Sheets, and Docs.
 *
 * All tools proxy through the core API's /api/v1/integrations/gdrive/*,
 * /api/v1/integrations/gsheets/*, and /api/v1/integrations/gdocs/* endpoints,
 * which handle OAuth and per-personality integration access modes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { registerApiProxyTool, wrapToolHandler } from './tool-utils.js';

export function registerGoogleWorkspaceTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // Google Drive
  // ═══════════════════════════════════════════════════════════════════════════

  // ── gdrive_list_files ───────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_list_files',
    description:
      'List files in Google Drive. Supports optional search query, folder filtering, and MIME type filtering. Returns file metadata including IDs, names, and MIME types.',
    inputSchema: {
      q: z
        .string()
        .optional()
        .describe('Google Drive search query (e.g. "name contains \'report\'")'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of files to return (1–100, default 20)'),
      folderId: z
        .string()
        .optional()
        .describe('Parent folder ID to list files from'),
      mimeType: z
        .string()
        .optional()
        .describe(
          'Filter by MIME type (e.g. "application/vnd.google-apps.spreadsheet", "application/pdf")'
        ),
    },
    buildPath: () => '/api/v1/integrations/gdrive/files',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.q) q.q = args.q as string;
      if (args.pageSize) q.pageSize = String(args.pageSize);
      if (args.folderId) q.folderId = args.folderId as string;
      if (args.mimeType) q.mimeType = args.mimeType as string;
      return q;
    },
  });

  // ── gdrive_get_file ─────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_get_file',
    description:
      'Get metadata and details of a single Google Drive file by its ID. Returns name, MIME type, size, owners, sharing settings, and other metadata.',
    inputSchema: {
      fileId: z.string().describe('Google Drive file ID'),
    },
    buildPath: (args) => `/api/v1/integrations/gdrive/files/${args.fileId}`,
  });

  // ── gdrive_search ───────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_search',
    description:
      'Full-text search across Google Drive files. Searches file names, descriptions, and content. Returns matching files with metadata.',
    inputSchema: {
      query: z.string().describe('Full-text search query'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (1–100, default 20)'),
    },
    buildPath: () => '/api/v1/integrations/gdrive/files/search',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      q.query = args.query as string;
      if (args.pageSize) q.pageSize = String(args.pageSize);
      return q;
    },
  });

  // ── gdrive_create_folder ────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_create_folder',
    description:
      'Create a new folder in Google Drive. Optionally specify a parent folder. Returns the created folder with its ID.',
    inputSchema: {
      name: z.string().describe('Folder name'),
      parentId: z
        .string()
        .optional()
        .describe('Parent folder ID (default: root)'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/gdrive/folders',
    buildBody: (args) => ({
      name: args.name,
      parentId: args.parentId,
    }),
  });

  // ── gdrive_upload_file ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_upload_file',
    description:
      'Upload a file to Google Drive. Content can be provided as base64-encoded data or plain text. Returns the created file with its ID.',
    inputSchema: {
      name: z.string().describe('File name including extension'),
      mimeType: z
        .string()
        .describe('MIME type of the file (e.g. "text/plain", "application/pdf")'),
      content: z
        .string()
        .describe('File content as base64-encoded data or plain text'),
      folderId: z
        .string()
        .optional()
        .describe('Destination folder ID (default: root)'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/gdrive/files',
    buildBody: (args) => ({
      name: args.name,
      mimeType: args.mimeType,
      content: args.content,
      folderId: args.folderId,
    }),
  });

  // ── gdrive_delete_file ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_delete_file',
    description:
      'Delete a file or folder from Google Drive by its ID. This action moves the item to trash.',
    inputSchema: {
      fileId: z.string().describe('Google Drive file or folder ID to delete'),
    },
    method: 'delete',
    buildPath: (args) => `/api/v1/integrations/gdrive/files/${args.fileId}`,
  });

  // ── gdrive_share_file ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdrive_share_file',
    description:
      'Share a Google Drive file or folder with another user. Specify the email address and permission role. Returns the created permission.',
    inputSchema: {
      fileId: z.string().describe('Google Drive file or folder ID to share'),
      email: z.string().describe('Email address of the user to share with'),
      role: z
        .enum(['reader', 'writer', 'commenter'])
        .describe('Permission role: "reader", "writer", or "commenter"'),
    },
    method: 'post',
    buildPath: (args) => `/api/v1/integrations/gdrive/files/${args.fileId}/share`,
    buildBody: (args) => ({
      email: args.email,
      role: args.role,
    }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Google Sheets
  // ═══════════════════════════════════════════════════════════════════════════

  // ── gsheets_get_spreadsheet ─────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gsheets_get_spreadsheet',
    description:
      'Get metadata for a Google Sheets spreadsheet by its ID. Returns spreadsheet title, sheet names, and properties.',
    inputSchema: {
      spreadsheetId: z.string().describe('Google Sheets spreadsheet ID'),
    },
    buildPath: (args) =>
      `/api/v1/integrations/gsheets/spreadsheets/${args.spreadsheetId}`,
  });

  // ── gsheets_get_values ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gsheets_get_values',
    description:
      'Read cell values from a Google Sheets spreadsheet. Specify a range in A1 notation (e.g. "Sheet1!A1:D10"). Returns a 2D array of cell values.',
    inputSchema: {
      spreadsheetId: z.string().describe('Google Sheets spreadsheet ID'),
      range: z
        .string()
        .describe('Cell range in A1 notation (e.g. "Sheet1!A1:D10", "A1:Z100")'),
    },
    buildPath: (args) =>
      `/api/v1/integrations/gsheets/spreadsheets/${args.spreadsheetId}/values`,
    buildQuery: (args) => ({
      range: args.range as string,
    }),
  });

  // ── gsheets_update_values ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gsheets_update_values',
    description:
      'Update cell values in a Google Sheets spreadsheet. Provide a range in A1 notation and a 2D array of values. Overwrites existing data in the specified range.',
    inputSchema: {
      spreadsheetId: z.string().describe('Google Sheets spreadsheet ID'),
      range: z
        .string()
        .describe('Cell range in A1 notation (e.g. "Sheet1!A1:D10")'),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.null()])))
        .describe('2D array of cell values (rows of columns)'),
    },
    method: 'put',
    buildPath: (args) =>
      `/api/v1/integrations/gsheets/spreadsheets/${args.spreadsheetId}/values`,
    buildBody: (args) => ({
      range: args.range,
      values: args.values,
    }),
  });

  // ── gsheets_append_values ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gsheets_append_values',
    description:
      'Append rows to a Google Sheets spreadsheet after the last row with data. Provide a range (determines the sheet and starting column) and a 2D array of values.',
    inputSchema: {
      spreadsheetId: z.string().describe('Google Sheets spreadsheet ID'),
      range: z
        .string()
        .describe(
          'Target range in A1 notation — data is appended after the last existing row (e.g. "Sheet1!A1:D1")'
        ),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.null()])))
        .describe('2D array of row values to append'),
    },
    method: 'post',
    buildPath: (args) =>
      `/api/v1/integrations/gsheets/spreadsheets/${args.spreadsheetId}/values/append`,
    buildBody: (args) => ({
      range: args.range,
      values: args.values,
    }),
  });

  // ── gsheets_create_spreadsheet ──────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gsheets_create_spreadsheet',
    description:
      'Create a new Google Sheets spreadsheet. Optionally specify sheet (tab) names. Returns the created spreadsheet with its ID and URL.',
    inputSchema: {
      title: z.string().describe('Spreadsheet title'),
      sheetNames: z
        .array(z.string())
        .optional()
        .describe('Optional list of sheet (tab) names to create (default: one sheet named "Sheet1")'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/gsheets/spreadsheets',
    buildBody: (args) => ({
      title: args.title,
      sheetNames: args.sheetNames,
    }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Google Docs
  // ═══════════════════════════════════════════════════════════════════════════

  // ── gdocs_get_document ──────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdocs_get_document',
    description:
      'Get the content and metadata of a Google Docs document by its ID. Returns the document title, body content, and structural elements.',
    inputSchema: {
      documentId: z.string().describe('Google Docs document ID'),
    },
    buildPath: (args) =>
      `/api/v1/integrations/gdocs/documents/${args.documentId}`,
  });

  // ── gdocs_create_document ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gdocs_create_document',
    description:
      'Create a new Google Docs document. Optionally provide initial content as markdown or plain text. Returns the created document with its ID and URL.',
    inputSchema: {
      title: z.string().describe('Document title'),
      content: z
        .string()
        .optional()
        .describe('Initial document content (markdown or plain text)'),
    },
    method: 'post',
    buildPath: () => '/api/v1/integrations/gdocs/documents',
    buildBody: (args) => ({
      title: args.title,
      content: args.content,
    }),
  });
}
