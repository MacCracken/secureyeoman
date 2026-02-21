/**
 * ModelRouter — Intelligent model selection for sub-agent delegation and swarm scheduling.
 *
 * Scores task complexity with a heuristic classifier, maps complexity to a model
 * tier, filters candidates by the active personality's allowedModels policy, and
 * selects the cheapest model in the appropriate tier. Falls back to the caller's
 * configured default when no suitable candidate exists or confidence is too low.
 *
 * ADR 085 — Intelligent Model Routing
 */

import type { CostCalculator, AvailableModel } from './cost-calculator.js';
import { getAvailableModels } from './cost-calculator.js';

// ── Task Complexity ───────────────────────────────────────────────────────────

export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export type TaskType =
  | 'summarize'
  | 'classify'
  | 'extract'
  | 'qa'
  | 'code'
  | 'reason'
  | 'plan'
  | 'general';

export interface TaskProfile {
  complexity: TaskComplexity;
  taskType: TaskType;
  estimatedInputTokens: number;
}

// ── Model Tiers ───────────────────────────────────────────────────────────────

/**
 * Three-tier model classification:
 *  - fast   : cheap, low-latency — suitable for summarisation, classification, extraction
 *  - capable: balanced — suitable for most tasks including moderate coding/reasoning
 *  - premium : highest quality — reserved for complex reasoning, multi-step planning,
 *              advanced code generation
 */
export type ModelTier = 'fast' | 'capable' | 'premium';

// Static tier assignments. Local/free providers are always 'fast'.
const MODEL_TIER: Record<string, ModelTier> = {
  // Fast / cheap
  'claude-haiku-3-5-20241022': 'fast',
  'claude-haiku-4-5': 'fast',
  'gpt-4o-mini': 'fast',
  'o3-mini': 'fast',
  'gemini-2.0-flash': 'fast',
  'gemini-3-flash': 'fast',
  'grok-3-mini': 'fast',
  'deepseek-chat': 'fast',
  'deepseek-coder': 'fast',
  'qwen3-coder': 'fast',

  // Capable / balanced
  'claude-sonnet-4-20250514': 'capable',
  'claude-sonnet-4-5': 'capable',
  'gpt-4o': 'capable',
  'gpt-5.2': 'capable',
  'grok-3': 'capable',
  'grok-2-1212': 'capable',
  'grok-2-vision-1212': 'capable',
  'deepseek-reasoner': 'capable',

  // Premium / expensive
  'claude-opus-4-20250514': 'premium',
  'gpt-4-turbo': 'premium',
  o1: 'premium',
  'o1-mini': 'premium',

  // Letta (stateful agent platform — provider/model-id naming)
  'openai/gpt-4o-mini': 'fast',
  'anthropic/claude-haiku-3-5-20241022': 'fast',
  'openai/gpt-4o': 'capable',
  'anthropic/claude-sonnet-4-20250514': 'capable',
};

/** Local providers are always free and always fast. */
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'localai', 'big-pickle']);

function modelTier(model: string, provider: string): ModelTier {
  if (LOCAL_PROVIDERS.has(provider) || model === 'big-pickle') return 'fast';
  return MODEL_TIER[model] ?? 'capable';
}

// ── Complexity→Tier Mapping ───────────────────────────────────────────────────

const TASK_TYPE_TIER: Record<TaskType, ModelTier> = {
  summarize: 'fast',
  classify: 'fast',
  extract: 'fast',
  qa: 'fast',
  code: 'capable',
  reason: 'capable',
  plan: 'capable',
  general: 'capable',
};

// Override: complex tasks need at least 'capable'; they may warrant 'premium' for long context
function targetTier(profile: TaskProfile): ModelTier {
  const base = TASK_TYPE_TIER[profile.taskType];
  if (profile.complexity === 'simple') return base === 'premium' ? 'capable' : base;
  if (profile.complexity === 'complex') {
    if (base === 'fast') return 'capable';
    if (base === 'capable') return 'capable'; // don't auto-escalate to premium
    return 'premium';
  }
  return base;
}

// ── Task Complexity Scorer ────────────────────────────────────────────────────

// Keywords that signal specific task types
const SUMMARIZE_PATTERNS =
  /\b(summarize|summarise|summary|tldr|tl;dr|condense|recap|brief|overview|digest|abstract)\b/i;
const CLASSIFY_PATTERNS =
  /\b(classify|categorize|categorise|label|tag|identify the type|determine (if|whether|which)|is this a|belongs to)\b/i;
const EXTRACT_PATTERNS =
  /\b(extract|pull out|find all|list all|enumerate|identify all|get all|retrieve)\b/i;
const QA_PATTERNS =
  /\b(what is|what are|who is|when did|where is|how many|how much|tell me|explain|define|describe)\b/i;
