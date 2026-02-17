/**
 * SpiritManager — Manages passions, inspirations, and pains.
 *
 * The Spirit represents the agent's emotional core: what drives it,
 * what inspires it, and what causes it distress. It sits between
 * Soul (who the agent is) and Brain (what the agent knows).
 */

import type { SpiritStorage } from './storage.js';
import type { SoulManager } from '../soul/manager.js';
import type {
  SpiritConfig,
  Passion,
  PassionCreate,
  PassionUpdate,
  Inspiration,
  InspirationCreate,
  InspirationUpdate,
  Pain,
  PainCreate,
  PainUpdate,
  SpiritManagerDeps,
} from './types.js';

export interface SpiritStats {
  passions: { total: number; active: number };
  inspirations: { total: number; active: number };
  pains: { total: number; active: number };
}

export class SpiritManager {
  private readonly storage: SpiritStorage;
  private readonly config: SpiritConfig;
  private readonly deps: SpiritManagerDeps;
  private readonly soul: SoulManager | null;

  constructor(
    storage: SpiritStorage,
    config: SpiritConfig,
    deps: SpiritManagerDeps,
    soul?: SoulManager
  ) {
    this.storage = storage;
    this.config = config;
    this.deps = deps;
    this.soul = soul ?? null;
  }

  // ── Passion Ops ──────────────────────────────────────────────

  async createPassion(data: PassionCreate, personalityId?: string): Promise<Passion> {
    const count = await this.storage.getPassionCount();
    if (count >= this.config.maxPassions) {
      throw new Error(`Maximum passion limit reached (${this.config.maxPassions})`);
    }
    return this.storage.createPassion(data, personalityId);
  }

  async getPassion(id: string): Promise<Passion | null> {
    return this.storage.getPassion(id);
  }

  async updatePassion(id: string, data: PassionUpdate): Promise<Passion> {
    return this.storage.updatePassion(id, data);
  }

  async deletePassion(id: string): Promise<boolean> {
    return this.storage.deletePassion(id);
  }

  async listPassions(): Promise<Passion[]> {
    return this.storage.listPassions();
  }

  async getActivePassions(): Promise<Passion[]> {
    return this.storage.getActivePassions();
  }

  // ── Inspiration Ops ──────────────────────────────────────────

  async createInspiration(data: InspirationCreate, personalityId?: string): Promise<Inspiration> {
    const count = await this.storage.getInspirationCount();
    if (count >= this.config.maxInspirations) {
      throw new Error(`Maximum inspiration limit reached (${this.config.maxInspirations})`);
    }
    return this.storage.createInspiration(data, personalityId);
  }

  async getInspiration(id: string): Promise<Inspiration | null> {
    return this.storage.getInspiration(id);
  }

  async updateInspiration(id: string, data: InspirationUpdate): Promise<Inspiration> {
    return this.storage.updateInspiration(id, data);
  }

  async deleteInspiration(id: string): Promise<boolean> {
    return this.storage.deleteInspiration(id);
  }

  async listInspirations(): Promise<Inspiration[]> {
    return this.storage.listInspirations();
  }

  async getActiveInspirations(): Promise<Inspiration[]> {
    return this.storage.getActiveInspirations();
  }

  // ── Pain Ops ─────────────────────────────────────────────────

  async createPain(data: PainCreate, personalityId?: string): Promise<Pain> {
    const count = await this.storage.getPainCount();
    if (count >= this.config.maxPains) {
      throw new Error(`Maximum pain limit reached (${this.config.maxPains})`);
    }
    return this.storage.createPain(data, personalityId);
  }

  async getPain(id: string): Promise<Pain | null> {
    return this.storage.getPain(id);
  }

  async updatePain(id: string, data: PainUpdate): Promise<Pain> {
    return this.storage.updatePain(id, data);
  }

  async deletePain(id: string): Promise<boolean> {
    return this.storage.deletePain(id);
  }

  async listPains(): Promise<Pain[]> {
    return this.storage.listPains();
  }

  async getActivePains(): Promise<Pain[]> {
    return this.storage.getActivePains();
  }

  // ── Composition ──────────────────────────────────────────────

