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

import os from 'os';
import { SoulConfigSchema } from '@secureyeoman/shared';
import { composeArchetypesPreamble } from './archetypes.js';
import { PERSONALITY_PRESETS, getPersonalityPreset, type PersonalityPreset } from './presets.js';
import type { SoulStorage } from './storage.js';
import type { BrainManager } from '../brain/manager.js';
import type { MarketplaceManager } from '../marketplace/manager.js';
import type { DynamicToolManager } from './dynamic-tool-manager.js';
import type { IntentManager } from '../intent/manager.js';
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
import { applySkillTrustFilter } from './skill-trust.js';
import { getCreationTools } from './creation-tools.js';

/**
 * Returns true when the current wall-clock time falls within the personality's
 * configured activeHours window. Always returns false when activeHours is disabled.
 */
export function isPersonalityWithinActiveHours(p: Personality): boolean {
  const ah = p.body?.activeHours;
  if (!ah?.enabled) return false;
  const now = new Date();
  const tz = ah.timezone ?? 'UTC';
  const dayAbbr = now
    .toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' })
    .toLowerCase()
    .slice(0, 3); // 'mon', 'tue', ...
  if (!ah.daysOfWeek.includes(dayAbbr as (typeof ah.daysOfWeek)[number])) return false;
  const hhmm = now
    .toLocaleTimeString('en-US', { timeZone: tz, hour12: false })
    .slice(0, 5); // 'HH:MM'
  return hhmm >= ah.start && hhmm <= ah.end;
}

// Compiled RegExp cache — patterns are stable after DB load, so we compile once.
const triggerPatternCache = new Map<string, RegExp | null>();

function compileTriggerPattern(pattern: string): RegExp | null {
  if (triggerPatternCache.has(pattern)) return triggerPatternCache.get(pattern)!;
  let re: RegExp | null;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    re = null;
  }
  triggerPatternCache.set(pattern, re);
  return re;
}

/**
 * Returns true when the user message is relevant to the given skill.
 *
 * Matching priority:
 *  1. triggerPatterns — each entry is tried as a RegExp (case-insensitive);
 *     falls back to plain substring if the pattern is invalid.
 *  2. Skill-name keyword fallback — words from the skill name longer than
 *     3 chars are matched as substrings in the message.
 */
function isSkillInContext(skill: Skill, message: string): boolean {
  if (skill.triggerPatterns.length > 0) {
    return skill.triggerPatterns.some((pattern) => {
      const re = compileTriggerPattern(pattern);
      return re ? re.test(message) : message.toLowerCase().includes(pattern.toLowerCase());
    });
  }
  // Keyword fallback: significant words from the skill name
  const words = skill.name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const msg = message.toLowerCase();
  return words.some((w) => msg.includes(w));
}

/**
 * Expands the {{output_dir}} template variable in skill instructions.
 * Resolves to `outputs/{skill-slug}/{iso-date}/`.
 */
function expandOutputDir(skill: Skill): string {
  const slug = skill.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const isoDate = new Date().toISOString().slice(0, 10);
  return skill.instructions.replace(/\{\{output_dir\}\}/g, `outputs/${slug}/${isoDate}/`);
}

export class SoulManager {
  private readonly storage: SoulStorage;
  private readonly brain: BrainManager | null;
  private readonly spirit: SpiritManager | null;
  private readonly baseConfig: SoulConfig;
  private config: SoulConfig;
  private readonly deps: SoulManagerDeps;
  private heartbeat: HeartbeatManager | null = null;
  private heartManager: HeartManager | null = null;
  private marketplace: MarketplaceManager | null = null;
  private dynamicToolManager: DynamicToolManager | null = null;
  private intentManager: IntentManager | null = null;

  setMarketplaceManager(manager: MarketplaceManager): void {
    this.marketplace = manager;
  }

  /**
   * Wire in the DynamicToolManager so that registered dynamic tool schemas are
   * injected into the AI context by getActiveTools().
   */
  setDynamicToolManager(manager: DynamicToolManager): void {
    this.dynamicToolManager = manager;
  }

