import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelationshipGraph } from './relationship-graph.js';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { EntityRelationship, EntityGroup, RelationshipEvent } from '@secureyeoman/shared';
import { createNoopLogger } from '../logging/logger.js';

function makeRelationship(overrides: Partial<EntityRelationship> = {}): EntityRelationship {
  return {
    id: 'rel-1',
    personalityId: 'p-1',
    sourceEntityId: 'entity-a',
    targetEntityId: 'entity-b',
    type: 'neutral',
    affinity: 0,
    trust: 0.5,
    interactionCount: 0,
    decayRate: 0.01,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeGroup(overrides: Partial<EntityGroup> = {}): EntityGroup {
  return {
    id: 'grp-1',
    personalityId: 'p-1',
    groupId: 'guild-alpha',
    name: 'Alpha Guild',
    members: [],
    metadata: {},
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeStore(
  opts: {
    relationship?: EntityRelationship | null;
    relationships?: EntityRelationship[];
    group?: EntityGroup | null;
    groups?: EntityGroup[];
    events?: RelationshipEvent[];
  } = {}
): SimulationStore {
  return {
    upsertRelationship: vi.fn().mockResolvedValue(undefined),
    getRelationship: vi.fn().mockResolvedValue(opts.relationship ?? null),
    listRelationships: vi.fn().mockResolvedValue(opts.relationships ?? []),
    deleteRelationship: vi.fn().mockResolvedValue(true),
    listAllRelationships: vi.fn().mockResolvedValue(opts.relationships ?? []),
    recordRelationshipEvent: vi.fn().mockResolvedValue(undefined),
    listRelationshipEvents: vi.fn().mockResolvedValue(opts.events ?? []),
    upsertEntityGroup: vi.fn().mockResolvedValue(undefined),
    listEntityGroups: vi.fn().mockResolvedValue(opts.groups ?? []),
    getEntityGroup: vi.fn().mockResolvedValue(opts.group ?? null),
    deleteEntityGroup: vi.fn().mockResolvedValue(true),
  } as unknown as SimulationStore;
}

function makeMoodEngine(): MoodEngine {
  return {
    applyEvent: vi.fn().mockResolvedValue({ valence: 0, arousal: 0, label: 'neutral' }),
  } as unknown as MoodEngine;
}

describe('RelationshipGraph', () => {
  let graph: RelationshipGraph;
  let store: SimulationStore;
  let moodEngine: MoodEngine;

  beforeEach(() => {
    store = makeStore();
    moodEngine = makeMoodEngine();
    graph = new RelationshipGraph({ store, logger: createNoopLogger(), moodEngine });
  });

  // ── Relationship CRUD ──────────────────────────────────────────────

  describe('createRelationship', () => {
    it('creates a relationship with default values', async () => {
      const rel = await graph.createRelationship('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        type: 'ally',
        affinity: 0.5,
        trust: 0.8,
        decayRate: 0.01,
        metadata: {},
      });

      expect(rel.personalityId).toBe('p-1');
      expect(rel.sourceEntityId).toBe('entity-a');
      expect(rel.targetEntityId).toBe('entity-b');
      expect(rel.type).toBe('ally');
      expect(rel.affinity).toBe(0.5);
      expect(rel.trust).toBe(0.8);
      expect(rel.interactionCount).toBe(0);
      expect(rel.id).toBeDefined();
      expect(store.upsertRelationship).toHaveBeenCalledOnce();
    });

    it('clamps affinity to [-1, 1] on creation', async () => {
      const rel = await graph.createRelationship('p-1', {
        sourceEntityId: 'a',
        targetEntityId: 'b',
        type: 'ally',
        affinity: 2,
        trust: 0.5,
        decayRate: 0.01,
        metadata: {},
      });
      expect(rel.affinity).toBe(1);
    });

    it('clamps trust to [0, 1] on creation', async () => {
      const rel = await graph.createRelationship('p-1', {
        sourceEntityId: 'a',
        targetEntityId: 'b',
        type: 'ally',
        affinity: 0,
        trust: -0.5,
        decayRate: 0.01,
        metadata: {},
      });
      expect(rel.trust).toBe(0);
    });
  });

  describe('getRelationship', () => {
    it('returns relationship when found', async () => {
      const existing = makeRelationship();
      store = makeStore({ relationship: existing });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.getRelationship('p-1', 'entity-a', 'entity-b');
      expect(result).toEqual(existing);
    });

    it('returns null when not found', async () => {
      const result = await graph.getRelationship('p-1', 'x', 'y');
      expect(result).toBeNull();
    });
  });

  describe('listRelationships', () => {
    it('returns relationships from store', async () => {
      const rels = [makeRelationship(), makeRelationship({ id: 'rel-2', targetEntityId: 'c' })];
      store = makeStore({ relationships: rels });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.listRelationships('p-1');
      expect(result).toHaveLength(2);
    });

    it('passes filter options to store', async () => {
      await graph.listRelationships('p-1', {
        entityId: 'entity-a',
        type: 'ally',
        minAffinity: 0.3,
        limit: 10,
      });
      expect(store.listRelationships).toHaveBeenCalledWith('p-1', {
        entityId: 'entity-a',
        type: 'ally',
        minAffinity: 0.3,
        limit: 10,
      });
    });
  });

  describe('updateRelationship', () => {
    it('updates existing relationship', async () => {
      const existing = makeRelationship({ affinity: 0.2, trust: 0.6 });
      store = makeStore({ relationship: existing });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.updateRelationship('p-1', 'entity-a', 'entity-b', {
        affinity: 0.8,
        trust: 0.9,
      });

      expect(result).not.toBeNull();
      expect(result!.affinity).toBe(0.8);
      expect(result!.trust).toBe(0.9);
      expect(store.upsertRelationship).toHaveBeenCalledOnce();
    });

    it('returns null for nonexistent relationship', async () => {
      const result = await graph.updateRelationship('p-1', 'x', 'y', { affinity: 0.5 });
      expect(result).toBeNull();
    });

    it('clamps updated affinity to valid range', async () => {
      const existing = makeRelationship();
      store = makeStore({ relationship: existing });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.updateRelationship('p-1', 'entity-a', 'entity-b', {
        affinity: 5,
      });
      expect(result!.affinity).toBe(1);
    });

    it('clamps updated trust to valid range', async () => {
      const existing = makeRelationship();
      store = makeStore({ relationship: existing });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.updateRelationship('p-1', 'entity-a', 'entity-b', {
        trust: -1,
      });
      expect(result!.trust).toBe(0);
    });

    it('preserves unchanged fields', async () => {
      const existing = makeRelationship({ affinity: 0.3, trust: 0.7, metadata: { tag: 'old' } });
      store = makeStore({ relationship: existing });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.updateRelationship('p-1', 'entity-a', 'entity-b', {
        affinity: 0.9,
      });
      expect(result!.trust).toBe(0.7);
      expect(result!.metadata).toEqual({ tag: 'old' });
    });
  });

  describe('deleteRelationship', () => {
    it('delegates to store and returns result', async () => {
      const result = await graph.deleteRelationship('p-1', 'entity-a', 'entity-b');
      expect(result).toBe(true);
      expect(store.deleteRelationship).toHaveBeenCalledWith('p-1', 'entity-a', 'entity-b');
    });
  });

  // ── Interaction Events ─────────────────────────────────────────────

  describe('recordInteraction', () => {
    it('records event and updates relationship scores', async () => {
      const existing = makeRelationship({ affinity: 0.2, trust: 0.5, interactionCount: 3 });
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const event = await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'trade',
        affinityDelta: 0.1,
        trustDelta: 0.05,
        source: 'user',
        moodEffect: null,
        metadata: {},
      });

      expect(event.eventType).toBe('trade');
      expect(event.personalityId).toBe('p-1');
      expect(store.recordRelationshipEvent).toHaveBeenCalledOnce();

      // Check that relationship was updated
      const upsertCall = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertCall.affinity).toBeCloseTo(0.3, 5);
      expect(upsertCall.trust).toBeCloseTo(0.55, 5);
      expect(upsertCall.interactionCount).toBe(4);
    });

    it('auto-creates relationship if none exists', async () => {
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'new-a',
        targetEntityId: 'new-b',
        eventType: 'meeting',
        affinityDelta: 0.2,
        trustDelta: 0.1,
        source: 'system',
        moodEffect: null,
        metadata: {},
      });

      expect(store.upsertRelationship).toHaveBeenCalledOnce();
      const created = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.sourceEntityId).toBe('new-a');
      expect(created.targetEntityId).toBe('new-b');
      expect(created.affinity).toBeCloseTo(0.2, 5);
      expect(created.trust).toBeCloseTo(0.6, 5);
      expect(created.interactionCount).toBe(1);
    });

    it('clamps affinity after delta application', async () => {
      const existing = makeRelationship({ affinity: 0.9 });
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'gift',
        affinityDelta: 0.5,
        trustDelta: 0,
        source: 'system',
        moodEffect: null,
        metadata: {},
      });

      const upsertCall = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertCall.affinity).toBe(1);
    });

    it('clamps negative affinity', async () => {
      const existing = makeRelationship({ affinity: -0.8 });
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'betrayal',
        affinityDelta: -0.5,
        trustDelta: 0,
        source: 'system',
        moodEffect: null,
        metadata: {},
      });

      const upsertCall = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertCall.affinity).toBe(-1);
    });

    it('clamps trust to [0, 1] after delta application', async () => {
      const existing = makeRelationship({ trust: 0.1 });
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'lie',
        affinityDelta: 0,
        trustDelta: -0.5,
        source: 'system',
        moodEffect: null,
        metadata: {},
      });

      const upsertCall = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upsertCall.trust).toBe(0);
    });

    it('applies mood effects when moodEffect is provided', async () => {
      const existing = makeRelationship();
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'compliment',
        affinityDelta: 0.1,
        trustDelta: 0,
        source: 'user',
        moodEffect: { valenceDelta: 0.3, arousalDelta: 0.1 },
        metadata: {},
      });

      expect(moodEngine.applyEvent).toHaveBeenCalledWith('p-1', {
        eventType: 'relationship:compliment',
        valenceDelta: 0.3,
        arousalDelta: 0.1,
        source: 'relationship_graph',
        metadata: {
          sourceEntityId: 'entity-a',
          targetEntityId: 'entity-b',
          eventType: 'compliment',
        },
      });
    });

    it('does not apply mood effects when moodEffect is null', async () => {
      const existing = makeRelationship();
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await graph.recordInteraction('p-1', {
        sourceEntityId: 'entity-a',
        targetEntityId: 'entity-b',
        eventType: 'trade',
        affinityDelta: 0.1,
        trustDelta: 0,
        source: 'user',
        moodEffect: null,
        metadata: {},
      });

      expect(moodEngine.applyEvent).not.toHaveBeenCalled();
    });

    it('does not crash when mood engine is unavailable', async () => {
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });
      const existing = makeRelationship();
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await expect(
        graph.recordInteraction('p-1', {
          sourceEntityId: 'entity-a',
          targetEntityId: 'entity-b',
          eventType: 'compliment',
          affinityDelta: 0.1,
          trustDelta: 0,
          source: 'user',
          moodEffect: { valenceDelta: 0.3, arousalDelta: 0.1 },
          metadata: {},
        })
      ).resolves.toBeDefined();
    });

    it('handles mood engine errors gracefully', async () => {
      const existing = makeRelationship();
      (store.getRelationship as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (moodEngine.applyEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('mood error')
      );

      await expect(
        graph.recordInteraction('p-1', {
          sourceEntityId: 'entity-a',
          targetEntityId: 'entity-b',
          eventType: 'compliment',
          affinityDelta: 0.1,
          trustDelta: 0,
          source: 'user',
          moodEffect: { valenceDelta: 0.3, arousalDelta: 0.1 },
          metadata: {},
        })
      ).resolves.toBeDefined();
    });
  });

  describe('listEvents', () => {
    it('delegates to store', async () => {
      await graph.listEvents('p-1', { entityId: 'entity-a', limit: 10, since: 1000 });
      expect(store.listRelationshipEvents).toHaveBeenCalledWith('p-1', {
        entityId: 'entity-a',
        limit: 10,
        since: 1000,
      });
    });
  });

  // ── Group CRUD ─────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('creates a group with provided data', async () => {
      const group = await graph.createGroup('p-1', {
        groupId: 'guild-alpha',
        name: 'Alpha Guild',
        members: ['entity-a', 'entity-b'],
        metadata: { level: 5 },
      });

      expect(group.personalityId).toBe('p-1');
      expect(group.groupId).toBe('guild-alpha');
      expect(group.name).toBe('Alpha Guild');
      expect(group.members).toEqual(['entity-a', 'entity-b']);
      expect(group.metadata).toEqual({ level: 5 });
      expect(store.upsertEntityGroup).toHaveBeenCalledOnce();
    });
  });

  describe('listGroups', () => {
    it('returns groups from store', async () => {
      const groups = [makeGroup(), makeGroup({ id: 'grp-2', groupId: 'guild-beta' })];
      store = makeStore({ groups });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.listGroups('p-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('addToGroup', () => {
    it('adds entity to group members', async () => {
      const group = makeGroup({ members: ['entity-a'] });
      store = makeStore({ group });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      await graph.addToGroup('p-1', 'guild-alpha', 'entity-b');

      expect(store.upsertEntityGroup).toHaveBeenCalledOnce();
      const upserted = (store.upsertEntityGroup as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upserted.members).toContain('entity-a');
      expect(upserted.members).toContain('entity-b');
    });

    it('skips duplicate member', async () => {
      const group = makeGroup({ members: ['entity-a'] });
      store = makeStore({ group });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      await graph.addToGroup('p-1', 'guild-alpha', 'entity-a');

      expect(store.upsertEntityGroup).not.toHaveBeenCalled();
    });

    it('throws when group not found', async () => {
      await expect(graph.addToGroup('p-1', 'nonexistent', 'entity-a')).rejects.toThrow('not found');
    });
  });

  describe('removeFromGroup', () => {
    it('removes entity from group', async () => {
      const group = makeGroup({ members: ['entity-a', 'entity-b'] });
      store = makeStore({ group });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.removeFromGroup('p-1', 'guild-alpha', 'entity-a');
      expect(result).toBe(true);

      const upserted = (store.upsertEntityGroup as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(upserted.members).toEqual(['entity-b']);
    });

    it('returns false when group not found', async () => {
      const result = await graph.removeFromGroup('p-1', 'nonexistent', 'entity-a');
      expect(result).toBe(false);
    });

    it('returns false when entity not in group', async () => {
      const group = makeGroup({ members: ['entity-a'] });
      store = makeStore({ group });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const result = await graph.removeFromGroup('p-1', 'guild-alpha', 'entity-z');
      expect(result).toBe(false);
    });
  });

  describe('getGroupMembers', () => {
    it('returns members of existing group', async () => {
      const group = makeGroup({ members: ['entity-a', 'entity-b'] });
      store = makeStore({ group });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const members = await graph.getGroupMembers('p-1', 'guild-alpha');
      expect(members).toEqual(['entity-a', 'entity-b']);
    });

    it('returns empty array when group not found', async () => {
      const members = await graph.getGroupMembers('p-1', 'nonexistent');
      expect(members).toEqual([]);
    });
  });

  describe('deleteGroup', () => {
    it('delegates to store', async () => {
      const result = await graph.deleteGroup('p-1', 'guild-alpha');
      expect(result).toBe(true);
      expect(store.deleteEntityGroup).toHaveBeenCalledWith('p-1', 'guild-alpha');
    });
  });

  // ── Tick Handler / Decay ───────────────────────────────────────────

  describe('createTickHandler', () => {
    it('returns a function', () => {
      const handler = graph.createTickHandler();
      expect(typeof handler).toBe('function');
    });

    it('decays relationships toward neutral on tick', async () => {
      const rels = [
        makeRelationship({ affinity: 0.8, trust: 0.9, decayRate: 0.1 }),
        makeRelationship({
          id: 'rel-2',
          sourceEntityId: 'c',
          targetEntityId: 'd',
          affinity: -0.6,
          trust: 0.2,
          decayRate: 0.1,
        }),
      ];
      store = makeStore({ relationships: rels });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const handler = graph.createTickHandler();
      await handler({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });

      // Both relationships should have been updated
      expect(store.upsertRelationship).toHaveBeenCalledTimes(2);

      const call1 = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // affinity: 0.8 + (0 - 0.8) * 0.1 = 0.72
      expect(call1.affinity).toBeCloseTo(0.72, 5);
      // trust: 0.9 + (0.5 - 0.9) * 0.1 = 0.86
      expect(call1.trust).toBeCloseTo(0.86, 5);

      const call2 = (store.upsertRelationship as ReturnType<typeof vi.fn>).mock.calls[1][0];
      // affinity: -0.6 + (0 - (-0.6)) * 0.1 = -0.54
      expect(call2.affinity).toBeCloseTo(-0.54, 5);
      // trust: 0.2 + (0.5 - 0.2) * 0.1 = 0.23
      expect(call2.trust).toBeCloseTo(0.23, 5);
    });

    it('does not update when decayRate is 0', async () => {
      const rels = [makeRelationship({ affinity: 0.5, trust: 0.8, decayRate: 0 })];
      store = makeStore({ relationships: rels });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const handler = graph.createTickHandler();
      await handler({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });

      expect(store.upsertRelationship).not.toHaveBeenCalled();
    });

    it('does nothing when no relationships exist', async () => {
      store = makeStore({ relationships: [] });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const handler = graph.createTickHandler();
      await handler({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });

      expect(store.upsertRelationship).not.toHaveBeenCalled();
    });

    it('converges affinity to 0 and trust to 0.5 after many decays', () => {
      let affinity = 0.9;
      let trust = 0.1;
      const rate = 0.1;

      for (let i = 0; i < 200; i++) {
        affinity += (0 - affinity) * rate;
        trust += (0.5 - trust) * rate;
      }

      expect(affinity).toBeCloseTo(0, 2);
      expect(trust).toBeCloseTo(0.5, 2);
    });

    it('skips negligible changes', async () => {
      // Relationship already very close to neutral
      const rels = [makeRelationship({ affinity: 0.00001, trust: 0.50001, decayRate: 0.01 })];
      store = makeStore({ relationships: rels });
      graph = new RelationshipGraph({ store, logger: createNoopLogger() });

      const handler = graph.createTickHandler();
      await handler({ tick: 1, simTime: 1000, personalityId: 'p-1', timestamp: Date.now() });

      // Change is very small: affinity delta ~ 0.0000001, trust delta ~ 0.0000001
      // Both are below 0.0001 threshold, so no update
      expect(store.upsertRelationship).not.toHaveBeenCalled();
    });
  });
});
