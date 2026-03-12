import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpatialEngine, euclideanDistance, isInsideZone } from './spatial-engine.js';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { EntityLocation, SpatialZone, ProximityRule, TickEvent } from '@secureyeoman/shared';
import { createNoopLogger } from '../logging/logger.js';

function makeLoc(overrides: Partial<EntityLocation> = {}): EntityLocation {
  return {
    id: 'loc-1',
    personalityId: 'p-1',
    entityId: 'e-1',
    entityType: 'npc',
    zoneId: '',
    x: 0,
    y: 0,
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

function makeTickEvent(overrides: Partial<TickEvent> = {}): TickEvent {
  return {
    tick: 1,
    simTime: 1000,
    personalityId: 'p-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeStore(): SimulationStore {
  return {
    getEntityLocation: vi.fn().mockResolvedValue(null),
    upsertEntityLocation: vi.fn().mockResolvedValue(undefined),
    listEntityLocations: vi.fn().mockResolvedValue([]),
    deleteEntityLocation: vi.fn().mockResolvedValue(true),
    upsertSpatialZone: vi.fn().mockResolvedValue(undefined),
    getSpatialZone: vi.fn().mockResolvedValue(null),
    listSpatialZones: vi.fn().mockResolvedValue([]),
    deleteSpatialZone: vi.fn().mockResolvedValue(true),
    saveProximityRule: vi.fn().mockResolvedValue(undefined),
    listProximityRules: vi.fn().mockResolvedValue([]),
    deleteProximityRule: vi.fn().mockResolvedValue(true),
    recordProximityEvent: vi.fn().mockResolvedValue(undefined),
    listProximityEvents: vi.fn().mockResolvedValue([]),
  } as unknown as SimulationStore;
}

function makeMoodEngine(): MoodEngine {
  return {
    applyEvent: vi.fn().mockResolvedValue(null),
  } as unknown as MoodEngine;
}

describe('SpatialEngine', () => {
  let engine: SpatialEngine;
  let store: SimulationStore;
  let moodEngine: MoodEngine;

  beforeEach(() => {
    store = makeStore();
    moodEngine = makeMoodEngine();
    engine = new SpatialEngine({ store, logger: createNoopLogger(), moodEngine });
  });

  describe('updateEntityLocation', () => {
    it('creates a new entity location', async () => {
      const loc = await engine.updateEntityLocation('p-1', {
        entityId: 'e-1',
        entityType: 'npc',
        zoneId: 'market',
        x: 10,
        y: 20,
        z: 0,
        heading: 90,
        speed: 5,
        metadata: {},
      });
      expect(loc.entityId).toBe('e-1');
      expect(loc.x).toBe(10);
      expect(loc.y).toBe(20);
      expect(store.upsertEntityLocation).toHaveBeenCalledOnce();
    });

    it('reuses existing id on update', async () => {
      const existing = makeLoc({ id: 'existing-id' });
      (store.getEntityLocation as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const loc = await engine.updateEntityLocation('p-1', {
        entityId: 'e-1',
        entityType: 'npc',
        zoneId: '',
        x: 50,
        y: 50,
        z: 0,
        heading: 0,
        speed: 0,
        metadata: {},
      });
      expect(loc.id).toBe('existing-id');
    });
  });

  describe('zone management', () => {
    it('creates a zone', async () => {
      const zone = await engine.createZone('p-1', {
        zoneId: 'market',
        name: 'Market Square',
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 100,
        properties: {},
      });
      expect(zone.zoneId).toBe('market');
      expect(store.upsertSpatialZone).toHaveBeenCalledOnce();
    });

    it('lists zones', async () => {
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([makeZone()]);
      const zones = await engine.listZones('p-1');
      expect(zones).toHaveLength(1);
    });
  });

  describe('proximity rules', () => {
    it('creates a rule', async () => {
      const rule = await engine.addRule('p-1', {
        triggerType: 'enter_radius',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        targetZoneId: null,
        radiusThreshold: 10,
        cooldownMs: 0,
        moodEffect: null,
        enabled: true,
      });
      expect(rule.triggerType).toBe('enter_radius');
      expect(store.saveProximityRule).toHaveBeenCalledOnce();
    });
  });

  describe('evaluateProximity', () => {
    it('fires enter_radius when entities come within threshold', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const target = makeLoc({ entityId: 'e-2', x: 100, y: 0 });
      const rule = makeRule({
        triggerType: 'enter_radius',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 10,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, target]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // First tick: entities are far apart (distance=100, threshold=10) — no trigger
      let events = await engine.evaluateProximity(makeTickEvent({ tick: 1 }));
      expect(events).toHaveLength(0);

      // Move target close
      const closerTarget = makeLoc({ entityId: 'e-2', x: 5, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([
        source,
        closerTarget,
      ]);

      // Second tick: now within radius — should fire
      events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('enter_radius');
      expect(events[0].distance).toBe(5);
    });

    it('fires leave_radius when entities exit threshold', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const target = makeLoc({ entityId: 'e-2', x: 5, y: 0 });
      const rule = makeRule({
        triggerType: 'leave_radius',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 10,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, target]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // First tick: entities inside radius — sets cache
      let events = await engine.evaluateProximity(makeTickEvent({ tick: 1 }));
      expect(events).toHaveLength(0);

      // Move target far away
      const farTarget = makeLoc({ entityId: 'e-2', x: 50, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([
        source,
        farTarget,
      ]);

      // Second tick: outside radius — should fire
      events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('leave_radius');
    });

    it('fires enter_zone when entity moves inside zone bounds', async () => {
      const entity = makeLoc({ entityId: 'e-1', x: -10, y: -10 });
      const zone = makeZone({ zoneId: 'market', minX: 0, minY: 0, maxX: 100, maxY: 100 });
      const rule = makeRule({
        triggerType: 'enter_zone',
        sourceEntityId: 'e-1',
        targetEntityId: null,
        targetZoneId: 'market',
        radiusThreshold: 0,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([entity]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([zone]);

      // First tick: entity outside zone
      let events = await engine.evaluateProximity(makeTickEvent({ tick: 1 }));
      expect(events).toHaveLength(0);

      // Move entity inside zone
      const insideEntity = makeLoc({ entityId: 'e-1', x: 50, y: 50 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([insideEntity]);

      // Second tick: should fire enter_zone
      events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('enter_zone');
      expect(events[0].targetZoneId).toBe('market');
    });

    it('fires leave_zone when entity exits zone bounds', async () => {
      const entity = makeLoc({ entityId: 'e-1', x: 50, y: 50 });
      const zone = makeZone({ zoneId: 'market', minX: 0, minY: 0, maxX: 100, maxY: 100 });
      const rule = makeRule({
        triggerType: 'leave_zone',
        sourceEntityId: 'e-1',
        targetZoneId: 'market',
        targetEntityId: null,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([entity]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([zone]);

      // First tick: entity inside zone
      let events = await engine.evaluateProximity(makeTickEvent({ tick: 1 }));
      expect(events).toHaveLength(0);

      // Move entity outside
      const outsideEntity = makeLoc({ entityId: 'e-1', x: 200, y: 200 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([outsideEntity]);

      // Second tick: should fire leave_zone
      events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('leave_zone');
    });

    it('applies mood effect when rule has moodEffect', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const target = makeLoc({ entityId: 'e-2', x: 100, y: 0 });
      const rule = makeRule({
        triggerType: 'enter_radius',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 10,
        moodEffect: { valenceDelta: -0.2, arousalDelta: 0.3 },
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // First tick: far apart
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, target]);
      await engine.evaluateProximity(makeTickEvent({ tick: 1 }));

      // Second tick: close — trigger with mood effect
      const close = makeLoc({ entityId: 'e-2', x: 3, y: 4 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, close]);
      await engine.evaluateProximity(makeTickEvent({ tick: 2 }));

      expect(moodEngine.applyEvent).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          eventType: 'proximity:enter_radius',
          valenceDelta: -0.2,
          arousalDelta: 0.3,
        })
      );
    });

    it('respects cooldown between trigger fires', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const rule = makeRule({
        triggerType: 'enter_radius',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 10,
        cooldownMs: 60_000,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Tick 1: far
      const far = makeLoc({ entityId: 'e-2', x: 100, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, far]);
      await engine.evaluateProximity(makeTickEvent({ tick: 1 }));

      // Tick 2: close — fires
      const close = makeLoc({ entityId: 'e-2', x: 3, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, close]);
      const events2 = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events2).toHaveLength(1);

      // Tick 3: move away then back — should be in cooldown
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, far]);
      await engine.evaluateProximity(makeTickEvent({ tick: 3 }));
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, close]);
      const events4 = await engine.evaluateProximity(makeTickEvent({ tick: 4 }));
      expect(events4).toHaveLength(0); // still in cooldown
    });

    it('skips rules with missing entities', async () => {
      const rule = makeRule({
        sourceEntityId: 'nonexistent',
        targetEntityId: 'also-nonexistent',
      });
      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = await engine.evaluateProximity(makeTickEvent());
      expect(events).toHaveLength(0);
    });
  });

  describe('approach/depart', () => {
    it('fires approach when distance decreases within threshold', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const rule = makeRule({
        triggerType: 'approach',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 20,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Tick 1: target at 15 (within threshold, sets initial cache)
      const t1 = makeLoc({ entityId: 'e-2', x: 15, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, t1]);
      await engine.evaluateProximity(makeTickEvent({ tick: 1 }));

      // Tick 2: target at 8 (closer, still within threshold — should fire)
      const t2 = makeLoc({ entityId: 'e-2', x: 8, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, t2]);
      const events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('approach');
    });

    it('fires depart when distance increases from within threshold', async () => {
      const source = makeLoc({ entityId: 'e-1', x: 0, y: 0 });
      const rule = makeRule({
        triggerType: 'depart',
        sourceEntityId: 'e-1',
        targetEntityId: 'e-2',
        radiusThreshold: 20,
      });

      (store.listProximityRules as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (store.listSpatialZones as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // Tick 1: target at 10
      const t1 = makeLoc({ entityId: 'e-2', x: 10, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, t1]);
      await engine.evaluateProximity(makeTickEvent({ tick: 1 }));

      // Tick 2: target at 18 (further, prev was within threshold)
      const t2 = makeLoc({ entityId: 'e-2', x: 18, y: 0 });
      (store.listEntityLocations as ReturnType<typeof vi.fn>).mockResolvedValue([source, t2]);
      const events = await engine.evaluateProximity(makeTickEvent({ tick: 2 }));
      expect(events).toHaveLength(1);
      expect(events[0].triggerType).toBe('depart');
    });
  });
});

describe('euclideanDistance', () => {
  it('calculates 2D distance', () => {
    const a = makeLoc({ x: 0, y: 0, z: 0 });
    const b = makeLoc({ x: 3, y: 4, z: 0 });
    expect(euclideanDistance(a, b)).toBeCloseTo(5, 5);
  });

  it('calculates 3D distance', () => {
    const a = makeLoc({ x: 0, y: 0, z: 0 });
    const b = makeLoc({ x: 1, y: 2, z: 2 });
    expect(euclideanDistance(a, b)).toBeCloseTo(3, 5);
  });

  it('returns 0 for same position', () => {
    const a = makeLoc({ x: 5, y: 5, z: 5 });
    expect(euclideanDistance(a, a)).toBe(0);
  });
});

describe('isInsideZone', () => {
  const zone = makeZone({ minX: 0, minY: 0, maxX: 100, maxY: 100 });

  it('returns true for entity inside', () => {
    expect(isInsideZone(makeLoc({ x: 50, y: 50 }), zone)).toBe(true);
  });

  it('returns true for entity on boundary', () => {
    expect(isInsideZone(makeLoc({ x: 0, y: 0 }), zone)).toBe(true);
    expect(isInsideZone(makeLoc({ x: 100, y: 100 }), zone)).toBe(true);
  });

  it('returns false for entity outside', () => {
    expect(isInsideZone(makeLoc({ x: -1, y: 50 }), zone)).toBe(false);
    expect(isInsideZone(makeLoc({ x: 50, y: 101 }), zone)).toBe(false);
  });
});