  setIntentManager(manager: IntentManager): void {
    this.intentManager = manager;
  }

  constructor(
    storage: SoulStorage,
    config: SoulConfig,
    deps: SoulManagerDeps,
    brain?: BrainManager,
    spirit?: SpiritManager
  ) {
    this.storage = storage;
    this.baseConfig = config;
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
      injectDateTime: false,
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
          workflows: false,
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
          exposeDesktopControl: false,
          exposeNetworkDevices: false,
          exposeNetworkDiscovery: false,
          exposeNetworkAudit: false,
          exposeNetBox: false,
          exposeNvd: false,
          exposeNetworkUtils: false,
          exposeTwingate: false,
        },
        proactiveConfig: {
          enabled: false,
          builtins: {
            dailyStandup: false,
            weeklySummary: false,
            contextualFollowup: false,
            integrationHealthAlert: false,
            securityAlertDigest: false,
          },
          builtinModes: {
            dailyStandup: 'auto',
            weeklySummary: 'suggest',
            contextualFollowup: 'suggest',
            integrationHealthAlert: 'auto',
            securityAlertDigest: 'suggest',
          },
          learning: { enabled: true, minConfidence: 0.7 },
        },
        activeHours: {
          enabled: false,
          start: '09:00',
          end: '17:00',
          daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
          timezone: 'UTC',
        },
        omnipresentMind: false,
      },
    }, { isArchetype: true });

    await this.storage.setActivePersonality(personality.id);
    return (await this.storage.getPersonality(personality.id))!;
  }

  /**
   * Seeds all available personality presets on first boot.
   *
   * The first preset (FRIDAY) is created as the active personality, honouring
   * the configured agent name. All other presets are created as inactive so they
   * are immediately available for selection in the UI without manual instantiation.
   */
  async seedAvailablePresets(): Promise<Personality[]> {
    const agentName = (await this.storage.getAgentName()) ?? 'FRIDAY';
    const created: Personality[] = [];

    const [firstPreset, ...restPresets] = PERSONALITY_PRESETS;

    if (firstPreset) {
      // For the primary preset, honour the configured agent name so the
      // active personality matches whatever name was set during onboarding.
      const data: PersonalityCreate = {
        ...firstPreset.data,
        name: agentName,
        systemPrompt: `You are ${agentName}, a helpful and security-conscious AI assistant. You are direct, technically precise, and proactive about identifying risks.`,
        includeArchetypes: agentName === 'FRIDAY',
      injectDateTime: false,
      };
      const personality = await this.storage.createPersonality(data, { isArchetype: true });
      created.push(personality);
    }

    for (const preset of restPresets) {
      const personality = await this.storage.createPersonality(preset.data, { isArchetype: true });
      created.push(personality);
    }

    const first = created[0];
    if (first) {
      await this.storage.setActivePersonality(first.id);
    }

    return created;
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

  async createPersonality(
    data: PersonalityCreate,
    opts?: { isArchetype?: boolean }
  ): Promise<Personality> {
    return this.storage.createPersonality(data, opts);
  }

  async updatePersonality(id: string, data: PersonalityUpdate): Promise<Personality> {
    return this.storage.updatePersonality(id, data);
  }

  async deletePersonality(id: string): Promise<void> {
    const personality = await this.storage.getPersonality(id);
    if (personality?.isArchetype) {
      throw new Error('Cannot delete a system archetype personality.');
    }
    if (personality?.isActive) {
      throw new Error('Cannot delete the active personality');
    }
    const mode = personality?.body?.resourcePolicy?.deletionMode ?? 'auto';
    if (mode === 'manual') {
      throw new Error(
        'Deletion is blocked (mode: manual). Change the deletion mode in Body → Resources first.'
      );
    }
    // 'request' mode: backend allows deletion; frontend enforces confirmation dialog.
    await this.storage.deletePersonality(id);
  }

  async listPersonalities(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ personalities: Personality[]; total: number }> {
    return this.storage.listPersonalities(opts);
  }

  async enablePersonality(id: string): Promise<void> {
    return this.storage.enablePersonality(id);
  }

  async disablePersonality(id: string): Promise<void> {
    return this.storage.disablePersonality(id);
  }

  async setDefaultPersonality(id: string): Promise<void> {
    await this.storage.setDefaultPersonality(id);
    if (this.heartbeat) {
      const personality = await this.storage.getPersonality(id);
      if (personality) {
        this.heartbeat.setPersonalitySchedule(personality.body?.activeHours ?? null);
      }
      this.heartbeat.setActivePersonalityId(id);
    }
  }

  async clearDefaultPersonality(): Promise<void> {
    await this.storage.clearDefaultPersonality();
    if (this.heartbeat) {
      this.heartbeat.setPersonalitySchedule(null);
      this.heartbeat.setActivePersonalityId(null);
    }
  }

  async getEnabledPersonalities(): Promise<Personality[]> {
    return this.storage.getEnabledPersonalities();
  }

  // ── Personality Presets ─────────────────────────────────────

  listPersonalityPresets(): PersonalityPreset[] {
    return PERSONALITY_PRESETS;
  }

  async createPersonalityFromPreset(
    presetId: string,
    overrides?: Partial<PersonalityCreate>
  ): Promise<Personality> {
    const preset = getPersonalityPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown personality preset: ${presetId}`);
    }
    return this.storage.createPersonality({ ...preset.data, ...overrides });
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
      // Capture skill details before deletion so we can sync marketplace state
      const skill = await this.brain.getSkill(id);
      await this.brain.deleteSkill(id);
      if (skill && this.marketplace) {
        await this.marketplace.onBrainSkillDeleted(skill.name, skill.source);
      }
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

  async listSkills(
    filter?: SkillFilter & { limit?: number; offset?: number }
  ): Promise<{ skills: Skill[]; total: number }> {
    let skills: Skill[];
    let total: number;

    if (this.brain) {
      const brainSkills = await this.brain.listSkills(filter);
      skills = brainSkills;
      total = brainSkills.length;
    } else {
      const result = await this.storage.listSkills(filter);
      skills = result.skills;
      total = result.total;
    }

    const withPersonality = skills.filter((s) => s.personalityId);
    if (withPersonality.length === 0) return { skills, total };

    const { personalities } = await this.storage.listPersonalities();
    const pMap = new Map(personalities.map((p) => [p.id, p.name]));
    return {
      skills: skills.map((s) =>
        s.personalityId ? { ...s, personalityName: pMap.get(s.personalityId) ?? null } : s
      ),
      total,
    };
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

  async listUsers(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserProfile[]; total: number }> {
    return this.storage.listUsers(opts);
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

  async incrementSkillInvoked(skillId: string): Promise<void> {
    await this.storage.incrementInvoked(skillId);
  }

  // ── Body / Heart ──────────────────────────────────────────────

  setHeart(heart: HeartManager): void {
    this.heartManager = heart;
  }

  setHeartbeat(hb: HeartbeatManager): void {
    this.heartbeat = hb;
    this.heartManager = new HeartManager(hb);
    // Sync current default personality ID so log entries are attributed correctly
    this.storage.getActivePersonality().then((p) => {
      if (p) hb.setActivePersonalityId(p.id);
    }).catch(() => { /* non-fatal */ });
  }

  private composeBodyPrompt(personality: Personality | null): string {
    const bodyEnabled = personality?.body?.enabled ?? false;
    if (!bodyEnabled && !this.heartManager && !this.heartbeat) return '';

    const lines: string[] = [
      '## Body',
      'Your Body is your form — the vessel and capabilities through which you act in the world.',
    ];

    // Capabilities — show enabled/disabled from personality config
    const allCapabilities = ['vision', 'limb_movement', 'auditory', 'haptic', 'diagnostics'] as const;
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
      exposeDesktopControl: false,
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

    // Creation Tools — list enabled capabilities with the exact tool names so
    // the model knows how to act without hesitation.
    const creation = personality?.body?.creationConfig;
    if (creation) {
      const TOOL_MAP: Record<string, string[]> = {
        skills: ['create_skill', 'update_skill', 'delete_skill'],
        tasks: ['create_task', 'update_task'],
        personalities: ['create_personality', 'update_personality'],
        subAgents: ['delegate_task', 'list_sub_agents', 'get_delegation_result'],
        customRoles: ['create_custom_role'],
        roleAssignments: ['assign_role'],
        experiments: ['create_experiment'],
        allowA2A: ['a2a_connect', 'a2a_send'],
        allowSwarms: ['create_swarm'],
        allowDynamicTools: ['register_dynamic_tool'],
      };

      const sec = this.deps.securityConfig;
      const enabledLines: string[] = [];
      for (const [key, toolNames] of Object.entries(TOOL_MAP)) {
        // Gate against top-level security policy — if security policy disables a
        // capability, don't tell the AI it has the tools (avoids false reports).
        if (key === 'subAgents' && sec && !sec.allowSubAgents) continue;
        if (key === 'allowA2A' && sec && !sec.allowA2A) continue;
        if (key === 'allowSwarms' && sec && !sec.allowSwarms) continue;
        if (key === 'allowDynamicTools' && sec && !sec.allowDynamicTools) continue;

        if ((creation as Record<string, boolean>)[key]) {
          enabledLines.push(`- **${key}**: use ${toolNames.map((t) => `\`${t}\``).join(', ')}`);
        }
      }

      if (enabledLines.length > 0) {
        lines.push('');
        lines.push('### Creation Tools');
        lines.push(
          'You have been granted the following resource-creation tools. ' +
          'Use them directly and confidently — do not ask for permission before calling them:'
        );
        lines.push(...enabledLines);
      }
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

    // Diagnostics — Channel A: live runtime snapshot injected when capability is enabled
    if (enabledCaps.includes('diagnostics')) {
      const uptimeSec = process.uptime();
      const uptimeStr =
        uptimeSec >= 3600
          ? `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`
          : `${Math.floor(uptimeSec / 60)}m ${Math.floor(uptimeSec % 60)}s`;
      const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const loadAvg = (os.loadavg()[0] ?? 0).toFixed(2);
      const serverCount = personality?.body?.selectedServers?.length ?? 0;
      const integrationCount = personality?.body?.selectedIntegrations?.length ?? 0;

      lines.push('');
      lines.push('### Diagnostics');
      lines.push('Live snapshot of your runtime state (assembled at session start):');
      lines.push('');
      lines.push(`- **uptime**: ${uptimeStr}`);
      lines.push(`- **memory**: ${memMb} MB RSS`);
      lines.push(`- **cpu**: ${loadAvg} (1m load avg)`);
      lines.push(`- **mcp servers**: ${serverCount} connected`);
      lines.push(`- **integrations**: ${integrationCount} connected`);

      const sec = this.deps.securityConfig;
      lines.push('');
      if (sec?.allowSubAgents) {
        lines.push(
          'Sub-agent diagnostic tools: `diag_report_status`, `diag_query_agent`, `diag_ping_integrations`'
        );
      } else {
        lines.push('Integration diagnostic tool: `diag_ping_integrations`');
      }
    }

    // Vision — screen observation via desktop control
    if (enabledCaps.includes('vision')) {
      const sec = this.deps.securityConfig;
      lines.push('');
      lines.push('### Vision');
      if (sec?.allowDesktopControl) {
        lines.push('Screen observation tools (Desktop Control enabled):');
        lines.push('');
        lines.push(
          '- `desktop_screenshot` — capture screen/window/region; returns image + AI interpretation. Use this to observe screen state before acting.'
        );
        lines.push('- `desktop_window_list` — list open windows with IDs, titles, and bounds');
        lines.push('- `desktop_display_list` — list connected monitors');
        if (sec?.allowCamera) {
          lines.push('- `desktop_camera_capture` — capture single camera frame + AI interpretation');
        }
        lines.push('');
        lines.push(
          'Tip: always call `desktop_screenshot` to observe the current screen state before using limb_movement tools.'
        );
      } else {
        lines.push(
          'vision: disabled (Desktop Control not enabled in Security Settings)'
        );
      }
    }

    // Limb movement — keyboard/mouse/clipboard via desktop control
    if (enabledCaps.includes('limb_movement')) {
      const sec = this.deps.securityConfig;
      lines.push('');
      lines.push('### Limb Movement');
      if (sec?.allowDesktopControl) {
        lines.push('Input control tools (Desktop Control enabled):');
        lines.push('');
        lines.push('Window management:');
        lines.push('- `desktop_window_focus` — focus a window by ID');
        lines.push('- `desktop_window_resize` — resize/reposition a window');
        lines.push('');
        lines.push('Mouse control:');
        lines.push('- `desktop_mouse_move` — move cursor to coordinates');
        lines.push('- `desktop_click` — click left/right/middle button (supports double-click)');
        lines.push('- `desktop_scroll` — scroll mouse wheel');
        lines.push('');
        lines.push('Keyboard:');
        lines.push('- `desktop_type` — type text into focused window');
        lines.push(
          "- `desktop_key` — press key combination (e.g., 'ctrl+c', 'shift+tab', 'enter')"
        );
        lines.push('');
        lines.push('Clipboard:');
        lines.push('- `desktop_clipboard_read` — read clipboard content');
        lines.push('- `desktop_clipboard_write` — write text to clipboard');
        lines.push('');
        lines.push(
          '- `desktop_input_sequence` — execute ordered list of input actions atomically (max 50 steps)'
        );
      } else {
        lines.push(
          'limb_movement: disabled (Desktop Control not enabled in Security Settings)'
        );
      }
    }

    return lines.join('\n');
  }

  // ── Composition ─────────────────────────────────────────────

  async composeSoulPrompt(
    input?: string,
    personalityId?: string,
    clientContext?: { viewportHint?: 'mobile' | 'tablet' | 'desktop' }
  ): Promise<string> {
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

    // Date/time context injection (per-personality opt-in)
    if (personality?.injectDateTime) {
      const tz = personality.body?.activeHours?.timezone || 'UTC';
      const now = new Date();
      const dateTimeStr = now.toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
      parts.push(`## Current Date & Time\n${dateTimeStr}`);
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

    // Token cap: per-personality override takes precedence over global config
    const tokenBudget = personality?.body?.maxPromptTokens ?? this.config.maxPromptTokens;
    const maxChars = tokenBudget * 4;

    if (skills.length > 0) {
      // Always include a compact catalog so the AI knows what skills are available
      const catalogLines = skills.map((s) => {
        const desc = s.description?.trim() || s.name;
        let entry = `- **${s.name}**: ${desc}`;
        if (s.useWhen) entry += ` Use when: ${s.useWhen}.`;
        if (s.doNotUseWhen) entry += ` Don't use when: ${s.doNotUseWhen}.`;
        if (s.linkedWorkflowId) entry += ` Triggers workflow: ${s.linkedWorkflowId}.`;
        if (s.routing === 'explicit')
          entry += ` To perform ${s.name} tasks, use the ${s.name} skill.`;
        return entry;
      });
      parts.push(
        `## Available Skills\nYou have access to the following skills. Full instructions are activated when the skill is relevant to the conversation.\n${catalogLines.join('\n')}`
      );
    }

    // Organizational Intent injection (Phase 48)
    if (this.intentManager) {
      const intentCtx = await this.intentManager.composeSoulContext();
      if (intentCtx) {
        parts.push(intentCtx);
      }
    }

    // Build the base prompt (archetypes + soul + context + catalog)
    let prompt = parts.join('\n\n');
    if (prompt.length > maxChars) {
      prompt = prompt.slice(0, maxChars);
    }

    // Determine which skills to fully expand:
    // - With a message: only skills that match the context (triggerPatterns or keyword)
    // - Without a message: all skills (can't be selective without input)
    const skillsToExpand = input ? skills.filter((s) => isSkillInContext(s, input)) : skills;

    // 48.3: Elevate skills linked to active goals — inject full instructions even without keyword match
    if (this.intentManager) {
      const goalSkillSlugs = this.intentManager.getGoalSkillSlugs();
      if (goalSkillSlugs.size > 0) {
        for (const s of skills) {
          if (goalSkillSlugs.has(s.name) && !skillsToExpand.includes(s)) {
            skillsToExpand.push(s);
          }
        }
      }
    }

    // Append full instructions for contextually relevant skills —
    // stop before exceeding the cap (never slice mid-skill)
    for (const skill of skillsToExpand) {
      if (!skill.instructions && !skill.successCriteria) continue;
      const instructions = expandOutputDir(skill);
      let section = `\n\n## Skill: ${skill.name}\n${instructions}`;
      if (skill.mcpToolsAllowed.length > 0)
        section += `\n\n[MCP tool restriction: only ${skill.mcpToolsAllowed.join(', ')} may be used while this skill is active.]`;
      if (skill.successCriteria)
        section += `\n\nSuccess criteria: ${skill.successCriteria}`;
      if (prompt.length + section.length > maxChars) break;
      prompt += section;
      void this.incrementSkillInvoked(skill.id);
    }

    // Viewport hint — appended after skills so it doesn't inflate skill budget
    if (clientContext?.viewportHint) {
      const VIEWPORT_HINTS: Record<string, string> = {
        mobile: '[Interface: mobile — prefer concise responses; avoid wide tables and long code blocks.]',
        tablet: '[Interface: tablet — use moderate formatting width.]',
        desktop: '[Interface: desktop — wide formatting is available; tables and code blocks render well.]',
      };
      const hint = VIEWPORT_HINTS[clientContext.viewportHint];
      if (hint) prompt += `\n\n${hint}`;
    }

    return prompt;
  }

  async getActiveTools(personalityId?: string | null): Promise<Tool[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Resolve personality so we can inject creation tools based on creationConfig.
    // Fall back to active personality when no explicit id is provided.
    const personality = personalityId
      ? ((await this.storage.getPersonality(personalityId)) ??
        (await this.storage.getActivePersonality()))
      : await this.storage.getActivePersonality();

    let skillTools: Tool[];
    if (this.brain) {
      skillTools = await this.brain.getActiveTools(personalityId);
    } else {
      const skills = await this.storage.getEnabledSkills();
      skillTools = [];
      for (const skill of skills) {
        if (!skill.tools || skill.tools.length === 0) continue;
        const filtered = applySkillTrustFilter(skill.tools, skill.source);
        skillTools.push(...filtered);
      }
    }

    // Append creation tools for each creationConfig toggle that is enabled.
    // Only injected when body.enabled is true — a disabled body has no creation
    // capabilities regardless of individual toggle values.
    const bodyEnabled = personality?.body?.enabled ?? false;
    const creationTools = getCreationTools(personality?.body?.creationConfig, bodyEnabled);

    // Inject registered dynamic tool schemas so the AI can call tools that
    // were previously created via register_dynamic_tool.  These are available
    // whenever the DynamicToolManager exists (i.e. allowDynamicTools is on)
    // and the personality body is enabled.
    const dynamicTools =
      bodyEnabled && this.dynamicToolManager ? this.dynamicToolManager.getSchemas() : [];

    return [...skillTools, ...creationTools, ...dynamicTools];
  }

  // ── Config ──────────────────────────────────────────────────

  getConfig(): SoulConfig {
    return this.config;
  }

  async loadConfigOverrides(): Promise<void> {
    const overrides = await this.storage.getSoulConfigOverrides();
    this.config = { ...this.baseConfig, ...overrides };
  }

  async updateConfig(patch: Partial<SoulConfig>): Promise<void> {
    const merged = { ...this.config, ...patch };
    const parsed = SoulConfigSchema.parse(merged);
    this.config = parsed;
    await this.storage.setSoulConfigOverrides(parsed);
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
