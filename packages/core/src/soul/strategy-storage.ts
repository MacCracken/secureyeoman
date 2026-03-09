/**
 * Strategy Storage — PostgreSQL-backed persistence for reasoning strategies.
 *
 * Provides CRUD for soul.reasoning_strategies and seeding of built-in strategies.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { buildWhere, buildSet, parseCount } from '../storage/query-helpers.js';
import { uuidv7 } from '../utils/crypto.js';
import type {
  ReasoningStrategy,
  ReasoningStrategyCreate,
  ReasoningStrategyUpdate,
  ReasoningStrategyCategory,
} from '@secureyeoman/shared';

// ── Row Type ─────────────────────────────────────────────────

interface StrategyRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  prompt_prefix: string;
  category: string;
  is_builtin: boolean;
  created_at: number;
  updated_at: number;
}

// ── Helpers ──────────────────────────────────────────────────

function rowToStrategy(row: StrategyRow): ReasoningStrategy {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    promptPrefix: row.prompt_prefix,
    category: row.category as ReasoningStrategyCategory,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Built-in Strategies ──────────────────────────────────────

const BUILTIN_STRATEGIES: {
  slug: string;
  name: string;
  category: ReasoningStrategyCategory;
  description: string;
  promptPrefix: string;
}[] = [
  {
    slug: 'standard',
    name: 'Standard',
    category: 'standard',
    description: 'Baseline reasoning with no additional strategy modifications.',
    promptPrefix: '',
  },
  {
    slug: 'chain-of-thought',
    name: 'Chain of Thought',
    category: 'chain_of_thought',
    description:
      'Sequential step-by-step reasoning that breaks complex problems into ordered logical steps.',
    promptPrefix:
      'Think step by step. Break down your reasoning into numbered sequential steps. For each step, clearly state the sub-problem, your reasoning, and the intermediate conclusion before moving to the next step.',
  },
  {
    slug: 'tree-of-thought',
    name: 'Tree of Thought',
    category: 'tree_of_thought',
    description:
      'Explores multiple reasoning paths in parallel, evaluating and pruning to find the best approach.',
    promptPrefix:
      'Generate multiple distinct reasoning paths for this problem. For each path, evaluate its promise and likelihood of leading to a correct solution. Prune unpromising paths early. Select and develop the most promising path to reach your final answer.',
  },
  {
    slug: 'reflexion',
    name: 'Reflexion',
    category: 'reflexion',
    description:
      'Produces an initial answer, then critically reflects on it and refines to address weaknesses.',
    promptPrefix:
      'First produce your initial answer. Then critically reflect on it: identify weaknesses, gaps, or errors in your reasoning. Finally, produce a refined answer that addresses each weakness you identified.',
  },
  {
    slug: 'self-refine',
    name: 'Self-Refine',
    category: 'self_refine',
    description:
      'Iteratively improves responses by identifying and fixing the weakest aspect each iteration.',
    promptPrefix:
      'Iteratively improve your response. After your initial answer, identify the single weakest aspect and improve it. Repeat for up to 3 passes. Each pass should produce a noticeably better result than the previous one.',
  },
  {
    slug: 'self-consistent',
    name: 'Self-Consistent',
    category: 'self_consistent',
    description:
      'Generates multiple independent reasoning chains and reports the consensus conclusion.',
    promptPrefix:
      'Approach this problem using multiple independent reasoning chains. Generate at least 3 distinct lines of reasoning. Compare their conclusions. Report the consensus answer and note any disagreements between chains.',
  },
  {
    slug: 'chain-of-density',
    name: 'Chain of Density',
    category: 'chain_of_density',
    description:
      'Produces increasingly dense responses, starting broad and progressively compressing information.',
    promptPrefix:
      'Respond with increasingly dense information. Start with a broad overview. Then compress and refine, adding more specific details while removing redundancy. Final pass should be maximally information-dense while remaining clear.',
  },
  {
    slug: 'argument-of-thought',
    name: 'Argument of Thought',
    category: 'argument_of_thought',
    description:
      'Applies formal argument structure with thesis, premises, counterarguments, and conclusion.',
    promptPrefix:
      'Use formal argument structure. State your thesis clearly. Present your premises with supporting evidence. Consider counterarguments and address them. Draw your conclusion from the argument presented.',
  },
];

// ── Storage Class ────────────────────────────────────────────

export class StrategyStorage extends PgBaseStorage {
  async createStrategy(
    data: ReasoningStrategyCreate,
    opts?: { isBuiltin?: boolean }
  ): Promise<ReasoningStrategy> {
    const now = Date.now();
    const id = uuidv7();

    await this.execute(
      `INSERT INTO soul.reasoning_strategies
       (id, name, slug, description, prompt_prefix, category, is_builtin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        data.name,
        data.slug,
        data.description ?? '',
        data.promptPrefix,
        data.category,
        opts?.isBuiltin ?? false,
        now,
        now,
      ]
    );

    return (await this.getStrategy(id))!;
  }

  async getStrategy(id: string): Promise<ReasoningStrategy | null> {
    const row = await this.queryOne<StrategyRow>(
      'SELECT * FROM soul.reasoning_strategies WHERE id = $1',
      [id]
    );
    return row ? rowToStrategy(row) : null;
  }

  async getStrategyBySlug(slug: string): Promise<ReasoningStrategy | null> {
    const row = await this.queryOne<StrategyRow>(
      'SELECT * FROM soul.reasoning_strategies WHERE slug = $1',
      [slug]
    );
    return row ? rowToStrategy(row) : null;
  }

  async listStrategies(opts?: {
    category?: ReasoningStrategyCategory;
    limit?: number;
    offset?: number;
  }): Promise<{ items: ReasoningStrategy[]; total: number }> {
    const { where, values, nextIdx } = buildWhere([
      { column: 'category', value: opts?.category },
    ]);
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM soul.reasoning_strategies ${where}`,
      values
    );
    const total = parseCount(countResult);

    const rows = await this.queryMany<StrategyRow>(
      `SELECT * FROM soul.reasoning_strategies ${where}
       ORDER BY is_builtin DESC, name ASC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...values, limit, offset]
    );

    return { items: rows.map(rowToStrategy), total };
  }

  async updateStrategy(
    id: string,
    data: ReasoningStrategyUpdate
  ): Promise<ReasoningStrategy | null> {
    const existing = await this.getStrategy(id);
    if (!existing) return null;
    if (existing.isBuiltin) {
      throw new Error('Cannot modify built-in strategies');
    }

    const { setClause, values, nextIdx, hasUpdates } = buildSet([
      { column: 'name', value: data.name },
      { column: 'slug', value: data.slug },
      { column: 'description', value: data.description },
      { column: 'prompt_prefix', value: data.promptPrefix },
      { column: 'category', value: data.category },
    ]);

    if (!hasUpdates) return existing;

    // Append updated_at only when there are actual field changes
    values.push(Date.now());
    values.push(id);

    await this.execute(
      `UPDATE soul.reasoning_strategies SET ${setClause}, updated_at = $${nextIdx} WHERE id = $${nextIdx + 1}`,
      values
    );

    return this.getStrategy(id);
  }

  async deleteStrategy(id: string): Promise<boolean> {
    const existing = await this.getStrategy(id);
    if (!existing) return false;
    if (existing.isBuiltin) {
      throw new Error('Cannot delete built-in strategies');
    }

    const count = await this.execute('DELETE FROM soul.reasoning_strategies WHERE id = $1', [id]);
    return count > 0;
  }

  async seedBuiltinStrategies(): Promise<void> {
    const now = Date.now();

    for (const s of BUILTIN_STRATEGIES) {
      await this.execute(
        `INSERT INTO soul.reasoning_strategies
         (id, name, slug, description, prompt_prefix, category, is_builtin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           prompt_prefix = EXCLUDED.prompt_prefix,
           category = EXCLUDED.category,
           updated_at = EXCLUDED.updated_at`,
        [uuidv7(), s.name, s.slug, s.description, s.promptPrefix, s.category, now, now]
      );
    }
  }
}
