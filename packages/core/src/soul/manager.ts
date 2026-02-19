/**
 * SoulManager — Composes personality + skills into AI system prompts.
 *
 * Manages the full lifecycle of personalities and skills, including
 * creation, approval workflows, and prompt composition.
 *
 * Prompt composition begins with the Sacred Archetypes preamble —
 * the cosmological foundation (No-Thing-Ness → The One → The Plurality)
 * that grounds the "In Our Image" hierarchy.
 *
 * When a BrainManager is provided, skills are delegated to the Brain
 * and relevant context is injected into the composed prompt.
 */

import { composeArchetypesPreamble } from './archetypes.js';
import type { SoulStorage } from './storage.js';
import type { BrainManager } from '../brain/manager.js';
import type { SpiritManager } from '../spirit/manager.js';
import type { HeartbeatManager } from '../body/heartbeat.js';
import { HeartManager } from '../body/heart.js';
import type {
  Personality,
  PersonalityCreate,
  PersonalityUpdate,
  Skill,
  SkillCreate,
  SkillUpdate,
  SoulConfig,
  Tool,
  SoulManagerDeps,
  SkillFilter,
  UserProfile,
  UserProfileCreate,
  UserProfileUpdate,
} from './types.js';

export class SoulManager {
  private readonly storage: SoulStorage;
  private readonly brain: BrainManager | null;
  private readonly spirit: SpiritManager | null;
  private readonly config: SoulConfig;
  private readonly deps: SoulManagerDeps;
  private heartbeat: HeartbeatManager | null = null;
  private heartManager: HeartManager | null = null;

  constructor(
    storage: SoulStorage,
    config: SoulConfig,
    deps: SoulManagerDeps,
    brain?: BrainManager,
    spirit?: SpiritManager
  ) {
    this.storage = storage;
    this.config = config;
    this.deps = deps;
    this.brain = brain ?? null;
    this.spirit = spirit ?? null;
  }

  // ── Agent Name ─────────────────────────────────────────────

  async getAgentName(): Promise<string | null> {
    return this.storage.getAgentName();
  }

