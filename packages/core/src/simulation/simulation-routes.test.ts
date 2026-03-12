import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerSimulationRoutes } from './simulation-routes.js';
import type { SimulationStore } from './simulation-store.js';
import type { TickDriver } from './tick-driver.js';
import type { MoodEngine } from './mood-engine.js';
import type { TickConfig, MoodState } from '@secureyeoman/shared';

function makeConfig(overrides: Partial<TickConfig> = {}): TickConfig {
  return {
    id: 'tc-1',
    personalityId: 'p-1',
    mode: 'turn_based',
    tickIntervalMs: 1000,
    timeScale: 1.0,
    paused: false,
    currentTick: 0,
    simTimeEpoch: 0,
    lastTickAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeMoodState(overrides: Partial<MoodState> = {}): MoodState {
  return {
    id: 'mood-1',
    personalityId: 'p-1',
    valence: 0.3,
    arousal: 0.4,
    dominance: 0.5,
    label: 'happy',
    decayRate: 0.05,
    baselineValence: 0,
    baselineArousal: 0.2,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTickDriver(config: TickConfig | null = makeConfig()): TickDriver {
  return {
    getState: vi.fn().mockResolvedValue(config),
    startPersonality: vi.fn().mockResolvedValue(config),
    advanceTick: vi
      .fn()
      .mockResolvedValue(
        config
          ? { tick: 1, simTime: 1000, personalityId: config.personalityId, timestamp: Date.now() }
          : null
      ),
    pausePersonality: vi.fn().mockResolvedValue(config ? { ...config, paused: true } : null),
    resumePersonality: vi.fn().mockResolvedValue(config ? { ...config, paused: false } : null),
    stopPersonality: vi.fn().mockResolvedValue(config !== null),
  } as unknown as TickDriver;
}

function makeMoodEngine(mood: MoodState | null = makeMoodState()): MoodEngine {
  return {
    getMood: vi.fn().mockResolvedValue(mood),
    applyEvent: vi.fn().mockResolvedValue(mood),
  } as unknown as MoodEngine;
}

function makeStore(): SimulationStore {
  return {
    listMoodEvents: vi.fn().mockResolvedValue([]),
  } as unknown as SimulationStore;
}

describe('Simulation Routes', () => {
  let app: FastifyInstance;
  let tickDriver: TickDriver;
  let moodEngine: MoodEngine;
  let store: SimulationStore;

  beforeEach(async () => {
    app = Fastify();
    tickDriver = makeTickDriver();
    moodEngine = makeMoodEngine();
    store = makeStore();
    registerSimulationRoutes(app, { store, tickDriver, moodEngine });
    await app.ready();
  });

  // ── Tick Driver Routes ────────────────────────────────────────────

  describe('GET /api/v1/simulation/tick/:personalityId', () => {
    it('returns tick config', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/tick/p-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().personalityId).toBe('p-1');
    });

    it('returns 404 when not found', async () => {
      tickDriver = makeTickDriver(null);
      app = Fastify();
      registerSimulationRoutes(app, { store, tickDriver, moodEngine });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/simulation/tick/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/simulation/tick/:personalityId', () => {
    it('creates tick config', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/p-1',
        payload: { mode: 'turn_based', tickIntervalMs: 500, timeScale: 1 },
      });
      expect(res.statusCode).toBe(201);
      expect(tickDriver.startPersonality).toHaveBeenCalled();
    });

    it('returns 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/p-1',
        payload: { mode: 'invalid_mode' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/simulation/tick/:personalityId/advance', () => {
    it('advances tick', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/p-1/advance',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().tick).toBe(1);
    });

    it('returns 404 when not found', async () => {
      tickDriver = makeTickDriver(null);
      app = Fastify();
      registerSimulationRoutes(app, { store, tickDriver, moodEngine });
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/nope/advance',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/simulation/tick/:personalityId/pause', () => {
    it('pauses ticking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/p-1/pause',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().paused).toBe(true);
    });
  });

  describe('POST /api/v1/simulation/tick/:personalityId/resume', () => {
    it('resumes ticking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/simulation/tick/p-1/resume',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().paused).toBe(false);
    });
  });

  describe('DELETE /api/v1/simulation/tick/:personalityId', () => {
    it('stops and deletes config', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/tick/p-1',
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when not found', async () => {
      tickDriver = makeTickDriver(null);
      app = Fastify();
      registerSimulationRoutes(app, { store, tickDriver, moodEngine });
      await app.ready();

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/simulation/tick/nope',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Mood Routes ───────────────────────────────────────────────────

  describe('GET /api/v1/personalities/:id/mood', () => {
    it('returns mood state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/p-1/mood',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().label).toBe('happy');
    });

    it('returns 404 when no mood', async () => {
      moodEngine = makeMoodEngine(null);
      app = Fastify();
      registerSimulationRoutes(app, { store, tickDriver, moodEngine });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/p-1/mood',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/personalities/:id/mood/event', () => {
    it('applies mood event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/p-1/mood/event',
        payload: {
          eventType: 'compliment',
          valenceDelta: 0.3,
          arousalDelta: 0.1,
          source: 'user',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(moodEngine.applyEvent).toHaveBeenCalled();
    });

    it('returns 400 for invalid event', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/p-1/mood/event',
        payload: { valenceDelta: 'not a number' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/personalities/:id/mood/history', () => {
    it('returns event history', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/personalities/p-1/mood/history?limit=10',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toEqual([]);
    });
  });

  describe('POST /api/v1/personalities/:id/mood/reset', () => {
    it('resets mood to baseline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/p-1/mood/reset',
      });
      expect(res.statusCode).toBe(200);
      expect(moodEngine.applyEvent).toHaveBeenCalled();
    });

    it('returns 404 when no mood exists', async () => {
      moodEngine = makeMoodEngine(null);
      app = Fastify();
      registerSimulationRoutes(app, { store, tickDriver, moodEngine });
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/personalities/p-1/mood/reset',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
