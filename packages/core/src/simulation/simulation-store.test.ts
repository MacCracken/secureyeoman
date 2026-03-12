import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationStore } from './simulation-store.js';
import type { TickConfig, MoodState, MoodEvent } from '@secureyeoman/shared';

const mockQuery = vi.fn();

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

function makeTickConfig(overrides: Partial<TickConfig> = {}): TickConfig {
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

describe('SimulationStore', () => {
  let store: SimulationStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new SimulationStore();
  });

  describe('saveTickConfig', () => {
    it('executes upsert query', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const config = makeTickConfig();
      await store.saveTickConfig(config);
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO simulation.tick_configs');
      expect(sql).toContain('ON CONFLICT (personality_id)');
    });
  });

  describe('getTickConfig', () => {
    it('returns config when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'tc-1',
            personality_id: 'p-1',
            mode: 'realtime',
            tick_interval_ms: 500,
            time_scale: 2.0,
            paused: false,
            current_tick: 10,
            sim_time_epoch: 5000,
            last_tick_at: 1000,
            created_at: 100,
            updated_at: 200,
          },
        ],
      });

      const config = await store.getTickConfig('p-1');
      expect(config).not.toBeNull();
      expect(config!.personalityId).toBe('p-1');
      expect(config!.mode).toBe('realtime');
      expect(config!.tickIntervalMs).toBe(500);
      expect(config!.timeScale).toBe(2.0);
      expect(config!.currentTick).toBe(10);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const config = await store.getTickConfig('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('deleteTickConfig', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      expect(await store.deleteTickConfig('p-1')).toBe(true);
    });

    it('returns false when nothing to delete', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      expect(await store.deleteTickConfig('nonexistent')).toBe(false);
    });
  });

  describe('upsertMoodState', () => {
    it('executes upsert query', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await store.upsertMoodState(makeMoodState());
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO simulation.mood_states');
      expect(sql).toContain('ON CONFLICT (personality_id)');
    });
  });

  describe('getMoodState', () => {
    it('returns mood state when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'mood-1',
            personality_id: 'p-1',
            valence: 0.3,
            arousal: 0.4,
            dominance: 0.5,
            label: 'happy',
            decay_rate: 0.05,
            baseline_valence: 0,
            baseline_arousal: 0.2,
            updated_at: 1000,
          },
        ],
      });

      const mood = await store.getMoodState('p-1');
      expect(mood).not.toBeNull();
      expect(mood!.valence).toBe(0.3);
      expect(mood!.arousal).toBe(0.4);
      expect(mood!.label).toBe('happy');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await store.getMoodState('nonexistent')).toBeNull();
    });
  });

  describe('recordMoodEvent', () => {
    it('inserts event', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const event: MoodEvent = {
        id: 'evt-1',
        personalityId: 'p-1',
        eventType: 'compliment',
        valenceDelta: 0.3,
        arousalDelta: 0.1,
        source: 'user',
        metadata: { text: 'nice job' },
        createdAt: Date.now(),
      };
      await store.recordMoodEvent(event);
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO simulation.mood_events');
    });
  });

  describe('listMoodEvents', () => {
    it('returns events with limit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'evt-1',
            personality_id: 'p-1',
            event_type: 'compliment',
            valence_delta: 0.3,
            arousal_delta: 0.1,
            source: 'user',
            metadata: {},
            created_at: 1000,
          },
        ],
      });

      const events = await store.listMoodEvents('p-1', { limit: 10 });
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('compliment');
    });

    it('filters by since timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await store.listMoodEvents('p-1', { since: 5000 });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('created_at >= $2');
    });
  });

  describe('updateMoodValues', () => {
    it('updates valence, arousal, and label', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await store.updateMoodValues('p-1', 0.5, 0.6, 'excited');
      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE simulation.mood_states');
      expect(mockQuery.mock.calls[0][1]).toEqual(expect.arrayContaining([0.5, 0.6, 'excited']));
    });
  });

  describe('updateTickState', () => {
    it('updates tick and simTime', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await store.updateTickState('p-1', 42, 42000);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE simulation.tick_configs');
      expect(mockQuery.mock.calls[0][1]![0]).toBe(42);
      expect(mockQuery.mock.calls[0][1]![1]).toBe(42000);
    });
  });
});
