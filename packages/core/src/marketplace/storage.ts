/**
 * Marketplace Storage — PostgreSQL local skill registry
 */

import type { MarketplaceSkill, AuthorInfo } from '@secureyeoman/shared';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import {
  summarizeTextSkill,
  veteranFinancialManagerSkill,
  seniorWebDesignerSkill,
  seniorSoftwareEngineerSkill,
  seniorSoftwareEngineerAuditSkill,
  devopsSreSkill,
} from './skills/index.js';

export class MarketplaceStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async addSkill(data: Partial<MarketplaceSkill>): Promise<MarketplaceSkill> {
    const now = Date.now();
    const id = data.id ?? uuidv7();
    const skill: MarketplaceSkill = {
      id,
      name: data.name ?? '',
      description: data.description ?? '',
      version: data.version ?? '1.0.0',
      author: data.author ?? '',
      authorInfo: data.authorInfo,
      category: data.category ?? 'general',
      tags: data.tags ?? [],
      downloadCount: data.downloadCount ?? 0,
      rating: data.rating ?? 0,
      instructions: data.instructions ?? '',
      tools: data.tools ?? [],
      triggerPatterns: data.triggerPatterns ?? [],
      useWhen: data.useWhen ?? '',
      doNotUseWhen: data.doNotUseWhen ?? '',
      successCriteria: data.successCriteria ?? '',
      routing: data.routing ?? 'fuzzy',
      autonomyLevel: data.autonomyLevel ?? 'L1',
      installed: data.installed ?? false,
      installedGlobally: data.installed ?? false,
      source: data.source ?? 'published',
      publishedAt: data.publishedAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    await this.execute(
      `INSERT INTO marketplace.skills
        (id, name, description, version, author, author_info, category, tags, download_count, rating, instructions, tools, trigger_patterns, use_when, do_not_use_when, success_criteria, routing, autonomy_level, installed, source, published_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        id,
        skill.name,
        skill.description,
        skill.version,
        skill.author,
        skill.authorInfo != null ? JSON.stringify(skill.authorInfo) : null,
        skill.category,
        JSON.stringify(skill.tags),
        skill.downloadCount,
        skill.rating,
        skill.instructions,
        JSON.stringify(skill.tools),
        JSON.stringify(skill.triggerPatterns),
        skill.useWhen,
        skill.doNotUseWhen,
        skill.successCriteria,
        skill.routing,
        skill.autonomyLevel,
        skill.installed,
        skill.source,
        skill.publishedAt,
        skill.updatedAt,
      ]
    );
    return skill;
  }

  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM marketplace.skills WHERE id = $1',
      [id]
    );
    return row ? this.rowToSkill(row) : null;
  }

  async findByNameAndSource(name: string, source: string): Promise<MarketplaceSkill | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM marketplace.skills WHERE name = $1 AND source = $2',
      [name, source]
    );
    return row ? this.rowToSkill(row) : null;
  }

  async updateSkill(id: string, data: Partial<MarketplaceSkill>): Promise<boolean> {
    const now = Date.now();
    const changes = await this.execute(
      `UPDATE marketplace.skills SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        version = COALESCE($3, version),
        author = COALESCE($4, author),
        author_info = COALESCE($5, author_info),
        category = COALESCE($6, category),
        tags = COALESCE($7, tags),
        instructions = COALESCE($8, instructions),
        trigger_patterns = COALESCE($9, trigger_patterns),
        use_when = COALESCE($10, use_when),
        do_not_use_when = COALESCE($11, do_not_use_when),
        success_criteria = COALESCE($12, success_criteria),
        routing = COALESCE($13, routing),
        autonomy_level = COALESCE($14, autonomy_level),
        updated_at = $15
       WHERE id = $16`,
      [
        data.name ?? null,
        data.description ?? null,
        data.version ?? null,
        data.author ?? null,
        data.authorInfo != null ? JSON.stringify(data.authorInfo) : null,
        data.category ?? null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.instructions ?? null,
        data.triggerPatterns ? JSON.stringify(data.triggerPatterns) : null,
        data.useWhen ?? null,
        data.doNotUseWhen ?? null,
        data.successCriteria ?? null,
        data.routing ?? null,
        data.autonomyLevel ?? null,
        now,
        id,
      ]
    );
    return changes > 0;
  }

  async search(
    query?: string,
    category?: string,
    limit = 20,
    offset = 0,
    source?: string,
    personalityId?: string
  ): Promise<{ skills: MarketplaceSkill[]; total: number }> {
    let paramIdx = 1;
    let where = ' WHERE 1=1';
    const params: unknown[] = [];

    if (query) {
      where += ` AND (name LIKE $${paramIdx} OR description LIKE $${paramIdx + 1})`;
      params.push(`%${query}%`, `%${query}%`);
      paramIdx += 2;
    }
    if (category) {
      where += ` AND category = $${paramIdx}`;
      params.push(category);
      paramIdx += 1;
    }
    if (source) {
      where += ` AND source = $${paramIdx}`;
      params.push(source);
      paramIdx += 1;
    }

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM marketplace.skills${where}`,
      params
    );
    const total = parseInt(countRow?.count ?? '0', 10);

    const fullSql = `SELECT * FROM marketplace.skills${where} ORDER BY download_count DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const rows = await this.queryMany<Record<string, unknown>>(fullSql, params);
    const skills = rows.map((r) => this.rowToSkill(r));

    if (personalityId !== undefined) {
      const installState = await this.getContextualInstallState(
        skills.map((s) => s.name),
        personalityId
      );
      return {
        skills: skills.map((s) => {
          const state = installState.get(s.name) ?? { installed: false, installedGlobally: false };
          return { ...s, installed: state.installed, installedGlobally: state.installedGlobally };
        }),
        total,
      };
    }

    // No personalityId: use stored boolean, installedGlobally mirrors installed
    return { skills: skills.map((s) => ({ ...s, installedGlobally: s.installed })), total };
  }

  /**
   * Compute contextual install state from brain.skills for a set of skill names.
   * - personalityId = '' (empty): global context — installed only if a personality_id IS NULL record exists.
   * - personalityId = 'X': personality context — installed if a personality_id = X record exists;
   *   installedGlobally if a personality_id IS NULL record exists.
   */
  private async getContextualInstallState(
    skillNames: string[],
    personalityId: string
  ): Promise<Map<string, { installed: boolean; installedGlobally: boolean }>> {
    const result = new Map<string, { installed: boolean; installedGlobally: boolean }>();
    if (skillNames.length === 0) return result;

    if (personalityId === '') {
      // Global context: installed = has a global brain.skills record
      const rows = await this.queryMany<{ name: string }>(
        `SELECT DISTINCT name FROM brain.skills
         WHERE source IN ('marketplace', 'community')
           AND personality_id IS NULL
           AND name = ANY($1)`,
        [skillNames]
      );
      const globalNames = new Set(rows.map((r) => r.name));
      for (const name of skillNames) {
        result.set(name, { installed: globalNames.has(name), installedGlobally: globalNames.has(name) });
      }
    } else {
      // Personality context: installed = has personality-specific record; installedGlobally = has global record
      const rows = await this.queryMany<{ name: string; is_global: boolean }>(
        `SELECT DISTINCT name, (personality_id IS NULL) AS is_global
         FROM brain.skills
         WHERE source IN ('marketplace', 'community')
           AND (personality_id IS NULL OR personality_id = $1)
           AND name = ANY($2)`,
        [personalityId, skillNames]
      );
      const globalNames = new Set<string>();
      const personalityNames = new Set<string>();
      for (const row of rows) {
        if (row.is_global) globalNames.add(row.name);
        else personalityNames.add(row.name);
      }
      for (const name of skillNames) {
        result.set(name, {
          installed: personalityNames.has(name),
          installedGlobally: globalNames.has(name),
        });
      }
    }

    return result;
  }

  async setInstalled(id: string, installed: boolean): Promise<boolean> {
    const changes = await this.execute(
      'UPDATE marketplace.skills SET installed = $1, updated_at = $2 WHERE id = $3',
      [installed, Date.now(), id]
    );
    return changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const changes = await this.execute('DELETE FROM marketplace.skills WHERE id = $1', [id]);
    return changes > 0;
  }

  private rowToSkill(row: Record<string, unknown>): MarketplaceSkill {
    const rawAuthorInfo = row.author_info;
    const authorInfo =
      rawAuthorInfo != null && typeof rawAuthorInfo === 'object'
        ? (rawAuthorInfo as MarketplaceSkill['authorInfo'])
        : typeof rawAuthorInfo === 'string'
          ? (JSON.parse(rawAuthorInfo) as MarketplaceSkill['authorInfo'])
          : undefined;
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      version: (row.version as string) ?? '1.0.0',
      author: (row.author as string) ?? '',
      authorInfo,
      category: (row.category as string) ?? 'general',
      tags: row.tags as string[],
      downloadCount: (row.download_count as number) ?? 0,
      rating: (row.rating as number) ?? 0,
      instructions: (row.instructions as string) ?? '',
      tools: row.tools as MarketplaceSkill['tools'],
      triggerPatterns: Array.isArray(row.trigger_patterns)
        ? (row.trigger_patterns as string[])
        : [],
      useWhen: (row.use_when as string) ?? '',
      doNotUseWhen: (row.do_not_use_when as string) ?? '',
      successCriteria: (row.success_criteria as string) ?? '',
      routing: ((row.routing as string) ?? 'fuzzy') as MarketplaceSkill['routing'],
      autonomyLevel: ((row.autonomy_level as string) ?? 'L1') as MarketplaceSkill['autonomyLevel'],
      installed: row.installed as boolean,
      installedGlobally: (row.installed as boolean) ?? false,
      source: ((row.source as string) ?? 'published') as MarketplaceSkill['source'],
      publishedAt: row.published_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  async seedBuiltinSkills(): Promise<void> {
    const BUILTIN_SKILLS = [
      summarizeTextSkill,
      veteranFinancialManagerSkill,
      seniorWebDesignerSkill,
      seniorSoftwareEngineerSkill,
      seniorSoftwareEngineerAuditSkill,
      devopsSreSkill,
    ];
    for (const skill of BUILTIN_SKILLS) {
      if (!skill.name) continue;
      const existing = await this.queryOne<{ id: string }>(
        'SELECT id FROM marketplace.skills WHERE name = $1 AND author = $2',
        [skill.name, skill.author]
      );
      if (existing) {
        // Update routing quality fields on existing rows so re-deploys pick up changes
        await this.updateSkill(existing.id, { ...skill, source: 'builtin' });
      } else {
        await this.addSkill({ ...skill, source: 'builtin' });
      }
    }
  }
}
