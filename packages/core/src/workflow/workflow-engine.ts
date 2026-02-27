/**
 * WorkflowEngine — DAG-based workflow executor.
 *
 * Executes workflow definitions step-by-step using topological sort.
 * Supports 9 step types, Mustache-style template resolution, retry policies,
 * and four error-handling modes (fail, continue, skip, fallback).
 */

import type { SecureLogger } from '../logging/logger.js';
import type { SubAgentManager } from '../agents/manager.js';
import type { SwarmManager } from '../agents/swarm-manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { WorkflowStorage } from './workflow-storage.js';
import { OutputSchemaValidator } from '../security/output-schema-validator.js';
import type { WorkflowDefinition, WorkflowRun, WorkflowStep } from '@secureyeoman/shared';

const _outputSchemaValidator = new OutputSchemaValidator();

export class WorkflowCycleError extends Error {
  constructor(cycleStepIds: string[]) {
    super(`Workflow contains a cycle involving steps: ${cycleStepIds.join(', ')}`);
    this.name = 'WorkflowCycleError';
  }
}

export interface WorkflowEngineContext {
  steps: Record<string, { output: unknown; status: string }>;
  input: Record<string, unknown>;
}

export interface WorkflowEngineDeps {
  storage: WorkflowStorage;
  subAgentManager?: SubAgentManager | null;
  swarmManager?: SwarmManager | null;
  auditChain?: AuditChain | null;
  logger: SecureLogger;
}

export class WorkflowEngine {
  private readonly storage: WorkflowStorage;
  private readonly subAgentManager: SubAgentManager | null;
  private readonly swarmManager: SwarmManager | null;
  private readonly auditChain: AuditChain | null;
  private readonly logger: SecureLogger;

  constructor(deps: WorkflowEngineDeps) {
    this.storage = deps.storage;
    this.subAgentManager = deps.subAgentManager ?? null;
    this.swarmManager = deps.swarmManager ?? null;
    this.auditChain = deps.auditChain ?? null;
    this.logger = deps.logger;
  }

  // ── Public API ────────────────────────────────────────────────

  async execute(run: WorkflowRun, definition: WorkflowDefinition): Promise<void> {
    this.logger.info('Workflow run started', { runId: run.id, workflowId: definition.id });

    await this.storage.updateRun(run.id, { status: 'running', startedAt: Date.now() });

    const ctx: WorkflowEngineContext = {
      steps: {},
      input: run.input! ?? {},
    };

    try {
      const tiers = this.topologicalSort(definition.steps);

      for (const tier of tiers) {
        await Promise.all(tier.map((stepId) => this.executeStep(stepId, definition, ctx, run.id)));
      }

      const lastOutput = this.buildOutput(ctx);
      await this.storage.updateRun(run.id, {
        status: 'completed',
        output: lastOutput,
        completedAt: Date.now(),
      });

      this.logger.info('Workflow run completed', { runId: run.id });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.storage.updateRun(run.id, {
        status: 'failed',
        error,
        completedAt: Date.now(),
      });
      this.logger.error('Workflow run failed', { runId: run.id, error });
    }
  }

  // ── Topological Sort (Kahn's algorithm) ──────────────────────

