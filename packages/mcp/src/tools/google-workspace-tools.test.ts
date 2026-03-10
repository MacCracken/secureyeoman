/**
 * Google Workspace MCP Tools — unit tests
 *
 * Verifies that all 14 google workspace tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGoogleWorkspaceTools } from './google-workspace-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ files: [] }),
    post: vi.fn().mockResolvedValue({ id: 'result-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'result-1' }),
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

describe('google-workspace-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGoogleWorkspaceTools(server, client, noopMiddleware());
  });

  it('registers all 14 tools in globalToolRegistry', () => {
    const tools = [
      'gdrive_list_files',
      'gdrive_get_file',
      'gdrive_search',
      'gdrive_create_folder',
      'gdrive_upload_file',
      'gdrive_delete_file',
      'gdrive_share_file',
      'gsheets_get_spreadsheet',
      'gsheets_get_values',
      'gsheets_update_values',
      'gsheets_append_values',
      'gsheets_create_spreadsheet',
      'gdocs_get_document',
      'gdocs_create_document',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ═══ Google Drive ═══════════════════════════════════════════════

  it('gdrive_list_files calls GET with query params', async () => {
    const handler = globalToolRegistry.get('gdrive_list_files')!;
    const result = await handler({ q: 'name contains "report"', pageSize: 30, folderId: 'folder-1', mimeType: 'application/pdf' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/gdrive/files',
      expect.objectContaining({ q: 'name contains "report"', pageSize: '30', folderId: 'folder-1', mimeType: 'application/pdf' })
    );
  });

  it('gdrive_get_file calls GET with fileId in path', async () => {
    const handler = globalToolRegistry.get('gdrive_get_file')!;
    const result = await handler({ fileId: 'file-1' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/integrations/gdrive/files/file-1', undefined);
  });

  it('gdrive_search calls GET with query params', async () => {
    const handler = globalToolRegistry.get('gdrive_search')!;
    const result = await handler({ query: 'quarterly report', pageSize: 10 });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/gdrive/files/search',
      { query: 'quarterly report', pageSize: '10' }
    );
  });

  it('gdrive_create_folder calls POST', async () => {
    const handler = globalToolRegistry.get('gdrive_create_folder')!;
    const result = await handler({ name: 'New Folder', parentId: 'parent-1' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/gdrive/folders', {
      name: 'New Folder',
      parentId: 'parent-1',
    });
  });

  it('gdrive_upload_file calls POST with body', async () => {
    const handler = globalToolRegistry.get('gdrive_upload_file')!;
    const result = await handler({
      name: 'file.txt',
      mimeType: 'text/plain',
      content: 'Hello world',
      folderId: 'folder-1',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/gdrive/files', {
      name: 'file.txt',
      mimeType: 'text/plain',
      content: 'Hello world',
      folderId: 'folder-1',
    });
  });

  it('gdrive_delete_file calls DELETE with fileId in path', async () => {
    const handler = globalToolRegistry.get('gdrive_delete_file')!;
    const result = await handler({ fileId: 'file-1' });
    expect(result.isError).toBeFalsy();
    expect(client.delete).toHaveBeenCalledWith('/api/v1/integrations/gdrive/files/file-1');
  });

  it('gdrive_share_file calls POST with body', async () => {
    const handler = globalToolRegistry.get('gdrive_share_file')!;
    const result = await handler({ fileId: 'file-1', email: 'alice@example.com', role: 'writer' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/gdrive/files/file-1/share', {
      email: 'alice@example.com',
      role: 'writer',
    });
  });

  // ═══ Google Sheets ══════════════════════════════════════════════

  it('gsheets_get_spreadsheet calls GET with spreadsheetId in path', async () => {
    const handler = globalToolRegistry.get('gsheets_get_spreadsheet')!;
    const result = await handler({ spreadsheetId: 'ss-1' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/gsheets/spreadsheets/ss-1',
      undefined
    );
  });

  it('gsheets_get_values calls GET with range query param', async () => {
    const handler = globalToolRegistry.get('gsheets_get_values')!;
    const result = await handler({ spreadsheetId: 'ss-1', range: 'Sheet1!A1:D10' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/gsheets/spreadsheets/ss-1/values',
      { range: 'Sheet1!A1:D10' }
    );
  });

  it('gsheets_update_values calls PUT with body', async () => {
    const handler = globalToolRegistry.get('gsheets_update_values')!;
    const result = await handler({
      spreadsheetId: 'ss-1',
      range: 'Sheet1!A1:B2',
      values: [['a', 'b'], ['c', 'd']],
    });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith(
      '/api/v1/integrations/gsheets/spreadsheets/ss-1/values',
      { range: 'Sheet1!A1:B2', values: [['a', 'b'], ['c', 'd']] }
    );
  });

  it('gsheets_append_values calls POST with body', async () => {
    const handler = globalToolRegistry.get('gsheets_append_values')!;
    const result = await handler({
      spreadsheetId: 'ss-1',
      range: 'Sheet1!A1:D1',
      values: [['new', 'row']],
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/gsheets/spreadsheets/ss-1/values/append',
      { range: 'Sheet1!A1:D1', values: [['new', 'row']] }
    );
  });

  it('gsheets_create_spreadsheet calls POST with body', async () => {
    const handler = globalToolRegistry.get('gsheets_create_spreadsheet')!;
    const result = await handler({ title: 'New Sheet', sheetNames: ['Data', 'Summary'] });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/gsheets/spreadsheets', {
      title: 'New Sheet',
      sheetNames: ['Data', 'Summary'],
    });
  });

  // ═══ Google Docs ════════════════════════════════════════════════

  it('gdocs_get_document calls GET with documentId in path', async () => {
    const handler = globalToolRegistry.get('gdocs_get_document')!;
    const result = await handler({ documentId: 'doc-1' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/gdocs/documents/doc-1',
      undefined
    );
  });

  it('gdocs_create_document calls POST with body', async () => {
    const handler = globalToolRegistry.get('gdocs_create_document')!;
    const result = await handler({ title: 'New Doc', content: '# Hello' });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/gdocs/documents', {
      title: 'New Doc',
      content: '# Hello',
    });
  });

  // ═══ Error handling ═════════════════════════════════════════════

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const handler = globalToolRegistry.get('gdrive_list_files')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ files: [{ id: 'f1', name: 'test.pdf' }] });
    const handler = globalToolRegistry.get('gdrive_list_files')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].name).toBe('test.pdf');
  });
});
