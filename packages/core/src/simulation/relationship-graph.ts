/**
 * Relationship Graph — Persistent inter-entity relationship tracking.
 *
 * Tracks affinity scores, trust levels, and group membership between
 * simulation entities. Updated by interactions and events. Queryable
 * for decision branching. Builds on cognitive memory's associative
 * graph pattern.
 */

import type {
  EntityRelationship,
  EntityRelationshipCreate,
  RelationshipEvent,
  RelationshipEventCreate,
  EntityGroup,
  EntityGroupCreate,
  TickEvent,
} from '@secureyeoman/shared';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export interface RelationshipGraphOpts {
  store: SimulationStore;
  logger: SecureLogger;
  moodEngine?: MoodEngine;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class RelationshipGraph {
  private store: SimulationStore;
  private logger: SecureLogger;
  private moodEngine?: MoodEngine;

  constructor(opts: RelationshipGraphOpts) {
    this.store = opts.store;
    this.logger = opts.logger;
    this.moodEngine = opts.moodEngine;
  }

  // ── CRUD for relationships between entities ─────────────────────────

  async createRelationship(
    personalityId: string,
    data: EntityRelationshipCreate
  ): Promise<EntityRelationship> {
    const now = Date.now();
    const rel: EntityRelationship = {
      id: uuidv7(),
      personalityId,
      sourceEntityId: data.sourceEntityId,
      targetEntityId: data.targetEntityId,
      type: data.type,
      affinity: clamp(data.affinity, -1, 1),
      trust: clamp(data.trust, 0, 1),
      interactionCount: 0,
      decayRate: data.decayRate,
      metadata: data.metadata,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.upsertRelationship(rel);
    this.logger.info(
      { personalityId, source: data.sourceEntityId, target: data.targetEntityId, type: data.type },
      'relationship created'
    );
    return rel;
  }

  async getRelationship(
    personalityId: string,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<EntityRelationship | null> {
    return this.store.getRelationship(personalityId, sourceEntityId, targetEntityId);
  }

  async listRelationships(
    personalityId: string,
    opts?: { entityId?: string; type?: string; minAffinity?: number; limit?: number }
  ): Promise<EntityRelationship[]> {
    return this.store.listRelationships(personalityId, opts);
  }

  async updateRelationship(
    personalityId: string,
    sourceEntityId: string,
    targetEntityId: string,
    updates: { affinity?: number; trust?: number; metadata?: Record<string, unknown> }
  ): Promise<EntityRelationship | null> {
    const existing = await this.store.getRelationship(
      personalityId,
      sourceEntityId,
      targetEntityId
    );
    if (!existing) return null;

    const updated: EntityRelationship = {
      ...existing,
      affinity: updates.affinity != null ? clamp(updates.affinity, -1, 1) : existing.affinity,
      trust: updates.trust != null ? clamp(updates.trust, 0, 1) : existing.trust,
      metadata: updates.metadata ?? existing.metadata,
      updatedAt: Date.now(),
    };
    await this.store.upsertRelationship(updated);
    return updated;
  }

  async deleteRelationship(
    personalityId: string,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<boolean> {
    return this.store.deleteRelationship(personalityId, sourceEntityId, targetEntityId);
  }

  // ── Relationship events (interactions) ──────────────────────────────

  async recordInteraction(
    personalityId: string,
    data: RelationshipEventCreate
  ): Promise<RelationshipEvent> {
    const now = Date.now();

    // Record the event
    const event: RelationshipEvent = {
      id: uuidv7(),
      personalityId,
      sourceEntityId: data.sourceEntityId,
      targetEntityId: data.targetEntityId,
      eventType: data.eventType,
      affinityDelta: data.affinityDelta,
      trustDelta: data.trustDelta,
      source: data.source,
      metadata: data.metadata,
      createdAt: now,
    };
    await this.store.recordRelationshipEvent(event);

    // Update the relationship scores
    let rel = await this.store.getRelationship(
      personalityId,
      data.sourceEntityId,
      data.targetEntityId
    );

    if (!rel) {
      // Auto-create relationship if it doesn't exist
      rel = {
        id: uuidv7(),
        personalityId,
        sourceEntityId: data.sourceEntityId,
        targetEntityId: data.targetEntityId,
        type: 'neutral',
        affinity: 0,
        trust: 0.5,
        interactionCount: 0,
        decayRate: 0.01,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
    }

    const updatedRel: EntityRelationship = {
      ...rel,
      affinity: clamp(rel.affinity + data.affinityDelta, -1, 1),
      trust: clamp(rel.trust + data.trustDelta, 0, 1),
      interactionCount: rel.interactionCount + 1,
      updatedAt: now,
    };
    await this.store.upsertRelationship(updatedRel);

    // Optionally trigger mood effects
    if (data.moodEffect && this.moodEngine) {
      try {
        await this.moodEngine.applyEvent(personalityId, {
          eventType: `relationship:${data.eventType}`,
          valenceDelta: data.moodEffect.valenceDelta,
          arousalDelta: data.moodEffect.arousalDelta,
          source: 'relationship_graph',
          metadata: {
            sourceEntityId: data.sourceEntityId,
            targetEntityId: data.targetEntityId,
            eventType: data.eventType,
          },
        });
      } catch (err) {
        this.logger.error({ err, personalityId }, 'mood effect from interaction failed');
      }
    }

    this.logger.info(
      {
        personalityId,
        source: data.sourceEntityId,
        target: data.targetEntityId,
        eventType: data.eventType,
      },
      'interaction recorded'
    );

    return event;
  }

  async listEvents(
    personalityId: string,
    opts?: { entityId?: string; limit?: number; since?: number }
  ): Promise<RelationshipEvent[]> {
    return this.store.listRelationshipEvents(personalityId, opts);
  }

  // ── Group membership ────────────────────────────────────────────────

  async createGroup(personalityId: string, data: EntityGroupCreate): Promise<EntityGroup> {
    const now = Date.now();
    const group: EntityGroup = {
      id: uuidv7(),
      personalityId,
      groupId: data.groupId,
      name: data.name,
      members: data.members,
      metadata: data.metadata,
      createdAt: now,
    };
    await this.store.upsertEntityGroup(group);
    this.logger.info({ personalityId, groupId: data.groupId, name: data.name }, 'group created');
    return group;
  }

  async listGroups(personalityId: string): Promise<EntityGroup[]> {
    return this.store.listEntityGroups(personalityId);
  }

  async addToGroup(personalityId: string, groupId: string, entityId: string): Promise<void> {
    const group = await this.store.getEntityGroup(personalityId, groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }
    if (group.members.includes(entityId)) return;
    const updated: EntityGroup = {
      ...group,
      members: [...group.members, entityId],
    };
    await this.store.upsertEntityGroup(updated);
  }

  async removeFromGroup(
    personalityId: string,
    groupId: string,
    entityId: string
  ): Promise<boolean> {
    const group = await this.store.getEntityGroup(personalityId, groupId);
    if (!group) return false;
    const idx = group.members.indexOf(entityId);
    if (idx === -1) return false;
    const updated: EntityGroup = {
      ...group,
      members: group.members.filter((m) => m !== entityId),
    };
    await this.store.upsertEntityGroup(updated);
    return true;
  }

  async getGroupMembers(personalityId: string, groupId: string): Promise<string[]> {
    const group = await this.store.getEntityGroup(personalityId, groupId);
    return group?.members ?? [];
  }

  async deleteGroup(personalityId: string, groupId: string): Promise<boolean> {
    return this.store.deleteEntityGroup(personalityId, groupId);
  }

  // ── Tick handler — decay relationships toward neutral ───────────────

  createTickHandler(): (event: TickEvent) => Promise<void> {
    return async (event: TickEvent) => {
      await this.decayRelationships(event.personalityId);
    };
  }

  async decayRelationships(personalityId: string): Promise<void> {
    const relationships = await this.store.listAllRelationships(personalityId);
    if (relationships.length === 0) return;

    let decayed = 0;
    for (const rel of relationships) {
      const rate = rel.decayRate;
      if (rate <= 0) continue;

      // Decay affinity toward 0
      const newAffinity = rel.affinity + (0 - rel.affinity) * rate;
      // Decay trust toward 0.5
      const newTrust = rel.trust + (0.5 - rel.trust) * rate;

      // Only persist if there's meaningful change
      if (
        Math.abs(newAffinity - rel.affinity) > 0.0001 ||
        Math.abs(newTrust - rel.trust) > 0.0001
      ) {
        const updated: EntityRelationship = {
          ...rel,
          affinity: clamp(newAffinity, -1, 1),
          trust: clamp(newTrust, 0, 1),
          updatedAt: Date.now(),
        };
        await this.store.upsertRelationship(updated);
        decayed++;
      }
    }

    if (decayed > 0) {
      this.logger.info({ personalityId, decayed }, 'relationships decayed');
    }
  }
}