  private topologicalSort(steps: WorkflowStep[]): string[][] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, inDegree.get(step.id) ?? 0);
      for (const dep of step.dependsOn) {
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        if (!adjacency.has(dep)) adjacency.set(dep, []);
        adjacency.get(dep)!.push(step.id);
      }
    }

    const tiers: string[][] = [];
    let frontier = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0).map((s) => s.id);

    while (frontier.length > 0) {
      tiers.push(frontier);
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const successor of adjacency.get(id) ?? []) {
          const newDegree = (inDegree.get(successor) ?? 0) - 1;
          inDegree.set(successor, newDegree);
          if (newDegree === 0) nextFrontier.push(successor);
        }
      }
      frontier = nextFrontier;
    }

    const visited = tiers.flat();
    if (visited.length !== steps.length) {
      const cycleSteps = steps.map((s) => s.id).filter((id) => !visited.includes(id));
      throw new WorkflowCycleError(cycleSteps);
    }

    return tiers;
  }

  // ── Step Execution ────────────────────────────────────────────

  private async executeStep(
    stepId: string,
    definition: WorkflowDefinition,
    ctx: WorkflowEngineContext,
    runId: string
  ): Promise<void> {
    const step = definition.steps.find((s) => s.id === stepId);
    if (!step) return;

    // Evaluate optional condition — skip if falsy
    if (step.condition) {
      try {
        const condResult = this.evaluateCondition(step.condition, ctx);
        if (!condResult) {
          ctx.steps[stepId] = { output: null, status: 'skipped' };
          await this.storage
            .createStepRun(runId, step.id, step.name, step.type)
            .then((sr) => this.storage.updateStepRun(sr.id, { status: 'skipped' }));
          return;
        }
      } catch {
        ctx.steps[stepId] = { output: null, status: 'skipped' };
        return;
      }
    }

    const stepRun = await this.storage.createStepRun(runId, step.id, step.name, step.type);
    const startedAt = Date.now();
    await this.storage.updateStepRun(stepRun.id, { status: 'running', startedAt });

    let output: unknown = null;
    let error: string | null = null;

    const maxAttempts = step.retryPolicy?.maxAttempts ?? 1;
    const backoffMs = step.retryPolicy?.backoffMs ?? 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        output = await this.dispatchStep(step, ctx);

        // ── Output schema validation (Phase 54) ───────────────────────────────
        const stepOutputSchema = (step.config as Record<string, unknown> | undefined)?.outputSchema;
        if (stepOutputSchema != null && output != null) {
          const schemaValidation = _outputSchemaValidator.validate(
            output,
            stepOutputSchema as Record<string, unknown>
          );
          if (!schemaValidation.valid) {
            this.logger.warn('Step output schema violation', {
              stepId: step.id,
              stepName: step.name,
              errors: schemaValidation.errors,
            });
            void this.auditChain?.record({
              event: 'step_output_schema_violation',
              level: 'warn',
              message: `Step "${step.name}" output failed schema validation`,
              metadata: {
                stepId: step.id,
                errorCount: schemaValidation.errors.length,
                errors: schemaValidation.errors.map((e) => `${e.path}: ${e.message}`),
              },
            });
          }
        }

        error = null;
        break;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        this.logger.warn('Step execution failed', {
          stepId: step.id,
          attempt: attempt + 1,
          maxAttempts,
          error,
        });
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
        }
      }
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;

    if (error !== null) {
      // Handle onError policy
      switch (step.onError) {
        case 'continue':
          ctx.steps[stepId] = { output: null, status: 'failed' };
          await this.storage.updateStepRun(stepRun.id, {
            status: 'failed',
            error,
            completedAt,
            durationMs,
          });
          break;
        case 'skip':
          ctx.steps[stepId] = { output: null, status: 'skipped' };
          await this.storage.updateStepRun(stepRun.id, {
            status: 'skipped',
            completedAt,
            durationMs,
          });
          break;
        case 'fallback':
          ctx.steps[stepId] = { output: null, status: 'failed' };
          await this.storage.updateStepRun(stepRun.id, {
            status: 'failed',
            error,
            completedAt,
            durationMs,
          });
          // Queue fallback step — will be picked up in next tier if caller handles it
          if (step.fallbackStepId) {
            await this.executeStep(step.fallbackStepId, definition, ctx, runId);
          }
          break;
        default:
          // 'fail' — rethrow to abort the workflow
          await this.storage.updateStepRun(stepRun.id, {
            status: 'failed',
            error,
            completedAt,
            durationMs,
          });
          throw new Error(`Step "${step.id}" failed: ${error}`);
      }
    } else {
      ctx.steps[stepId] = { output, status: 'completed' };
      const outputRecord =
        output !== null && output !== undefined
          ? { result: typeof output === 'string' ? output : JSON.stringify(output) }
          : null;
      await this.storage.updateStepRun(stepRun.id, {
        status: 'completed',
        output: outputRecord,
        completedAt,
        durationMs,
      });
    }
  }

  // ── Step Dispatchers ──────────────────────────────────────────

  private async dispatchStep(step: WorkflowStep, ctx: WorkflowEngineContext): Promise<unknown> {
    const cfg = step.config;

    switch (step.type) {
      case 'agent': {
        if (!this.subAgentManager) {
          throw new Error('SubAgentManager not available for agent step');
        }
        const profile = this.resolveTemplate(String(cfg.profile ?? ''), ctx);
        const task = this.resolveTemplate(String(cfg.taskTemplate ?? ''), ctx);
        const contextStr = cfg.contextTemplate
          ? this.resolveTemplate(String(cfg.contextTemplate), ctx)
          : undefined;
        const result = await this.subAgentManager.delegate({
          profile,
          task,
          context: contextStr,
          modelOverride: cfg.modelOverride ? String(cfg.modelOverride) : undefined,
          maxTokenBudget: cfg.maxTokenBudget ? Number(cfg.maxTokenBudget) : undefined,
        });
        return result.result ?? null;
      }

      case 'tool':
      case 'mcp': {
        // Fallback: log that MCP client not wired — return null
        this.logger.warn('MCP tool step not wired to mcpClientManager', { stepId: step.id });
        return null;
      }

      case 'condition': {
        const expr = String(cfg.expression ?? 'false');
        return this.evaluateCondition(expr, ctx);
      }

      case 'transform': {
        const template = String(cfg.outputTemplate ?? '');
        return this.resolveTemplate(template, ctx);
      }

      case 'resource': {
        // Log resource write intent — actual BrainManager wiring is optional
        const resourceType = String(cfg.resourceType ?? 'memory');
        const data = this.resolveTemplate(String(cfg.dataTemplate ?? ''), ctx);
        this.logger.info('Workflow resource step', {
          resourceType,
          stepId: step.id,
          dataLength: data.length,
        });
        return { resourceType, data };
      }

      case 'webhook': {
        const url = this.resolveTemplate(String(cfg.url ?? ''), ctx);
        const method = String(cfg.method ?? 'POST').toUpperCase();
        const body = cfg.bodyTemplate
          ? this.resolveTemplate(String(cfg.bodyTemplate), ctx)
          : undefined;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (cfg.headersTemplate) {
          try {
            const resolvedHeaders = this.resolveTemplate(String(cfg.headersTemplate), ctx);
            Object.assign(headers, JSON.parse(resolvedHeaders));
          } catch {
            // ignore malformed headers template
          }
        }
        const response = await fetch(url, {
          method,
          headers,
          body: body ?? undefined,
        });
        const responseText = await response.text();
        return { status: response.status, body: responseText };
      }

      case 'subworkflow': {
        const subWorkflowId = String(cfg.workflowId ?? '');
        const subDefinition = await this.storage.getDefinition(subWorkflowId);
        if (!subDefinition) {
          throw new Error(`Sub-workflow not found: ${subWorkflowId}`);
        }
        const subInput: Record<string, unknown> = cfg.inputTemplate
          ? { data: this.resolveTemplate(String(cfg.inputTemplate), ctx) }
          : {};
        const subRun = await this.storage.createRun(
          subDefinition.id,
          subDefinition.name,
          subInput,
          'subworkflow'
        );
        await this.execute(subRun, subDefinition);
        const updatedSubRun = await this.storage.getRun(subRun.id);
        return updatedSubRun?.output ?? null;
      }

      case 'swarm': {
        if (!this.swarmManager) {
          throw new Error('SwarmManager not available for swarm step');
        }
        const templateId = String(cfg.templateId ?? '');
        const task = this.resolveTemplate(String(cfg.taskTemplate ?? ''), ctx);
        const context = cfg.contextTemplate
          ? this.resolveTemplate(String(cfg.contextTemplate), ctx)
          : undefined;
        const tokenBudget = cfg.tokenBudget ? Number(cfg.tokenBudget) : undefined;
        const swarmResult = await this.swarmManager.executeSwarm({
          templateId,
          task,
          context,
          tokenBudget,
          initiatedBy: 'workflow',
        });
        return swarmResult.result ?? null;
      }

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // ── Template Resolution ───────────────────────────────────────

  resolveTemplate(template: string, ctx: WorkflowEngineContext): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const parts = path.trim().split('.');
      let value: unknown = { steps: ctx.steps, input: ctx.input };
      for (const part of parts) {
        if (value === null || value === undefined) return '';
        value = (value as Record<string, unknown>)[part];
      }
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
  }

  // ── Condition Evaluation ──────────────────────────────────────

  evaluateCondition(expr: string, ctx: WorkflowEngineContext): boolean {
    try {
      const fn = new Function('steps', 'input', `"use strict"; return !!(${expr});`);
      return fn(ctx.steps, ctx.input) === true;
    } catch {
      return false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private buildOutput(ctx: WorkflowEngineContext): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [id, step] of Object.entries(ctx.steps)) {
      output[id] = step.output;
    }
    return output;
  }
}
