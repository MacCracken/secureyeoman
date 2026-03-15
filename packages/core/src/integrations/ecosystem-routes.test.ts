import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerEcosystemRoutes } from './ecosystem-routes.js';
import type { EcosystemServiceInfo } from './service-discovery.js';

const mockListSandboxProfiles = vi.fn();
vi.mock('./agnos/agnos-client.js', () => ({
  AgnosClient: function (_config: unknown, _logger: unknown) {
    return { listSandboxProfiles: mockListSandboxProfiles };
  },
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as any;

const MOCK_AGNOSTIC: EcosystemServiceInfo = {
  id: 'agnostic',
  displayName: 'Agnostic Agentic System',
  description: 'QA platform',
  url: 'http://127.0.0.1:8000',
  healthUrl: 'http://127.0.0.1:8000/health',
  status: 'disconnected',
  enabled: false,
  lastProbeAt: null,
  lastProbeLatencyMs: null,
  error: null,
  requiredSecrets: ['AGNOSTIC_API_KEY', 'AGNOSTIC_WEBHOOK_SECRET'],
  secretsProvisioned: false,
};

const MOCK_AGNOS: EcosystemServiceInfo = {
  id: 'agnos',
  displayName: 'AGNOS Runtime',
  description: 'Agent runtime',
  url: 'http://127.0.0.1:8090',
  healthUrl: 'http://127.0.0.1:8090/health',
  status: 'disconnected',
  enabled: false,
  lastProbeAt: null,
  lastProbeLatencyMs: null,
  error: null,
  requiredSecrets: ['AGNOS_GATEWAY_API_KEY', 'AGNOS_RUNTIME_API_KEY'],
  secretsProvisioned: false,
};

function makeMockManager() {
  return {
    getServices: vi.fn().mockReturnValue([MOCK_AGNOSTIC, MOCK_AGNOS]),
    getService: vi.fn().mockImplementation((id: string) => {
      if (id === 'agnostic') return { ...MOCK_AGNOSTIC };
      if (id === 'agnos') return { ...MOCK_AGNOS };
      return undefined;
    }),
    probe: vi.fn().mockResolvedValue({ ...MOCK_AGNOSTIC, lastProbeAt: Date.now() }),
    enable: vi.fn().mockResolvedValue({ ...MOCK_AGNOSTIC, status: 'connected', enabled: true }),
    disable: vi
      .fn()
      .mockResolvedValue({ ...MOCK_AGNOSTIC, status: 'disconnected', enabled: false }),
  };
}

describe('Ecosystem Routes', () => {
  let app: FastifyInstance;
  let mockManager: ReturnType<typeof makeMockManager>;

  beforeEach(async () => {
    app = Fastify();
    mockManager = makeMockManager();
    registerEcosystemRoutes(app, { discoveryManager: mockManager as any, logger: mockLogger });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/ecosystem/services', () => {
    it('returns list of all services', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.services).toHaveLength(2);
      expect(body.services[0].id).toBe('agnostic');
      expect(body.services[1].id).toBe('agnos');
    });
  });

  describe('GET /api/v1/ecosystem/services/:id', () => {
    it('returns single service for valid id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services/agnostic',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe('agnostic');
      expect(body.displayName).toBe('Agnostic Agentic System');
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services/unknown',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('Unknown ecosystem service');
    });
  });

  describe('POST /api/v1/ecosystem/services/:id/probe', () => {
    it('returns service info after probe', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/agnostic/probe',
      });
      expect(res.statusCode).toBe(200);
      expect(mockManager.probe).toHaveBeenCalledWith('agnostic');
    });

    it('returns 404 for unknown service', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/unknown/probe',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/ecosystem/services/:id/enable', () => {
    it('returns connected service on success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/agnostic/enable',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('connected');
      expect(body.enabled).toBe(true);
      expect(mockManager.enable).toHaveBeenCalledWith('agnostic');
    });

    it('returns 502 when service is unreachable', async () => {
      mockManager.enable.mockResolvedValue({
        ...MOCK_AGNOSTIC,
        status: 'unreachable',
        error: 'ECONNREFUSED',
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/agnostic/enable',
      });
      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('unreachable');
      expect(body.service).toBeDefined();
    });

    it('returns 404 for unknown service', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/unknown/enable',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/ecosystem/services/:id/disable', () => {
    it('returns disconnected service info', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/agnostic/disable',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('disconnected');
      expect(body.enabled).toBe(false);
      expect(mockManager.disable).toHaveBeenCalledWith('agnostic');
    });

    it('returns 404 for unknown service', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ecosystem/services/unknown/disable',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/ecosystem/services/agnos/sandbox-profiles', () => {
    it('returns profiles when AGNOS is connected', async () => {
      mockManager.getService.mockImplementation((id: string) => {
        if (id === 'agnos') return { ...MOCK_AGNOS, status: 'connected', enabled: true };
        return undefined;
      });
      mockListSandboxProfiles.mockResolvedValue([
        { id: 'default', name: 'Default', seccomp: true, landlock: true },
        {
          id: 'permissive',
          name: 'Permissive',
          description: 'No restrictions',
          seccomp: false,
          landlock: false,
        },
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services/agnos/sandbox-profiles',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.profiles).toHaveLength(2);
      expect(body.profiles[0].id).toBe('default');
      expect(body.profiles[1].seccomp).toBe(false);
    });

    it('returns empty profiles when AGNOS is disconnected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services/agnos/sandbox-profiles',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.profiles).toEqual([]);
      expect(body.status).toBe('disconnected');
    });

    it('returns 502 when AGNOS client throws', async () => {
      mockManager.getService.mockImplementation((id: string) => {
        if (id === 'agnos') return { ...MOCK_AGNOS, status: 'connected', enabled: true };
        return undefined;
      });
      mockListSandboxProfiles.mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/ecosystem/services/agnos/sandbox-profiles',
      });
      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('ECONNREFUSED');
    });
  });
});
