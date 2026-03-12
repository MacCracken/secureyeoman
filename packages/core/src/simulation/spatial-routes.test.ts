import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerSimulationRoutes } from './simulation-routes.js';
import type { SimulationStore } from './simulation-store.js';
import type { TickDriver } from './tick-driver.js';
import type { MoodEngine } from './mood-engine.js';
import type { SpatialEngine } from './spatial-engine.js';
import type { EntityLocation, SpatialZone, ProximityRule } from '@secureyeoman/shared';

function makeLoc(overrides: Partial<EntityLocation> = {}): EntityLocation {
  return {
    id: 'loc-1',
    personalityId: 'p-1',
    entityId: 'e-1',
    entityType: 'npc',
    zoneId: 'market',
    x: 10,
    y: 20,
    z: 0,
    heading: 0,
    speed: 0,
    metadata: {},
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeZone(overrides: Partial<SpatialZone> = {}): SpatialZone {
  return {
    id: 'zone-1',
    personalityId: 'p-1',
    zoneId: 'market',
    name: 'Market Square',
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    properties: {},
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<ProximityRule> = {}): ProximityRule {
  return {
    id: 'rule-1',
    personalityId: 'p-1',
    triggerType: 'enter_radius',
    sourceEntityId: 'e-1',
    targetEntityId: 'e-2',
    targetZoneId: null,
    radiusThreshold: 10,
    cooldownMs: 0,
    moodEffect: null,
    enabled: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTickDriver(): TickDriver {
  return {
    getState: vi.fn().mockResolvedValue(null),
    startPersonality: vi.fn().mockResolvedValue(null),
    advanceTick: vi.fn().mockResolvedValue(null),
    pausePersonality: vi.fn().mockResolvedValue(null),
    resumePersonality: vi.fn().mockResolvedValue(null),
    stopPersonality: vi.fn().mockResolvedValue(false),
  } as unknown as TickDriver;
}

function makeMoodEngine(): MoodEngine {
  return {
    getMood: vi.fn().mockResolvedValue(null),
    applyEvent: vi.fn().mockResolvedValue(null),
  } as unknown as MoodEngine;
}

function makeStore(): SimulationStore {
  return {
    listMoodEvents: vi.fn().mockResolvedValue([]),
  } as unknown as SimulationStore;
}

function makeSpatialEngine(): SpatialEngine {
  return {
    updateEntityLocation: vi.fn().mockResolvedValue(makeLoc()),
    getEntityLocation: vi.fn().mockResolvedValue(makeLoc()),
    listEntities: vi.fn().mockResolvedValue([makeLoc()]),
    removeEntity: vi.fn().mockResolvedValue(true),
    createZone: vi.fn().mockResolvedValue(makeZone()),
    listZones: vi.fn().mockResolvedValue([makeZone()]),
    deleteZone: vi.fn().mockResolvedValue(true),
    addRule: vi.fn().mockResolvedValue(makeRule()),
    listRules: vi.fn().mockResolvedValue([makeRule()]),
    deleteRule: vi.fn().mockResolvedValue(true),
    listProximityEvents: vi.fn().mockResolvedValue([]),
  } as unknown as SpatialEngine;
}

describe('Spatial Routes', () => {
  let app: FastifyInstance;
  let spatialEngine: SpatialEngine;

  beforeEach(async () => {
    app = Fastify();
    spatialEngine = makeSpatialEngine();
    registerSimulationRoutes(app, {
      store: makeStore(),
      tickDriver: makeTickDriver(),
      moodEngine: makeMoodEngine(),
      spatialEngine,
    });
    await app.ready();
  });

  // ── Entity Location Routes ──────────────────────────────────────

  describe('POST /api/v1/simulation/spatial/:personalityId/entities', () => {
    it('upserts entity location', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/entities',
        payload: {
          entityId: 'e-1',
          entityType: 'npc',
          zoneId: 'market',
          x: 10,
          y: 20,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entityId).toBe('e-1');
      expect(spatialEngine.updateEntityLocation).toHaveBeenCalled();
    });

    it('returns 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/entities',
        payload: { x: 'not a number' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/simulation/spatial/:personalityId/entities', () => {
    it('lists entities', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/spatial/p-1/entities',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
    });

    it('filters by zoneId', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/spatial/p-1/entities?zoneId=market',
      });
      expect(spatialEngine.listEntities).toHaveBeenCalledWith('p-1', {
        zoneId: 'market',
        limit: undefined,
      });
    });
  });

  describe('DELETE /api/v1/simulation/spatial/:personalityId/entities/:entityId', () => {
    it('removes entity', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/entities/e-1',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (spatialEngine.removeEntity as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/entities/nope',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Zone Routes ─────────────────────────────────────────────────

  describe('POST /api/v1/simulation/spatial/:personalityId/zones', () => {
    it('creates a zone', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/zones',
        payload: {
          zoneId: 'market',
          name: 'Market Square',
          minX: 0,
          minY: 0,
          maxX: 100,
          maxY: 100,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().zoneId).toBe('market');
    });

    it('returns 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/zones',
        payload: { name: 'Missing bounds' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/simulation/spatial/:personalityId/zones', () => {
    it('lists zones', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/spatial/p-1/zones',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/simulation/spatial/:personalityId/zones/:zoneId', () => {
    it('deletes zone', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/zones/market',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (spatialEngine.deleteZone as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/zones/nope',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Proximity Rule Routes ───────────────────────────────────────

  describe('POST /api/v1/simulation/spatial/:personalityId/rules', () => {
    it('creates proximity rule', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/rules',
        payload: {
          triggerType: 'enter_radius',
          sourceEntityId: 'e-1',
          targetEntityId: 'e-2',
          radiusThreshold: 10,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().triggerType).toBe('enter_radius');
    });

    it('returns 400 for invalid trigger type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/spatial/p-1/rules',
        payload: { triggerType: 'invalid' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/simulation/spatial/:personalityId/rules', () => {
    it('lists rules', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/spatial/p-1/rules',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/simulation/spatial/:personalityId/rules/:ruleId', () => {
    it('deletes rule', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/rules/rule-1',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      (spatialEngine.deleteRule as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/spatial/p-1/rules/nope',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Proximity Event History ─────────────────────────────────────

  describe('GET /api/v1/simulation/spatial/:personalityId/proximity', () => {
    it('returns proximity events', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/spatial/p-1/proximity?limit=10',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toEqual([]);
    });
  });
});