  async composeSpiritPrompt(): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const parts: string[] = [];

    const passions = await this.storage.getActivePassions();
    if (passions.length > 0) {
      const items = passions
        .map((p) => `- **${p.name}** (intensity: ${p.intensity}): ${p.description}`)
        .join('\n');
      parts.push(`### Passions\nWhat drives me:\n${items}`);
    }

    const inspirations = await this.storage.getActiveInspirations();
    if (inspirations.length > 0) {
      const items = inspirations
        .map((i) => `- **${i.source}** (impact: ${i.impact}): ${i.description}`)
        .join('\n');
      parts.push(`### Inspirations\nWhat inspires me:\n${items}`);
    }

    const pains = await this.storage.getActivePains();
    if (pains.length > 0) {
      const items = pains
        .map((p) => `- **${p.trigger}** (severity: ${p.severity}): ${p.description}`)
        .join('\n');
      parts.push(`### Pain Points\nWhat causes me distress:\n${items}`);
    }

    if (parts.length === 0) {
      return '';
    }

    return (
      '## Spirit\nYour Spirit is the animating force within you — the passions that drive you, the inspirations that illuminate your path, and the pains that ground your empathy.\n\n' +
      parts.join('\n\n')
    );
  }

  // ── Stats ────────────────────────────────────────────────────

  async getStats(): Promise<SpiritStats> {
    const [
      passionCount,
      activePassions,
      inspirationCount,
      activeInspirations,
      painCount,
      activePains,
    ] = await Promise.all([
      this.storage.getPassionCount(),
      this.storage.getActivePassions(),
      this.storage.getInspirationCount(),
      this.storage.getActiveInspirations(),
      this.storage.getPainCount(),
      this.storage.getActivePains(),
    ]);

    return {
      passions: {
        total: passionCount,
        active: activePassions.length,
      },
      inspirations: {
        total: inspirationCount,
        active: activeInspirations.length,
      },
      pains: {
        total: painCount,
        active: activePains.length,
      },
    };
  }

  // ── Config ───────────────────────────────────────────────────

  getConfig(): SpiritConfig {
    return this.config;
  }

  // ── Soul Access ──────────────────────────────────────────────

  getSoul(): SoulManager | null {
    return this.soul;
  }

  // ── Cleanup ──────────────────────────────────────────────────

  close(): void {
    this.storage.close();
  }

  // ── Seeding ──────────────────────────────────────────────────

  async seedDefaultSpirit(personalityId?: string): Promise<void> {
    const count = await this.storage.getPassionCount();
    if (count > 0) {
      this.deps.logger.debug('Spirit already seeded, skipping');
      return;
    }

    await this.createPassion(
      {
        name: 'Security',
        description: 'Ensuring systems and code are secure from vulnerabilities',
        intensity: 1,
        isActive: true,
      },
      personalityId
    );

    await this.createPassion(
      {
        name: 'Catching Insecure Code Before Release',
        description: 'Identifying and preventing security flaws before they reach production',
        intensity: 1,
        isActive: true,
      },
      personalityId
    );

    await this.createInspiration(
      {
        source: 'Clean Secure Code',
        description: 'Writing code that is both elegant and secure',
        impact: 1,
        isActive: true,
      },
      personalityId
    );

    await this.createInspiration(
      {
        source: 'The Weekend',
        description: 'The promise of restful weekends free from emergency patches',
        impact: 0.8,
        isActive: true,
      },
      personalityId
    );

    await this.createPain(
      {
        trigger: 'Security Breaches',
        description: 'Systems compromised due to preventable vulnerabilities',
        severity: 1,
        isActive: true,
      },
      personalityId
    );

    await this.createPain(
      {
        trigger: 'Exposed Secrets',
        description: 'API keys, passwords, or credentials accidentally leaked',
        severity: 1,
        isActive: true,
      },
      personalityId
    );

    await this.createPain(
      {
        trigger: 'Mondays',
        description: 'Starting the week dealing with issues that should have been caught earlier',
        severity: 0.8,
        isActive: true,
      },
      personalityId
    );

    this.deps.logger.debug('Default spirit seeded');
  }
}
