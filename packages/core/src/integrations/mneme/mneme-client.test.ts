/**
 * Mneme Client Tests
 *
 * Unit tests use mocked fetch. Integration tests (skipped by default)
 * run against a live Mneme instance at MNEME_URL or localhost:3838.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MnemeClient } from './mneme-client.js';

// ── Unit tests (mocked fetch) ───────────────────────────────────────────────

describe('MnemeClient', () => {
  let client: MnemeClient;

  beforeEach(() => {
    client = new MnemeClient({ baseUrl: 'http://localhost:3838' });
    vi.restoreAllMocks();
  });

  describe('health', () => {
    it('parses health response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'ok',
            version: '2026.3.18',
            notes_count: 5,
            active_vault: 'default',
            semantic_available: false,
            vector_count: 0,
            embedding_backend: 'none',
            embedding_dimension: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const health = await client.health();
      expect(health.status).toBe('ok');
      expect(health.version).toBe('2026.3.18');
      expect(health.notes_count).toBe(5);
      expect(health.active_vault).toBe('default');
    });
  });

  describe('search', () => {
    it('passes query and parses results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            search_id: 's:1:1',
            results: [
              {
                note_id: 'abc-123',
                title: 'Test Note',
                path: 'test-note.md',
                snippet: 'matching text',
                score: 1.5,
                source: 'fulltext',
                trust: 1.0,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await client.search('test');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test Note');
      expect(result.results[0].score).toBeGreaterThan(0);

      const url = (globalThis.fetch as any).mock.calls[0][0];
      expect(url).toContain('/v1/search?q=test');
    });
  });

  describe('notes CRUD', () => {
    it('creates a note', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'note-1',
            title: 'New Note',
            path: 'new-note.md',
            content: '# New Note',
            tags: ['test'],
            content_hash: 'abc',
            created_at: '2026-03-19T00:00:00Z',
            updated_at: '2026-03-19T00:00:00Z',
            last_accessed: '2026-03-19T00:00:00Z',
            provenance: 'manual',
            trust_override: null,
            backlinks: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const note = await client.createNote({
        title: 'New Note',
        content: '# New Note',
        tags: ['test'],
      });
      expect(note.id).toBe('note-1');
      expect(note.title).toBe('New Note');
    });

    it('gets a note by ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'note-1',
            title: 'Existing Note',
            path: 'existing-note.md',
            content: '# Content',
            tags: [],
            content_hash: 'def',
            created_at: '2026-03-19T00:00:00Z',
            updated_at: '2026-03-19T00:00:00Z',
            last_accessed: '2026-03-19T00:00:00Z',
            provenance: 'manual',
            trust_override: null,
            backlinks: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const note = await client.getNote('note-1');
      expect(note.title).toBe('Existing Note');
      expect(note.content).toBe('# Content');
    });

    it('lists notes', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const notes = await client.listNotes();
      expect(notes).toEqual([]);
    });
  });

  describe('vaults', () => {
    it('lists vaults', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'vault-1',
              name: 'default',
              path: '/data',
              description: '',
              search_weight: 1.0,
              is_default: true,
              is_active: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const vaults = await client.listVaults();
      expect(vaults).toHaveLength(1);
      expect(vaults[0].name).toBe('default');
    });
  });

  describe('error handling', () => {
    it('throws on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      );

      await expect(client.getNote('nonexistent')).rejects.toThrow('Mneme API error (404)');
    });
  });

  describe('tags', () => {
    it('lists tags', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: 'tag-1', name: 'rust', color: null, created_at: '2026-03-19T00:00:00Z' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const tags = await client.listTags();
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('rust');
    });
  });
});
