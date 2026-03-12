/**
 * Spatial Engine — Location-aware entity context with proximity triggers.
 *
 * Evaluates proximity rules each tick: entity-to-entity radius checks,
 * zone enter/leave detection, and approach/depart tracking. Fires
 * proximity events and optionally applies mood effects.
 */

import type {
  EntityLocation,
  EntityLocationUpsert,
  SpatialZone,
  SpatialZoneCreate,
  ProximityRule,
  ProximityRuleCreate,
  ProximityEvent,
  ProximityTriggerType,
  TickEvent,
} from '@secureyeoman/shared';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export interface SpatialEngineOpts {
  store: SimulationStore;
  logger: SecureLogger;
  moodEngine?: MoodEngine;
}

/** Tracks previous distances for approach/depart detection. */
type DistanceCache = Map<string, number>;

export class SpatialEngine {
  private store: SimulationStore;
  private logger: SecureLogger;
  private moodEngine?: MoodEngine;

  /** personalityId → (ruleId → previous distance) */
  private distanceCaches = new Map<string, DistanceCache>();

  /** ruleId → last fired timestamp (for cooldown enforcement) */
  private cooldowns = new Map<string, number>();

  constructor(opts: SpatialEngineOpts) {
    this.store = opts.store;
    this.logger = opts.logger;
    this.moodEngine = opts.moodEngine;
  }

  // ── Entity Location Management ────────────────────────────────────

  async updateEntityLocation(
    personalityId: string,
    input: EntityLocationUpsert
  ): Promise<EntityLocation> {
    const existing = await this.store.getEntityLocation(personalityId, input.entityId);
    const loc: EntityLocation = {
      id: existing?.id ?? uuidv7(),
      personalityId,
      entityId: input.entityId,
      entityType: input.entityType,
      zoneId: input.zoneId,
      x: input.x,
      y: input.y,
      z: input.z,
      heading: input.heading,
      speed: input.speed,
      metadata: input.metadata,
      updatedAt: Date.now(),
    };
    await this.store.upsertEntityLocation(loc);
    return loc;
  }

  async getEntityLocation(personalityId: string, entityId: string): Promise<EntityLocation | null> {
    return this.store.getEntityLocation(personalityId, entityId);
  }

  async listEntities(
    personalityId: string,
    opts?: { zoneId?: string; limit?: number }
  ): Promise<EntityLocation[]> {
    return this.store.listEntityLocations(personalityId, opts);
  }

  async removeEntity(personalityId: string, entityId: string): Promise<boolean> {
    return this.store.deleteEntityLocation(personalityId, entityId);
  }

  // ── Zone Management ───────────────────────────────────────────────

  async createZone(personalityId: string, input: SpatialZoneCreate): Promise<SpatialZone> {
    const zone: SpatialZone = {
      id: uuidv7(),
      personalityId,
      zoneId: input.zoneId,
      name: input.name,
      minX: input.minX,
      minY: input.minY,
      maxX: input.maxX,
      maxY: input.maxY,
      properties: input.properties,
      createdAt: Date.now(),
    };
    await this.store.upsertSpatialZone(zone);
    return zone;
  }

  async listZones(personalityId: string): Promise<SpatialZone[]> {
    return this.store.listSpatialZones(personalityId);
  }

  async deleteZone(personalityId: string, zoneId: string): Promise<boolean> {
    return this.store.deleteSpatialZone(personalityId, zoneId);
  }

  // ── Proximity Rules ───────────────────────────────────────────────

  async addRule(personalityId: string, input: ProximityRuleCreate): Promise<ProximityRule> {
    const rule: ProximityRule = {
      id: uuidv7(),
      personalityId,
      triggerType: input.triggerType,
      sourceEntityId: input.sourceEntityId,
      targetEntityId: input.targetEntityId,
      targetZoneId: input.targetZoneId,
      radiusThreshold: input.radiusThreshold,
      cooldownMs: input.cooldownMs,
      moodEffect: input.moodEffect,
      enabled: input.enabled,
      createdAt: Date.now(),
    };
    await this.store.saveProximityRule(rule);
    return rule;
  }

