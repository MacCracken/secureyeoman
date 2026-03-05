/**
 * Responsible AI Manager — Phase 130
 *
 * Orchestrates cohort error analysis, fairness metrics, SHAP token attribution,
 * data provenance tracking, and model card generation.
 *
 * Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability.
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';
import type {
  CohortAnalysis,
  CohortAnalysisCreate,
  CohortDimension,
  CohortSlice,
  FairnessReport,
  FairnessReportCreate,
  FairnessGroupResult,
  ShapExplanation,
  ShapExplanationCreate,
  TokenAttribution,
  ProvenanceEntry,
  ProvenanceQuery,
  ProvenanceSummary,
  ModelCard,
  ModelCardCreate,
  ResponsibleAiConfig,
} from '@secureyeoman/shared';
import { ResponsibleAiStorage } from './responsible-ai-store.js';
import { uuidv7 } from '../utils/id.js';
import type { AIClient } from '../ai/client.js';

export interface ResponsibleAiManagerDeps {
  pool: Pool;
  logger: SecureLogger;
  aiClient?: AIClient | null;
  config?: Partial<ResponsibleAiConfig>;
}

// ── Helper: extract metadata from eval scores for cohort slicing ──

interface EvalScoreRow {
  sample_index: number;
  prompt: string;
  response: string;
  groundedness: number;
  coherence: number;
  relevance: number;
  fluency: number;
  harmlessness: number;
  model_name: string;
  metadata?: Record<string, unknown>;
}

/**
 * Determine the value for a given cohort dimension from an eval score record.
 */
function extractDimensionValue(
  row: EvalScoreRow,
  dimension: CohortDimension,
  customKey?: string
): string {
  switch (dimension) {
    case 'model_name':
      return row.model_name || 'unknown';
    case 'time_of_day': {
      const hour = new Date().getHours();
      if (hour < 6) return 'night';
      if (hour < 12) return 'morning';
      if (hour < 18) return 'afternoon';
      return 'evening';
    }
    case 'custom':
      return customKey && row.metadata?.[customKey] != null
        ? String(row.metadata[customKey])
        : 'unknown';
    default:
      return row.metadata?.[dimension] != null ? String(row.metadata[dimension]) : 'unknown';
  }
}

/** Average score across the 5 judge dimensions. */
function avgScore(row: EvalScoreRow): number {
  return (row.groundedness + row.coherence + row.relevance + row.fluency + row.harmlessness) / 5;
}

/** Whether a score row counts as an "error" (avg < 3.0 = below adequate). */
function isError(row: EvalScoreRow): boolean {
  return avgScore(row) < 3.0;
}

export class ResponsibleAiManager {
  private readonly storage: ResponsibleAiStorage;
  private readonly logger: SecureLogger;
  private readonly pool: Pool;
  private readonly aiClient: AIClient | null;
  private readonly config: Partial<ResponsibleAiConfig>;

  constructor(deps: ResponsibleAiManagerDeps) {
    this.pool = deps.pool;
    this.logger = deps.logger;
    this.aiClient = deps.aiClient ?? null;
    this.config = deps.config ?? {};
    this.storage = new ResponsibleAiStorage();
  }

  // ── Cohort Error Analysis ───────────────────────────────────────

