/**
 * Responsible AI Storage — Phase 130
 *
 * PgBaseStorage for cohort analyses, fairness reports, SHAP explanations,
 * data provenance entries, and model cards.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { safeJsonParse } from '../utils/json.js';
import type {
  CohortAnalysis,
  FairnessReport,
  ShapExplanation,
  ProvenanceEntry,
  ProvenanceQuery,
  ProvenanceSummary,
  ModelCard,
} from '@secureyeoman/shared';

// ── Row types ───────────────────────────────────────────────────────

interface CohortRow {
  id: string;
  eval_run_id: string;
  dataset_id: string;
  dimension: string;
  slices: string;
  total_samples: number;
  overall_error_rate: number;
  created_at: string;
}

interface FairnessRow {
  id: string;
  eval_run_id: string;
  dataset_id: string;
  protected_attribute: string;
  groups: string;
  demographic_parity: number;
  equalized_odds: number;
  disparate_impact_ratio: number;
  passes_threshold: boolean;
  threshold: number;
  created_at: string;
}

interface ShapRow {
  id: string;
  eval_run_id: string | null;
  model_name: string;
  prompt: string;
  response: string;
  input_tokens: string;
  prediction_score: number | null;
  dimension: string | null;
  created_at: string;
}

interface ProvenanceRow {
  id: string;
  dataset_id: string;
  conversation_id: string | null;
  user_id: string | null;
  personality_id: string | null;
  status: string;
  filter_reason: string | null;
  source_type: string;
  content_hash: string | null;
  recorded_at: string;
}

interface ModelCardRow {
  id: string;
  personality_id: string;
  model_name: string;
  version: string | null;
  intended_use: string;
  limitations: string;
  ethical_considerations: string | null;
  training_data_summary: string;
  evaluation_results: string | null;
  fairness_assessment: string | null;
  deployed_at: string | null;
  risk_classification: string | null;
  generated_by: string;
  created_at: string;
  updated_at: string;
}

// ── Row mappers ─────────────────────────────────────────────────────

function toCohortAnalysis(r: CohortRow): CohortAnalysis {
  return {
    id: r.id,
    evalRunId: r.eval_run_id,
    datasetId: r.dataset_id,
    dimension: r.dimension as CohortAnalysis['dimension'],
    slices: typeof r.slices === 'string' ? safeJsonParse(r.slices, []) : r.slices,
    totalSamples: Number(r.total_samples),
    overallErrorRate: Number(r.overall_error_rate),
    createdAt: Number(r.created_at),
  };
}

function toFairnessReport(r: FairnessRow): FairnessReport {
  return {
    id: r.id,
    evalRunId: r.eval_run_id,
    datasetId: r.dataset_id,
    protectedAttribute: r.protected_attribute,
    groups: typeof r.groups === 'string' ? safeJsonParse(r.groups, []) : r.groups,
    demographicParity: Number(r.demographic_parity),
    equalizedOdds: Number(r.equalized_odds),
    disparateImpactRatio: Number(r.disparate_impact_ratio),
    passesThreshold: r.passes_threshold,
    threshold: Number(r.threshold),
    createdAt: Number(r.created_at),
  };
}

function toShapExplanation(r: ShapRow): ShapExplanation {
  return {
    id: r.id,
    evalRunId: r.eval_run_id,
    modelName: r.model_name,
    prompt: r.prompt,
    response: r.response,
    inputTokens: typeof r.input_tokens === 'string' ? safeJsonParse(r.input_tokens, []) : r.input_tokens,
    predictionScore: r.prediction_score != null ? Number(r.prediction_score) : undefined,
    dimension: r.dimension ?? undefined,
    createdAt: Number(r.created_at),
  };
}

function toProvenanceEntry(r: ProvenanceRow): ProvenanceEntry {
  return {
    id: r.id,
    datasetId: r.dataset_id,
    conversationId: r.conversation_id,
    userId: r.user_id,
    personalityId: r.personality_id,
    status: r.status as ProvenanceEntry['status'],
    filterReason: r.filter_reason,
    sourceType: r.source_type,
    contentHash: r.content_hash,
    recordedAt: Number(r.recorded_at),
  };
}

function toModelCard(r: ModelCardRow): ModelCard {
  return {
    id: r.id,
    personalityId: r.personality_id,
    modelName: r.model_name,
    version: r.version ?? undefined,
    intendedUse: r.intended_use,
    limitations: r.limitations,
    ethicalConsiderations: r.ethical_considerations ?? undefined,
    trainingDataSummary:
      typeof r.training_data_summary === 'string'
        ? safeJsonParse(r.training_data_summary, { sampleCount: 0 })
        : r.training_data_summary,
    evaluationResults:
      r.evaluation_results != null
        ? typeof r.evaluation_results === 'string'
          ? safeJsonParse(r.evaluation_results, undefined)
          : r.evaluation_results
        : undefined,
    fairnessAssessment:
      r.fairness_assessment != null
        ? typeof r.fairness_assessment === 'string'
          ? safeJsonParse(r.fairness_assessment, undefined)
          : r.fairness_assessment
        : undefined,
    deployedAt: r.deployed_at ?? undefined,
    riskClassification: (r.risk_classification as ModelCard['riskClassification']) ?? undefined,
    generatedBy: r.generated_by as ModelCard['generatedBy'],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// ── Storage class ───────────────────────────────────────────────────

export class ResponsibleAiStorage extends PgBaseStorage {
  // ── Cohort Analyses ─────────────────────────────────────────────

  async insertCohortAnalysis(a: CohortAnalysis): Promise<void> {
    await this.execute(
      `INSERT INTO responsible_ai.cohort_analyses
         (id, eval_run_id, dataset_id, dimension, slices, total_samples, overall_error_rate, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        a.id,
        a.evalRunId,
        a.datasetId,
        a.dimension,
        JSON.stringify(a.slices),
        a.totalSamples,
        a.overallErrorRate,
        a.createdAt,
      ]
    );
  }

  async getCohortAnalysis(id: string): Promise<CohortAnalysis | null> {
    const row = await this.queryOne<CohortRow>(
      'SELECT * FROM responsible_ai.cohort_analyses WHERE id = $1',
      [id]
    );
    return row ? toCohortAnalysis(row) : null;
  }

  async listCohortAnalyses(evalRunId: string): Promise<CohortAnalysis[]> {
    const rows = await this.queryMany<CohortRow>(
      'SELECT * FROM responsible_ai.cohort_analyses WHERE eval_run_id = $1 ORDER BY created_at DESC',
      [evalRunId]
    );
    return rows.map(toCohortAnalysis);
  }

  // ── Fairness Reports ────────────────────────────────────────────

  async insertFairnessReport(r: FairnessReport): Promise<void> {
    await this.execute(
      `INSERT INTO responsible_ai.fairness_reports
         (id, eval_run_id, dataset_id, protected_attribute, groups,
          demographic_parity, equalized_odds, disparate_impact_ratio,
          passes_threshold, threshold, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id,
        r.evalRunId,
        r.datasetId,
        r.protectedAttribute,
        JSON.stringify(r.groups),
        r.demographicParity,
        r.equalizedOdds,
        r.disparateImpactRatio,
        r.passesThreshold,
        r.threshold,
        r.createdAt,
      ]
    );
  }

  async getFairnessReport(id: string): Promise<FairnessReport | null> {
    const row = await this.queryOne<FairnessRow>(
      'SELECT * FROM responsible_ai.fairness_reports WHERE id = $1',
      [id]
    );
    return row ? toFairnessReport(row) : null;
  }

  async listFairnessReports(evalRunId: string): Promise<FairnessReport[]> {
    const rows = await this.queryMany<FairnessRow>(
      'SELECT * FROM responsible_ai.fairness_reports WHERE eval_run_id = $1 ORDER BY created_at DESC',
      [evalRunId]
    );
    return rows.map(toFairnessReport);
  }

  // ── SHAP Explanations ──────────────────────────────────────────

  async insertShapExplanation(s: ShapExplanation): Promise<void> {
    await this.execute(
      `INSERT INTO responsible_ai.shap_explanations
         (id, eval_run_id, model_name, prompt, response, input_tokens, prediction_score, dimension, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        s.id,
        s.evalRunId ?? null,
        s.modelName,
        s.prompt,
        s.response,
        JSON.stringify(s.inputTokens),
        s.predictionScore ?? null,
        s.dimension ?? null,
        s.createdAt,
      ]
    );
  }

  async getShapExplanation(id: string): Promise<ShapExplanation | null> {
    const row = await this.queryOne<ShapRow>(
      'SELECT * FROM responsible_ai.shap_explanations WHERE id = $1',
      [id]
    );
    return row ? toShapExplanation(row) : null;
  }

  async listShapExplanations(opts: {
    evalRunId?: string;
    modelName?: string;
    limit?: number;
  }): Promise<ShapExplanation[]> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (opts.evalRunId) {
      conds.push(`eval_run_id = $${idx++}`);
      vals.push(opts.evalRunId);
    }
    if (opts.modelName) {
      conds.push(`model_name = $${idx++}`);
      vals.push(opts.modelName);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = Math.min(opts.limit ?? 100, 500);
    vals.push(limit);
    const rows = await this.queryMany<ShapRow>(
      `SELECT * FROM responsible_ai.shap_explanations ${where} ORDER BY created_at DESC LIMIT $${idx}`,
      vals
    );
    return rows.map(toShapExplanation);
  }

  // ── Data Provenance ────────────────────────────────────────────

  async insertProvenanceEntry(e: ProvenanceEntry): Promise<void> {
    await this.execute(
      `INSERT INTO responsible_ai.provenance_entries
         (id, dataset_id, conversation_id, user_id, personality_id, status, filter_reason, source_type, content_hash, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        e.id,
        e.datasetId,
        e.conversationId ?? null,
        e.userId ?? null,
        e.personalityId ?? null,
        e.status,
        e.filterReason ?? null,
        e.sourceType,
        e.contentHash ?? null,
        e.recordedAt,
      ]
    );
  }

  async insertProvenanceBatch(entries: ProvenanceEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const vals: unknown[] = [];
      const rows: string[] = [];
      let idx = 1;
      for (const e of batch) {
        rows.push(
          `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );
        vals.push(
          e.id,
          e.datasetId,
          e.conversationId ?? null,
          e.userId ?? null,
          e.personalityId ?? null,
          e.status,
          e.filterReason ?? null,
          e.sourceType,
          e.contentHash ?? null,
          e.recordedAt
        );
      }
      await this.execute(
        `INSERT INTO responsible_ai.provenance_entries
           (id, dataset_id, conversation_id, user_id, personality_id, status, filter_reason, source_type, content_hash, recorded_at)
         VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        vals
      );
    }
  }

  async queryProvenance(q: ProvenanceQuery): Promise<ProvenanceEntry[]> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (q.datasetId) {
      conds.push(`dataset_id = $${idx++}`);
      vals.push(q.datasetId);
    }
    if (q.conversationId) {
      conds.push(`conversation_id = $${idx++}`);
      vals.push(q.conversationId);
    }
    if (q.userId) {
      conds.push(`user_id = $${idx++}`);
      vals.push(q.userId);
    }
    if (q.status) {
      conds.push(`status = $${idx++}`);
      vals.push(q.status);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = Math.min(q.limit ?? 100, 1000);
    const offset = q.offset ?? 0;
    vals.push(limit, offset);
    const rows = await this.queryMany<ProvenanceRow>(
      `SELECT * FROM responsible_ai.provenance_entries ${where} ORDER BY recorded_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      vals
    );
    return rows.map(toProvenanceEntry);
  }

  async getProvenanceSummary(datasetId: string): Promise<ProvenanceSummary> {
    const rows = await this.queryMany<{ status: string; cnt: string }>(
      `SELECT status, COUNT(*)::TEXT AS cnt FROM responsible_ai.provenance_entries WHERE dataset_id = $1 GROUP BY status`,
      [datasetId]
    );
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      counts[r.status] = Number(r.cnt);
      total += Number(r.cnt);
    }

    const uniqueRows = await this.queryOne<{ users: string; convs: string }>(
      `SELECT COUNT(DISTINCT user_id)::TEXT AS users, COUNT(DISTINCT conversation_id)::TEXT AS convs
       FROM responsible_ai.provenance_entries WHERE dataset_id = $1`,
      [datasetId]
    );

    const reasonRows = await this.queryMany<{ filter_reason: string; cnt: string }>(
      `SELECT filter_reason, COUNT(*)::TEXT AS cnt FROM responsible_ai.provenance_entries
       WHERE dataset_id = $1 AND status = 'filtered' AND filter_reason IS NOT NULL GROUP BY filter_reason`,
      [datasetId]
    );
    const filterReasons: Record<string, number> = {};
    for (const r of reasonRows) {
      filterReasons[r.filter_reason] = Number(r.cnt);
    }

    return {
      datasetId,
      totalEntries: total,
      included: counts['included'] ?? 0,
      filtered: counts['filtered'] ?? 0,
      synthetic: counts['synthetic'] ?? 0,
      redacted: counts['redacted'] ?? 0,
      uniqueUsers: Number(uniqueRows?.users ?? 0),
      uniqueConversations: Number(uniqueRows?.convs ?? 0),
      filterReasons,
    };
  }

  /** Check if a specific user's data was used in any training dataset. */
  async findUserProvenance(userId: string): Promise<ProvenanceEntry[]> {
    const rows = await this.queryMany<ProvenanceRow>(
      `SELECT * FROM responsible_ai.provenance_entries WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 1000`,
      [userId]
    );
    return rows.map(toProvenanceEntry);
  }

  /** Delete all provenance entries for a user (GDPR right-to-erasure). */
  async redactUserData(userId: string): Promise<number> {
    return this.execute(
      `UPDATE responsible_ai.provenance_entries SET status = 'redacted', filter_reason = 'gdpr_erasure'
       WHERE user_id = $1 AND status != 'redacted'`,
      [userId]
    );
  }

  // ── Model Cards ────────────────────────────────────────────────

  async insertModelCard(card: ModelCard): Promise<void> {
    await this.execute(
      `INSERT INTO responsible_ai.model_cards
         (id, personality_id, model_name, version, intended_use, limitations, ethical_considerations,
          training_data_summary, evaluation_results, fairness_assessment, deployed_at,
          risk_classification, generated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         intended_use = EXCLUDED.intended_use,
         limitations = EXCLUDED.limitations,
         ethical_considerations = EXCLUDED.ethical_considerations,
         training_data_summary = EXCLUDED.training_data_summary,
         evaluation_results = EXCLUDED.evaluation_results,
         fairness_assessment = EXCLUDED.fairness_assessment,
         deployed_at = EXCLUDED.deployed_at,
         risk_classification = EXCLUDED.risk_classification,
         updated_at = EXCLUDED.updated_at`,
      [
        card.id,
        card.personalityId,
        card.modelName,
        card.version ?? null,
        card.intendedUse,
        card.limitations,
        card.ethicalConsiderations ?? null,
        JSON.stringify(card.trainingDataSummary),
        card.evaluationResults ? JSON.stringify(card.evaluationResults) : null,
        card.fairnessAssessment ? JSON.stringify(card.fairnessAssessment) : null,
        card.deployedAt ?? null,
        card.riskClassification ?? null,
        card.generatedBy,
        card.createdAt,
        card.updatedAt,
      ]
    );
  }

  async getModelCard(id: string): Promise<ModelCard | null> {
    const row = await this.queryOne<ModelCardRow>(
      'SELECT * FROM responsible_ai.model_cards WHERE id = $1',
      [id]
    );
    return row ? toModelCard(row) : null;
  }

  async getModelCardByPersonality(personalityId: string): Promise<ModelCard | null> {
    const row = await this.queryOne<ModelCardRow>(
      'SELECT * FROM responsible_ai.model_cards WHERE personality_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [personalityId]
    );
    return row ? toModelCard(row) : null;
  }

  async listModelCards(opts?: { personalityId?: string; limit?: number }): Promise<ModelCard[]> {
    const conds: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (opts?.personalityId) {
      conds.push(`personality_id = $${idx++}`);
      vals.push(opts.personalityId);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = Math.min(opts?.limit ?? 50, 200);
    vals.push(limit);
    const rows = await this.queryMany<ModelCardRow>(
      `SELECT * FROM responsible_ai.model_cards ${where} ORDER BY updated_at DESC LIMIT $${idx}`,
      vals
    );
    return rows.map(toModelCard);
  }
}