  async listRules(
    personalityId: string,
    opts?: { enabledOnly?: boolean }
  ): Promise<ProximityRule[]> {
    return this.store.listProximityRules(personalityId, opts);
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    this.cooldowns.delete(ruleId);
    return this.store.deleteProximityRule(ruleId);
  }

  // ── Proximity Event History ───────────────────────────────────────

  async listProximityEvents(
    personalityId: string,
    opts?: { limit?: number; sinceTick?: number }
  ): Promise<ProximityEvent[]> {
    return this.store.listProximityEvents(personalityId, opts);
  }

  // ── Tick Handler — evaluate all proximity rules ───────────────────

  /**
   * Returns a TickHandler function that evaluates proximity rules each tick.
   */
  createTickHandler(): (event: TickEvent) => Promise<void> {
    return async (event: TickEvent) => {
      await this.evaluateProximity(event);
    };
  }

  async evaluateProximity(event: TickEvent): Promise<ProximityEvent[]> {
    const { personalityId, tick } = event;
    const rules = await this.store.listProximityRules(personalityId, { enabledOnly: true });
    if (rules.length === 0) return [];

    const entities = await this.store.listEntityLocations(personalityId);
    const entityMap = new Map(entities.map((e) => [e.entityId, e]));
    const zones = await this.store.listSpatialZones(personalityId);
    const zoneMap = new Map(zones.map((z) => [z.zoneId, z]));

    const now = Date.now();
    const fired: ProximityEvent[] = [];

    for (const rule of rules) {
      // Cooldown check
      const lastFired = this.cooldowns.get(rule.id);
      if (lastFired && rule.cooldownMs > 0 && now - lastFired < rule.cooldownMs) {
        continue;
      }

      const events = this.evaluateRule(rule, entityMap, zoneMap, personalityId, tick);
      for (const evt of events) {
        await this.store.recordProximityEvent(evt);
        fired.push(evt);
        this.cooldowns.set(rule.id, now);

        // Apply mood effect if configured
        if (rule.moodEffect && this.moodEngine) {
          try {
            await this.moodEngine.applyEvent(personalityId, {
              eventType: `proximity:${rule.triggerType}`,
              valenceDelta: rule.moodEffect.valenceDelta,
              arousalDelta: rule.moodEffect.arousalDelta,
              source: 'spatial_engine',
              metadata: {
                ruleId: rule.id,
                triggerType: rule.triggerType,
                distance: evt.distance,
              },
            });
          } catch (err) {
            this.logger.error({ err, ruleId: rule.id }, 'mood effect application failed');
          }
        }
      }
    }

    if (fired.length > 0) {
      this.logger.info({ personalityId, tick, count: fired.length }, 'proximity events fired');
    }

    return fired;
  }

  private evaluateRule(
    rule: ProximityRule,
    entityMap: Map<string, EntityLocation>,
    zoneMap: Map<string, SpatialZone>,
    personalityId: string,
    tick: number
  ): ProximityEvent[] {
    const events: ProximityEvent[] = [];

    switch (rule.triggerType) {
      case 'enter_radius':
      case 'leave_radius':
      case 'approach':
      case 'depart':
        events.push(...this.evaluateRadiusRule(rule, entityMap, personalityId, tick));
        break;
      case 'enter_zone':
      case 'leave_zone':
        events.push(...this.evaluateZoneRule(rule, entityMap, zoneMap, personalityId, tick));
        break;
    }

    return events;
  }