const CODE_PATTERNS =
  /\b(implement|write (a |the )?(function|class|method|module|script|test|code)|refactor|debug|fix the bug|add (a )?feature|code review|programming|algorithm)\b/i;
const REASON_PATTERNS =
  /\b(analyze|analyse|compare|contrast|evaluate|assess|why does|root cause|pros and cons|trade.?off|reasoning|think through|reason about|implication)\b/i;
const PLAN_PATTERNS =
  /\b(plan|design|architect|strategy|roadmap|steps to|how to build|how to create|how to implement|propose|outline|draft)\b/i;

function detectTaskType(task: string): TaskType {
  if (CODE_PATTERNS.test(task)) return 'code';
  if (PLAN_PATTERNS.test(task)) return 'plan';
  if (REASON_PATTERNS.test(task)) return 'reason';
  if (SUMMARIZE_PATTERNS.test(task)) return 'summarize';
  if (CLASSIFY_PATTERNS.test(task)) return 'classify';
  if (EXTRACT_PATTERNS.test(task)) return 'extract';
  if (QA_PATTERNS.test(task)) return 'qa';
  return 'general';
}

/**
 * Heuristic complexity scoring:
 *  - simple   : short tasks (< 30 words), single-clause, simple task types
 *  - moderate : medium tasks (30–150 words), multi-clause, general/code/reason
 *  - complex  : long tasks (> 150 words), multiple subtasks, planning/reasoning chains
 */
function scoreComplexity(task: string, taskType: TaskType): TaskComplexity {
  const words = task.trim().split(/\s+/).length;
  const hasManySubtasks =
    (task.match(
      /\b(and (then|also)|additionally|furthermore|then|next|finally|step \d|first.*second)\b/gi
    )?.length ?? 0) >= 3;
  const hasComparisons = (task.match(/\bcompare|versus|vs\.?\b/gi)?.length ?? 0) >= 2;

  // code, reason, and plan tasks are never trivially simple — even a short description implies
  // meaningful work that warrants at least a capable-tier model.
  if (
    words < 30 &&
    !hasManySubtasks &&
    taskType !== 'plan' &&
    taskType !== 'reason' &&
    taskType !== 'code'
  ) {
    return 'simple';
  }

  if (words > 150 || hasManySubtasks || hasComparisons || taskType === 'plan') {
    return 'complex';
  }

  return 'moderate';
}

/** Rough token estimate for a task string (input side only). */
function estimateInputTokens(task: string, context?: string): number {
  const combined = task + (context ?? '');
  // ~4 chars per token is a reasonable heuristic
  return Math.ceil(combined.length / 4);
}

export function profileTask(task: string, context?: string): TaskProfile {
  const taskType = detectTaskType(task);
  const complexity = scoreComplexity(task, taskType);
  const estimatedInputTokens = estimateInputTokens(task, context);
  return { complexity, taskType, estimatedInputTokens };
}

// ── Model Router ──────────────────────────────────────────────────────────────

export interface RoutingDecision {
  /** The selected model name, or null if falling back to the caller's default. */
  selectedModel: string | null;
  selectedProvider: string | null;
  tier: ModelTier;
  confidence: number; // 0–1
  taskProfile: TaskProfile;
  /** Estimated cost in USD for a typical invocation at the given token budget. */
  estimatedCostUsd: number;
  /** A cheaper alternative if the selected model is not the cheapest available. */
  cheaperAlternative: { model: string; provider: string; estimatedCostUsd: number } | null;
}

export interface RouterOptions {
  /** Per-personality model allowlist. Empty = all models allowed. */
  allowedModels?: string[];
  /** Caller-configured default model (profile or personality default). */
  defaultModel?: string | null;
  /** Token budget for this delegation (used to estimate cost). */
  tokenBudget?: number;
  /** Optional context string to include in token estimation. */
  context?: string;
}

export class ModelRouter {
  private readonly costCalculator: CostCalculator;

  constructor(costCalculator: CostCalculator) {
    this.costCalculator = costCalculator;
  }

