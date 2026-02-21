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
      installed: data.installed ?? false,
      source: data.source ?? 'published',
      publishedAt: data.publishedAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    await this.execute(
      `INSERT INTO marketplace.skills
        (id, name, description, version, author, author_info, category, tags, download_count, rating, instructions, tools, trigger_patterns, installed, source, published_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
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
        updated_at = $10
       WHERE id = $11`,
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
    source?: string
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
    return { skills: rows.map((r) => this.rowToSkill(r)), total };
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
      triggerPatterns: Array.isArray(row.trigger_patterns) ? (row.trigger_patterns as string[]) : [],
      installed: row.installed as boolean,
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
      const exists = await this.queryOne(
        'SELECT 1 FROM marketplace.skills WHERE name = $1 AND author = $2',
        [skill.name, skill.author]
      );
      if (!exists) {
        await this.addSkill({ ...skill, source: 'builtin' });
      }
    }
  }
}
