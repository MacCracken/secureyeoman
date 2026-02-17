import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatternLearner } from './pattern-learner.js';
import type { InteractionEvent, DetectedPattern } from './pattern-learner.js';

// ── Mock BrainManager ────────────────────────────────────────────

const mockBrainManager = {
  remember: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  recall: vi.fn().mockResolvedValue([]),
};

// ── Mock Logger ──────────────────────────────────────────────────

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

// ── Helpers ──────────────────────────────────────────────────────

function makeMemoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 8)}`,
    type: 'procedural' as const,
    content: 'Interaction: message in context "morning-checkin"',
    source: 'proactive_pattern',
    importance: 0.3,
    accessCount: 0,
    createdAt: Date.now(),
    lastAccessedAt: null,
    expiresAt: null,
    context: {
      interactionType: 'message',
      context: 'morning-checkin',
      timestamp: String(Date.now()),
    },
    ...overrides,
  };
}

/** Build multiple memory records at a consistent hour to trigger temporal patterns */
function makeTemporalMemories(count: number, hour: number, context: string) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date('2026-02-16T00:00:00.000Z');
    date.setHours(hour, i, 0, 0);
    return makeMemoryRecord({
      context: {
        interactionType: 'message',
        context,
        timestamp: String(date.getTime()),
      },
      createdAt: date.getTime(),
    });
  });
}

/** Build multiple memory records spread across different hours */
function makeScatteredMemories(count: number, context: string) {
  return Array.from({ length: count }, (_, i) =>
    makeMemoryRecord({
      context: {
        interactionType: 'message',
        context,
        timestamp: String(new Date(`2026-02-${(i % 16) + 1}T${(i % 24).toString().padStart(2, '0')}:00:00.000Z`).getTime()),
      },
      createdAt: Date.now(),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('PatternLearner', () => {
  let learner: PatternLearner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainManager.remember.mockResolvedValue({ id: 'mem-1' });
    mockBrainManager.recall.mockResolvedValue([]);
    learner = new PatternLearner(mockBrainManager as any, mockLogger as any);
  });

  // ── recordInteraction ────────────────────────────────────────────

  describe('recordInteraction', () => {
    it('stores interaction in brain memory as procedural type', async () => {
      const event: InteractionEvent = {
        type: 'message',
        context: 'morning-checkin',
        timestamp: Date.now(),
      };
      await learner.recordInteraction(event);

      expect(mockBrainManager.remember).toHaveBeenCalledOnce();
      const [memType, content, category] = mockBrainManager.remember.mock.calls[0];
      expect(memType).toBe('procedural');
      expect(content).toContain('morning-checkin');
      expect(content).toContain('message');
      expect(category).toBe('proactive_pattern');
    });

    it('includes metadata with interactionType, context, and timestamp', async () => {
      const ts = 1707897600000;
      const event: InteractionEvent = {
        type: 'command',
        context: 'deploy',
        timestamp: ts,
        metadata: { userId: 'u1' },
      };
      await learner.recordInteraction(event);

      const [, , , metadata] = mockBrainManager.remember.mock.calls[0];
      expect(metadata.interactionType).toBe('command');
      expect(metadata.context).toBe('deploy');
      expect(metadata.timestamp).toBe(String(ts));
    });

    it('converts all metadata values to strings', async () => {
      const event: InteractionEvent = {
        type: 'action',
        context: 'test',
        timestamp: Date.now(),
        metadata: { count: 42, active: true, name: 'alice' },
      };
      await learner.recordInteraction(event);

      const [, , , metadata] = mockBrainManager.remember.mock.calls[0];
      expect(metadata.count).toBe('42');
      expect(metadata.active).toBe('true');
      expect(metadata.name).toBe('alice');
    });

    it('works without metadata', async () => {
      const event: InteractionEvent = {
        type: 'view',
        context: 'dashboard',
        timestamp: Date.now(),
      };
      await learner.recordInteraction(event);

      expect(mockBrainManager.remember).toHaveBeenCalledOnce();
    });

    it('stores with importance 0.3', async () => {
      const event: InteractionEvent = { type: 'test', context: 'ctx', timestamp: Date.now() };
      await learner.recordInteraction(event);

      const [, , , , importance] = mockBrainManager.remember.mock.calls[0];
      expect(importance).toBe(0.3);
    });

    it('does not throw when brainManager.remember fails — logs warning instead', async () => {
      mockBrainManager.remember.mockRejectedValue(new Error('Brain offline'));

      const event: InteractionEvent = { type: 'test', context: 'ctx', timestamp: Date.now() };
      await expect(learner.recordInteraction(event)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to record interaction for pattern learning',
        expect.objectContaining({ error: 'Brain offline' }),
      );
    });

    it('handles non-Error throw in recordInteraction', async () => {
      mockBrainManager.remember.mockRejectedValue('raw error string');

      const event: InteractionEvent = { type: 'test', context: 'ctx', timestamp: Date.now() };
      await expect(learner.recordInteraction(event)).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to record interaction for pattern learning',
        expect.objectContaining({ error: 'raw error string' }),
      );
    });
  });

  // ── detectPatterns ───────────────────────────────────────────────

  describe('detectPatterns', () => {
    it('returns empty array when fewer than 3 memories', async () => {
      mockBrainManager.recall.mockResolvedValue([makeMemoryRecord(), makeMemoryRecord()]);
      const patterns = await learner.detectPatterns();
      expect(patterns).toEqual([]);
    });

    it('returns empty array when recall returns null', async () => {
      mockBrainManager.recall.mockResolvedValue(null);
      const patterns = await learner.detectPatterns();
      expect(patterns).toEqual([]);
    });

    it('calls brain.recall with correct type and query', async () => {
      mockBrainManager.recall.mockResolvedValue([]);
      await learner.detectPatterns(30);

      expect(mockBrainManager.recall).toHaveBeenCalledWith({
        type: 'procedural',
        source: 'proactive_pattern',
        limit: 300, // 30 * 10
      });
    });

    it('uses default lookbackDays of 30 when not provided', async () => {
      mockBrainManager.recall.mockResolvedValue([]);
      await learner.detectPatterns();

      const query = mockBrainManager.recall.mock.calls[0][0];
      expect(query.limit).toBe(300); // 30 * 10
    });

    it('uses custom lookbackDays multiplied by 10 for recall limit', async () => {
      mockBrainManager.recall.mockResolvedValue([]);
      await learner.detectPatterns(7);

      const query = mockBrainManager.recall.mock.calls[0][0];
      expect(query.limit).toBe(70); // 7 * 10
    });

    it('detects temporal pattern when interactions cluster at same hour', async () => {
      const memories = makeTemporalMemories(4, 9, 'standup');
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      const temporal = patterns.find((p) => p.type === 'temporal');
      expect(temporal).toBeDefined();
      expect(temporal!.id).toContain('temporal_standup_9');
      expect(temporal!.description).toContain('standup');
      expect(temporal!.description).toContain('9:00');
      expect(temporal!.occurrences).toBe(4);
      expect(temporal!.confidence).toBeGreaterThan(0);
      expect(temporal!.confidence).toBeLessThanOrEqual(1);
    });

    it('detects contextual pattern when 5+ interactions in same context', async () => {
      // Need at least 5 interactions for contextual pattern
      const memories = makeTemporalMemories(6, 9, 'deploy-check');
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      const contextual = patterns.find((p) => p.type === 'contextual');
      expect(contextual).toBeDefined();
      expect(contextual!.id).toContain('contextual_deploy-check');
      expect(contextual!.description).toContain('deploy-check');
      expect(contextual!.occurrences).toBe(6);
    });

    it('does not detect contextual pattern with fewer than 5 interactions', async () => {
      // 4 interactions — temporal may trigger but not contextual
      const memories = makeTemporalMemories(4, 9, 'rare-context');
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      const contextual = patterns.find((p) => p.type === 'contextual');
      expect(contextual).toBeUndefined();
    });

    it('groups memories by context correctly', async () => {
      const ctx1 = makeTemporalMemories(4, 9, 'morning');
      const ctx2 = makeTemporalMemories(6, 14, 'afternoon');
      mockBrainManager.recall.mockResolvedValue([...ctx1, ...ctx2]);

      const patterns = await learner.detectPatterns();
      const temporals = patterns.filter((p) => p.type === 'temporal');
      const contexts = temporals.map((p) => (p.context as any).context);
      expect(contexts).toContain('morning');
      expect(contexts).toContain('afternoon');
    });

    it('sorts patterns by confidence descending', async () => {
      // 6 interactions at consistent hour = high confidence temporal + contextual
      const memories = makeTemporalMemories(6, 9, 'high-freq');
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1]!.confidence).toBeGreaterThanOrEqual(patterns[i]!.confidence);
      }
    });

    it('includes lastSeen as the maximum timestamp from interactions', async () => {
      const memories = makeTemporalMemories(3, 10, 'check');
      // Use recent timestamps
      const latestTimestamp = Date.now();
      memories[2].context!.timestamp = String(latestTimestamp);
      memories[2].createdAt = latestTimestamp;
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      const temporal = patterns.find((p) => p.type === 'temporal');
      if (temporal) {
        expect(temporal.lastSeen).toBe(latestTimestamp);
      }
    });

    it('returns empty array and logs error when recall throws', async () => {
      mockBrainManager.recall.mockRejectedValue(new Error('DB connection failed'));

      const patterns = await learner.detectPatterns();
      expect(patterns).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Pattern detection failed',
        expect.objectContaining({ error: 'DB connection failed' }),
      );
    });

    it('skips context groups with fewer than 3 interactions', async () => {
      const memories = [
        makeMemoryRecord({ context: { interactionType: 'm', context: 'sparse', timestamp: String(Date.now()) }, createdAt: Date.now() }),
        makeMemoryRecord({ context: { interactionType: 'm', context: 'sparse', timestamp: String(Date.now()) }, createdAt: Date.now() }),
        // only 2 in 'sparse' context — not enough; but 3 overall memories pass the first gate
        makeMemoryRecord({ context: { interactionType: 'm', context: 'other', timestamp: String(Date.now()) }, createdAt: Date.now() }),
      ];
      mockBrainManager.recall.mockResolvedValue(memories);

      const patterns = await learner.detectPatterns();
      // No context group has >= 3 interactions
      const sparsePatterns = patterns.filter((p) => (p.context as any).context === 'sparse');
      expect(sparsePatterns).toHaveLength(0);
    });

    it('handles missing context in context by using "unknown"', async () => {
      const memories = Array.from({ length: 3 }, () =>
        makeMemoryRecord({
          context: { interactionType: 'test', timestamp: String(Date.now()) }, // no context field
          createdAt: Date.now(),
        }),
      );
      mockBrainManager.recall.mockResolvedValue(memories);

      // Should not throw
      const patterns = await learner.detectPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  // ── convertToTrigger ─────────────────────────────────────────────

  describe('convertToTrigger', () => {
    it('converts temporal pattern to a schedule trigger', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_standup_9',
        type: 'temporal',
        description: 'User tends to "standup" around 9:00',
        confidence: 0.9,
        occurrences: 8,
        lastSeen: Date.now(),
        context: { avgHour: 9, context: 'standup', hourVariance: 1.5 },
      };

      const triggerData = learner.convertToTrigger(pattern);

      expect(triggerData.type).toBe('schedule');
      expect(triggerData.condition.type).toBe('schedule');
      expect((triggerData.condition as any).cron).toContain('9');
      expect(triggerData.enabled).toBe(false);
      expect(triggerData.approvalMode).toBe('suggest');
      expect(triggerData.cooldownMs).toBe(3600000);
      expect(triggerData.limitPerDay).toBe(1);
    });

    it('uses avgHour from pattern context for cron schedule', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_check_14',
        type: 'temporal',
        description: 'Afternoon check',
        confidence: 0.8,
        occurrences: 5,
        lastSeen: Date.now(),
        context: { avgHour: 14 },
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect((triggerData.condition as any).cron).toBe('0 14 * * 1-5');
    });

    it('creates weekday-only schedule (1-5) for temporal patterns', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_work_10',
        type: 'temporal',
        description: 'Work activity',
        confidence: 0.85,
        occurrences: 6,
        lastSeen: Date.now(),
        context: { avgHour: 10 },
      };

      const triggerData = learner.convertToTrigger(pattern);
      const cron = (triggerData.condition as any).cron;
      expect(cron).toContain('1-5');
    });

    it('sets action type to remind for temporal patterns', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_meeting_11',
        type: 'temporal',
        description: 'Team meeting time',
        confidence: 0.9,
        occurrences: 7,
        lastSeen: Date.now(),
        context: { avgHour: 11 },
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect(triggerData.action.type).toBe('remind');
      expect((triggerData.action as any).content).toBe(pattern.description);
      expect((triggerData.action as any).category).toBe('pattern_reminder');
    });

    it('converts contextual pattern to a pattern trigger', () => {
      const pattern: DetectedPattern = {
        id: 'contextual_deploy',
        type: 'contextual',
        description: 'Frequent deployments (15 times)',
        confidence: 0.75,
        occurrences: 15,
        lastSeen: Date.now(),
        context: { context: 'deploy', interactionCount: 15 },
      };

      const triggerData = learner.convertToTrigger(pattern);

      expect(triggerData.type).toBe('pattern');
      expect(triggerData.condition.type).toBe('pattern');
      expect((triggerData.condition as any).patternId).toBe(pattern.id);
      expect((triggerData.condition as any).minConfidence).toBe(0.7);
      expect(triggerData.enabled).toBe(false);
      expect(triggerData.approvalMode).toBe('suggest');
      expect(triggerData.cooldownMs).toBe(3600000);
      expect(triggerData.limitPerDay).toBe(3);
    });

    it('includes occurrences and confidence in trigger description', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_foo_8',
        type: 'temporal',
        description: 'Test pattern',
        confidence: 0.85,
        occurrences: 10,
        lastSeen: Date.now(),
        context: { avgHour: 8 },
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect(triggerData.description).toContain('10 occurrences');
      expect(triggerData.description).toContain('85%');
    });

    it('uses pattern description as trigger name prefix', () => {
      const pattern: DetectedPattern = {
        id: 'contextual_review',
        type: 'contextual',
        description: 'Code review sessions',
        confidence: 0.8,
        occurrences: 12,
        lastSeen: Date.now(),
        context: {},
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect(triggerData.name).toBe('Pattern: Code review sessions');
    });

    it('defaults avgHour to 9 when not present in context for temporal pattern', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_unknown_hour',
        type: 'temporal',
        description: 'Something temporal',
        confidence: 0.75,
        occurrences: 3,
        lastSeen: Date.now(),
        context: {}, // no avgHour
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect((triggerData.condition as any).cron).toBe('0 9 * * 1-5');
    });

    it('sets UTC timezone on schedule condition', () => {
      const pattern: DetectedPattern = {
        id: 'temporal_tz_test',
        type: 'temporal',
        description: 'TZ test',
        confidence: 0.8,
        occurrences: 4,
        lastSeen: Date.now(),
        context: { avgHour: 8 },
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect((triggerData.condition as any).timezone).toBe('UTC');
    });

    it('falls through to contextual handling for unknown pattern type', () => {
      const pattern: DetectedPattern = {
        id: 'sequential_abc',
        type: 'sequential' as any,
        description: 'Sequential pattern',
        confidence: 0.7,
        occurrences: 5,
        lastSeen: Date.now(),
        context: {},
      };

      const triggerData = learner.convertToTrigger(pattern);
      expect(triggerData.type).toBe('pattern');
    });
  });
});
