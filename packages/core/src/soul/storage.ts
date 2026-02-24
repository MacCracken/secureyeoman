/**
 * Soul Storage — PostgreSQL-backed storage for personalities, users, and skills.
 *
 * Extends PgBaseStorage for shared pool access, async methods, and transactions.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type {
  Personality,
  PersonalityCreate,
  PersonalityUpdate,
  Skill,
  SkillCreate,
  SkillUpdate,
  SoulConfig,
  UserProfile,
  UserProfileCreate,
  UserProfileUpdate,
} from './types.js';
import type { SkillFilter } from './types.js';
import { uuidv7 } from '../utils/crypto.js';

interface PersonalityRow {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  traits: Record<string, string>;
  sex: string;
  voice: string;
  preferred_language: string;
  default_model: Personality['defaultModel'] | null;
  model_fallbacks: Personality['modelFallbacks'];
  include_archetypes: boolean;
  is_active: boolean;
  is_default: boolean;
  is_archetype: boolean;
  body: Personality['body'];
  created_at: number;
  updated_at: number;
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: unknown[];
  trigger_patterns: string[];
  use_when: string;
  do_not_use_when: string;
  success_criteria: string;
  mcp_tools_allowed: string[];
  routing: string;
  linked_workflow_id: string | null;
  enabled: boolean;
  source: string;
  status: string;
  usage_count: number;
  invoked_count: number;
  last_used_at: number | null;
  personality_id: string | null;
  created_at: number;
  updated_at: number;
}

interface UserRow {
  id: string;
  name: string;
  nickname: string;
  relationship: string;
  preferences: Record<string, string>;
  notes: string;
  created_at: number;
  updated_at: number;
}

function rowToPersonality(row: PersonalityRow): Personality {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    traits: row.traits ?? {},
    sex: row.sex as Personality['sex'],
    voice: row.voice,
    preferredLanguage: row.preferred_language,
    defaultModel: row.default_model ?? null,
    modelFallbacks: row.model_fallbacks ?? [],
    includeArchetypes: row.include_archetypes,
    isActive: row.is_active,
    isDefault: row.is_default ?? false,
    isArchetype: row.is_archetype ?? false,
    body: row.body ?? {
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
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    relationship: row.relationship as UserProfile['relationship'],
    preferences: row.preferences ?? {},
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    tools: (row.tools ?? []) as Skill['tools'],
    triggerPatterns: row.trigger_patterns ?? [],
    // Routing quality (Phase 44)
    useWhen: row.use_when ?? '',
    doNotUseWhen: row.do_not_use_when ?? '',
    successCriteria: row.success_criteria ?? '',
    mcpToolsAllowed: (row.mcp_tools_allowed ?? []) as string[],
    routing: (row.routing ?? 'fuzzy') as Skill['routing'],
    linkedWorkflowId: row.linked_workflow_id ?? null,
    // ADR 021: Skill Actions
    actions: [],
    // ADR 022: Skill Triggers
    triggers: [],
    // Dependencies
    dependencies: [],
    provides: [],
    // Security
    requireApproval: false,
    allowedPermissions: [],
    enabled: row.enabled,
    source: row.source as Skill['source'],
    status: row.status as Skill['status'],
    usageCount: row.usage_count,
    invokedCount: row.invoked_count ?? 0,
    lastUsedAt: row.last_used_at,
    personalityId: row.personality_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SoulStorage extends PgBaseStorage {
  // ── Personalities ─────────────────────────────────────────────

  async createPersonality(
    data: PersonalityCreate,
    opts?: { isArchetype?: boolean }
  ): Promise<Personality> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO soul.personalities (id, name, description, system_prompt, traits, sex, voice, preferred_language, default_model, model_fallbacks, include_archetypes, is_active, is_default, is_archetype, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16, $17)`,
      [
        id,
        data.name,
        data.description ?? '',
        data.systemPrompt ?? '',
        JSON.stringify(data.traits ?? {}),
        data.sex ?? 'unspecified',
        data.voice ?? '',
        data.preferredLanguage ?? '',
        data.defaultModel ? JSON.stringify(data.defaultModel) : null,
        JSON.stringify(data.modelFallbacks ?? []),
        data.includeArchetypes ?? true,
        false,
        false,
        opts?.isArchetype ?? false,
        JSON.stringify(
          data.body ?? {
            enabled: false,
            capabilities: [],
            heartEnabled: true,
            creationConfig: {
              skills: false,
              tasks: false,
              personalities: false,
              experiments: false,
            },
          }
        ),
        now,
        now,
      ]
    );

    const result = await this.getPersonality(id);
    if (!result) throw new Error(`Failed to retrieve personality after insert: ${id}`);
    return result;
  }

  async getPersonality(id: string): Promise<Personality | null> {
    const row = await this.queryOne<PersonalityRow>(
      'SELECT * FROM soul.personalities WHERE id = $1',
      [id]
    );
    return row ? rowToPersonality(row) : null;
  }

  async getActivePersonality(): Promise<Personality | null> {
    const row = await this.queryOne<PersonalityRow>(
      'SELECT * FROM soul.personalities WHERE is_default = true LIMIT 1'
    );
    return row ? rowToPersonality(row) : null;
  }

  async setActivePersonality(id: string): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('UPDATE soul.personalities SET is_active = false WHERE is_active = true');
      await client.query('UPDATE soul.personalities SET is_default = false WHERE is_default = true');
      const result = await client.query(
        'UPDATE soul.personalities SET is_active = true, is_default = true, updated_at = $1 WHERE id = $2',
        [Date.now(), id]
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new Error(`Personality not found: ${id}`);
      }
    });
  }

  async enablePersonality(id: string): Promise<void> {
    const result = await this.execute(
      'UPDATE soul.personalities SET is_active = true, updated_at = $1 WHERE id = $2',
      [Date.now(), id]
    );
    if (result === 0) {
      throw new Error(`Personality not found: ${id}`);
    }
  }

  async disablePersonality(id: string): Promise<void> {
    const result = await this.execute(
      'UPDATE soul.personalities SET is_active = false, updated_at = $1 WHERE id = $2',
      [Date.now(), id]
    );
    if (result === 0) {
      throw new Error(`Personality not found: ${id}`);
    }
  }

  async setDefaultPersonality(id: string): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('UPDATE soul.personalities SET is_default = false WHERE is_default = true');
      const result = await client.query(
        'UPDATE soul.personalities SET is_default = true, updated_at = $1 WHERE id = $2',
        [Date.now(), id]
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new Error(`Personality not found: ${id}`);
      }
    });
  }

  async clearDefaultPersonality(): Promise<void> {
    await this.execute(
      'UPDATE soul.personalities SET is_default = false WHERE is_default = true'
    );
  }

  async getEnabledPersonalities(): Promise<Personality[]> {
    const rows = await this.queryMany<PersonalityRow>(
      'SELECT * FROM soul.personalities WHERE is_active = true ORDER BY created_at DESC'
    );
    return rows.map(rowToPersonality);
  }

  async updatePersonality(id: string, data: PersonalityUpdate): Promise<Personality> {
    const existing = await this.getPersonality(id);
    if (!existing) {
      throw new Error(`Personality not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE soul.personalities SET
         name = $1,
         description = $2,
         system_prompt = $3,
         traits = $4::jsonb,
         sex = $5,
         voice = $6,
         preferred_language = $7,
         default_model = $8::jsonb,
         model_fallbacks = $9::jsonb,
         include_archetypes = $10,
         body = $11::jsonb,
         updated_at = $12
       WHERE id = $13`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.systemPrompt ?? existing.systemPrompt,
        JSON.stringify(data.traits ?? existing.traits),
        data.sex ?? existing.sex,
        data.voice ?? existing.voice,
        data.preferredLanguage ?? existing.preferredLanguage,
        data.defaultModel !== undefined
          ? data.defaultModel
            ? JSON.stringify(data.defaultModel)
            : null
          : existing.defaultModel
            ? JSON.stringify(existing.defaultModel)
            : null,
        JSON.stringify(
          data.modelFallbacks !== undefined ? data.modelFallbacks : existing.modelFallbacks
        ),
        data.includeArchetypes !== undefined ? data.includeArchetypes : existing.includeArchetypes,
        JSON.stringify(
          data.body ??
            existing.body ?? {
              enabled: false,
              capabilities: [],
              heartEnabled: true,
              creationConfig: {
                skills: false,
                tasks: false,
                personalities: false,
                experiments: false,
              },
            }
        ),
        now,
        id,
      ]
    );

    const result = await this.getPersonality(id);
    if (!result) throw new Error(`Failed to retrieve personality after update: ${id}`);
    return result;
  }

  async deletePersonality(id: string): Promise<boolean> {
    const existing = await this.getPersonality(id);
    if (existing?.isArchetype) {
      throw new Error('Cannot delete a system archetype personality.');
    }
    const count = await this.execute('DELETE FROM soul.personalities WHERE id = $1', [id]);
    return count > 0;
  }

  async listPersonalities(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ personalities: Personality[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM soul.personalities'
    );

    const rows = await this.queryMany<PersonalityRow>(
      'SELECT * FROM soul.personalities ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return {
      personalities: rows.map(rowToPersonality),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async getPersonalityCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM soul.personalities'
    );
    return Number(row?.count ?? 0);
  }

  // ── Skills ────────────────────────────────────────────────────

  async createSkill(data: SkillCreate): Promise<Skill> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO soul.skills (id, name, description, instructions, tools, trigger_patterns, use_when, do_not_use_when, success_criteria, mcp_tools_allowed, routing, linked_workflow_id, enabled, source, status, personality_id, usage_count, invoked_count, last_used_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, 0, 0, NULL, $17, $18)`,
      [
        id,
        data.name,
        data.description ?? '',
        data.instructions ?? '',
        JSON.stringify(data.tools ?? []),
        JSON.stringify(data.triggerPatterns ?? []),
        data.useWhen ?? '',
        data.doNotUseWhen ?? '',
        data.successCriteria ?? '',
        JSON.stringify(data.mcpToolsAllowed ?? []),
        data.routing ?? 'fuzzy',
        data.linkedWorkflowId ?? null,
        data.enabled ?? true,
        data.source ?? 'user',
        data.status ?? 'active',
        data.personalityId ?? null,
        now,
        now,
      ]
    );

    const result = await this.getSkill(id);
    if (!result) throw new Error(`Failed to retrieve skill after insert: ${id}`);
    return result;
  }

  async getSkill(id: string): Promise<Skill | null> {
    const row = await this.queryOne<SkillRow>('SELECT * FROM soul.skills WHERE id = $1', [id]);
    return row ? rowToSkill(row) : null;
  }

  async updateSkill(id: string, data: SkillUpdate): Promise<Skill> {
    const existing = await this.getSkill(id);
    if (!existing) {
      throw new Error(`Skill not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE soul.skills SET
         name = $1,
         description = $2,
         instructions = $3,
         tools = $4::jsonb,
         trigger_patterns = $5::jsonb,
         use_when = $6,
         do_not_use_when = $7,
         success_criteria = $8,
         mcp_tools_allowed = $9::jsonb,
         routing = $10,
         linked_workflow_id = $11,
         enabled = $12,
         source = $13,
         status = $14,
         updated_at = $15
       WHERE id = $16`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.instructions ?? existing.instructions,
        JSON.stringify(data.tools ?? existing.tools),
        JSON.stringify(data.triggerPatterns ?? existing.triggerPatterns),
        data.useWhen !== undefined ? data.useWhen : existing.useWhen,
        data.doNotUseWhen !== undefined ? data.doNotUseWhen : existing.doNotUseWhen,
        data.successCriteria !== undefined ? data.successCriteria : existing.successCriteria,
        JSON.stringify(data.mcpToolsAllowed !== undefined ? data.mcpToolsAllowed : existing.mcpToolsAllowed),
        data.routing ?? existing.routing,
        data.linkedWorkflowId !== undefined ? data.linkedWorkflowId : existing.linkedWorkflowId,
        data.enabled !== undefined ? data.enabled : existing.enabled,
        data.source ?? existing.source,
        data.status ?? existing.status,
        now,
        id,
      ]
    );

    const result = await this.getSkill(id);
    if (!result) throw new Error(`Failed to retrieve skill after update: ${id}`);
    return result;
  }

  async deleteSkill(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM soul.skills WHERE id = $1', [id]);
    return count > 0;
  }

  async listSkills(
    filter?: SkillFilter & { limit?: number; offset?: number }
  ): Promise<{ skills: Skill[]; total: number }> {
    let sql = 'SELECT * FROM soul.skills WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filter?.status) {
      sql += ` AND status = $${idx++}`;
      params.push(filter.status);
    }
    if (filter?.source) {
      sql += ` AND source = $${idx++}`;
      params.push(filter.source);
    }
    if (filter?.enabled !== undefined) {
      sql += ` AND enabled = $${idx++}`;
      params.push(filter.enabled);
    }

    const countSql = sql.replace('SELECT * FROM', 'SELECT COUNT(*) as count FROM');
    const countResult = await this.queryOne<{ count: string }>(countSql, params);

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    sql += ` ORDER BY usage_count DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;

    const rows = await this.queryMany<SkillRow>(sql, [...params, limit, offset]);
    return {
      skills: rows.map(rowToSkill),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async getEnabledSkills(): Promise<Skill[]> {
    const rows = await this.queryMany<SkillRow>(
      "SELECT * FROM soul.skills WHERE enabled = true AND status = 'active' ORDER BY usage_count DESC, created_at DESC"
    );
    return rows.map(rowToSkill);
  }

  async getPendingSkills(): Promise<Skill[]> {
    const rows = await this.queryMany<SkillRow>(
      "SELECT * FROM soul.skills WHERE status = 'pending_approval' ORDER BY created_at DESC"
    );
    return rows.map(rowToSkill);
  }

  async incrementUsage(skillId: string): Promise<void> {
    await this.execute(
      'UPDATE soul.skills SET usage_count = usage_count + 1, last_used_at = $1 WHERE id = $2',
      [Date.now(), skillId]
    );
  }

  async incrementInvoked(skillId: string): Promise<void> {
    await this.execute(
      'UPDATE soul.skills SET invoked_count = invoked_count + 1 WHERE id = $1',
      [skillId]
    );
  }

  async getSkillCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM soul.skills');
    return Number(row?.count ?? 0);
  }

  // ── Soul Meta ───────────────────────────────────────────────────

  async getAgentName(): Promise<string | null> {
    const row = await this.queryOne<{ value: string }>(
      "SELECT value FROM soul.meta WHERE key = 'agent_name'"
    );
    return row?.value ?? null;
  }

  async setAgentName(name: string): Promise<void> {
    await this.execute(
      `INSERT INTO soul.meta (key, value, updated_at) VALUES ('agent_name', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = $1, updated_at = $2`,
      [name, Date.now()]
    );
  }

  async getSoulConfigOverrides(): Promise<Partial<SoulConfig>> {
    const row = await this.queryOne<{ value: string }>(
      "SELECT value FROM soul.meta WHERE key = 'soul_config'"
    );
    if (!row?.value) return {};
    try {
      return JSON.parse(row.value) as Partial<SoulConfig>;
    } catch {
      return {};
    }
  }

  async setSoulConfigOverrides(overrides: Partial<SoulConfig>): Promise<void> {
    await this.execute(
      `INSERT INTO soul.meta (key, value, updated_at) VALUES ('soul_config', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = $1, updated_at = $2`,
      [JSON.stringify(overrides), Date.now()]
    );
  }

  // ── Users ───────────────────────────────────────────────────

  async createUser(data: UserProfileCreate): Promise<UserProfile> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO soul.users (id, name, nickname, relationship, preferences, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        id,
        data.name,
        data.nickname ?? '',
        data.relationship ?? 'user',
        JSON.stringify(data.preferences ?? {}),
        data.notes ?? '',
        now,
        now,
      ]
    );

    const result = await this.getUser(id);
    if (!result) throw new Error(`Failed to retrieve user after insert: ${id}`);
    return result;
  }

  async getUser(id: string): Promise<UserProfile | null> {
    const row = await this.queryOne<UserRow>('SELECT * FROM soul.users WHERE id = $1', [id]);
    return row ? rowToUser(row) : null;
  }

  async getUserByName(name: string): Promise<UserProfile | null> {
    const row = await this.queryOne<UserRow>(
      'SELECT * FROM soul.users WHERE name ILIKE $1 LIMIT 1',
      [name]
    );
    return row ? rowToUser(row) : null;
  }

  async getOwner(): Promise<UserProfile | null> {
    const row = await this.queryOne<UserRow>(
      "SELECT * FROM soul.users WHERE relationship = 'owner' LIMIT 1"
    );
    return row ? rowToUser(row) : null;
  }

  async updateUser(id: string, data: UserProfileUpdate): Promise<UserProfile> {
    const existing = await this.getUser(id);
    if (!existing) {
      throw new Error(`User not found: ${id}`);
    }

    const now = Date.now();
    await this.execute(
      `UPDATE soul.users SET
         name = $1,
         nickname = $2,
         relationship = $3,
         preferences = $4::jsonb,
         notes = $5,
         updated_at = $6
       WHERE id = $7`,
      [
        data.name ?? existing.name,
        data.nickname ?? existing.nickname,
        data.relationship ?? existing.relationship,
        JSON.stringify(data.preferences ?? existing.preferences),
        data.notes ?? existing.notes,
        now,
        id,
      ]
    );

    const result = await this.getUser(id);
    if (!result) throw new Error(`Failed to retrieve user after update: ${id}`);
    return result;
  }

  async deleteUser(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM soul.users WHERE id = $1', [id]);
    return count > 0;
  }

  async listUsers(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ users: UserProfile[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM soul.users'
    );

    const rows = await this.queryMany<UserRow>(
      'SELECT * FROM soul.users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return {
      users: rows.map(rowToUser),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  // ── Collab Docs ────────────────────────────────────────────

  async saveCollabDoc(docId: string, stateBytes: Uint8Array): Promise<void> {
    await this.execute(
      `INSERT INTO soul.collab_docs (doc_id, state, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (doc_id) DO UPDATE SET state = $2, updated_at = $3`,
      [docId, Buffer.from(stateBytes), Date.now()]
    );
  }

  async loadCollabDoc(docId: string): Promise<Uint8Array | null> {
    const row = await this.queryOne<{ state: Buffer }>(
      'SELECT state FROM soul.collab_docs WHERE doc_id = $1',
      [docId]
    );
    return row ? new Uint8Array(row.state) : null;
  }
}