  private evaluateRadiusRule(
    rule: ProximityRule,
    entityMap: Map<string, EntityLocation>,
    personalityId: string,
    tick: number
  ): ProximityEvent[] {
    const events: ProximityEvent[] = [];
    const source = rule.sourceEntityId ? entityMap.get(rule.sourceEntityId) : null;
    if (rule.sourceEntityId && !source) return events;

    const targets = rule.targetEntityId
      ? ([entityMap.get(rule.targetEntityId)].filter(Boolean) as EntityLocation[])
      : [...entityMap.values()].filter((e) => e.entityId !== rule.sourceEntityId);

    if (!source) return events;

    const distCache = this.getDistanceCache(personalityId);

    for (const target of targets) {
      const dist = euclideanDistance(source, target);
      const cacheKey = `${rule.id}:${source.entityId}:${target.entityId}`;
      const prevDist = distCache.get(cacheKey);

      let triggered = false;
      if (rule.triggerType === 'enter_radius') {
        triggered =
          (prevDist == null || prevDist > rule.radiusThreshold) && dist <= rule.radiusThreshold;
      } else if (rule.triggerType === 'leave_radius') {
        triggered =
          prevDist != null && prevDist <= rule.radiusThreshold && dist > rule.radiusThreshold;
      } else if (rule.triggerType === 'approach') {
        triggered = prevDist != null && dist < prevDist && dist <= rule.radiusThreshold;
      } else if (rule.triggerType === 'depart') {
        triggered = prevDist != null && dist > prevDist && prevDist <= rule.radiusThreshold;
      }

      distCache.set(cacheKey, dist);

      if (triggered) {
        events.push({
          id: uuidv7(),
          personalityId,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          sourceEntityId: source.entityId,
          targetEntityId: target.entityId,
          targetZoneId: null,
          distance: dist,
          tick,
          metadata: {},
          createdAt: Date.now(),
        });
      }
    }

    return events;
  }

  private evaluateZoneRule(
    rule: ProximityRule,
    entityMap: Map<string, EntityLocation>,
    zoneMap: Map<string, SpatialZone>,
    personalityId: string,
    tick: number
  ): ProximityEvent[] {
    const events: ProximityEvent[] = [];
    if (!rule.targetZoneId) return events;

    const zone = zoneMap.get(rule.targetZoneId);
    if (!zone) return events;

    const source = rule.sourceEntityId ? entityMap.get(rule.sourceEntityId) : null;
    if (rule.sourceEntityId && !source) return events;

    const entities = source ? [source] : [...entityMap.values()];
    const distCache = this.getDistanceCache(personalityId);

    for (const entity of entities) {
      const inside = isInsideZone(entity, zone);
      const cacheKey = `${rule.id}:zone:${entity.entityId}:${rule.targetZoneId}`;
      const wasInside = distCache.get(cacheKey);

      let triggered = false;
      if (rule.triggerType === 'enter_zone') {
        triggered = (wasInside == null || wasInside === 0) && inside;
      } else if (rule.triggerType === 'leave_zone') {
        triggered = wasInside === 1 && !inside;
      }

      distCache.set(cacheKey, inside ? 1 : 0);

      if (triggered) {
        events.push({
          id: uuidv7(),
          personalityId,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          sourceEntityId: entity.entityId,
          targetEntityId: null,
          targetZoneId: rule.targetZoneId,
          distance: 0,
          tick,
          metadata: { zoneName: zone.name },
          createdAt: Date.now(),
        });
      }
    }

    return events;
  }

  private getDistanceCache(personalityId: string): DistanceCache {
    let cache = this.distanceCaches.get(personalityId);
    if (!cache) {
      cache = new Map();
      this.distanceCaches.set(personalityId, cache);
    }
    return cache;
  }
}

// ── Geometry helpers ──────────────────────────────────────────────────

export function euclideanDistance(a: EntityLocation, b: EntityLocation): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isInsideZone(entity: EntityLocation, zone: SpatialZone): boolean {
  return (
    entity.x >= zone.minX && entity.x <= zone.maxX && entity.y >= zone.minY && entity.y <= zone.maxY
  );
}
