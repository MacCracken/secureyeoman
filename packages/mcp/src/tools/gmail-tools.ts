/**
 * Gmail Tools — MCP tools for reading and composing Gmail messages.
 *
 * All tools proxy through the core API's /api/v1/gmail/* endpoints,
 * which enforce per-personality integration access modes:
 *   auto   → full access (list, read, draft, send)
 *   draft  → list, read, draft only
 *   suggest → list, read only
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

export function registerGmailTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── gmail_list_messages ──────────────────────────────────────
  server.registerTool(
    'gmail_list_messages',
    {
      description:
        'List Gmail messages. Supports Gmail search syntax (e.g. "is:unread", "from:alice@example.com", "subject:invoice"). Returns a page of message stubs with IDs; use gmail_read_message to fetch full content.',
      inputSchema: {
        q: z.string().optional().describe('Gmail search query (e.g. "is:unread", "from:boss@company.com")'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of messages to return (1–100, default 20)'),
        pageToken: z.string().optional().describe('Page token from a previous response for pagination'),
        labelIds: z.string().optional().describe('Comma-separated label IDs to filter by (e.g. "INBOX,UNREAD")'),
      },
    },
    wrapToolHandler('gmail_list_messages', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.q) query.q = String(args.q);
      if (args.maxResults) query.maxResults = String(args.maxResults);
      if (args.pageToken) query.pageToken = String(args.pageToken);
      if (args.labelIds) query.labelIds = String(args.labelIds);

      const result = await client.get('/api/v1/gmail/messages', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_read_message ───────────────────────────────────────
  server.registerTool(
    'gmail_read_message',
    {
      description:
        'Read the full content of a Gmail message by its ID. Returns headers (From, To, Subject, Date), body text, labels, and thread ID.',
      inputSchema: {
        messageId: z.string().describe('Gmail message ID (from gmail_list_messages results)'),
      },
    },
    wrapToolHandler('gmail_read_message', middleware, async (args) => {
      const result = await client.get(`/api/v1/gmail/messages/${args.messageId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_read_thread ───────────────────────────────────────
  server.registerTool(
    'gmail_read_thread',
    {
      description:
        'Read all messages in a Gmail thread. Returns the full conversation chain including all replies.',
      inputSchema: {
        threadId: z.string().describe('Gmail thread ID (from a message\'s threadId field)'),
      },
    },
    wrapToolHandler('gmail_read_thread', middleware, async (args) => {
      const result = await client.get(`/api/v1/gmail/threads/${args.threadId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_compose_draft ──────────────────────────────────────
  server.registerTool(
    'gmail_compose_draft',
    {
      description:
        'Create a Gmail draft. The draft is saved but NOT sent — it requires human review and sending. Available when integration mode is "auto" or "draft". Returns the draft ID.',
      inputSchema: {
        to: z.string().describe('Recipient email address(es), comma-separated'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Plain text email body'),
        cc: z.string().optional().describe('CC recipients, comma-separated'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated'),
        threadId: z.string().optional().describe('Thread ID to reply in (adds to existing thread)'),
      },
    },
    wrapToolHandler('gmail_compose_draft', middleware, async (args) => {
      const result = await client.post('/api/v1/gmail/drafts', {
        to: args.to,
        subject: args.subject,
        body: args.body,
        cc: args.cc,
        bcc: args.bcc,
        threadId: args.threadId,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_send_email ─────────────────────────────────────────
  server.registerTool(
    'gmail_send_email',
    {
      description:
        'Send an email via Gmail immediately. Only available when integration mode is "auto". If mode is "draft", use gmail_compose_draft instead and ask the user to review and send. Returns the sent message ID.',
      inputSchema: {
        to: z.string().describe('Recipient email address(es), comma-separated'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Plain text email body'),
        cc: z.string().optional().describe('CC recipients, comma-separated'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated'),
        threadId: z.string().optional().describe('Thread ID to reply in'),
        inReplyTo: z.string().optional().describe('Message-ID header of the message being replied to'),
        references: z.string().optional().describe('References header for threading'),
      },
    },
    wrapToolHandler('gmail_send_email', middleware, async (args) => {
      const result = await client.post('/api/v1/gmail/send', {
        to: args.to,
        subject: args.subject,
        body: args.body,
        cc: args.cc,
        bcc: args.bcc,
        threadId: args.threadId,
        inReplyTo: args.inReplyTo,
        references: args.references,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_list_labels ────────────────────────────────────────
  server.registerTool(
    'gmail_list_labels',
    {
      description: 'List all Gmail labels (folders) including system labels like INBOX, SENT, TRASH and user-created labels.',
      inputSchema: {},
    },
    wrapToolHandler('gmail_list_labels', middleware, async () => {
      const result = await client.get('/api/v1/gmail/labels');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── gmail_profile ────────────────────────────────────────────
  server.registerTool(
    'gmail_profile',
    {
      description: 'Get the connected Gmail account profile — email address, access mode (auto/draft/suggest), and total message/thread counts.',
      inputSchema: {},
    },
    wrapToolHandler('gmail_profile', middleware, async () => {
      const result = await client.get('/api/v1/gmail/profile');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
