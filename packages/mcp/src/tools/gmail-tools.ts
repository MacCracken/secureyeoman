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
import { registerApiProxyTool } from './tool-utils.js';

export function registerGmailTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── gmail_profile ────────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_profile',
    description:
      'Get the connected Gmail account profile — email address, access mode (auto/draft/suggest), and total message/thread counts.',
    inputSchema: {},
    buildPath: () => '/api/v1/gmail/profile',
  });

  // ── gmail_list_messages ──────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_list_messages',
    description:
      'List Gmail messages. Supports Gmail search syntax (e.g. "is:unread", "from:alice@example.com", "subject:invoice"). Returns a page of message stubs with IDs; use gmail_read_message to fetch full content.',
    inputSchema: {
      q: z
        .string()
        .optional()
        .describe('Gmail search query (e.g. "is:unread", "from:boss@company.com")'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of messages to return (1–100, default 20)'),
      pageToken: z
        .string()
        .optional()
        .describe('Page token from a previous response for pagination'),
      labelIds: z
        .string()
        .optional()
        .describe('Comma-separated label IDs to filter by (e.g. "INBOX,UNREAD")'),
    },
    buildPath: () => '/api/v1/gmail/messages',
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.q) q.q = args.q as string;
      if (args.maxResults) q.maxResults = String(args.maxResults);
      if (args.pageToken) q.pageToken = args.pageToken as string;
      if (args.labelIds) q.labelIds = args.labelIds as string;
      return q;
    },
  });

  // ── gmail_read_message ───────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_read_message',
    description:
      'Read the full content of a Gmail message by its ID. Returns headers (From, To, Subject, Date), body text, labels, and thread ID.',
    inputSchema: {
      messageId: z.string().describe('Gmail message ID (from gmail_list_messages results)'),
    },
    buildPath: (args) => `/api/v1/gmail/messages/${args.messageId}`,
  });

  // ── gmail_read_thread ────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_read_thread',
    description:
      'Read all messages in a Gmail thread. Returns the full conversation chain including all replies.',
    inputSchema: {
      threadId: z.string().describe("Gmail thread ID (from a message's threadId field)"),
    },
    buildPath: (args) => `/api/v1/gmail/threads/${args.threadId}`,
  });

  // ── gmail_list_labels ────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_list_labels',
    description:
      'List all Gmail labels (folders) including system labels like INBOX, SENT, TRASH and user-created labels.',
    inputSchema: {},
    buildPath: () => '/api/v1/gmail/labels',
  });

  // ── gmail_compose_draft ──────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_compose_draft',
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
    method: 'post',
    buildPath: () => '/api/v1/gmail/drafts',
    buildBody: (args) => ({
      to: args.to,
      subject: args.subject,
      body: args.body,
      cc: args.cc,
      bcc: args.bcc,
      threadId: args.threadId,
    }),
  });

  // ── gmail_send_email ─────────────────────────────────────────
  registerApiProxyTool(server, client, middleware, {
    name: 'gmail_send_email',
    description:
      'Send an email via Gmail immediately. Only available when integration mode is "auto". If mode is "draft", use gmail_compose_draft instead and ask the user to review and send. Returns the sent message ID.',
    inputSchema: {
      to: z.string().describe('Recipient email address(es), comma-separated'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Plain text email body'),
      cc: z.string().optional().describe('CC recipients, comma-separated'),
      bcc: z.string().optional().describe('BCC recipients, comma-separated'),
      threadId: z.string().optional().describe('Thread ID to reply in'),
      inReplyTo: z
        .string()
        .optional()
        .describe('Message-ID header of the message being replied to'),
      references: z.string().optional().describe('References header for threading'),
    },
    method: 'post',
    buildPath: () => '/api/v1/gmail/send',
    buildBody: (args) => ({
      to: args.to,
      subject: args.subject,
      body: args.body,
      cc: args.cc,
      bcc: args.bcc,
      threadId: args.threadId,
      inReplyTo: args.inReplyTo,
      references: args.references,
    }),
  });
}