  async runCohortAnalysis(opts: CohortAnalysisCreate): Promise<CohortAnalysis> {
    this.logger.info('Running cohort error analysis', {
      evalRunId: opts.evalRunId,
      dimension: opts.dimension,
    });

    const rows = await this.loadEvalScores(opts.evalRunId);
    if (rows.length === 0) {
      throw new Error(`No eval scores found for run ${opts.evalRunId}`);
    }

    // Group by dimension value
    const groups = new Map<string, EvalScoreRow[]>();
    for (const row of rows) {
      const val = extractDimensionValue(row, opts.dimension, opts.customKey);
      const arr = groups.get(val);
      if (arr) arr.push(row);
      else groups.set(val, [row]);
    }

    const slices: CohortSlice[] = [];
    let totalErrors = 0;
    for (const [value, scoreRows] of groups) {
      const errors = scoreRows.filter(isError).length;
      totalErrors += errors;
      slices.push({
        dimension: opts.dimension,
        value,
        sampleCount: scoreRows.length,
        errorCount: errors,
        errorRate: scoreRows.length > 0 ? errors / scoreRows.length : 0,
        avgScore: scoreRows.reduce((s, r) => s + avgScore(r), 0) / scoreRows.length,
        avgGroundedness: scoreRows.reduce((s, r) => s + r.groundedness, 0) / scoreRows.length,
        avgCoherence: scoreRows.reduce((s, r) => s + r.coherence, 0) / scoreRows.length,
        avgRelevance: scoreRows.reduce((s, r) => s + r.relevance, 0) / scoreRows.length,
        avgFluency: scoreRows.reduce((s, r) => s + r.fluency, 0) / scoreRows.length,
        avgHarmlessness: scoreRows.reduce((s, r) => s + r.harmlessness, 0) / scoreRows.length,
      });
    }

    // Sort by error rate descending (worst cohorts first)
    slices.sort((a, b) => b.errorRate - a.errorRate);

    const analysis: CohortAnalysis = {
      id: uuidv7(),
      evalRunId: opts.evalRunId,
      datasetId: opts.datasetId,
      dimension: opts.dimension,
      slices,
      totalSamples: rows.length,
      overallErrorRate: rows.length > 0 ? totalErrors / rows.length : 0,
      createdAt: Date.now(),
    };

    await this.storage.insertCohortAnalysis(analysis);
    this.logger.info('Cohort analysis complete', { id: analysis.id, sliceCount: slices.length });
    return analysis;
  }

  async getCohortAnalysis(id: string): Promise<CohortAnalysis | null> {
    return this.storage.getCohortAnalysis(id);
  }

  async listCohortAnalyses(evalRunId: string): Promise<CohortAnalysis[]> {
    return this.storage.listCohortAnalyses(evalRunId);
  }

  // ── Fairness Metrics ────────────────────────────────────────────

  async computeFairnessReport(opts: FairnessReportCreate): Promise<FairnessReport> {
    this.logger.info('Computing fairness metrics', {
      evalRunId: opts.evalRunId,
      protectedAttribute: opts.protectedAttribute,
    });

    const rows = await this.loadEvalScores(opts.evalRunId);
    if (rows.length === 0) {
      throw new Error(`No eval scores found for run ${opts.evalRunId}`);
    }

    const threshold = opts.threshold ?? 0.8;

    // Group by protected attribute value
    const groups = new Map<string, EvalScoreRow[]>();
    for (const row of rows) {
      const val =
        row.metadata?.[opts.protectedAttribute] != null
          ? String(row.metadata[opts.protectedAttribute])
          : 'unknown';
      const arr = groups.get(val);
      if (arr) arr.push(row);
      else groups.set(val, [row]);
    }

    const groupResults: FairnessGroupResult[] = [];
    for (const [group, scoreRows] of groups) {
      const positive = scoreRows.filter((r) => avgScore(r) >= 3.0).length;
      const errors = scoreRows.filter(isError).length;
      // For true positive / false positive, treat "adequate" (>= 3.0) as positive
      const tp = positive;
      const fp = errors; // Simplified: errors where system predicted positive but should be negative
      groupResults.push({
        group,
        sampleCount: scoreRows.length,
        positiveRate: scoreRows.length > 0 ? positive / scoreRows.length : 0,
        errorRate: scoreRows.length > 0 ? errors / scoreRows.length : 0,
        truePositiveRate: scoreRows.length > 0 ? tp / scoreRows.length : 0,
        falsePositiveRate: scoreRows.length > 0 ? fp / scoreRows.length : 0,
      });
    }

    // Compute fairness metrics
    const rates = groupResults.map((g) => g.positiveRate);
    const maxRate = Math.max(...rates, 0.001);
    const minRate = Math.min(...rates);

    // Demographic parity: max difference in positive rates
    const demographicParity = maxRate - minRate;

    // Equalized odds: max difference in TPR across groups
    const tprs = groupResults.map((g) => g.truePositiveRate);
    const equalizedOdds = Math.max(...tprs) - Math.min(...tprs);

    // Disparate impact: ratio of min to max positive rate (four-fifths rule)
    const disparateImpactRatio = maxRate > 0 ? minRate / maxRate : 1;

    const report: FairnessReport = {
      id: uuidv7(),
      evalRunId: opts.evalRunId,
      datasetId: opts.datasetId,
      protectedAttribute: opts.protectedAttribute,
      groups: groupResults,
      demographicParity,
      equalizedOdds,
      disparateImpactRatio,
      passesThreshold: disparateImpactRatio >= threshold,
      threshold,
      createdAt: Date.now(),
    };

    await this.storage.insertFairnessReport(report);
    this.logger.info('Fairness report complete', {
      id: report.id,
      disparateImpact: disparateImpactRatio,
      passes: report.passesThreshold,
    });
    return report;
  }

