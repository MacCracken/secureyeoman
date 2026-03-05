import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { AuditEntry } from '@secureyeoman/shared';
import { registerAuditExportRoutes } from './audit-export-routes.js';

const MOCK_ENTRIES: AuditEntry[] = [
  {
    id: 'e1',
    event: 'login',
    level: 'info',
    message: 'User logged in',
    userId: 'u1',
    timestamp: 1700000000000,
    metadata: {},
    integrity: { version: '1', signature: 'sig1', previousEntryHash: '' },
  },
  {
    id: 'e2',
    event: 'logout',
    level: 'info',
    message: 'User logged out',
    userId: 'u1',
    timestamp: 1700000001000,
    metadata: {},
    integrity: { version: '1', signature: 'sig2', previousEntryHash: 'h1' },
  },
  {
    id: 'e3',
    event: 'auth_failure',
    level: 'warn',
    message: 'Login failed',
    timestamp: 1700000002000,
    metadata: { ip: '10.0.0.1' },
    integrity: { version: '1', signature: 'sig3', previousEntryHash: 'h2' },
  },
];

async function* mockIterate() {
  for (const entry of MOCK_ENTRIES) {
    yield entry;
  }
}

function buildMockStorage() {
  return {
    iterateFiltered: vi.fn(() => mockIterate()),
  } as any;
}

async function buildApp(storage: ReturnType<typeof buildMockStorage>) {
  const app = Fastify({ logger: false });
  registerAuditExportRoutes(app, { auditStorage: storage, hostname: 'testhost' });
  await app.ready();
  return app;
}

describe('POST /api/v1/audit/export', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let storage: ReturnType<typeof buildMockStorage>;

  beforeEach(async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
  });

  it('returns JSONL content-type for jsonl format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
  });

  it('returns correct JSONL body with one JSON object per line', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl' },
    });
    const lines = res.body.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('e1');
  });

  it('returns CSV content-type for csv format', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'csv' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('starts CSV body with header row', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'csv' },
    });
    expect(res.body.startsWith('id,event,level')).toBe(true);
  });

  it('returns syslog content-type for syslog format', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'syslog' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('syslog lines match RFC 5424 PRI pattern', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'syslog' },
    });
    const firstLine = res.body.split('\n')[0];
    expect(firstLine).toMatch(/^<\d+>1 /);
  });

  it('returns 400 for invalid format', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'xml' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sets Content-Disposition attachment header', async () => {
    storage = buildMockStorage();
    app = await buildApp(storage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl' },
    });
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('audit-export.jsonl');
  });

  it('passes from/to time range filters to storage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl', from: 1700000000000, to: 1700000002000 },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.iterateFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ from: 1700000000000, to: 1700000002000 })
    );
  });

  it('passes level[] filter to storage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl', level: ['info', 'warn'] },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.iterateFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ level: ['info', 'warn'] })
    );
  });

  it('passes event[] filter to storage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl', event: ['login', 'logout'] },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.iterateFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ event: ['login', 'logout'] })
    );
  });

  it('passes userId filter to storage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl', userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.iterateFiltered).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('enforces limit by capping emitted entries', async () => {
    // Create a storage that yields many entries
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_ENTRIES[0],
      id: `e-${i}`,
    }));
    async function* iterateMany() {
      for (const entry of manyEntries) yield entry;
    }
    storage.iterateFiltered = vi.fn(() => iterateMany());
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'jsonl', limit: 3 },
    });
    expect(res.statusCode).toBe(200);
    const lines = res.body.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
  });

  it('uses syslog .log extension in Content-Disposition', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'syslog' },
    });
    expect(res.headers['content-disposition']).toContain('audit-export.log');
  });

  it('uses .csv extension in Content-Disposition for csv format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit/export',
      payload: { format: 'csv' },
    });
    expect(res.headers['content-disposition']).toContain('audit-export.csv');
  });
});
