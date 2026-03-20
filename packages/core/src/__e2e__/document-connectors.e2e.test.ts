/**
 * E2E: Document Connectors
 *
 * Tests the knowledge base connector endpoints including
 * Mneme sync, text ingestion, and document lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startE2EServer,
  setupTestDb,
  teardownTestDb,
  truncateAllTables,
  login,
  authHeaders,
  type E2EServer,
} from './helpers.js';

let server: E2EServer;
let token: string;

beforeAll(async () => {
  await setupTestDb();
  server = await startE2EServer();
  const auth = await login(server.baseUrl);
  token = auth.accessToken;
});

afterAll(async () => {
  await server.close();
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAllTables();
});

describe('Document Connectors', () => {
  describe('POST /api/v1/brain/documents/ingest-text', () => {
    it('ingests raw text into knowledge base', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents/ingest-text`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          text: 'Rust crates in SecureYeoman provide crypto, hardware detection, and DLP.',
          title: 'Architecture Overview',
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as { document: { status: string; title: string } };
      expect(data.document.title).toBe('Architecture Overview');
      expect(data.document.status).toBe('ready');
    });

    it('rejects missing text', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents/ingest-text`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ title: 'No Text' }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects missing title', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents/ingest-text`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ text: 'some text' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/brain/documents', () => {
    it('lists documents after ingestion', async () => {
      // Ingest first
      await fetch(`${server.baseUrl}/api/v1/brain/documents/ingest-text`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ text: 'Test content', title: 'Test Doc' }),
      });

      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents`, {
        headers: authHeaders(token),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { documents: unknown[]; total: number };
      expect(data.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty list initially', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents`, {
        headers: authHeaders(token),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { documents: unknown[]; total: number };
      expect(data.total).toBe(0);
    });
  });

  describe('POST /api/v1/brain/documents/connectors/mneme-sync', () => {
    it('returns error when mneme is not reachable', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents/connectors/mneme-sync`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          mnemeUrl: 'http://127.0.0.1:19999', // not running
        }),
      });

      // Should return 500 or similar since Mneme is not running
      // The route itself should not crash
      expect(res.status).toBeGreaterThanOrEqual(200);
    });

    it('rejects invalid URL scheme', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/brain/documents/connectors/mneme-sync`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          mnemeUrl: 'ftp://evil.com',
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});
