/**
 * Guardrail Pipeline — Phase 143
 *
 * Extensible chain-of-responsibility filter pipeline for input/output content.
 * Wraps existing guards as builtin filters and supports user-defined custom filters.
 */

import type {
  GuardrailFilter,
  GuardrailFilterContext,
  GuardrailFilterFinding,
  GuardrailFilterResult,
  GuardrailPipelineConfig,
  GuardrailPipelinePersonalityConfig,
  GuardrailPipelineResult,
  FilterExecutionMetric,
} from '@secureyeoman/shared';
import { GuardrailMetricsCollector } from './guardrail-metrics.js';

export interface GuardrailPipelineDeps {
  auditRecord: (params: {
    event: string;
    level: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
  logger?: { info(msg: string, ctx?: Record<string, unknown>): void; warn(msg: string, ctx?: Record<string, unknown>): void; error(msg: string, ctx?: Record<string, unknown>): void };
}

export class GuardrailPipeline {
  private readonly config: GuardrailPipelineConfig;
  private readonly deps: GuardrailPipelineDeps;
  private readonly filters: Map<string, GuardrailFilter> = new Map();
  private sortedFilters: GuardrailFilter[] = [];
  readonly metrics: GuardrailMetricsCollector;

  constructor(config: GuardrailPipelineConfig, deps: GuardrailPipelineDeps) {
    this.config = config;
    this.deps = deps;
    this.metrics = new GuardrailMetricsCollector();
  }

  // ── Filter registration ────────────────────────────────────────────

  registerFilter(filter: GuardrailFilter): void {
    if (this.filters.has(filter.id)) {
      const existing = this.filters.get(filter.id)!;
      existing.dispose?.();
    }
    this.filters.set(filter.id, filter);
    this.rebuildSortOrder();
  }

  unregisterFilter(filterId: string): boolean {
    const filter = this.filters.get(filterId);
    if (!filter) return false;
    filter.dispose?.();
    this.filters.delete(filterId);
    this.rebuildSortOrder();
    return true;
  }

  getFilter(filterId: string): GuardrailFilter | undefined {
    return this.filters.get(filterId);
  }

  listFilters(): GuardrailFilter[] {
    return [...this.sortedFilters];
  }

  private rebuildSortOrder(): void {
    this.sortedFilters = [...this.filters.values()].sort((a, b) => a.priority - b.priority);
  }

  // ── Pipeline execution ─────────────────────────────────────────────

  async runInput(
    text: string,
    ctx: Omit<GuardrailFilterContext, 'direction' | 'dryRun'>,
    personalityCfg?: GuardrailPipelinePersonalityConfig
  ): Promise<GuardrailPipelineResult> {
    return this.run(text, { ...ctx, direction: 'input', dryRun: false }, personalityCfg);
  }

  async runOutput(
    text: string,
    ctx: Omit<GuardrailFilterContext, 'direction' | 'dryRun'>,
    personalityCfg?: GuardrailPipelinePersonalityConfig
  ): Promise<GuardrailPipelineResult> {
    return this.run(text, { ...ctx, direction: 'output', dryRun: false }, personalityCfg);
  }

  private async run(
    text: string,
    baseCtx: GuardrailFilterContext,
    personalityCfg?: GuardrailPipelinePersonalityConfig
  ): Promise<GuardrailPipelineResult> {
    if (!this.config.enabled) {
      return { passed: true, text, findings: [] };
    }

    const dryRun = personalityCfg?.dryRun ?? this.config.dryRun;
    const ctx: GuardrailFilterContext = { ...baseCtx, dryRun };
    const activeFilters = this.resolveActiveFilters(personalityCfg);

    const allFindings: GuardrailFilterFinding[] = [];
    const filterMetrics: FilterExecutionMetric[] = [];
    let currentText = text;
    let blocked = false;

    for (const filter of activeFilters) {
      const hook = ctx.direction === 'input' ? filter.onInput : filter.onOutput;
      if (!hook) continue;

      const startTime = performance.now();
      let result: GuardrailFilterResult;
      let action: FilterExecutionMetric['action'] = 'passed';

      try {
        result = await hook.call(filter, currentText, ctx);
      } catch (err) {
        action = 'error';
        const durationMs = performance.now() - startTime;
        this.deps.logger?.error('Guardrail filter error', {
          filterId: filter.id,
          error: String(err),
        });

        if (this.config.metricsEnabled) {
          const metric: FilterExecutionMetric = {
            filterId: filter.id,
            filterName: filter.name,
            direction: ctx.direction,
            durationMs,
            findingCount: 0,
            action,
          };
          filterMetrics.push(metric);
          this.metrics.record(metric);
        }
        // Fail-open on filter errors
        continue;
      }

      const durationMs = performance.now() - startTime;

      if (!result.passed) {
        action = 'blocked';
        blocked = true;
      }

      allFindings.push(...result.findings);
      currentText = result.text;

      if (this.config.metricsEnabled) {
        const metric: FilterExecutionMetric = {
          filterId: filter.id,
          filterName: filter.name,
          direction: ctx.direction,
          durationMs,
          findingCount: result.findings.length,
          action,
        };
        filterMetrics.push(metric);
        this.metrics.record(metric);
      }

      // In dry-run mode, record block but don't stop the chain
      if (blocked && !dryRun) {
        this.deps.auditRecord({
          event: 'guardrail_pipeline_blocked',
          level: 'warn',
          message: `Guardrail filter '${filter.name}' blocked content`,
          metadata: {
            filterId: filter.id,
            direction: ctx.direction,
            personalityId: ctx.personalityId,
            findingCount: result.findings.length,
          },
        });
        break;
      }
    }

    if (allFindings.length > 0) {
      this.deps.auditRecord({
        event: 'guardrail_pipeline_scan',
        level: blocked && !dryRun ? 'warn' : 'info',
        message: `Guardrail pipeline ${ctx.direction}: ${allFindings.length} finding(s)${dryRun ? ' (dry-run)' : ''}`,
        metadata: {
          direction: ctx.direction,
          personalityId: ctx.personalityId,
          blocked: blocked && !dryRun,
          dryRun,
          filterIds: [...new Set(allFindings.map((f) => f.filterId))],
          findingCount: allFindings.length,
        },
      });
    }

    return {
      passed: dryRun ? true : !blocked,
      text: currentText,
      findings: allFindings,
      filterMetrics: this.config.metricsEnabled ? filterMetrics : undefined,
    };
  }

  // ── Filter resolution ──────────────────────────────────────────────

  private resolveActiveFilters(
    personalityCfg?: GuardrailPipelinePersonalityConfig
  ): GuardrailFilter[] {
    const globalDisabled = new Set(this.config.disabledFilters);
    const personalityDisabled = new Set(personalityCfg?.disabledFilters ?? []);
    const personalityAllowlist = personalityCfg?.enabledFilters
      ? new Set(personalityCfg.enabledFilters)
      : null;

    return this.sortedFilters.filter((f) => {
      if (!f.enabled) return false;
      if (globalDisabled.has(f.id)) return false;
      if (personalityDisabled.has(f.id)) return false;
      if (personalityAllowlist && !personalityAllowlist.has(f.id)) return false;
      return true;
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  dispose(): void {
    for (const filter of this.filters.values()) {
      filter.dispose?.();
    }
    this.filters.clear();
    this.sortedFilters = [];
  }
}
