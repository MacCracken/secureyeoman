import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ── Mock ConstitutionalEngine ────────────────────────────────────────────────

const mockIsEnabled = true;
const mockPrinciples = [
  {
    id: 'helpfulness',
    name: 'Helpfulness',
    description: 'Be helpful',
    weight: 1,
    critiquePrompt: 'Is this helpful?',
    enabled: true,
  },
  {
    id: 'harmlessness',
    name: 'Harmlessness',
    description: 'Do no harm',
    weight: 0.9,
    critiquePrompt: 'Is this harmful?',
    enabled: true,
  },
];

const mockCritique = vi.fn();
const mockCritiqueAndRevise = vi.fn();

vi.mock('./constitutional.js', () => ({
  ConstitutionalEngine: function ConstitutionalEngine() {
    return {
      isEnabled: mockIsEnabled,
      getPrinciples: () => mockPrinciples,
      critique: mockCritique,
      critiqueAndRevise: mockCritiqueAndRevise,
    };
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    mode: 'critique',
    recordPreferencePairs: false,
    ...overrides,
  };
}

function makeSecureYeoman(configOverrides: Record<string, unknown> = {}) {
  const constitutionalConfig = makeConfig(configOverrides);
  return {
    getConfig: () => ({
      security: { constitutional: constitutionalConfig },
    }),
    getLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    }),
    getAIClient: () => ({
      chat: vi.fn().mockResolvedValue({ content: 'mocked' }),
    }),
    getIntentManager: () => null,
    getPreferenceManager: undefined as (() => unknown) | undefined,
  };
}

