/**
 * Gmail MCP Tools — unit tests
 *
 * Verifies that all 7 gmail_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGmailTools } from './gmail-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ messages: [] }),
    post: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
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

describe('gmail-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGmailTools(server, client, noopMiddleware());
  });

  it('registers all 7 gmail_* tools in globalToolRegistry', () => {
    const tools = [
      'gmail_profile',
      'gmail_list_messages',
      'gmail_read_message',
      'gmail_read_thread',
      'gmail_list_labels',
      'gmail_compose_draft',
      'gmail_send_email',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── gmail_profile ────────────────────────────────────────────

  it('gmail_profile calls GET /api/v1/gmail/profile', async () => {
    const handler = globalToolRegistry.get('gmail_profile')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/profile', undefined);
  });

  // ── gmail_list_messages ──────────────────────────────────────

  it('gmail_list_messages calls GET with all query params', async () => {
    const handler = globalToolRegistry.get('gmail_list_messages')!;
    const result = await handler({
      q: 'is:unread',
      maxResults: 50,
      pageToken: 'tok-123',
      labelIds: 'INBOX,UNREAD',
    });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/messages', {
      q: 'is:unread',
      maxResults: '50',
      pageToken: 'tok-123',
      labelIds: 'INBOX,UNREAD',
    });
  });

  it('gmail_list_messages with no filters', async () => {
    const handler = globalToolRegistry.get('gmail_list_messages')!;
    await handler({});
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/messages', {});
  });

  // ── gmail_read_message ───────────────────────────────────────

  it('gmail_read_message calls GET with messageId in path', async () => {
    const handler = globalToolRegistry.get('gmail_read_message')!;
    const result = await handler({ messageId: 'msg-42' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/messages/msg-42', undefined);
  });

  // ── gmail_read_thread ────────────────────────────────────────

  it('gmail_read_thread calls GET with threadId in path', async () => {
    const handler = globalToolRegistry.get('gmail_read_thread')!;
    const result = await handler({ threadId: 'thread-1' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/threads/thread-1', undefined);
  });

  // ── gmail_list_labels ────────────────────────────────────────

  it('gmail_list_labels calls GET', async () => {
    const handler = globalToolRegistry.get('gmail_list_labels')!;
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith('/api/v1/gmail/labels', undefined);
  });

  // ── gmail_compose_draft ──────────────────────────────────────

  it('gmail_compose_draft calls POST with full body', async () => {
    const handler = globalToolRegistry.get('gmail_compose_draft')!;
    const result = await handler({
      to: 'alice@example.com',
      subject: 'Hello',
      body: 'Hi Alice!',
      cc: 'bob@example.com',
      bcc: 'charlie@example.com',
      threadId: 'thread-1',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/gmail/drafts', {
      to: 'alice@example.com',
      subject: 'Hello',
      body: 'Hi Alice!',
      cc: 'bob@example.com',
      bcc: 'charlie@example.com',
      threadId: 'thread-1',
    });
  });

  // ── gmail_send_email ─────────────────────────────────────────

  it('gmail_send_email calls POST with full body', async () => {
    const handler = globalToolRegistry.get('gmail_send_email')!;
    const result = await handler({
      to: 'alice@example.com',
      subject: 'Important',
      body: 'Please review',
      inReplyTo: '<msg-id@example.com>',
      references: '<ref@example.com>',
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/gmail/send', {
      to: 'alice@example.com',
      subject: 'Important',
      body: 'Please review',
      cc: undefined,
      bcc: undefined,
      threadId: undefined,
      inReplyTo: '<msg-id@example.com>',
      references: '<ref@example.com>',
    });
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Auth failed'));
    const handler = globalToolRegistry.get('gmail_profile')!;
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Auth failed');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ email: 'test@gmail.com' });
    const handler = globalToolRegistry.get('gmail_profile')!;
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.email).toBe('test@gmail.com');
  });
});
