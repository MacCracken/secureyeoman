/**
 * DLP Routes — unit tests for all DLP REST endpoints.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerDlpRoutes, type DlpRouteDeps } from './dlp-routes.js';

// ── Mock deps ─────────────────────────────────────────────────────────────────

function makeMockClassificationEngine() {
  return {
    classify: vi.fn().mockReturnValue({
      level: 'confidential',
      autoLevel: 'confidential',
      rulesTriggered: ['pii-ssn'],
    }),
  };
}

function makeMockClassificationStore() {
  return {
    create: vi.fn().mockResolvedValue('cls-1'),
    getByContentId: vi.fn().mockResolvedValue({ contentId: 'c1', level: 'internal' }),
    override: vi.fn().mockResolvedValue(1),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function makeMockDlpManager() {
  return {
    scanOutbound: vi.fn().mockResolvedValue({ allowed: true, violations: [] }),
  };
}

function makeMockDlpPolicyStore() {
  return {
    create: vi.fn().mockResolvedValue('pol-1'),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getById: vi.fn().mockResolvedValue({ id: 'pol-1', name: 'test' }),
    update: vi.fn().mockResolvedValue(1),
    delete: vi.fn().mockResolvedValue(1),
  };
}

function makeMockEgressMonitor() {
  return {
    getStats: vi.fn().mockResolvedValue({ total: 10, blocked: 2 }),
    getAnomalies: vi.fn().mockResolvedValue([{ id: 'a1' }]),
    getDestinations: vi.fn().mockResolvedValue([{ host: 'example.com' }]),
  };
}

function makeMockWatermarkEngine() {
  const engine = {
    embed: vi.fn().mockReturnValue('watermarked-text'),
    extract: vi.fn().mockReturnValue({ userId: 'u1' }),
    detect: vi.fn().mockReturnValue(true),
    getAlgorithm: vi.fn().mockReturnValue('unicode-steganography'),
    constructor: function MockWatermarkEngine(algo: string) {
      return { ...engine, getAlgorithm: vi.fn().mockReturnValue(algo) };
    },
  };
  return engine;
}

function makeMockWatermarkStore() {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockRetentionStore() {
  return {
    create: vi.fn().mockResolvedValue('ret-1'),
    list: vi.fn().mockResolvedValue([{ id: 'ret-1' }]),
    update: vi.fn().mockResolvedValue(1),
    delete: vi.fn().mockResolvedValue(1),
  };
}

function makeMockRetentionManager() {
  return {
    preview: vi.fn().mockResolvedValue({ pendingDeletions: 5 }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(depsOverrides: Partial<DlpRouteDeps> = {}): {
  app: FastifyInstance;
  deps: DlpRouteDeps;
} {
  const app = Fastify({ logger: false });

  // Inject authUser for routes that read (req as any).authUser
  app.addHook('onRequest', async (request) => {
    (request as any).authUser = { userId: 'user-1', role: 'admin' };
  });

  const deps: DlpRouteDeps = {
    classificationEngine: makeMockClassificationEngine() as any,
    classificationStore: makeMockClassificationStore() as any,
    dlpManager: makeMockDlpManager() as any,
    dlpPolicyStore: makeMockDlpPolicyStore() as any,
    watermarkEngine: makeMockWatermarkEngine() as any,
    watermarkStore: makeMockWatermarkStore() as any,
    egressMonitor: makeMockEgressMonitor() as any,
    retentionStore: makeMockRetentionStore() as any,
    retentionManager: makeMockRetentionManager() as any,
    ...depsOverrides,
  };

  registerDlpRoutes(app, deps);
  return { app, deps };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DLP Routes', () => {
  let app: FastifyInstance;
  let deps: DlpRouteDeps;

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── POST /api/v1/security/dlp/classify ──────────────────────────────────

  describe('POST /api/v1/security/dlp/classify', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('classifies text and returns result', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'my SSN is 123-45-6789' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.classification.level).toBe('confidential');
      expect(deps.classificationEngine.classify).toHaveBeenCalledWith('my SSN is 123-45-6789');
    });

    it('stores classification when contentId and contentType provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'secret', contentId: 'c1', contentType: 'document' },
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentId: 'c1',
          contentType: 'document',
          classificationLevel: 'confidential',
          manualOverride: false,
          tenantId: 'default',
        })
      );
    });

    it('does not store classification when contentId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'hello', contentType: 'message' },
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.create).not.toHaveBeenCalled();
    });

    it('does not store classification when contentType is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'hello', contentId: 'c1' },
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.create).not.toHaveBeenCalled();
    });

    it('returns 400 when text is missing (undefined body text)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: text');
    });

    it('allows empty string text (text === "")', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationEngine.classify).toHaveBeenCalledWith('');
    });

    it('returns 500 on internal error', async () => {
      (deps.classificationEngine.classify as any).mockImplementation(() => {
        throw new Error('boom');
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'test' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/security/dlp/classifications/:contentId ─────────────────

  describe('GET /api/v1/security/dlp/classifications/:contentId', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns classification by contentId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications/c1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().classification).toEqual({ contentId: 'c1', level: 'internal' });
      expect(deps.classificationStore.getByContentId).toHaveBeenCalledWith('c1', 'message');
    });

    it('passes contentType query param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications/c1?contentType=document',
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.getByContentId).toHaveBeenCalledWith('c1', 'document');
    });

    it('returns 500 on error', async () => {
      (deps.classificationStore.getByContentId as any).mockRejectedValue(new Error('db err'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications/c1',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── PUT /api/v1/security/dlp/classifications/:contentId ─────────────────

  describe('PUT /api/v1/security/dlp/classifications/:contentId', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('overrides classification level', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: { level: 'restricted' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(true);
      expect(deps.classificationStore.override).toHaveBeenCalledWith(
        'c1',
        'message',
        'restricted',
        'user-1'
      );
    });

    it('uses provided contentType', async () => {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: { level: 'internal', contentType: 'document' },
      });
      expect(deps.classificationStore.override).toHaveBeenCalledWith(
        'c1',
        'document',
        'internal',
        'user-1'
      );
    });

    it('returns updated false when nothing changed', async () => {
      (deps.classificationStore.override as any).mockResolvedValue(0);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: { level: 'public' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(false);
    });

    it('returns 400 when level is missing', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: level');
    });

    it('falls back to system userId when authUser is absent', async () => {
      const appNoAuth = Fastify({ logger: false });
      const noAuthDeps: DlpRouteDeps = {
        classificationEngine: makeMockClassificationEngine() as any,
        classificationStore: makeMockClassificationStore() as any,
      };
      registerDlpRoutes(appNoAuth, noAuthDeps);

      const res = await appNoAuth.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: { level: 'restricted' },
      });
      expect(res.statusCode).toBe(200);
      expect(noAuthDeps.classificationStore.override).toHaveBeenCalledWith(
        'c1',
        'message',
        'restricted',
        'system'
      );
      await appNoAuth.close();
    });

    it('returns 500 on error', async () => {
      (deps.classificationStore.override as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/classifications/c1',
        payload: { level: 'restricted' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/security/dlp/classifications ────────────────────────────

  describe('GET /api/v1/security/dlp/classifications', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('lists classifications with defaults', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications',
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.list).toHaveBeenCalledWith({
        level: undefined,
        contentType: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('passes query params with parsed int values', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications?level=confidential&contentType=message&limit=10&offset=5',
      });
      expect(res.statusCode).toBe(200);
      expect(deps.classificationStore.list).toHaveBeenCalledWith({
        level: 'confidential',
        contentType: 'message',
        limit: 10,
        offset: 5,
      });
    });

    it('returns 500 on error', async () => {
      (deps.classificationStore.list as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/classifications',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /api/v1/security/dlp/scan ──────────────────────────────────────

  describe('POST /api/v1/security/dlp/scan', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('scans outbound content', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: { content: 'hello', destination: 'slack' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().scan).toEqual({ allowed: true, violations: [] });
      expect(deps.dlpManager!.scanOutbound).toHaveBeenCalledWith('hello', 'slack', {
        contentType: undefined,
        userId: 'user-1',
        personalityId: undefined,
      });
    });

    it('passes optional fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: {
          content: 'data',
          destination: 'email',
          contentType: 'document',
          userId: 'u-custom',
          personalityId: 'p-1',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(deps.dlpManager!.scanOutbound).toHaveBeenCalledWith('data', 'email', {
        contentType: 'document',
        userId: 'u-custom',
        personalityId: 'p-1',
      });
    });

    it('returns 400 when content is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: { destination: 'slack' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: content');
    });

    it('returns 400 when destination is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: { content: 'hello' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: destination');
    });

    it('returns 500 on error', async () => {
      (deps.dlpManager!.scanOutbound as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: { content: 'x', destination: 'y' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /api/v1/security/dlp/policies ──────────────────────────────────

  describe('POST /api/v1/security/dlp/policies', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('creates a policy and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: {
          name: 'block-ssn',
          rules: [{ type: 'regex', value: '\\d{3}-\\d{2}-\\d{4}' }],
          action: 'block',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('pol-1');
      expect(deps.dlpPolicyStore!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'block-ssn',
          description: null,
          enabled: true,
          action: 'block',
          classificationLevels: ['confidential', 'restricted'],
          appliesTo: ['email', 'slack', 'webhook', 'api'],
          tenantId: 'default',
        })
      );
    });

    it('uses provided optional fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: {
          name: 'warn-pii',
          description: 'Warn on PII',
          enabled: false,
          rules: [{ type: 'regex', value: 'SSN' }],
          action: 'warn',
          classificationLevels: ['restricted'],
          appliesTo: ['email'],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(deps.dlpPolicyStore!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Warn on PII',
          enabled: false,
          classificationLevels: ['restricted'],
          appliesTo: ['email'],
        })
      );
    });

    it('returns 400 when name is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: { rules: [{ type: 'x', value: 'y' }], action: 'block' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: name');
    });

    it('returns 400 when rules is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: { name: 'test', action: 'block' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: rules');
    });

    it('returns 400 when rules is not an array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: { name: 'test', rules: 'not-array', action: 'block' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: rules');
    });

    it('returns 400 when action is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: { name: 'test', rules: [{ type: 'x', value: 'y' }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: action');
    });

    it('returns 500 on error', async () => {
      (deps.dlpPolicyStore!.create as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/policies',
        payload: { name: 'n', rules: [{ type: 'x', value: 'y' }], action: 'block' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/security/dlp/policies ───────────────────────────────────

  describe('GET /api/v1/security/dlp/policies', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('lists policies with defaults', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies',
      });
      expect(res.statusCode).toBe(200);
      expect(deps.dlpPolicyStore!.list).toHaveBeenCalledWith({
        active: undefined,
        appliesTo: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('parses active=true query param as boolean true', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies?active=true',
      });
      expect(deps.dlpPolicyStore!.list).toHaveBeenCalledWith(
        expect.objectContaining({ active: true })
      );
    });

    it('parses active=false query param as boolean false', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies?active=false',
      });
      expect(deps.dlpPolicyStore!.list).toHaveBeenCalledWith(
        expect.objectContaining({ active: false })
      );
    });

    it('parses limit and offset as integers', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies?limit=25&offset=50&appliesTo=email',
      });
      expect(deps.dlpPolicyStore!.list).toHaveBeenCalledWith({
        active: undefined,
        appliesTo: 'email',
        limit: 25,
        offset: 50,
      });
    });

    it('returns 500 on error', async () => {
      (deps.dlpPolicyStore!.list as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/security/dlp/policies/:id ───────────────────────────────

  describe('GET /api/v1/security/dlp/policies/:id', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns policy by id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies/pol-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().policy).toEqual({ id: 'pol-1', name: 'test' });
    });

    it('returns 404 when policy not found', async () => {
      (deps.dlpPolicyStore!.getById as any).mockResolvedValue(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies/nope',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Policy not found');
    });

    it('returns 500 on error', async () => {
      (deps.dlpPolicyStore!.getById as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/policies/pol-1',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── PUT /api/v1/security/dlp/policies/:id ───────────────────────────────

  describe('PUT /api/v1/security/dlp/policies/:id', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('updates policy and returns updated true', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/policies/pol-1',
        payload: { name: 'renamed', enabled: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(true);
      expect(deps.dlpPolicyStore!.update).toHaveBeenCalledWith('pol-1', {
        name: 'renamed',
        enabled: false,
      });
    });

    it('returns updated false when no rows changed', async () => {
      (deps.dlpPolicyStore!.update as any).mockResolvedValue(0);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/policies/pol-1',
        payload: { name: 'x' },
      });
      expect(res.json().updated).toBe(false);
    });

    it('returns 500 on error', async () => {
      (deps.dlpPolicyStore!.update as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/policies/pol-1',
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── DELETE /api/v1/security/dlp/policies/:id ────────────────────────────

  describe('DELETE /api/v1/security/dlp/policies/:id', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('deletes policy and returns deleted true', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/policies/pol-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().deleted).toBe(true);
    });

    it('returns deleted false when nothing was removed', async () => {
      (deps.dlpPolicyStore!.delete as any).mockResolvedValue(0);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/policies/pol-1',
      });
      expect(res.json().deleted).toBe(false);
    });

    it('returns 500 on error', async () => {
      (deps.dlpPolicyStore!.delete as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/policies/pol-1',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Conditional route registration (missing deps) ───────────────────────

  describe('routes not registered when deps missing', () => {
    it('does not register scan/policy routes without dlpManager', async () => {
      ({ app } = buildApp({ dlpManager: undefined, dlpPolicyStore: undefined }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/scan',
        payload: { content: 'x', destination: 'y' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('does not register egress routes without egressMonitor', async () => {
      ({ app } = buildApp({ egressMonitor: undefined }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/stats',
      });
      expect(res.statusCode).toBe(404);
    });

    it('does not register watermark routes without watermarkEngine', async () => {
      ({ app } = buildApp({ watermarkEngine: undefined, watermarkStore: undefined }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'x', contentId: 'c1' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('does not register retention routes without retentionStore', async () => {
      ({ app } = buildApp({ retentionStore: undefined, retentionManager: undefined }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/retention',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Egress monitor routes ───────────────────────────────────────────────

  describe('GET /api/v1/security/dlp/egress/stats', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns egress stats with defaults', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/stats',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ total: 10, blocked: 2 });
      const callArgs = (deps.egressMonitor!.getStats as any).mock.calls[0];
      expect(typeof callArgs[0]).toBe('number');
      expect(typeof callArgs[1]).toBe('number');
    });

    it('parses from/to query params', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/stats?from=1000&to=2000',
      });
      expect(res.statusCode).toBe(200);
      expect(deps.egressMonitor!.getStats).toHaveBeenCalledWith(1000, 2000);
    });

    it('returns 500 on error', async () => {
      (deps.egressMonitor!.getStats as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/stats',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/v1/security/dlp/egress/anomalies', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns anomalies', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/anomalies',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().anomalies).toEqual([{ id: 'a1' }]);
    });

    it('returns 500 on error', async () => {
      (deps.egressMonitor!.getAnomalies as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/anomalies',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/v1/security/dlp/egress/destinations', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns destinations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/destinations',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().destinations).toEqual([{ host: 'example.com' }]);
    });

    it('returns 500 on error', async () => {
      (deps.egressMonitor!.getDestinations as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/egress/destinations',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Watermark routes ────────────────────────────────────────────────────

  describe('POST /api/v1/security/dlp/watermark/embed', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('embeds watermark and records it', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'hello world', contentId: 'c1' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.contentId).toBe('c1');
      expect(body.algorithm).toBe('unicode-steganography');
      expect(deps.watermarkEngine!.embed).toHaveBeenCalled();
      expect(deps.watermarkStore!.record).toHaveBeenCalledWith(
        expect.objectContaining({
          contentId: 'c1',
          contentType: 'text',
          algorithm: 'unicode-steganography',
          tenantId: 'default',
        })
      );
    });

    it('uses authUser userId', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'hello', contentId: 'c1' },
      });
      const embedCall = (deps.watermarkEngine!.embed as any).mock.calls[0];
      const payload = embedCall[1];
      expect(payload.userId).toBe('user-1');
    });

    it('uses provided userId over authUser', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'hello', contentId: 'c1', userId: 'custom-user' },
      });
      const embedCall = (deps.watermarkEngine!.embed as any).mock.calls[0];
      const payload = embedCall[1];
      expect(payload.userId).toBe('custom-user');
    });

    it('returns 400 when text is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { contentId: 'c1' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: text');
    });

    it('allows empty string text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: '', contentId: 'c1' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when contentId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: contentId');
    });

    it('returns 500 on error', async () => {
      (deps.watermarkEngine!.embed as any).mockImplementation(() => {
        throw new Error('embed fail');
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/embed',
        payload: { text: 'hello', contentId: 'c1' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v1/security/dlp/watermark/extract', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('extracts watermark payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/extract',
        payload: { text: 'watermarked content' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(true);
      expect(body.payload).toEqual({ userId: 'u1' });
    });

    it('returns found=false when no watermark', async () => {
      (deps.watermarkEngine!.extract as any).mockReturnValue(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/extract',
        payload: { text: 'plain text' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().found).toBe(false);
      expect(res.json().payload).toBeNull();
    });

    it('returns 400 when text is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/extract',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: text');
    });

    it('allows empty string text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/extract',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 on error', async () => {
      (deps.watermarkEngine!.extract as any).mockImplementation(() => {
        throw new Error('fail');
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/extract',
        payload: { text: 'x' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v1/security/dlp/watermark/detect', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('detects watermark', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/detect',
        payload: { text: 'watermarked content' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().detected).toBe(true);
    });

    it('returns detected=false when no watermark', async () => {
      (deps.watermarkEngine!.detect as any).mockReturnValue(false);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/detect',
        payload: { text: 'plain text' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().detected).toBe(false);
    });

    it('returns 400 when text is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/detect',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: text');
    });

    it('allows empty string text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/detect',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('returns 500 on error', async () => {
      (deps.watermarkEngine!.detect as any).mockImplementation(() => {
        throw new Error('fail');
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/watermark/detect',
        payload: { text: 'x' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Retention routes ────────────────────────────────────────────────────

  describe('POST /api/v1/security/dlp/retention', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('creates retention policy and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { contentType: 'conversation', retentionDays: 90 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('ret-1');
      expect(deps.retentionStore!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'conversation',
          retentionDays: 90,
          classificationLevel: null,
          enabled: true,
          lastPurgeAt: null,
          tenantId: 'default',
        })
      );
    });

    it('passes optional fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: {
          contentType: 'document',
          retentionDays: 365,
          classificationLevel: 'restricted',
          enabled: false,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(deps.retentionStore!.create).toHaveBeenCalledWith(
        expect.objectContaining({
          classificationLevel: 'restricted',
          enabled: false,
        })
      );
    });

    it('returns 400 when contentType is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { retentionDays: 90 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required field: contentType');
    });

    it('returns 400 when retentionDays is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { contentType: 'conversation' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('retentionDays must be a positive number');
    });

    it('returns 400 when retentionDays is zero', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { contentType: 'conversation', retentionDays: 0 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('retentionDays must be a positive number');
    });

    it('returns 400 when retentionDays is negative', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { contentType: 'conversation', retentionDays: -5 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('retentionDays must be a positive number');
    });

    it('returns 500 on error', async () => {
      (deps.retentionStore!.create as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention',
        payload: { contentType: 'conversation', retentionDays: 90 },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/v1/security/dlp/retention', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('lists retention policies', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/retention',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().policies).toEqual([{ id: 'ret-1' }]);
    });

    it('returns 500 on error', async () => {
      (deps.retentionStore!.list as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/dlp/retention',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('PUT /api/v1/security/dlp/retention/:id', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('updates retention policy', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/retention/ret-1',
        payload: { retentionDays: 180, enabled: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().updated).toBe(true);
      expect(deps.retentionStore!.update).toHaveBeenCalledWith('ret-1', {
        retentionDays: 180,
        enabled: false,
      });
    });

    it('returns updated false when no rows changed', async () => {
      (deps.retentionStore!.update as any).mockResolvedValue(0);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/retention/ret-1',
        payload: { retentionDays: 30 },
      });
      expect(res.json().updated).toBe(false);
    });

    it('returns 500 on error', async () => {
      (deps.retentionStore!.update as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/security/dlp/retention/ret-1',
        payload: { retentionDays: 30 },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/v1/security/dlp/retention/:id', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('deletes retention policy', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/retention/ret-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().deleted).toBe(true);
    });

    it('returns deleted false when nothing removed', async () => {
      (deps.retentionStore!.delete as any).mockResolvedValue(0);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/retention/ret-1',
      });
      expect(res.json().deleted).toBe(false);
    });

    it('returns 500 on error', async () => {
      (deps.retentionStore!.delete as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/security/dlp/retention/ret-1',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/v1/security/dlp/retention/preview', () => {
    beforeEach(() => {
      ({ app, deps } = buildApp());
    });

    it('returns retention preview', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention/preview',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ pendingDeletions: 5 });
    });

    it('returns 500 on error', async () => {
      (deps.retentionManager!.preview as any).mockRejectedValue(new Error('fail'));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/retention/preview',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Feature guard (license) ─────────────────────────────────────────────

  describe('featureGuardOpts without secureYeoman', () => {
    it('registers classify route without preHandler when no secureYeoman', async () => {
      ({ app, deps } = buildApp({ secureYeoman: undefined }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/dlp/classify',
        payload: { text: 'hello' },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