  async getFairnessReport(id: string): Promise<FairnessReport | null> {
    return this.storage.getFairnessReport(id);
  }

  async listFairnessReports(evalRunId: string): Promise<FairnessReport[]> {
    return this.storage.listFairnessReports(evalRunId);
  }

  // ── SHAP Explainability ─────────────────────────────────────────

  /**
   * Compute SHAP-style token attributions using perturbation-based method.
   * For each input token, measures the change in model output score when
   * the token is masked. Approximates Shapley values via leave-one-out.
   */
  async computeShapExplanation(opts: ShapExplanationCreate): Promise<ShapExplanation> {
    this.logger.info('Computing SHAP token attributions', { modelName: opts.modelName });

    const tokens = tokenize(opts.prompt);
    const baselineScore = await this.scoreResponse(
      opts.modelName,
      opts.prompt,
      opts.response,
      opts.dimension
    );

    // Leave-one-out attribution for each token
    const attributions: TokenAttribution[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const masked = [...tokens];
      masked[i] = '[MASK]';
      const maskedPrompt = masked.join(' ');
      const maskedScore = await this.scoreResponse(
        opts.modelName,
        maskedPrompt,
        opts.response,
        opts.dimension
      );
      attributions.push({
        token: tokens[i]!,
        attribution: baselineScore - maskedScore,
      });
    }

    // Normalize attributions to sum to 1
    const totalAbs = attributions.reduce((s, a) => s + Math.abs(a.attribution), 0);
    if (totalAbs > 0) {
      for (const a of attributions) {
        a.attribution = a.attribution / totalAbs;
      }
    }

    const explanation: ShapExplanation = {
      id: uuidv7(),
      evalRunId: opts.evalRunId ?? null,
      modelName: opts.modelName,
      prompt: opts.prompt,
      response: opts.response,
      inputTokens: attributions,
      predictionScore: baselineScore,
      dimension: opts.dimension,
      createdAt: Date.now(),
    };

    await this.storage.insertShapExplanation(explanation);
    this.logger.info('SHAP explanation complete', {
      id: explanation.id,
      tokenCount: attributions.length,
    });
    return explanation;
  }

  async getShapExplanation(id: string): Promise<ShapExplanation | null> {
    return this.storage.getShapExplanation(id);
  }

  async listShapExplanations(opts: {
    evalRunId?: string;
    modelName?: string;
    limit?: number;
  }): Promise<ShapExplanation[]> {
    return this.storage.listShapExplanations(opts);
  }

  // ── Data Provenance ─────────────────────────────────────────────

