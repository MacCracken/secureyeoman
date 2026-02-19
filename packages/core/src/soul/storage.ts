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
  enabled: boolean;
  source: string;
  status: string;
  usage_count: number;
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
    lastUsedAt: row.last_used_at,
    personalityId: row.personality_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SoulStorage extends PgBaseStorage {
  // ── Personalities ─────────────────────────────────────────────

  async createPersonality(data: PersonalityCreate): Promise<Personality> {
    const now = Date.now();
    const id = uuidv7();

    await this.query(
      `INSERT INTO soul.personalities (id, name, description, system_prompt, traits, sex, voice, preferred_language, default_model, model_fallbacks, include_archetypes, is_active, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15)`,
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
      'SELECT * FROM soul.personalities WHERE is_active = true LIMIT 1'
    );
    return row ? rowToPersonality(row) : null;
  }

  async setActivePersonality(id: string): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query('UPDATE soul.personalities SET is_active = false WHERE is_active = true');
      const result = await client.query(
        'UPDATE soul.personalities SET is_active = true, updated_at = $1 WHERE id = $2',
        [Date.now(), id]
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new Error(`Personality not found: ${id}`);
      }
    });
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
        JSON.stringify(data.modelFallbacks !== undefined ? data.modelFallbacks : existing.modelFallbacks),
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
    const count = await this.execute('DELETE FROM soul.personalities WHERE id = $1', [id]);
    return count > 0;
  }

  async listPersonalities(): Promise<Personality[]> {
    const rows = await this.queryMany<PersonalityRow>(
      'SELECT * FROM soul.personalities ORDER BY created_at DESC'
    );
    return rows.map(rowToPersonality);
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
      `INSERT INTO soul.skills (id, name, description, instructions, tools, trigger_patterns, enabled, source, status, personality_id, usage_count, last_used_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, 0, NULL, $11, $12)`,
      [
        id,
        data.name,
        data.description ?? '',
        data.instructions ?? '',
        JSON.stringify(data.tools ?? []),
        JSON.stringify(data.triggerPatterns ?? []),
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
         enabled = $6,
         source = $7,
         status = $8,
         updated_at = $9
       WHERE id = $10`,
      [
        data.name ?? existing.name,
        data.description ?? existing.description,
        data.instructions ?? existing.instructions,
        JSON.stringify(data.tools ?? existing.tools),
        JSON.stringify(data.triggerPatterns ?? existing.triggerPatterns),
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

  async listSkills(filter?: SkillFilter): Promise<Skill[]> {
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

    sql += ' ORDER BY usage_count DESC, created_at DESC';

    const rows = await this.queryMany<SkillRow>(sql, params);
    return rows.map(rowToSkill);
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

  async listUsers(): Promise<UserProfile[]> {
    const rows = await this.queryMany<UserRow>('SELECT * FROM soul.users ORDER BY created_at DESC');
    return rows.map(rowToUser);
  }
}
