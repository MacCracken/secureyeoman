/**
 * Szal Workflow Engine — TypeScript wrapper for Rust NAPI bindings.
 *
 * Provides condition evaluation, flow validation, step building,
 * DAG construction, and template resolution.
 * Falls back to JS implementations when native module is unavailable.
 */

import { native } from './index.js';

// ── Condition Evaluation ──────────────────────────────────────────────────

/**
 * Evaluate a condition expression against a JSON context.
 * Expression format: `steps.build.status == 'completed' && input.env == 'prod'`
 */
export function evaluateCondition(expression: string, context: unknown): boolean {
  if (native?.szalEvaluateCondition) {
    return native.szalEvaluateCondition(expression, JSON.stringify(context));
  }
  return evaluateConditionJS(expression, context);
}

// ── Flow Validation ───────────────────────────────────────────────────────

export interface FlowValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a workflow flow definition (cycle detection, dependency resolution).
 */
export function validateFlow(flowJson: string): FlowValidationResult {
  if (native?.szalValidateFlow) {
    return JSON.parse(native.szalValidateFlow(flowJson)) as FlowValidationResult;
  }
  return { valid: true }; // JS fallback: skip validation
}

// ── Step Builder ──────────────────────────────────────────────────────────

export interface StepConfig {
  name: string;
  description?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  backoff?: 'fixed' | 'linear' | 'exponential';
  rollbackable?: boolean;
  stepType?: string;
  config?: unknown;
  condition?: string;
  dependsOn?: string[];
  triggerMode?: 'all' | 'any';
}

/**
 * Create a step definition with generated UUID.
 * Returns JSON StepDef.
 */
export function createStep(config: StepConfig): string {
  if (native?.szalCreateStep) {
    return native.szalCreateStep(JSON.stringify(config));
  }
  // JS fallback: minimal step object
  return JSON.stringify({
    id: crypto.randomUUID(),
    name: config.name,
    description: config.description ?? '',
    timeout_ms: config.timeoutMs ?? 30_000,
    max_retries: config.maxRetries ?? 0,
    retry_delay_ms: config.retryDelayMs ?? 1_000,
    backoff: config.backoff ?? 'fixed',
    rollbackable: config.rollbackable ?? false,
    step_type: config.stepType ?? null,
    config: config.config ?? null,
    condition: config.condition ?? null,
    depends_on: config.dependsOn ?? [],
    trigger_mode: config.triggerMode ?? 'all',
    sub_steps: [],
  });
}

// ── DAG Flow Builder ──────────────────────────────────────────────────────

/**
 * Build and validate a DAG flow from step definitions.
 * Returns the validated flow JSON or throws on cycle detection.
 */
export function buildDagFlow(name: string, stepsJson: string): string {
  if (native?.szalBuildDagFlow) {
    return native.szalBuildDagFlow(name, stepsJson);
  }
  // JS fallback: wrap without validation
  return JSON.stringify({ name, mode: 'dag', steps: JSON.parse(stepsJson) });
}

// ── Template Resolution ───────────────────────────────────────────────────

/**
 * Resolve template variables with dot-notation path walking.
 * `{{steps.build.output.url}}` → walks into nested JSON context.
 */
export function resolveTemplate(template: string, context: unknown): string {
  if (native?.szalResolveTemplate) {
    return native.szalResolveTemplate(template, JSON.stringify(context));
  }
  return resolveTemplateJS(template, context);
}

// ── JS Fallbacks ──────────────────────────────────────────────────────────

function evaluateConditionJS(expression: string, context: unknown): boolean {
  // Simple evaluator: supports path == 'value' && path != 'value'
  const ctx = context as Record<string, unknown>;

  const resolvePath = (path: string): unknown => {
    const parts = path.trim().split('.');
    let value: unknown = ctx;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };

  // Handle && and || by splitting
  if (expression.includes('||')) {
    return expression.split('||').some((part) => evaluateConditionJS(part.trim(), context));
  }
  if (expression.includes('&&')) {
    return expression.split('&&').every((part) => evaluateConditionJS(part.trim(), context));
  }

  // Handle == and !=
  const eqMatch = expression.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
  if (eqMatch) {
    const left = resolvePath(eqMatch[1]!);
    const rightRaw = eqMatch[3]!.trim();
    const right = rightRaw.startsWith("'")
      ? rightRaw.slice(1, -1)
      : rightRaw === 'true'
        ? true
        : rightRaw === 'false'
          ? false
          : Number(rightRaw);
    return eqMatch[2] === '==' ? left === right : left !== right;
  }

  // Bare path = truthy check
  return !!resolvePath(expression);
}

function resolveTemplateJS(template: string, context: unknown): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split('.');
    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return '';
      value = (value as Record<string, unknown>)[part];
    }
    if (value == null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}
