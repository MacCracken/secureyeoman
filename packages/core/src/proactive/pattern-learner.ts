/**
 * Pattern Learner — Detects recurring patterns from user interactions
 * and converts them into proactive triggers.
 */

import type { BrainManager } from '../brain/manager.js';
import type { SecureLogger } from '../logging/logger.js';
import type { ProactiveTriggerCreate } from '@friday/shared';

export interface InteractionEvent {
  type: string;
  context: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface DetectedPattern {
  id: string;
  type: 'temporal' | 'sequential' | 'contextual';
  description: string;
  confidence: number;
  occurrences: number;
  lastSeen: number;
  context: Record<string, unknown>;
}

export class PatternLearner {
  private readonly brain: BrainManager;
  private readonly logger: SecureLogger;

  constructor(brain: BrainManager, logger: SecureLogger) {
    this.brain = brain;
    this.logger = logger;
  }

  async recordInteraction(event: InteractionEvent): Promise<void> {
    try {
      await this.brain.remember(
        'procedural',
        `Interaction: ${event.type} in context "${event.context}"`,
        'proactive_pattern',
        {
          interactionType: event.type,
          context: event.context,
          timestamp: String(event.timestamp),
          ...Object.fromEntries(
            Object.entries(event.metadata ?? {}).map(([k, v]) => [k, String(v)]),
          ),
        },
        0.3,
      );
    } catch (err) {
      this.logger.warn('Failed to record interaction for pattern learning', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async detectPatterns(lookbackDays: number = 30): Promise<DetectedPattern[]> {
    try {
      const memories = await this.brain.recall({
        type: 'procedural',
        source: 'proactive_pattern',
        limit: lookbackDays * 10,
      });

      if (!memories || memories.length < 3) {
        return [];
      }

      // Group memories by context to identify patterns
      const contextGroups = new Map<string, Array<{ timestamp: number; type: string }>>();

      for (const memory of memories) {
        const ctx = memory.context?.context ?? 'unknown';
        if (!contextGroups.has(ctx)) {
          contextGroups.set(ctx, []);
        }
        contextGroups.get(ctx)!.push({
          timestamp: memory.createdAt ?? Date.now(),
          type: memory.context?.interactionType ?? 'unknown',
        });
      }

      const patterns: DetectedPattern[] = [];

      for (const [context, interactions] of contextGroups) {
        if (interactions.length < 3) continue;

        // Temporal pattern: similar time of day
        const hours = interactions.map((i) => new Date(i.timestamp).getHours());
        const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
        const hourVariance =
          hours.reduce((sum, h) => sum + Math.pow(h - avgHour, 2), 0) / hours.length;

        if (hourVariance < 4) {
          patterns.push({
            id: `temporal_${context}_${avgHour}`,
            type: 'temporal',
            description: `User tends to "${context}" around ${avgHour}:00`,
            confidence: Math.min(1, 1 - hourVariance / 12),
            occurrences: interactions.length,
            lastSeen: Math.max(...interactions.map((i) => i.timestamp)),
            context: { avgHour, context, hourVariance },
          });
        }

        // Contextual pattern: repeated interactions in same context
        if (interactions.length >= 5) {
          patterns.push({
            id: `contextual_${context}`,
            type: 'contextual',
            description: `Frequent activity in "${context}" (${interactions.length} times)`,
            confidence: Math.min(1, interactions.length / 20),
            occurrences: interactions.length,
            lastSeen: Math.max(...interactions.map((i) => i.timestamp)),
            context: { context, interactionCount: interactions.length },
          });
        }
      }

      return patterns.sort((a, b) => b.confidence - a.confidence);
    } catch (err) {
      this.logger.error('Pattern detection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  convertToTrigger(pattern: DetectedPattern): ProactiveTriggerCreate {
    switch (pattern.type) {
      case 'temporal': {
        const hour = (pattern.context.avgHour as number) ?? 9;
        return {
          name: `Pattern: ${pattern.description}`,
          description: `Auto-detected pattern with ${pattern.occurrences} occurrences (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          enabled: false,
          type: 'schedule',
          condition: {
            type: 'schedule',
            cron: `0 ${hour} * * 1-5`,
            timezone: 'UTC',
          },
          action: {
            type: 'remind',
            content: pattern.description,
            category: 'pattern_reminder',
          },
          approvalMode: 'suggest',
          cooldownMs: 3600000,
          limitPerDay: 1,
        };
      }
      case 'contextual':
      default:
        return {
          name: `Pattern: ${pattern.description}`,
          description: `Auto-detected pattern with ${pattern.occurrences} occurrences (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          enabled: false,
          type: 'pattern',
          condition: {
            type: 'pattern',
            patternId: pattern.id,
            minConfidence: 0.7,
          },
          action: {
            type: 'remind',
            content: pattern.description,
            category: 'pattern_reminder',
          },
          approvalMode: 'suggest',
          cooldownMs: 3600000,
          limitPerDay: 3,
        };
    }
  }
}
