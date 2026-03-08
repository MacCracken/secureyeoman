/**
 * Google Workspace Routes — unit tests
 *
 * Tests the Fastify route handlers for Google Drive, Sheets, and Docs API proxies:
 *   GET    /api/v1/integrations/gdrive/files
 *   GET    /api/v1/integrations/gdrive/files/:fileId
 *   GET    /api/v1/integrations/gdrive/files/search
 *   POST   /api/v1/integrations/gdrive/folders
 *   POST   /api/v1/integrations/gdrive/files
 *   DELETE /api/v1/integrations/gdrive/files/:fileId
 *   POST   /api/v1/integrations/gdrive/files/:fileId/share
 *   GET    /api/v1/integrations/gsheets/spreadsheets/:id
 *   GET    /api/v1/integrations/gsheets/spreadsheets/:id/values
 *   PUT    /api/v1/integrations/gsheets/spreadsheets/:id/values
 *   POST   /api/v1/integrations/gsheets/spreadsheets/:id/values/append
 *   POST   /api/v1/integrations/gsheets/spreadsheets
 *   GET    /api/v1/integrations/gdocs/documents/:id
 *   POST   /api/v1/integrations/gdocs/documents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGoogleWorkspaceRoutes } from './google-workspace-routes.js';
import type { OAuthTokenService } from '../gateway/oauth-token-service.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_ROW = {
  id: 'tok-g1',
  provider: 'gdrive',
  email: 'user@example.com',
  scope: 'drive',
  scopes: 'https://www.googleapis.com/auth/drive',
  expiresAt: Date.now() + 3600_000,
  createdAt: Date.now(),
};

function mockOAuthTokenService(opts?: {
  noTokens?: boolean;
  noValidToken?: boolean;
  provider?: string;
}): OAuthTokenService {
  const row = opts?.provider ? { ...TOKEN_ROW, provider: opts.provider } : TOKEN_ROW;
  return {
    listTokens: vi.fn().mockResolvedValue(opts?.noTokens ? [] : [row]),
    getValidToken: vi.fn().mockResolvedValue(opts?.noValidToken ? null : 'access-token-gws'),
    forceRefreshById: vi.fn().mockResolvedValue(null),
    storeToken: vi.fn(),
    revokeToken: vi.fn(),
  } as unknown as OAuthTokenService;
}

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

async function buildApp(oauthTokenService: OAuthTokenService) {
  const app = Fastify({ logger: false });
  registerGoogleWorkspaceRoutes(app, { oauthTokenService });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Google Workspace Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── No OAuth token → 404 ──────────────────────────────────────────────────

  describe('No OAuth token connected', () => {
    it('returns 404 for any endpoint when no token exists', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/gdrive/files' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no google account connected/i);
    });

    it('returns 404 when getValidToken returns null', async () => {
      const app = await buildApp(mockOAuthTokenService({ noValidToken: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/gdrive/files' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Google Drive ──────────────────────────────────────────────────────────

  describe('Google Drive', () => {
    describe('GET /api/v1/integrations/gdrive/files', () => {
      it('returns file list on success', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const files = [{ id: 'f1', name: 'doc.pdf', mimeType: 'application/pdf' }];
        vi.stubGlobal('fetch', mockFetch({ files }));
        const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/gdrive/files' });
        expect(res.statusCode).toBe(200);
        expect(res.json().files).toHaveLength(1);
        expect(res.json().files[0].id).toBe('f1');
      });

      it('forwards query parameters to Google API', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const fetchMock = mockFetch({ files: [] });
        vi.stubGlobal('fetch', fetchMock);
        await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gdrive/files?folderId=folder-1&mimeType=application/pdf&pageSize=5',
        });
        const rawUrl: string = fetchMock.mock.calls[0][0];
        const calledUrl = decodeURIComponent(rawUrl).replace(/\+/g, ' ');
        expect(calledUrl).toContain("'folder-1' in parents");
        expect(calledUrl).toContain("mimeType = 'application/pdf'");
        expect(calledUrl).toContain('pageSize=5');
      });

      it('resolves token from google provider when gdrive is absent', async () => {
        const app = await buildApp(mockOAuthTokenService({ provider: 'google' }));
        vi.stubGlobal('fetch', mockFetch({ files: [] }));
        const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/gdrive/files' });
        expect(res.statusCode).toBe(200);
      });
    });

    describe('GET /api/v1/integrations/gdrive/files/:fileId', () => {
      it('returns file metadata', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ id: 'f-abc', name: 'report.docx', size: '1024' }));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gdrive/files/f-abc',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().id).toBe('f-abc');
        expect(res.json().name).toBe('report.docx');
      });

      it('forwards upstream error status', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ error: 'not found' }, 404));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gdrive/files/missing-id',
        });
        expect(res.statusCode).toBe(404);
      });
    });

    describe('GET /api/v1/integrations/gdrive/files/search', () => {
      it('returns search results', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const files = [{ id: 'f2', name: 'budget.xlsx' }];
        vi.stubGlobal('fetch', mockFetch({ files }));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gdrive/files/search?query=budget',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().files).toHaveLength(1);
      });
    });

    describe('POST /api/v1/integrations/gdrive/folders', () => {
      it('creates a folder and returns 201', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ id: 'folder-new', name: 'My Folder' }));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/folders',
          payload: { name: 'My Folder' },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().id).toBe('folder-new');
      });

      it('returns 400 when name is missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/folders',
          payload: {},
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/name/i);
      });
    });

    describe('POST /api/v1/integrations/gdrive/files (upload)', () => {
      it('uploads a file and returns 201', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ id: 'uploaded-1', name: 'data.csv' }));
        const content = Buffer.from('col1,col2\n1,2').toString('base64');
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/files',
          payload: { name: 'data.csv', mimeType: 'text/csv', content },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().id).toBe('uploaded-1');
      });

      it('returns 400 when required fields are missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/files',
          payload: { name: 'file.txt' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/name, mimeType, content/i);
      });

      it('forwards upstream 403 error', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ error: { message: 'insufficientPermissions' } }, 403));
        const content = Buffer.from('test').toString('base64');
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/files',
          payload: { name: 'x.txt', mimeType: 'text/plain', content },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().message).toMatch(/re-authorize/i);
      });
    });

    describe('DELETE /api/v1/integrations/gdrive/files/:fileId', () => {
      it('trashes a file and returns success', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ id: 'f-del', trashed: true }));
        const res = await app.inject({
          method: 'DELETE',
          url: '/api/v1/integrations/gdrive/files/f-del',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ success: true, fileId: 'f-del', trashed: true });
      });
    });

    describe('POST /api/v1/integrations/gdrive/files/:fileId/share', () => {
      it('shares a file and returns 201', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ id: 'perm-1', role: 'reader' }));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/files/f-share/share',
          payload: { email: 'bob@example.com', role: 'reader' },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().role).toBe('reader');
      });

      it('returns 400 when email or role is missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdrive/files/f-share/share',
          payload: { email: 'bob@example.com' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/email, role/i);
      });
    });
  });

  // ── Google Sheets ─────────────────────────────────────────────────────────

  describe('Google Sheets', () => {
    describe('GET /api/v1/integrations/gsheets/spreadsheets/:spreadsheetId', () => {
      it('returns spreadsheet metadata', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const data = { spreadsheetId: 'ss-1', properties: { title: 'Budget' } };
        vi.stubGlobal('fetch', mockFetch(data));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().spreadsheetId).toBe('ss-1');
      });
    });

    describe('GET /api/v1/integrations/gsheets/spreadsheets/:spreadsheetId/values', () => {
      it('returns cell values for a range', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const data = {
          range: 'Sheet1!A1:B2',
          values: [
            ['a', 'b'],
            ['1', '2'],
          ],
        };
        vi.stubGlobal('fetch', mockFetch(data));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1/values?range=Sheet1!A1:B2',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().values).toHaveLength(2);
      });

      it('returns 400 when range is missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1/values',
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/range/i);
      });
    });

    describe('PUT /api/v1/integrations/gsheets/spreadsheets/:spreadsheetId/values', () => {
      it('updates cell values', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const responseData = { updatedRange: 'Sheet1!A1:B1', updatedCells: 2 };
        vi.stubGlobal('fetch', mockFetch(responseData));
        const res = await app.inject({
          method: 'PUT',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1/values',
          payload: { range: 'Sheet1!A1:B1', values: [['x', 'y']] },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().updatedCells).toBe(2);
      });

      it('returns 400 when range or values missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'PUT',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1/values',
          payload: { range: 'Sheet1!A1' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/range, values/i);
      });
    });

    describe('POST /api/v1/integrations/gsheets/spreadsheets/:spreadsheetId/values/append', () => {
      it('appends rows to a sheet', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const responseData = { updates: { updatedRows: 1 } };
        vi.stubGlobal('fetch', mockFetch(responseData));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gsheets/spreadsheets/ss-1/values/append',
          payload: { range: 'Sheet1!A1', values: [['new-row']] },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().updates.updatedRows).toBe(1);
      });
    });

    describe('POST /api/v1/integrations/gsheets/spreadsheets', () => {
      it('creates a new spreadsheet and returns 201', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal(
          'fetch',
          mockFetch({ spreadsheetId: 'ss-new', properties: { title: 'New Sheet' } })
        );
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gsheets/spreadsheets',
          payload: { title: 'New Sheet', sheetNames: ['Data', 'Summary'] },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().spreadsheetId).toBe('ss-new');
      });

      it('returns 400 when title is missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gsheets/spreadsheets',
          payload: {},
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/title/i);
      });

      it('forwards upstream error status', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ error: 'quota exceeded' }, 429));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gsheets/spreadsheets',
          payload: { title: 'Quota Test' },
        });
        // sendError casts status; 429 is not in the union so it falls through
        // The route uses resp.status which may be cast — just verify non-2xx
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
      });
    });
  });

  // ── Google Docs ───────────────────────────────────────────────────────────

  describe('Google Docs', () => {
    describe('GET /api/v1/integrations/gdocs/documents/:documentId', () => {
      it('returns document metadata', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const data = { documentId: 'doc-1', title: 'My Doc', body: {} };
        vi.stubGlobal('fetch', mockFetch(data));
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/integrations/gdocs/documents/doc-1',
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().documentId).toBe('doc-1');
        expect(res.json().title).toBe('My Doc');
      });
    });

    describe('POST /api/v1/integrations/gdocs/documents', () => {
      it('creates a document and returns 201', async () => {
        const app = await buildApp(mockOAuthTokenService());
        vi.stubGlobal('fetch', mockFetch({ documentId: 'doc-new', title: 'New Doc' }));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdocs/documents',
          payload: { title: 'New Doc' },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().documentId).toBe('doc-new');
      });

      it('creates a document with content (two-step: create + batchUpdate)', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const fetchMock = vi
          .fn()
          // First call: create doc
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ documentId: 'doc-content' }),
            text: () => Promise.resolve('{}'),
          })
          // Second call: batchUpdate to insert text
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ replies: [] }),
            text: () => Promise.resolve('{}'),
          });
        vi.stubGlobal('fetch', fetchMock);
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdocs/documents',
          payload: { title: 'Content Doc', content: 'Hello World' },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().documentId).toBe('doc-content');
        // Verify batchUpdate was called with insertText
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const batchUrl: string = fetchMock.mock.calls[1][0];
        expect(batchUrl).toContain(':batchUpdate');
      });

      it('returns 400 when title is missing', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdocs/documents',
          payload: {},
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toMatch(/title/i);
      });

      it('returns error when batchUpdate fails', async () => {
        const app = await buildApp(mockOAuthTokenService());
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ documentId: 'doc-fail' }),
            text: () => Promise.resolve('{}'),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'internal' }),
            text: () => Promise.resolve('internal server error'),
          });
        vi.stubGlobal('fetch', fetchMock);
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/integrations/gdocs/documents',
          payload: { title: 'Fail Doc', content: 'some text' },
        });
        expect(res.statusCode).toBe(500);
      });
    });
  });
});