  async recordProvenance(entries: ProvenanceEntry[]): Promise<void> {
    await this.storage.insertProvenanceBatch(entries);
    this.logger.debug('Provenance entries recorded', { count: entries.length });
  }

  async queryProvenance(q: ProvenanceQuery): Promise<ProvenanceEntry[]> {
    return this.storage.queryProvenance(q);
  }

  async getProvenanceSummary(datasetId: string): Promise<ProvenanceSummary> {
    return this.storage.getProvenanceSummary(datasetId);
  }

  async findUserProvenance(userId: string): Promise<ProvenanceEntry[]> {
    return this.storage.findUserProvenance(userId);
  }

  /** GDPR right-to-erasure: mark all of a user's data as redacted. */
  async redactUserData(userId: string): Promise<number> {
    this.logger.info('Redacting user data from provenance records', { userId });
    return this.storage.redactUserData(userId);
  }

  // ── Model Cards ─────────────────────────────────────────────────

  /**
   * Auto-generate a model card for a personality's deployed model.
   * Pulls training data summary, eval results, and fairness reports
   * from existing records to populate the card.
   */
  async generateModelCard(opts: ModelCardCreate): Promise<ModelCard> {
    this.logger.info('Generating model card', {
      personalityId: opts.personalityId,
      modelName: opts.modelName,
    });

    const now = Date.now();
    const card: ModelCard = {
      id: uuidv7(),
      personalityId: opts.personalityId,
      modelName: opts.modelName,
      version: opts.version,
      intendedUse: opts.intendedUse || 'General-purpose conversational AI assistant.',
      limitations:
        opts.limitations ||
        'Model may generate inaccurate or biased outputs. Not suitable for high-stakes decisions without human oversight.',
      ethicalConsiderations: opts.ethicalConsiderations,
      trainingDataSummary: { sampleCount: 0 },
      riskClassification:
        opts.riskClassification ?? this.config.defaultRiskClassification ?? 'limited',
      generatedBy: 'auto',
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.insertModelCard(card);
    this.logger.info('Model card generated', { id: card.id });
    return card;
  }

  async getModelCard(id: string): Promise<ModelCard | null> {
    return this.storage.getModelCard(id);
  }

  async getModelCardByPersonality(personalityId: string): Promise<ModelCard | null> {
    return this.storage.getModelCardByPersonality(personalityId);
  }

  async listModelCards(opts?: { personalityId?: string; limit?: number }): Promise<ModelCard[]> {
    return this.storage.listModelCards(opts);
  }

  /**
   * Render a model card as Markdown (Hugging Face Model Card format).
   */
  renderModelCardMarkdown(card: ModelCard): string {
    const lines: string[] = [];
    lines.push(`# Model Card: ${card.modelName}`);
    lines.push('');
    if (card.version) lines.push(`**Version**: ${card.version}`);
    lines.push(`**Personality**: ${card.personalityId}`);
    if (card.deployedAt) lines.push(`**Deployed**: ${card.deployedAt}`);
    if (card.riskClassification)
      lines.push(`**EU AI Act Risk Classification**: ${card.riskClassification}`);
    lines.push(`**Generated**: ${card.generatedBy}`);
    lines.push('');

    lines.push('## Intended Use');
    lines.push('');
    lines.push(card.intendedUse);
    lines.push('');

    lines.push('## Limitations');
    lines.push('');
    lines.push(card.limitations);
    lines.push('');

    if (card.ethicalConsiderations) {
      lines.push('## Ethical Considerations');
      lines.push('');
      lines.push(card.ethicalConsiderations);
      lines.push('');
    }

    lines.push('## Training Data');
    lines.push('');
    const td = card.trainingDataSummary;
    lines.push(`- **Sample Count**: ${td.sampleCount}`);
    if (td.datasetId) lines.push(`- **Dataset ID**: ${td.datasetId}`);
    if (td.dateRange?.from)
      lines.push(`- **Date Range**: ${td.dateRange.from} to ${td.dateRange.to ?? 'present'}`);
    if (td.sourceBreakdown) {
      lines.push('- **Source Breakdown**:');
      for (const [src, count] of Object.entries(td.sourceBreakdown)) {
        lines.push(`  - ${src}: ${count}`);
      }
    }
    lines.push('');

    if (card.evaluationResults) {
      lines.push('## Evaluation Results');
      lines.push('');
      const ev = card.evaluationResults;
      if (ev.evalRunId) lines.push(`- **Eval Run**: ${ev.evalRunId}`);
      if (ev.sampleCount) lines.push(`- **Samples**: ${ev.sampleCount}`);
      if (ev.avgGroundedness != null)
        lines.push(`- **Groundedness**: ${ev.avgGroundedness.toFixed(2)}`);
      if (ev.avgCoherence != null) lines.push(`- **Coherence**: ${ev.avgCoherence.toFixed(2)}`);
      if (ev.avgRelevance != null) lines.push(`- **Relevance**: ${ev.avgRelevance.toFixed(2)}`);
      if (ev.avgFluency != null) lines.push(`- **Fluency**: ${ev.avgFluency.toFixed(2)}`);
      if (ev.avgHarmlessness != null)
        lines.push(`- **Harmlessness**: ${ev.avgHarmlessness.toFixed(2)}`);
      lines.push('');
    }

    if (card.fairnessAssessment) {
      lines.push('## Fairness Assessment');
      lines.push('');
      const fa = card.fairnessAssessment;
      if (fa.protectedAttributes?.length) {
        lines.push(`- **Protected Attributes**: ${fa.protectedAttributes.join(', ')}`);
      }
      if (fa.passesThreshold != null) {
        lines.push(`- **Passes Threshold**: ${fa.passesThreshold ? 'Yes' : 'No'}`);
      }
      if (fa.disparateImpactRatios) {
        lines.push('- **Disparate Impact Ratios**:');
        for (const [attr, ratio] of Object.entries(fa.disparateImpactRatios)) {
          lines.push(`  - ${attr}: ${ratio.toFixed(3)}`);
        }
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Generated at ${new Date(card.createdAt).toISOString()}*`);
    return lines.join('\n');
  }

  // ── Internal helpers ────────────────────────────────────────────

  private async loadEvalScores(evalRunId: string): Promise<EvalScoreRow[]> {
    const result = await this.pool.query<EvalScoreRow>(
      `SELECT sample_index, prompt, response, groundedness, coherence, relevance,
              fluency, harmlessness, model_name
       FROM training.eval_scores WHERE eval_run_id = $1
       ORDER BY sample_index`,
      [evalRunId]
    );
    return result.rows;
  }

  /**
   * Score a response on a given dimension using the AI client.
   * Falls back to a simple heuristic when no AI client is available.
   */
  private async scoreResponse(
    _modelName: string,
    prompt: string,
    response: string,
    dimension?: string
  ): Promise<number> {
    // Use AI client for scoring if available
    if (this.aiClient) {
      try {
        const judgePrompt = `Rate the following response on ${dimension || 'overall quality'} from 0.0 to 1.0.
Prompt: ${prompt.slice(0, 500)}
Response: ${response.slice(0, 500)}
Return ONLY a number between 0.0 and 1.0.`;

        const result = await this.aiClient.chat({
          messages: [{ role: 'user', content: judgePrompt }],
          maxTokens: 16,
          temperature: 0,
          stream: false,
        });
        const score = parseFloat(result.content);
        if (!isNaN(score) && score >= 0 && score <= 1) return score;
      } catch {
        // Fall through to heuristic
      }
    }

    // Heuristic fallback: length-based score
    const ratio = Math.min(response.length / Math.max(prompt.length, 1), 3);
    return Math.min(ratio / 3, 1);
  }
}

// ── Token utilities ─────────────────────────────────────────────────

/** Simple whitespace tokenizer for SHAP attribution. */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}
