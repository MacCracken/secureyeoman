/**
 * Tick Driver — Configurable timestep scheduler for simulation entities.
 *
 * Three modes:
 *   - realtime: ticks at wall-clock interval
 *   - accelerated: wall-clock interval compressed by timeScale
 *   - turn_based: manual advance only (no automatic ticking)
 */

import type { TickConfig, TickConfigCreate, TickEvent } from '@secureyeoman/shared';
import type { SimulationStore } from './simulation-store.js';
import type { MoodEngine } from './mood-engine.js';
import type { SecureLogger } from '../logging/logger.js';
import { uuidv7 } from '../utils/crypto.js';

export type TickHandler = (event: TickEvent) => void | Promise<void>;

export interface TickDriverOpts {
  store: SimulationStore;
  logger: SecureLogger;
  moodEngine?: MoodEngine;
  cognitiveDecayIntervalTicks?: number;
  onCognitiveDecay?: (personalityId: string) => void | Promise<void>;
}

interface ActiveTimer {
  timer: ReturnType<typeof setInterval> | null;
  config: TickConfig;
}

export class TickDriver {
  private store: SimulationStore;
  private logger: SecureLogger;
  private moodEngine?: MoodEngine;
  private cognitiveDecayInterval: number;
  private onCognitiveDecay?: (personalityId: string) => void | Promise<void>;
  private timers = new Map<string, ActiveTimer>();
  private handlers: TickHandler[] = [];

  constructor(opts: TickDriverOpts) {
    this.store = opts.store;
    this.logger = opts.logger;
    this.moodEngine = opts.moodEngine;
    this.cognitiveDecayInterval = opts.cognitiveDecayIntervalTicks ?? 60;
    this.onCognitiveDecay = opts.onCognitiveDecay;
  }

  onTick(handler: TickHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Create a tick config and start ticking (unless turn_based).
   */
  async startPersonality(input: TickConfigCreate): Promise<TickConfig> {
    const now = Date.now();
    const existing = await this.store.getTickConfig(input.personalityId);

    const config: TickConfig = {
      id: existing?.id ?? uuidv7(),
      personalityId: input.personalityId,
      mode: input.mode,
      tickIntervalMs: input.tickIntervalMs,
      timeScale: input.timeScale,
      paused: false,
      currentTick: existing?.currentTick ?? 0,
      simTimeEpoch: existing?.simTimeEpoch ?? 0,
      lastTickAt: existing?.lastTickAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.store.saveTickConfig(config);

    // Stop any existing timer
    this.clearTimer(input.personalityId);

    if (config.mode !== 'turn_based') {
      this.scheduleTimer(config);
    }

    this.logger.info(
      { personalityId: input.personalityId, mode: config.mode },
      'tick driver started'
    );
    return config;
  }

  async stopPersonality(personalityId: string): Promise<boolean> {
    this.clearTimer(personalityId);
    return this.store.deleteTickConfig(personalityId);
  }

  async pausePersonality(personalityId: string): Promise<TickConfig | null> {
    const config = await this.store.getTickConfig(personalityId);
    if (!config) return null;

    this.clearTimer(personalityId);

    const updated: TickConfig = { ...config, paused: true, updatedAt: Date.now() };
    await this.store.saveTickConfig(updated);
    return updated;
  }

  async resumePersonality(personalityId: string): Promise<TickConfig | null> {
    const config = await this.store.getTickConfig(personalityId);
    if (!config) return null;

    const updated: TickConfig = { ...config, paused: false, updatedAt: Date.now() };
    await this.store.saveTickConfig(updated);

    if (updated.mode !== 'turn_based') {
      this.scheduleTimer(updated);
    }
    return updated;
  }

  /**
   * Manually advance one tick (primarily for turn_based mode).
   */
  async advanceTick(personalityId: string): Promise<TickEvent | null> {
    const config = await this.store.getTickConfig(personalityId);
    if (!config) return null;

    return this.executeTick(config);
  }

  async getState(personalityId: string): Promise<TickConfig | null> {
    return this.store.getTickConfig(personalityId);
  }

  stopAll(): void {
    for (const [pid] of this.timers) {
      this.clearTimer(pid);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────

  private scheduleTimer(config: TickConfig): void {
    const intervalMs =
      config.mode === 'accelerated'
        ? Math.max(10, config.tickIntervalMs / config.timeScale)
        : config.tickIntervalMs;

    const timer = setInterval(() => {
      void this.onTimerFire(config.personalityId);
    }, intervalMs);

    this.timers.set(config.personalityId, { timer, config });
  }

  private clearTimer(personalityId: string): void {
    const entry = this.timers.get(personalityId);
    if (entry?.timer) {
      clearInterval(entry.timer);
    }
    this.timers.delete(personalityId);
  }

  private async onTimerFire(personalityId: string): Promise<void> {
    const config = await this.store.getTickConfig(personalityId);
    if (!config || config.paused) return;

    try {
      await this.executeTick(config);
    } catch (err) {
      this.logger.error({ err, personalityId }, 'tick execution failed');
    }
  }

  private async executeTick(config: TickConfig): Promise<TickEvent> {
    const now = Date.now();
    const newTick = config.currentTick + 1;

    // Simulated time advances by tickIntervalMs * timeScale
    const simAdvance =
      config.mode === 'accelerated'
        ? config.tickIntervalMs * config.timeScale
        : config.tickIntervalMs;
    const newSimTime = config.simTimeEpoch + simAdvance;

    // Persist tick state
    await this.store.updateTickState(config.personalityId, newTick, newSimTime);

    const event: TickEvent = {
      tick: newTick,
      simTime: newSimTime,
      personalityId: config.personalityId,
      timestamp: now,
    };

    // Mood decay per tick
    if (this.moodEngine) {
      try {
        await this.moodEngine.decayMood(config.personalityId);
      } catch (err) {
        this.logger.error({ err, personalityId: config.personalityId }, 'mood decay failed');
      }
    }

    // Cognitive memory decay every N ticks
    if (this.onCognitiveDecay && newTick % this.cognitiveDecayInterval === 0) {
      try {
        await this.onCognitiveDecay(config.personalityId);
      } catch (err) {
        this.logger.error({ err, personalityId: config.personalityId }, 'cognitive decay failed');
      }
    }

    // Notify registered handlers
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error({ err }, 'tick handler error');
      }
    }

    return event;
  }
}