  /**
   * Select the optimal model for a given task.
   *
   * Selection algorithm:
   *  1. Profile the task (complexity + type).
   *  2. Determine the target tier.
   *  3. Get available models (static list; no async API call needed for routing).
   *  4. Filter by allowedModels if set.
   *  5. Filter to models in the target tier (or cheaper if nothing matches).
   *  6. Pick the cheapest model in that tier.
   *  7. If zero candidates survive filtering, return null (fall back to default).
   */
  route(task: string, options: RouterOptions = {}): RoutingDecision {
    const { allowedModels = [], defaultModel, tokenBudget = 50000, context } = options;

    const taskProfile = profileTask(task, context);
    const tier = targetTier(taskProfile);

    const grouped = getAvailableModels(true); // only providers with API keys set
    const allModels: AvailableModel[] = Object.values(grouped).flat();

    // Exclude local/free models from routing decisions if they aren't the only option
    // (they'll still be selected if the personality explicitly allows only them)
    const candidates = allModels.filter((m) => {
      // Respect allowedModels allowlist
      if (allowedModels.length > 0 && !allowedModels.includes(m.model)) return false;
      return true;
    });

    if (candidates.length === 0) {
      return this.fallback(taskProfile, tier, tokenBudget);
    }

    // Find candidates at target tier
    let tieredCandidates = candidates.filter((m) => modelTier(m.model, m.provider) === tier);

    // If nothing at target tier, widen to next cheaper tier
    if (tieredCandidates.length === 0) {
      const fallbackTier: ModelTier = tier === 'premium' ? 'capable' : 'fast';
      tieredCandidates = candidates.filter((m) => modelTier(m.model, m.provider) === fallbackTier);
    }

    // Still nothing — widen to all candidates
    if (tieredCandidates.length === 0) {
      tieredCandidates = candidates;
    }

    if (tieredCandidates.length === 0) {
      return this.fallback(taskProfile, tier, tokenBudget);
    }

    // Sort by estimated cost (cheapest first)
    const sorted = tieredCandidates.slice().sort((a, b) => {
      const ca = this.estimateCostForCandidate(a, tokenBudget);
      const cb = this.estimateCostForCandidate(b, tokenBudget);
      return ca - cb;
    });

    const selected = sorted[0]!;
    const selectedCost = this.estimateCostForCandidate(selected, tokenBudget);

    // Confidence: higher when multiple good candidates exist at the target tier
    const atTargetTier = sorted.filter((m) => modelTier(m.model, m.provider) === tier).length;
    const confidence = atTargetTier >= 2 ? 0.9 : atTargetTier === 1 ? 0.75 : 0.5;

    // If confidence is very low and a defaultModel is configured, respect the default
    if (confidence < 0.5 && defaultModel) {
      return this.fallback(taskProfile, tier, tokenBudget);
    }

    // Cheaper alternative: cheapest model overall vs. selected (may differ if selected isn't local)
    const cheaperAlternative = this.findCheaperAlternative(
      candidates,
      selected,
      selectedCost,
      tokenBudget
    );

    return {
      selectedModel: selected.model,
      selectedProvider: selected.provider,
      tier,
      confidence,
      taskProfile,
      estimatedCostUsd: selectedCost,
      cheaperAlternative,
    };
  }

  /**
   * Estimate the total cost for a task without model selection.
   * Used by the cost-estimate API endpoint before swarm execution.
   */
  estimateCost(
    task: string,
    model: string,
    provider: string,
    tokenBudget = 50000,
    context?: string
  ): number {
    const taskProfile = profileTask(task, context);
    // Use 60/40 input/output split as a reasonable heuristic
    const inputTokens = Math.min(taskProfile.estimatedInputTokens, tokenBudget * 0.6);
    const outputTokens = Math.min(tokenBudget * 0.4, tokenBudget - inputTokens);

    return this.costCalculator.calculate(provider as any, model, {
      inputTokens: Math.ceil(inputTokens),
      outputTokens: Math.ceil(outputTokens),
      cachedTokens: 0,
      totalTokens: Math.ceil(inputTokens + outputTokens),
    });
  }

  private estimateCostForCandidate(model: AvailableModel, tokenBudget: number): number {
    const inputTokens = Math.ceil(tokenBudget * 0.6);
    const outputTokens = Math.ceil(tokenBudget * 0.4);
    return this.costCalculator.calculate(model.provider as any, model.model, {
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      totalTokens: inputTokens + outputTokens,
    });
  }

  private fallback(
    taskProfile: TaskProfile,
    tier: ModelTier,
    tokenBudget: number
  ): RoutingDecision {
    return {
      selectedModel: null,
      selectedProvider: null,
      tier,
      confidence: 0,
      taskProfile,
      estimatedCostUsd: 0,
      cheaperAlternative: null,
    };
  }

  private findCheaperAlternative(
    candidates: AvailableModel[],
    selected: AvailableModel,
    selectedCost: number,
    tokenBudget: number
  ): RoutingDecision['cheaperAlternative'] {
    // Only report an alternative if it's meaningfully cheaper (>20% saving)
    for (const candidate of candidates) {
      if (candidate.model === selected.model) continue;
      const cost = this.estimateCostForCandidate(candidate, tokenBudget);
      if (cost < selectedCost * 0.8) {
        return { model: candidate.model, provider: candidate.provider, estimatedCostUsd: cost };
      }
    }
    return null;
  }
}
