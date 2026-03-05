import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DriftDetectionManager } from './drift-detection-manager.js';

// ── Pool mock ────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as any;
}

// ── Logger mock ──────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function () {
      return this;
    }),
  } as any;
}

// ── Alert manager mock ───────────────────────────────────────────────────────

function makeAlertManager() {
  return {
    fireAlert: vi.fn(async () => undefined),
  } as any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBaselineRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'baseline-1',
    personality_id: 'p-1',
    baseline_mean: 0.85,
    baseline_stddev: 0.05,
    sample_count: 100,
    threshold: 2.0,
    computed_at: new Date(),
    ...overrides,
  };
}

function makeSnapshotRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'snap-1',
    baseline_id: 'baseline-1',
    current_mean: 0.82,
    current_stddev: 0.03,
    drift_magnitude: 0.6,
    sample_count: 50,
    alert_triggered: false,
    computed_at: new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DriftDetectionManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let alertManager: ReturnType<typeof makeAlertManager>;
  let manager: DriftDetectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    alertManager = makeAlertManager();
    manager = new DriftDetectionManager({ pool, logger, getAlertManager: () => alertManager });
  });

  afterEach(() => {
    manager.stop();
  });

  // ── computeBaseline ──────────────────────────────────────────────────────

  describe('computeBaseline()', () => {
    it('inserts baseline with mean/stddev', async () => {
      const row = makeBaselineRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.85, stddev: 0.05, count: '100' }], rowCount: 1 }) // compute stats
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }); // insert

      const baseline = await manager.computeBaseline('p-1');
      expect(baseline.id).toBe('baseline-1');
      expect(baseline.baselineMean).toBe(0.85);
      expect(baseline.baselineStddev).toBe(0.05);
    });

    it('stores personality_id', async () => {
      const row = makeBaselineRow({ personality_id: 'p-42' });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.8, stddev: 0.1, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const baseline = await manager.computeBaseline('p-42');
      expect(baseline.personalityId).toBe('p-42');
    });

    it('with custom threshold', async () => {
      const row = makeBaselineRow({ threshold: 3.0 });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.8, stddev: 0.1, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const baseline = await manager.computeBaseline('p-1', 3.0);
      expect(baseline.threshold).toBe(3.0);
    });
  });

  // ── listBaselines ────────────────────────────────────────────────────────

  describe('listBaselines()', () => {
    it('returns baselines', async () => {
      const rows = [makeBaselineRow(), makeBaselineRow({ id: 'baseline-2' })];
      pool.query = vi.fn(async () => ({ rows, rowCount: rows.length }));

      const baselines = await manager.listBaselines();
      expect(baselines).toHaveLength(2);
    });
  });

  // ── getBaseline ──────────────────────────────────────────────────────────

  describe('getBaseline()', () => {
    it('returns baseline by ID', async () => {
      const row = makeBaselineRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const baseline = await manager.getBaseline('baseline-1');
      expect(baseline).not.toBeNull();
      expect(baseline!.id).toBe('baseline-1');
    });

    it('returns null for missing', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const baseline = await manager.getBaseline('nope');
      expect(baseline).toBeNull();
    });
  });

  // ── getSnapshots ─────────────────────────────────────────────────────────

  describe('getSnapshots()', () => {
    it('returns snapshots', async () => {
      const rows = [makeSnapshotRow(), makeSnapshotRow({ id: 'snap-2' })];
      pool.query = vi.fn(async () => ({ rows, rowCount: rows.length }));

      const snapshots = await manager.getSnapshots('baseline-1');
      expect(snapshots).toHaveLength(2);
    });
  });

  // ── checkDrift ───────────────────────────────────────────────────────────

  describe('checkDrift()', () => {
    const baselineObj = {
      id: 'baseline-1',
      personalityId: 'p-1',
      baselineMean: 0.85,
      baselineStddev: 0.05,
      sampleCount: 100,
      threshold: 2.0,
      computedAt: new Date().toISOString(),
    };

    it('creates snapshot', async () => {
      const snapshotRow = makeSnapshotRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.82, stddev: 0.03, count: '50' }], rowCount: 1 }) // current stats
        .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 }); // insert snapshot

      const result = await manager.checkDrift(baselineObj);
      expect(result).not.toBeNull();
    });

    it('logs warning when drift > threshold', async () => {
      const snapshotRow = makeSnapshotRow({ drift_magnitude: 3.0, alert_triggered: true });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.70, stddev: 0.04, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 });

      await manager.checkDrift(baselineObj);
      expect(logger.warn).toHaveBeenCalledWith(
        'Quality drift detected',
        expect.objectContaining({ personalityId: 'p-1' })
      );
    });

    it('no alert when drift < threshold', async () => {
      const snapshotRow = makeSnapshotRow({ drift_magnitude: 0.5, alert_triggered: false });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.84, stddev: 0.04, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 });

      await manager.checkDrift(baselineObj);
      expect(alertManager.fireAlert).not.toHaveBeenCalled();
    });

    it('returns null when insufficient samples', async () => {
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: null, stddev: 0, count: '0' }], rowCount: 1 });

      const result = await manager.checkDrift(baselineObj);
      expect(result).toBeNull();
    });

    it('computes drift magnitude correctly', async () => {
      // mean=0.85, stddev=0.05, current=0.70 → drift = |0.85-0.70|/0.05 = 3.0
      const snapshotRow = makeSnapshotRow({ drift_magnitude: 3.0 });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.70, stddev: 0.04, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 });

      const result = await manager.checkDrift(baselineObj);
      expect(result).not.toBeNull();
      expect(result!.driftMagnitude).toBeCloseTo(3.0, 1);
    });

    it('logs drift warning with metadata', async () => {
      const lowThresholdBaseline = { ...baselineObj, threshold: 1.0 };
      const snapshotRow = makeSnapshotRow({ drift_magnitude: 2.0, alert_triggered: true });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ avg: 0.75, stddev: 0.04, count: '50' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [snapshotRow], rowCount: 1 });

      await manager.checkDrift(lowThresholdBaseline);
      expect(logger.warn).toHaveBeenCalledWith(
        'Quality drift detected',
        expect.objectContaining({
          personalityId: 'p-1',
          threshold: 1.0,
        })
      );
    });
  });

  // ── checkAllDrift ────────────────────────────────────────────────────────

  describe('checkAllDrift()', () => {
    it('checks all baselines', async () => {
      const baselines = [makeBaselineRow(), makeBaselineRow({ id: 'baseline-2' })];
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: baselines, rowCount: baselines.length }) // list baselines
        .mockResolvedValueOnce({ rows: [{ avg: 0.84, stddev: 0.04, count: '50' }], rowCount: 1 }) // stats for baseline 1
        .mockResolvedValueOnce({ rows: [makeSnapshotRow()], rowCount: 1 }) // insert snapshot 1
        .mockResolvedValueOnce({ rows: [{ avg: 0.83, stddev: 0.04, count: '50' }], rowCount: 1 }) // stats for baseline 2
        .mockResolvedValueOnce({ rows: [makeSnapshotRow({ id: 'snap-2' })], rowCount: 1 }); // insert snapshot 2

      await manager.checkAllDrift();
      expect(pool.query.mock.calls.length).toBeGreaterThan(1);
    });
  });

  // ── periodic check ───────────────────────────────────────────────────────

  describe('startPeriodicCheck / stop', () => {
    it('starts and stops without error', () => {
      vi.useFakeTimers();
      manager.startPeriodicCheck(60_000);
      manager.stop();
      vi.useRealTimers();
    });
  });
});