  async setAgentName(name: string): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw new Error('Agent name cannot be empty');
    }
    await this.storage.setAgentName(name.trim());
  }

  // ── Onboarding ──────────────────────────────────────────────

  async needsOnboarding(): Promise<boolean> {
    const [agentName, personalityCount] = await Promise.all([
      this.storage.getAgentName(),
      this.storage.getPersonalityCount(),
    ]);
    return agentName === null || personalityCount === 0;
  }

  async createDefaultPersonality(): Promise<Personality> {
    const agentName = (await this.storage.getAgentName()) ?? 'FRIDAY';

    const personality = await this.storage.createPersonality({
      name: agentName,
      description: 'Friendly, Reliable, Intelligent Digitally Adaptable Yeoman',
      systemPrompt: `You are ${agentName}, a helpful and security-conscious AI assistant. You are direct, technically precise, and proactive about identifying risks.`,
      traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
      sex: 'unspecified',
      voice: '',
      preferredLanguage: '',
      defaultModel: null,
      modelFallbacks: [],
      includeArchetypes: agentName === 'FRIDAY',
      body: {
        enabled: false,
        capabilities: [],
        heartEnabled: true,
        creationConfig: {
          skills: false,
          tasks: false,
          personalities: false,
          subAgents: false,
          customRoles: false,
          roleAssignments: false,
          experiments: false,
          allowA2A: false,
          allowSwarms: false,
          allowDynamicTools: false,
        },
        selectedServers: [],
        selectedIntegrations: [],
        mcpFeatures: {
          exposeGit: false,
          exposeFilesystem: false,
          exposeWeb: false,
          exposeWebScraping: false,
          exposeWebSearch: false,
          exposeBrowser: false,
        },
        proactiveConfig: {
          enabled: false,
          approvalMode: 'suggest',
          builtins: {
            dailyStandup: false,
            weeklySummary: false,
            contextualFollowup: false,
            integrationHealthAlert: false,
            securityAlertDigest: false,
          },
          learning: { enabled: true, minConfidence: 0.7 },
        },
      },
    });

    await this.storage.setActivePersonality(personality.id);
    return (await this.storage.getPersonality(personality.id))!;
  }

  // ── Personality ─────────────────────────────────────────────

  async getPersonality(id: string): Promise<Personality | null> {
    return this.storage.getPersonality(id);
  }

  async getActivePersonality(): Promise<Personality | null> {
    return this.storage.getActivePersonality();
  }

  async setPersonality(id: string): Promise<void> {
    await this.storage.setActivePersonality(id);
  }

  async createPersonality(data: PersonalityCreate): Promise<Personality> {
    return this.storage.createPersonality(data);
  }

  async updatePersonality(id: string, data: PersonalityUpdate): Promise<Personality> {
    return this.storage.updatePersonality(id, data);
  }

  async deletePersonality(id: string): Promise<void> {
    const personality = await this.storage.getPersonality(id);
    if (personality?.isActive) {
      throw new Error('Cannot delete the active personality');
    }
    await this.storage.deletePersonality(id);
  }

  async listPersonalities(): Promise<Personality[]> {
    return this.storage.listPersonalities();
  }

  // ── Skills (delegated to Brain when available) ────────────

  async createSkill(data: SkillCreate): Promise<Skill> {
    if (this.brain) {
      return this.brain.createSkill(data);
    }
    const count = await this.storage.getSkillCount();
    if (count >= this.config.maxSkills) {
      throw new Error(`Maximum skill limit reached (${this.config.maxSkills})`);
    }
    return this.storage.createSkill(data);
  }

  async updateSkill(id: string, data: SkillUpdate): Promise<Skill> {
    if (this.brain) {
      return this.brain.updateSkill(id, data);
    }
    return this.storage.updateSkill(id, data);
  }

  async deleteSkill(id: string): Promise<void> {
    if (this.brain) {
      await this.brain.deleteSkill(id);
      return;
    }
    await this.storage.deleteSkill(id);
  }

  async enableSkill(id: string): Promise<void> {
    if (this.brain) {
      await this.brain.enableSkill(id);
      return;
    }
    await this.storage.updateSkill(id, { enabled: true });
  }

  async disableSkill(id: string): Promise<void> {
    if (this.brain) {
      await this.brain.disableSkill(id);
      return;
    }
    await this.storage.updateSkill(id, { enabled: false });
  }

  async listSkills(filter?: SkillFilter): Promise<Skill[]> {
    const skills = this.brain
      ? await this.brain.listSkills(filter)
      : await this.storage.listSkills(filter);

    const withPersonality = skills.filter((s) => s.personalityId);
    if (withPersonality.length === 0) return skills;

    const personalities = await this.storage.listPersonalities();
    const pMap = new Map(personalities.map((p) => [p.id, p.name]));
    return skills.map((s) =>
      s.personalityId ? { ...s, personalityName: pMap.get(s.personalityId) ?? null } : s
    );
  }

  async getSkill(id: string): Promise<Skill | null> {
    if (this.brain) {
      return this.brain.getSkill(id);
    }
    return this.storage.getSkill(id);
  }

  async approveSkill(id: string): Promise<Skill> {
    if (this.brain) {
      return this.brain.approveSkill(id);
    }
    const skill = await this.storage.getSkill(id);
    if (!skill) {
      throw new Error(`Skill not found: ${id}`);
    }
    if (skill.status !== 'pending_approval') {
      throw new Error(`Skill is not pending approval (status: ${skill.status})`);
    }
    return this.storage.updateSkill(id, { status: 'active' });
  }

  async rejectSkill(id: string): Promise<void> {
    if (this.brain) {
      await this.brain.rejectSkill(id);
      return;
    }
    const skill = await this.storage.getSkill(id);
    if (!skill) {
      throw new Error(`Skill not found: ${id}`);
    }
    if (skill.status !== 'pending_approval') {
      throw new Error(`Skill is not pending approval (status: ${skill.status})`);
    }
    await this.storage.deleteSkill(id);
  }

  // ── Users ──────────────────────────────────────────────────

  async getUser(id: string): Promise<UserProfile | null> {
    return this.storage.getUser(id);
  }

  async getUserByName(name: string): Promise<UserProfile | null> {
    return this.storage.getUserByName(name);
  }

  async getOwner(): Promise<UserProfile | null> {
    return this.storage.getOwner();
  }

  async createUser(data: UserProfileCreate): Promise<UserProfile> {
    return this.storage.createUser(data);
  }

  async updateUser(id: string, data: UserProfileUpdate): Promise<UserProfile> {
    return this.storage.updateUser(id, data);
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.storage.deleteUser(id);
  }

  async listUsers(): Promise<UserProfile[]> {
    return this.storage.listUsers();
  }

  // ── Learning ────────────────────────────────────────────────

  async proposeSkill(data: Omit<SkillCreate, 'source' | 'status'>): Promise<Skill> {
    if (!this.config.learningMode.includes('ai_proposed')) {
      throw new Error('AI-proposed learning mode is not enabled');
    }
    return this.createSkill({
      ...data,
      source: 'ai_proposed',
      status: 'pending_approval',
      enabled: false,
    });
  }

  async learnSkill(data: Omit<SkillCreate, 'source' | 'status'>): Promise<Skill> {
    if (!this.config.learningMode.includes('autonomous')) {
      throw new Error('Autonomous learning mode is not enabled');
    }
    return this.createSkill({
      ...data,
      source: 'ai_learned',
      status: 'active',
      enabled: true,
    });
  }

  async incrementSkillUsage(skillId: string): Promise<void> {
    if (this.brain) {
      await this.brain.incrementSkillUsage(skillId);
      return;
    }
    await this.storage.incrementUsage(skillId);
  }

  // ── Body / Heart ──────────────────────────────────────────────

  setHeart(heart: HeartManager): void {
    this.heartManager = heart;
  }

  setHeartbeat(hb: HeartbeatManager): void {
    this.heartbeat = hb;
    this.heartManager = new HeartManager(hb);
  }

  private composeBodyPrompt(personality: Personality | null): string {
    const bodyEnabled = personality?.body?.enabled ?? false;
    if (!bodyEnabled && !this.heartManager && !this.heartbeat) return '';

    const lines: string[] = [
      '## Body',
      'Your Body is your form — the vessel and capabilities through which you act in the world.',
    ];

    // Capabilities — show enabled/disabled from personality config
    const allCapabilities = ['vision', 'limb_movement', 'auditory', 'haptic'] as const;
    const enabledCaps = personality?.body?.capabilities ?? [];
    const capLines: string[] = [];
    for (const cap of allCapabilities) {
      const status = enabledCaps.includes(cap) ? 'enabled' : 'disabled';
      capLines.push(`- **${cap}**: ${status}`);
    }
    lines.push('');
    lines.push('### Capabilities');
    lines.push(...capLines);

    // MCP Connections — list selected servers and feature toggles
    const selectedServers = personality?.body?.selectedServers ?? [];
    const mcpFeatures = personality?.body?.mcpFeatures ?? {
      exposeGit: false,
      exposeFilesystem: false,
      exposeWeb: false,
      exposeWebScraping: false,
      exposeWebSearch: false,
      exposeBrowser: false,
    };
    if (selectedServers.length > 0) {
      lines.push('');
      lines.push('### MCP Connections');
      lines.push(`Connected servers: ${selectedServers.join(', ')}`);
      const webParts: string[] = [];
      if (mcpFeatures.exposeWeb) {
        const webSubs: string[] = [];
        if (mcpFeatures.exposeWebScraping) webSubs.push('scraping');
        if (mcpFeatures.exposeWebSearch) webSubs.push('search');
        webParts.push(webSubs.length > 0 ? `enabled (${webSubs.join(', ')})` : 'enabled');
      } else {
        webParts.push('disabled');
      }
      lines.push(
        `Tool categories — Git: ${mcpFeatures.exposeGit ? 'enabled' : 'disabled'}, Filesystem: ${mcpFeatures.exposeFilesystem ? 'enabled' : 'disabled'}, Web: ${webParts[0]}, Browser: ${mcpFeatures.exposeBrowser ? 'enabled' : 'disabled'}`
      );
    }

    // Creation Permissions
    const creation = personality?.body?.creationConfig;
    if (creation) {
      const perms = Object.entries(creation)
        .map(([k, v]) => `${k}: ${v ? 'allowed' : 'denied'}`)
        .join(', ');
      lines.push('');
      lines.push('### Creation Permissions');
      lines.push(perms);
    }

    // Heart subsection
    if (this.heartManager) {
      const heartPrompt = this.heartManager.composeHeartPrompt();
      if (heartPrompt) {
        lines.push('');
        lines.push(heartPrompt);
      }
    } else if (this.heartbeat) {
      // Fallback for direct heartbeat usage (backward compat)
      const status = this.heartbeat.getStatus();
      const lastBeat = status.lastBeat;
      if (lastBeat) {
        lines.push('');
        lines.push('### Heart');
        lines.push('Your Heart is your pulse — the vital rhythms that sustain you.');
        lines.push('');
        lines.push(
          `Heartbeat #${status.beatCount} at ${new Date(lastBeat.timestamp).toISOString()} (${lastBeat.durationMs}ms):`
        );
        for (const check of lastBeat.checks) {
          const tag = check.status === 'ok' ? 'ok' : check.status === 'warning' ? 'WARN' : 'ERR';
          lines.push(`- ${check.name}: [${tag}] ${check.message}`);
        }
      }
    }

    return lines.join('\n');
  }

  // ── Composition ─────────────────────────────────────────────

  async composeSoulPrompt(input?: string, personalityId?: string): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    const parts: string[] = [];

    const personality = personalityId
      ? ((await this.storage.getPersonality(personalityId)) ??
        (await this.storage.getActivePersonality()))
      : await this.storage.getActivePersonality();

    // Sacred archetypes — cosmological foundation (toggleable per personality)
    const includeArchetypes = personality?.includeArchetypes ?? true;
    if (includeArchetypes) {
      parts.push(composeArchetypesPreamble());
    }

    // Soul section — identity (personality is the sole source of identity)
    if (personality) {
      const soulLines: string[] = [
        '## Soul',
        'Your Soul is your unchanging identity — the core of who you are, from which all else flows.',
        '',
        `You are ${personality.name}. ${personality.systemPrompt}`.trim(),
      ];

      if (personality.sex !== 'unspecified') {
        soulLines.push(`Sex: ${personality.sex}`);
      }

      if (personality.voice) {
        soulLines.push(`Voice style: ${personality.voice}`);
      }

      if (personality.preferredLanguage) {
        soulLines.push(`Preferred language: ${personality.preferredLanguage}`);
      }

      const traitEntries = Object.entries(personality.traits);
      if (traitEntries.length > 0) {
        const traitStr = traitEntries.map(([k, v]) => `${k}: ${v}`).join(', ');
        soulLines.push(`Traits: ${traitStr}`);
      }

      parts.push(soulLines.join('\n'));
    }

    // User context injection
    const owner = await this.storage.getOwner();
    if (owner) {
      const userParts: string[] = [`Owner: ${owner.name}`];
      if (owner.nickname) userParts.push(`Nickname: ${owner.nickname}`);
      if (owner.notes) userParts.push(`Notes: ${owner.notes}`);
      const prefEntries = Object.entries(owner.preferences);
      if (prefEntries.length > 0) {
        userParts.push('Preferences: ' + prefEntries.map(([k, v]) => `${k}: ${v}`).join(', '));
      }
      parts.push('## User Context\n' + userParts.join('\n'));
    }

    // Spirit context injection (passions, inspirations, pains)
    if (this.spirit) {
      const spiritPrompt = await this.spirit.composeSpiritPrompt();
      if (spiritPrompt) {
        parts.push(spiritPrompt);
      }
    }

    // Brain context injection
    if (this.brain && input) {
      const context = await this.brain.getRelevantContext(input);
      if (context) {
        parts.push(context);
      }
    }

    // Body vital signs injection
    const bodyPrompt = this.composeBodyPrompt(personality);
    if (bodyPrompt) {
      parts.push(bodyPrompt);
    }

    // Skills from Brain or Soul storage — filter to this personality + global skills
    const skills = this.brain
      ? await this.brain.getActiveSkills(personality?.id ?? null)
      : await this.storage.getEnabledSkills();

    for (const skill of skills) {
      if (skill.instructions) {
        parts.push(`## Skill: ${skill.name}\n${skill.instructions}`);
      }
    }

    let prompt = parts.join('\n\n');

    // Token cap: estimate ~4 chars per token
    const maxChars = this.config.maxPromptTokens * 4;
    if (prompt.length > maxChars) {
      prompt = prompt.slice(0, maxChars);
    }

    return prompt;
  }

  async getActiveTools(): Promise<Tool[]> {
    if (!this.config.enabled) {
      return [];
    }

    if (this.brain) {
      return this.brain.getActiveTools();
    }

    const skills = await this.storage.getEnabledSkills();
    const tools: Tool[] = [];
    for (const skill of skills) {
      if (skill.tools && skill.tools.length > 0) {
        tools.push(...skill.tools);
      }
    }
    return tools;
  }

  // ── Config ──────────────────────────────────────────────────

  getConfig(): SoulConfig {
    return this.config;
  }

  // ── Brain Access ────────────────────────────────────────────

  getBrain(): BrainManager | null {
    return this.brain;
  }

  // ── Spirit Access ──────────────────────────────────────────

  getSpirit(): SpiritManager | null {
    return this.spirit;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  close(): void {
    this.storage.close();
  }
}
