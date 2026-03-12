import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TickDriver } from './tick-driver.js';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { TickConfig, TickEvent } from '@secureyeoman/shared';
import { createNoopLogger } from '../logging/logger.js';

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

function makeStore(config: TickConfig | null = null): SimulationStore {
  return {
    getTickConfig: vi.fn().mockResolvedValue(config),
    saveTickConfig: vi.fn().mockResolvedValue(undefined),
    updateTickState: vi.fn().mockResolvedValue(undefined),
    deleteTickConfig: vi.fn().mockResolvedValue(true),
  } as unknown as SimulationStore;
}

function makeMoodEngine(): MoodEngine {
  return {
    decayMood: vi.fn().mockResolvedValue(null),
  } as unknown as MoodEngine;
}

describe('TickDriver', () => {
  let store: SimulationStore;
  let moodEngine: MoodEngine;
  let driver: TickDriver;

  beforeEach(() => {
    vi.useFakeTimers();
    store = makeStore();
    moodEngine = makeMoodEngine();
    driver = new TickDriver({
      store,
      logger: createNoopLogger(),
      moodEngine,
      cognitiveDecayIntervalTicks: 5,
    });
  });

  afterEach(() => {
    driver.stopAll();
    vi.useRealTimers();
  });

  describe('startPersonality', () => {
    it('creates a tick config for turn_based', async () => {
      const config = await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'turn_based',
        tickIntervalMs: 1000,
        timeScale: 1.0,
      });

      expect(config.mode).toBe('turn_based');
      expect(config.personalityId).toBe('p-1');
      expect(store.saveTickConfig).toHaveBeenCalledOnce();
    });

    it('preserves existing tick/simTime on restart', async () => {
      const existing = makeConfig({ currentTick: 50, simTimeEpoch: 50000 });
      store = makeStore(existing);
      driver = new TickDriver({ store, logger: createNoopLogger(), moodEngine });

      const config = await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'turn_based',
        tickIntervalMs: 1000,
        timeScale: 1.0,
      });

      expect(config.currentTick).toBe(50);
      expect(config.simTimeEpoch).toBe(50000);
    });
  });

  describe('advanceTick (turn_based)', () => {
    it('advances tick and simTime', async () => {
      const config = makeConfig({ currentTick: 0, simTimeEpoch: 0 });
      store = makeStore(config);
      driver = new TickDriver({ store, logger: createNoopLogger(), moodEngine });

      const event = await driver.advanceTick('p-1');

      expect(event).not.toBeNull();
      expect(event!.tick).toBe(1);
      expect(event!.simTime).toBe(1000); // tickIntervalMs * timeScale = 1000
      expect(store.updateTickState).toHaveBeenCalledWith('p-1', 1, 1000);
    });

    it('returns null for nonexistent config', async () => {
      const event = await driver.advanceTick('nonexistent');
      expect(event).toBeNull();
    });

    it('calls mood decay per tick', async () => {
      const config = makeConfig();
      store = makeStore(config);
      driver = new TickDriver({ store, logger: createNoopLogger(), moodEngine });

      await driver.advanceTick('p-1');

      expect(moodEngine.decayMood).toHaveBeenCalledWith('p-1');
    });

    it('triggers cognitive decay at configured interval', async () => {
      const cognitiveDecay = vi.fn();
      const config = makeConfig({ currentTick: 4 });
      store = makeStore(config);
      driver = new TickDriver({
        store,
        logger: createNoopLogger(),
        moodEngine,
        cognitiveDecayIntervalTicks: 5,
        onCognitiveDecay: cognitiveDecay,
      });

      // Tick 4 → 5 (5 % 5 === 0)
      await driver.advanceTick('p-1');
      expect(cognitiveDecay).toHaveBeenCalledWith('p-1');
    });

    it('does not trigger cognitive decay off-interval', async () => {
      const cognitiveDecay = vi.fn();
      const config = makeConfig({ currentTick: 2 });
      store = makeStore(config);
      driver = new TickDriver({
        store,
        logger: createNoopLogger(),
        moodEngine,
        cognitiveDecayIntervalTicks: 5,
        onCognitiveDecay: cognitiveDecay,
      });

      // Tick 2 → 3 (3 % 5 !== 0)
      await driver.advanceTick('p-1');
      expect(cognitiveDecay).not.toHaveBeenCalled();
    });

    it('notifies registered tick handlers', async () => {
      const config = makeConfig();
      store = makeStore(config);
      driver = new TickDriver({ store, logger: createNoopLogger() });

      const events: TickEvent[] = [];
      driver.onTick((event) => events.push(event));

      await driver.advanceTick('p-1');

      expect(events).toHaveLength(1);
      expect(events[0].tick).toBe(1);
      expect(events[0].personalityId).toBe('p-1');
    });
  });

  describe('realtime mode', () => {
    it('auto-ticks at tickIntervalMs', async () => {
      const config = makeConfig({ mode: 'realtime', tickIntervalMs: 500 });
      // getTickConfig returns config on timer fires
      (store.getTickConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);

      await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'realtime',
        tickIntervalMs: 500,
        timeScale: 1.0,
      });

      // Advance fake timers
      await vi.advanceTimersByTimeAsync(1500);

      // Should have fired ~3 times (at 500, 1000, 1500)
      expect(
        (store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('accelerated mode', () => {
    it('compresses wall-clock interval by timeScale', async () => {
      const config = makeConfig({ mode: 'accelerated', tickIntervalMs: 1000, timeScale: 10 });
      (store.getTickConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);

      await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'accelerated',
        tickIntervalMs: 1000,
        timeScale: 10,
      });

      // Wall-clock interval = 1000/10 = 100ms
      await vi.advanceTimersByTimeAsync(350);

      // Should have fired ~3 times (at 100, 200, 300)
      expect(
        (store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThanOrEqual(2);
    });

    it('advances simTime by tickIntervalMs * timeScale', async () => {
      const config = makeConfig({
        mode: 'accelerated',
        tickIntervalMs: 1000,
        timeScale: 5,
        currentTick: 0,
        simTimeEpoch: 0,
      });
      store = makeStore(config);
      driver = new TickDriver({ store, logger: createNoopLogger() });

      const event = await driver.advanceTick('p-1');
      // simTime = 0 + 1000 * 5 = 5000
      expect(event!.simTime).toBe(5000);
    });
  });

  describe('pause/resume', () => {
    it('pauses and resumes', async () => {
      const config = makeConfig({ mode: 'realtime', tickIntervalMs: 200 });
      (store.getTickConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);

      await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'realtime',
        tickIntervalMs: 200,
        timeScale: 1.0,
      });

      const paused = await driver.pausePersonality('p-1');
      expect(paused).not.toBeNull();
      expect(paused!.paused).toBe(true);

      // After pause, advancing timers should not fire ticks
      const callsBefore = (store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(500);
      // Timer was cleared, so no new calls (the paused config makes onTimerFire bail out)
      // Note: interval was cleared, so no new calls at all
      const callsAfter = (store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);

      // Resume
      const resumed = await driver.resumePersonality('p-1');
      expect(resumed).not.toBeNull();
      expect(resumed!.paused).toBe(false);
    });

    it('returns null for nonexistent personality', async () => {
      store = makeStore(null);
      driver = new TickDriver({ store, logger: createNoopLogger() });

      expect(await driver.pausePersonality('nope')).toBeNull();
      expect(await driver.resumePersonality('nope')).toBeNull();
    });
  });

  describe('stopPersonality', () => {
    it('clears timer and deletes config', async () => {
      const config = makeConfig({ mode: 'realtime', tickIntervalMs: 100 });
      (store.getTickConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);

      await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'realtime',
        tickIntervalMs: 100,
        timeScale: 1.0,
      });

      const stopped = await driver.stopPersonality('p-1');
      expect(stopped).toBe(true);
      expect(store.deleteTickConfig).toHaveBeenCalledWith('p-1');
    });
  });

  describe('stopAll', () => {
    it('clears all timers', async () => {
      const config = makeConfig({ mode: 'realtime', tickIntervalMs: 100 });
      (store.getTickConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);

      await driver.startPersonality({
        personalityId: 'p-1',
        mode: 'realtime',
        tickIntervalMs: 100,
        timeScale: 1.0,
      });

      driver.stopAll();

      const callsBefore = (store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(500);
      expect((store.updateTickState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        callsBefore
      );
    });
  });
});
