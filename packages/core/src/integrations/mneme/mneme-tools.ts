/**
 * Mneme MCP Tools — Knowledge base operations exposed as MCP tools.
 *
 * Tools:
 * - mneme_search:         Search notes by keyword or semantic similarity
 * - mneme_get_note:       Retrieve a note with content, backlinks, and metadata
 * - mneme_create_note:    Create a new note with title, content, and tags
 * - mneme_update_note:    Update an existing note
 * - mneme_list_notes:     List all notes in the active vault
 * - mneme_query_graph:    RAG query across the knowledge base
 * - mneme_list_vaults:    List registered vaults
 * - mneme_switch_vault:   Switch the active vault
 */

import type { McpToolDef } from '@secureyeoman/shared';
import type { SecureLogger } from '../../logging/logger.js';
import type { MnemeClient } from './mneme-client.js';

export const MNEME_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'mneme_search',
    description:
      'Search the Mneme knowledge base by keyword or semantic similarity. Returns matching notes with snippets and relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keyword or natural language question)',
        },
      },
      required: ['query'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_get_note',
    description:
      'Retrieve a specific note from Mneme by ID. Returns full content, tags, backlinks, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID (UUID)' },
      },
      required: ['id'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_create_note',
    description:
      'Create a new note in the Mneme knowledge base. Supports markdown content and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content (markdown)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to apply to the note',
        },
      },
      required: ['title', 'content'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_update_note',
    description: 'Update an existing note in Mneme. Can update title, content, and/or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Note ID (UUID)' },
        title: { type: 'string', description: 'New title (optional)' },
        content: { type: 'string', description: 'New content (optional)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags (optional, replaces existing)',
        },
      },
      required: ['id'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_list_notes',
    description: 'List all notes in the active Mneme vault. Returns titles, paths, and metadata.',
    inputSchema: { type: 'object', properties: {} },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_query_graph',
    description:
      'Ask a natural language question across the Mneme knowledge base using RAG (Retrieval-Augmented Generation). Returns relevant context from notes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language question to answer from the knowledge base',
        },
      },
      required: ['query'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_list_vaults',
    description: 'List all registered vaults in Mneme.',
    inputSchema: { type: 'object', properties: {} },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
  {
    name: 'mneme_switch_vault',
    description: 'Switch the active vault in Mneme.',
    inputSchema: {
      type: 'object',
      properties: {
        vault_id: { type: 'string', description: 'Vault ID to switch to' },
      },
      required: ['vault_id'],
    },
    serverId: 'secureyeoman-local',
    serverName: 'SecureYeoman',
  },
];

export interface MnemeToolHandlerDeps {
  logger: SecureLogger;
  mnemeClient: MnemeClient;
}

export async function handleMnemeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: MnemeToolHandlerDeps
): Promise<unknown> {
  const { mnemeClient, logger } = deps;

  switch (toolName) {
    case 'mneme_search': {
      const query = args.query as string;
      if (!query) return { error: 'Missing required parameter: query' };
      const result = await mnemeClient.search(query);
      return {
        results: result.results.map((r) => ({
          noteId: r.note_id,
          title: r.title,
          snippet: r.snippet,
          score: r.score,
          source: r.source,
        })),
        count: result.results.length,
      };
    }

    case 'mneme_get_note': {
      const id = args.id as string;
      if (!id) return { error: 'Missing required parameter: id' };
      const note = await mnemeClient.getNote(id);
      return {
        id: note.id,
        title: note.title,
        content: note.content,
        tags: note.tags,
        backlinks: note.backlinks,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      };
    }

    case 'mneme_create_note': {
      const title = args.title as string;
      const content = args.content as string;
      if (!title || !content) return { error: 'Missing required parameters: title, content' };
      const note = await mnemeClient.createNote({
        title,
        content,
        tags: (args.tags as string[]) ?? [],
      });
      logger.info({ noteId: note.id, title }, 'Mneme note created via MCP');
      return { id: note.id, title: note.title, path: note.path };
    }

    case 'mneme_update_note': {
      const id = args.id as string;
      if (!id) return { error: 'Missing required parameter: id' };
      const note = await mnemeClient.updateNote(id, {
        title: args.title as string | undefined,
        content: args.content as string | undefined,
        tags: args.tags as string[] | undefined,
      });
      logger.info({ noteId: note.id }, 'Mneme note updated via MCP');
      return { id: note.id, title: note.title, updatedAt: note.updated_at };
    }

    case 'mneme_list_notes': {
      const notes = await mnemeClient.listNotes();
      return {
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          path: n.path,
          updatedAt: n.updated_at,
        })),
        count: notes.length,
      };
    }

    case 'mneme_query_graph': {
      const query = args.query as string;
      if (!query) return { error: 'Missing required parameter: query' };
      return mnemeClient.ragQuery(query);
    }

    case 'mneme_list_vaults': {
      const vaults = await mnemeClient.listVaults();
      return {
        vaults: vaults.map((v) => ({
          id: v.id,
          name: v.name,
          isActive: v.is_active,
          isDefault: v.is_default,
        })),
      };
    }

    case 'mneme_switch_vault': {
      const vaultId = args.vault_id as string;
      if (!vaultId) return { error: 'Missing required parameter: vault_id' };
      await mnemeClient.switchVault(vaultId);
      logger.info({ vaultId }, 'Mneme vault switched via MCP');
      return { ok: true, vaultId };
    }

    default:
      return { error: `Unknown Mneme tool: ${toolName}` };
  }
}