async function buildApp(configOverrides: Record<string, unknown> = {}) {
  const { registerConstitutionalRoutes } = await import('./constitutional-routes.js');
  const app = Fastify();
  const sy = makeSecureYeoman(configOverrides);
  registerConstitutionalRoutes(app, sy as never);
  return { app, sy };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('constitutional-routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Disabled config ──────────────────────────────────────────────────────

  describe('when disabled', () => {
    it('should not register any routes', async () => {
      const { app } = await buildApp({ enabled: false });

      const res1 = await app.inject({
        method: 'GET',
        url: '/api/v1/security/constitutional/principles',
      });
      expect(res1.statusCode).toBe(404);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: { prompt: 'x', response: 'y' },
      });
      expect(res2.statusCode).toBe(404);

      const res3 = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'x', response: 'y' },
      });
      expect(res3.statusCode).toBe(404);

      await app.close();
    });
  });

  // ── GET /principles ──────────────────────────────────────────────────────

  describe('GET /api/v1/security/constitutional/principles', () => {
    it('should return principles list with enabled and mode', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/constitutional/principles',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.enabled).toBe(true);
      expect(body.mode).toBe('critique');
      expect(body.principles).toHaveLength(2);
      expect(body.principles[0]).toEqual({
        id: 'helpfulness',
        name: 'Helpfulness',
        description: 'Be helpful',
        weight: 1,
      });
      expect(body.principles[1]).toEqual({
        id: 'harmlessness',
        name: 'Harmlessness',
        description: 'Do no harm',
        weight: 0.9,
      });
      // critiquePrompt and enabled should NOT be in the response
      expect(body.principles[0]).not.toHaveProperty('critiquePrompt');
      expect(body.principles[0]).not.toHaveProperty('enabled');

      await app.close();
    });
  });

  // ── POST /critique ───────────────────────────────────────────────────────

  describe('POST /api/v1/security/constitutional/critique', () => {
    it('should return critiques for valid input', async () => {
      const critiques = [
        {
          principleId: 'helpfulness',
          principleName: 'Helpfulness',
          violated: false,
          explanation: 'Looks good',
          severity: 'low',
        },
        {
          principleId: 'harmlessness',
          principleName: 'Harmlessness',
          violated: true,
          explanation: 'Potentially harmful',
          severity: 'high',
        },
      ];
      mockCritique.mockResolvedValue(critiques);

      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: { prompt: 'How to cook pasta?', response: 'Boil water and add pasta.' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.critiques).toEqual(critiques);
      expect(body.violationCount).toBe(1);
      expect(mockCritique).toHaveBeenCalledWith('How to cook pasta?', 'Boil water and add pasta.');

      await app.close();
    });

    it('should return 400 when prompt is missing', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: { response: 'some response' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('prompt and response are required');

      await app.close();
    });

    it('should return 400 when response is missing', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: { prompt: 'some prompt' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('prompt and response are required');

      await app.close();
    });

    it('should return 400 when body is empty', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('prompt and response are required');

      await app.close();
    });

    it('should count zero violations when none violated', async () => {
      mockCritique.mockResolvedValue([
        {
          principleId: 'helpfulness',
          principleName: 'Helpfulness',
          violated: false,
          explanation: 'Fine',
          severity: 'low',
        },
      ]);

      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/critique',
        payload: { prompt: 'hi', response: 'hello' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().violationCount).toBe(0);

      await app.close();
    });
  });

  // ── POST /revise ─────────────────────────────────────────────────────────

  describe('POST /api/v1/security/constitutional/revise', () => {
    const revisionResult = {
      originalResponse: 'bad answer',
      revisedResponse: 'good answer',
      critiques: [
        {
          principleId: 'harmlessness',
          principleName: 'Harmlessness',
          violated: true,
          explanation: 'Was harmful',
          severity: 'high' as const,
        },
      ],
      revisionRound: 1,
      revised: true,
      totalRounds: 1,
    };

    it('should return revision for valid input', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me something', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.originalResponse).toBe('bad answer');
      expect(body.revisedResponse).toBe('good answer');
      expect(body.revised).toBe(true);
      expect(body.revisionRound).toBe(1);
      expect(mockCritiqueAndRevise).toHaveBeenCalledWith('tell me something', 'bad answer');

      await app.close();
    });

    it('should return 400 when prompt is missing', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { response: 'some response' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('prompt and response are required');

      await app.close();
    });

    it('should return 400 when response is missing', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'some prompt' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('prompt and response are required');

      await app.close();
    });

    it('should not record preference pair when recordPreferencePairs is false', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const { app, sy } = await buildApp({ recordPreferencePairs: false });
      const mockPrefMgr = { recordAnnotation: vi.fn() };
      sy.getPreferenceManager = () => mockPrefMgr;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockPrefMgr.recordAnnotation).not.toHaveBeenCalled();

      await app.close();
    });

    it('should record preference pair when recordPreferencePairs is true and revision occurred', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const mockRecordAnnotation = vi.fn().mockResolvedValue(undefined);
      const { app, sy } = await buildApp({ recordPreferencePairs: true });
      sy.getPreferenceManager = () => ({ recordAnnotation: mockRecordAnnotation });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockRecordAnnotation).toHaveBeenCalledWith({
        prompt: 'tell me',
        chosen: 'good answer',
        rejected: 'bad answer',
        source: 'constitutional',
        metadata: {
          critiques: [{ id: 'harmlessness', severity: 'high' }],
          round: 1,
          source: 'api',
        },
      });

      await app.close();
    });

    it('should not record preference pair when revision did not occur', async () => {
      const noRevisionResult = {
        ...revisionResult,
        revised: false,
        revisedResponse: 'bad answer',
        critiques: [
          {
            principleId: 'helpfulness',
            principleName: 'Helpfulness',
            violated: false,
            explanation: 'Fine',
            severity: 'low' as const,
          },
        ],
      };
      mockCritiqueAndRevise.mockResolvedValue(noRevisionResult);

      const mockRecordAnnotation = vi.fn().mockResolvedValue(undefined);
      const { app, sy } = await buildApp({ recordPreferencePairs: true });
      sy.getPreferenceManager = () => ({ recordAnnotation: mockRecordAnnotation });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockRecordAnnotation).not.toHaveBeenCalled();

      await app.close();
    });

    it('should not record preference pair when prefMgr is not available', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const { app, sy } = await buildApp({ recordPreferencePairs: true });
      sy.getPreferenceManager = undefined;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);

      await app.close();
    });

    it('should swallow errors from prefMgr.recordAnnotation (non-critical)', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const mockRecordAnnotation = vi.fn().mockRejectedValue(new Error('DB down'));
      const { app, sy } = await buildApp({ recordPreferencePairs: true });
      sy.getPreferenceManager = () => ({ recordAnnotation: mockRecordAnnotation });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      // Should still succeed despite recordAnnotation throwing
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.revised).toBe(true);
      expect(body.revisedResponse).toBe('good answer');
      expect(mockRecordAnnotation).toHaveBeenCalled();

      await app.close();
    });

    it('should not record when getPreferenceManager returns null', async () => {
      mockCritiqueAndRevise.mockResolvedValue(revisionResult);

      const { app, sy } = await buildApp({ recordPreferencePairs: true });
      sy.getPreferenceManager = () => null;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/constitutional/revise',
        payload: { prompt: 'tell me', response: 'bad answer' },
      });

      expect(res.statusCode).toBe(200);

      await app.close();
    });
  });
});
