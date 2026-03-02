/**
 * WorkflowEngine — DAG-based workflow executor.
 *
 * Executes workflow definitions step-by-step using topological sort.
 * Supports 16 step types, Mustache-style template resolution, retry policies,
 * and four error-handling modes (fail, continue, skip, fallback).
 *
 * Phase 73 adds 5 ML pipeline step types:
 *   data_curation, training_job, evaluation, conditional_deploy, human_approval
 *
 * Phase 90 adds 2 CI/CD step types:
 *   ci_trigger — dispatch a CI job, returns { runId, url, status: 'queued' }
 *   ci_wait   — poll until completion, returns { status, conclusion, logs_url, durationMs }
 */

import type { SecureLogger } from '../logging/logger.js';
import type { SubAgentManager } from '../agents/manager.js';
import type { SwarmManager } from '../agents/swarm-manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { WorkflowStorage } from './workflow-storage.js';
import { OutputSchemaValidator } from '../security/output-schema-validator.js';
import type { DataCurationManager } from '../training/data-curation.js';
import type { EvaluationManager } from '../training/evaluation-manager.js';
import type { PipelineApprovalManager } from '../training/approval-manager.js';
import type { PipelineLineageStorage } from '../training/pipeline-lineage.js';
import type { DistillationManager } from '../training/distillation-manager.js';
import type { FinetuneManager } from '../training/finetune-manager.js';
import type { WorkflowDefinition, WorkflowRun, WorkflowStep } from '@secureyeoman/shared';
import { assertPublicUrl } from '../utils/ssrf-guard.js';
import type { AlertManager } from '../telemetry/alert-manager.js';
import { emitJobCompletion } from '../telemetry/job-completion-events.js';

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

/** Credential bundle for CI/CD step types (ci_trigger, ci_wait). Phase 90. */
export interface CicdEngineConfig {
  /** GitHub token for GitHub Actions steps. */
  githubToken?: string;
  /** Jenkins server base URL. */
  jenkinsUrl?: string;
  /** Jenkins Basic Auth username. */
  jenkinsUsername?: string;
  /** Jenkins Basic Auth API token. */
  jenkinsApiToken?: string;
  /** GitLab server URL (default: https://gitlab.com). */
  gitlabUrl?: string;
  /** GitLab Personal Access Token. */
  gitlabToken?: string;
  /** Northflank API key. */
  northflankApiKey?: string;
}

export interface WorkflowEngineDeps {
  storage: WorkflowStorage;
  subAgentManager?: SubAgentManager | null;
  swarmManager?: SwarmManager | null;
  auditChain?: AuditChain | null;
  logger: SecureLogger;
  // ML Pipeline deps (Phase 73)
  dataCurationManager?: DataCurationManager | null;
  distillationManager?: DistillationManager | null;
  finetuneManager?: FinetuneManager | null;
  evaluationManager?: EvaluationManager | null;
  approvalManager?: PipelineApprovalManager | null;
  lineageStorage?: PipelineLineageStorage | null;
  // CI/CD deps (Phase 90)
  cicdConfig?: CicdEngineConfig | null;
  // Alert pipeline (Phase 104)
  alertManager?: AlertManager | null;
}

export class WorkflowEngine {
  private readonly storage: WorkflowStorage;
  private readonly subAgentManager: SubAgentManager | null;
  private readonly swarmManager: SwarmManager | null;
  private readonly auditChain: AuditChain | null;
  private readonly logger: SecureLogger;
  /** Compiled condition functions, keyed by expression string. */
  private readonly _conditionCache = new Map<string, (...args: unknown[]) => unknown>();
  private static readonly MAX_CONDITION_CACHE = 1000;
  // ML Pipeline managers (Phase 73)
  private readonly dataCurationManager: DataCurationManager | null;
  private readonly distillationManager: DistillationManager | null;
  private readonly finetuneManager: FinetuneManager | null;
  private readonly evaluationManager: EvaluationManager | null;
  private readonly approvalManager: PipelineApprovalManager | null;
  private readonly lineageStorage: PipelineLineageStorage | null;
  // CI/CD config (Phase 90)
  private readonly cicdConfig: CicdEngineConfig | null;
  // Alert pipeline (Phase 104)
  private readonly alertManager: AlertManager | null;

  constructor(deps: WorkflowEngineDeps) {
    this.storage = deps.storage;
    this.subAgentManager = deps.subAgentManager ?? null;
    this.swarmManager = deps.swarmManager ?? null;
    this.auditChain = deps.auditChain ?? null;
    this.logger = deps.logger;
    this.dataCurationManager = deps.dataCurationManager ?? null;
    this.distillationManager = deps.distillationManager ?? null;
    this.finetuneManager = deps.finetuneManager ?? null;
    this.evaluationManager = deps.evaluationManager ?? null;
    this.approvalManager = deps.approvalManager ?? null;
    this.lineageStorage = deps.lineageStorage ?? null;
    this.cicdConfig = deps.cicdConfig ?? null;
    this.alertManager = deps.alertManager ?? null;
  }

  // ── Public API ────────────────────────────────────────────────

  async execute(run: WorkflowRun, definition: WorkflowDefinition): Promise<void> {
    this.logger.info('Workflow run started', { runId: run.id, workflowId: definition.id });

    const startTime = Date.now();
    await this.storage.updateRun(run.id, { status: 'running', startedAt: startTime });

    const ctx: WorkflowEngineContext = {
      steps: {},
      input: run.input ?? {},
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

      void emitJobCompletion(this.alertManager, {
        jobType: 'workflow',
        status: 'completed',
        jobId: run.id,
        jobName: definition.name,
        durationMs: Date.now() - startTime,
      }, this.logger);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.storage.updateRun(run.id, {
        status: 'failed',
        error,
        completedAt: Date.now(),
      });
      this.logger.error('Workflow run failed', { runId: run.id, error });

      void emitJobCompletion(this.alertManager, {
        jobType: 'workflow',
        status: 'failed',
        jobId: run.id,
        jobName: definition.name,
        durationMs: Date.now() - startTime,
      }, this.logger);
    }
  }

  // ── Topological Sort (Kahn's algorithm) ──────────────────────

  private topologicalSort(steps: WorkflowStep[]): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      // For 'any' steps, require only 1 dep to complete (not all of them).
      const required =
        step.triggerMode === 'any' ? Math.min(1, step.dependsOn.length) : step.dependsOn.length;
      inDegree.set(step.id, required);
      for (const dep of step.dependsOn) {
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
          const current = inDegree.get(successor) ?? 0;
          if (current <= 0) continue; // already enqueued (e.g. 'any' step with multiple deps)
          const newDegree = current - 1;
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

    // For 'any' trigger mode: skip if no dep completed (all failed/skipped)
    if (step.triggerMode === 'any' && step.dependsOn.length > 0) {
      const anyDepCompleted = step.dependsOn.some(
        (depId) => ctx.steps[depId]?.status === 'completed'
      );
      if (!anyDepCompleted) {
        ctx.steps[stepId] = { output: null, status: 'skipped' };
        await this.storage
          .createStepRun(runId, step.id, step.name, step.type)
          .then((sr) => this.storage.updateStepRun(sr.id, { status: 'skipped' }));
        return;
      }
    }

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
        output = await this.dispatchStep(step, ctx, runId, definition.id);

        // ── Output schema validation (Phase 54 + Phase 83 strict mode) ──────
        const stepCfg = step.config as Record<string, unknown> | undefined;
        const stepOutputSchema = stepCfg?.outputSchema;
        const outputSchemaMode = (stepCfg?.outputSchemaMode as string | undefined) ?? 'audit';
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
            if (outputSchemaMode === 'strict') {
              throw new Error(
                `Step "${step.id}" output failed schema validation (${schemaValidation.errors.length} error(s)): ` +
                  schemaValidation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
              );
            }
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

  private async dispatchStep(
    step: WorkflowStep,
    ctx: WorkflowEngineContext,
    runId: string,
    workflowId: string
  ): Promise<unknown> {
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
        assertPublicUrl(url, 'Webhook URL');
        const method = String(cfg.method ?? 'POST').toUpperCase();
        const body = cfg.bodyTemplate
          ? this.resolveTemplate(String(cfg.bodyTemplate), ctx)
          : undefined;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (cfg.headersTemplate) {
          try {
            const resolvedHeaders = this.resolveTemplate(String(cfg.headersTemplate), ctx);
            const parsed = JSON.parse(resolvedHeaders) as Record<string, unknown>;
            for (const key of Object.keys(parsed)) {
              if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
              headers[key] = String(parsed[key]);
            }
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

      // ── ML Pipeline step types (Phase 73) ────────────────────────

      case 'data_curation': {
        if (!this.dataCurationManager) {
          throw new Error('DataCurationManager not available for data_curation step');
        }
        const outputDir = this.resolveTemplate(
          String(cfg.outputDir ?? '/tmp/secureyeoman-datasets'),
          ctx
        );
        const personalityIdsRaw = cfg.personalityIds;
        const personalityIds = Array.isArray(personalityIdsRaw)
          ? (personalityIdsRaw as string[])
          : personalityIdsRaw
            ? [this.resolveTemplate(String(personalityIdsRaw), ctx)]
            : undefined;
        const descriptor = await this.dataCurationManager.curateDataset({
          outputDir,
          personalityIds,
          minTurns: cfg.minTurns != null ? Number(cfg.minTurns) : undefined,
          maxConversations: cfg.maxConversations != null ? Number(cfg.maxConversations) : undefined,
          fromTs: cfg.fromTs != null ? Number(cfg.fromTs) : undefined,
          toTs: cfg.toTs != null ? Number(cfg.toTs) : undefined,
        });
        // Record lineage
        if (this.lineageStorage) {
          await this.lineageStorage.recordDataset(runId, workflowId, {
            datasetId: descriptor.datasetId,
            path: descriptor.path,
            sampleCount: descriptor.sampleCount,
            filters: descriptor.filters as Record<string, unknown>,
            snapshotAt: descriptor.snapshotAt,
          });
        }
        return descriptor;
      }

      case 'training_job': {
        const jobType = String(cfg.jobType ?? 'finetune') as 'distillation' | 'finetune';
        const jobId = this.resolveTemplate(String(cfg.jobId ?? ''), ctx);
        const timeoutMs = Number(cfg.timeoutMs ?? 3_600_000); // 1h default
        const pollIntervalMs = Number(cfg.pollIntervalMs ?? 30_000); // 30s default

        if (jobType === 'finetune') {
          if (!this.finetuneManager) {
            throw new Error('FinetuneManager not available for training_job step');
          }
          const job = await this.finetuneManager.getJob(jobId);
          if (!job) throw new Error(`Finetune job not found: ${jobId}`);
          if (job.status === 'pending') {
            await this.finetuneManager.startJob(jobId);
          }
          const finalJob = await this.pollUntilDone(
            () => this.finetuneManager!.getJob(jobId).then((j) => j?.status ?? 'failed'),
            ['complete', 'failed', 'cancelled'],
            timeoutMs,
            pollIntervalMs
          );
          const finalStatus = await this.finetuneManager.getJob(jobId);
          if (finalJob === 'failed' || finalJob === 'cancelled') {
            throw new Error(
              `Finetune job ${jobId} ended with status: ${finalJob} — ${finalStatus?.errorMessage ?? ''}`
            );
          }
          if (this.lineageStorage) {
            await this.lineageStorage.recordTrainingJob(runId, workflowId, {
              jobId,
              jobType: 'finetune',
              jobStatus: finalJob,
            });
          }
          return {
            jobId,
            jobType: 'finetune',
            status: finalJob,
            adapterPath: finalStatus?.adapterPath ?? null,
            experimentId: jobId,
          };
        } else {
          // distillation
          if (!this.distillationManager) {
            throw new Error('DistillationManager not available for training_job step');
          }
          const job = await this.distillationManager.getJob(jobId);
          if (!job) throw new Error(`Distillation job not found: ${jobId}`);
          // Distillation job must be started externally (requires teacher client)
          // This step just polls for completion.
          const finalStatus = await this.pollUntilDone(
            () => this.distillationManager!.getJob(jobId).then((j) => j?.status ?? 'failed'),
            ['complete', 'failed', 'cancelled'],
            timeoutMs,
            pollIntervalMs
          );
          if (finalStatus === 'failed' || finalStatus === 'cancelled') {
            const j = await this.distillationManager.getJob(jobId);
            throw new Error(
              `Distillation job ${jobId} ended with status: ${finalStatus} — ${j?.errorMessage ?? ''}`
            );
          }
          const finalJob = await this.distillationManager.getJob(jobId);
          if (this.lineageStorage) {
            await this.lineageStorage.recordTrainingJob(runId, workflowId, {
              jobId,
              jobType: 'distillation',
              jobStatus: finalStatus,
            });
          }
          return {
            jobId,
            jobType: 'distillation',
            status: finalStatus,
            outputPath: finalJob?.outputPath ?? null,
            experimentId: jobId,
          };
        }
      }

      case 'evaluation': {
        if (!this.evaluationManager) {
          throw new Error('EvaluationManager not available for evaluation step');
        }
        const datasetPath = cfg.datasetPath
          ? this.resolveTemplate(String(cfg.datasetPath), ctx)
          : undefined;
        const maxSamples = cfg.maxSamples != null ? Number(cfg.maxSamples) : undefined;
        // Inline samples if provided
        const samplesRaw = cfg.samples;
        const samples = Array.isArray(samplesRaw)
          ? (samplesRaw as { prompt: string; gold: string }[])
          : undefined;
        if (!datasetPath && (!samples || samples.length === 0)) {
          throw new Error('evaluation step requires either cfg.datasetPath or cfg.samples');
        }
        // Model function: use webhook-style call to a local model endpoint if provided
        const modelEndpoint = cfg.modelEndpoint
          ? this.resolveTemplate(String(cfg.modelEndpoint), ctx)
          : null;
        const modelFn = async (prompt: string): Promise<string> => {
          if (!modelEndpoint) return '(no model endpoint configured)';
          const response = await fetch(modelEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          });
          const json = (await response.json()) as { response?: string; text?: string };
          return json.response ?? json.text ?? '';
        };
        const result = await this.evaluationManager.runEvaluation({
          samples,
          datasetPath,
          maxSamples,
          modelFn,
        });
        if (this.lineageStorage) {
          // Filter out undefined optional metrics before storing (Record<string, number> contract)
          const definedMetrics: Record<string, number> = {};
          for (const [k, v] of Object.entries(result.metrics)) {
            if (typeof v === 'number') definedMetrics[k] = v;
          }
          await this.lineageStorage.recordEvaluation(runId, workflowId, {
            evalId: result.evalId,
            metrics: definedMetrics,
            completedAt: result.completedAt,
          });
        }
        return result;
      }

      case 'conditional_deploy': {
        // Read the metric value from context (e.g. {{steps.eval.output.metrics.char_similarity}})
        const metricPath = String(cfg.metricPath ?? '');
        const metricValueStr = this.resolveTemplate(`{{${metricPath}}}`, ctx);
        const metricValue = parseFloat(metricValueStr);
        const threshold = Number(cfg.threshold ?? 0.5);
        const modelVersion = cfg.modelVersion
          ? this.resolveTemplate(String(cfg.modelVersion), ctx)
          : '';
        const personalityId = cfg.personalityId
          ? this.resolveTemplate(String(cfg.personalityId), ctx)
          : '';
        const jobId = cfg.jobId ? this.resolveTemplate(String(cfg.jobId), ctx) : '';
        const ollamaUrl = cfg.ollamaUrl
          ? this.resolveTemplate(String(cfg.ollamaUrl), ctx)
          : 'http://ollama:11434';

        const passes = !isNaN(metricValue) && metricValue >= threshold;
        this.logger.info('conditional_deploy: evaluating threshold', {
          metricPath,
          metricValue,
          threshold,
          passes,
        });

        if (passes) {
          // Attempt to register fine-tuned adapter with Ollama if finetuneManager available
          if (this.finetuneManager && jobId) {
            try {
              await this.finetuneManager.registerWithOllama(jobId, ollamaUrl);
              this.logger.info('conditional_deploy: registered adapter with Ollama', { jobId });
            } catch (err) {
              this.logger.warn('conditional_deploy: Ollama registration failed (non-fatal)', {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          if (this.lineageStorage && (modelVersion || jobId)) {
            await this.lineageStorage.recordDeployment(runId, workflowId, {
              modelVersion: modelVersion || jobId,
              personalityId,
              deployedAt: Date.now(),
            });
          }
          return { deployed: true, metricValue, threshold, modelVersion, personalityId };
        } else {
          const reason = `Metric ${metricValue.toFixed(4)} < threshold ${threshold}`;
          this.logger.info('conditional_deploy: threshold not met, skipping deploy', { reason });
          return { deployed: false, metricValue, threshold, reason };
        }
      }

      case 'human_approval': {
        if (!this.approvalManager) {
          throw new Error('ApprovalManager not available for human_approval step');
        }
        const timeoutMs = Number(cfg.timeoutMs ?? 86_400_000); // 24h default
        // Build report from context
        const reportTemplate = cfg.reportTemplate
          ? this.resolveTemplate(String(cfg.reportTemplate), ctx)
          : null;
        let report: Record<string, unknown> | undefined;
        if (reportTemplate) {
          try {
            report = JSON.parse(reportTemplate) as Record<string, unknown>;
          } catch {
            report = { summary: reportTemplate };
          }
        }
        const request = await this.approvalManager.createRequest({
          workflowRunId: runId,
          stepId: step.id,
          report,
          timeoutMs,
        });
        this.logger.info('human_approval: approval request created, waiting for decision', {
          requestId: request.id,
          runId,
          timeoutMs,
        });
        // Block until approved/rejected/timed-out
        await this.approvalManager.waitForDecision(request.id);
        return { approved: true, requestId: request.id };
      }

      case 'ci_trigger': {
        // Fire a CI/CD job and return immediately with the queued run info.
        const provider = String(cfg.provider ?? 'github-actions');
        const owner = this.resolveTemplate(String(cfg.owner ?? ''), ctx);
        const repo = this.resolveTemplate(String(cfg.repo ?? ''), ctx);
        const ref = this.resolveTemplate(String(cfg.ref ?? 'main'), ctx);
        const workflowId = this.resolveTemplate(String(cfg.workflowId ?? ''), ctx);
        const inputsRaw = cfg.inputs ? this.resolveTemplate(JSON.stringify(cfg.inputs), ctx) : '{}';
        const inputs = JSON.parse(inputsRaw) as Record<string, string>;

        this.logger.info('ci_trigger: dispatching CI job', {
          provider,
          owner,
          repo,
          ref,
          workflowId,
        });

        if (provider === 'github-actions') {
          const token =
            this.cicdConfig?.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
          const headers: Record<string, string> = {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          };
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
            { method: 'POST', headers, body: JSON.stringify({ ref, inputs }) }
          );
          if (!res.ok && res.status !== 204) {
            const errBody = await res.text();
            throw new Error(`GitHub Actions dispatch failed (${res.status}): ${errBody}`);
          }
          // GHA dispatch returns 204 — no run ID is synchronously available.
          // Return a sentinel so ci_wait can poll by listing runs.
          return {
            runId: 'dispatched',
            url: `https://github.com/${owner}/${repo}/actions`,
            status: 'queued',
            provider,
            owner,
            repo,
            ref,
            workflowId,
          };
        }

        if (provider === 'gitlab') {
          const gitlabUrl = (this.cicdConfig?.gitlabUrl ?? 'https://gitlab.com').replace(/\/$/, '');
          const gitlabToken = this.cicdConfig?.gitlabToken;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (gitlabToken) headers['PRIVATE-TOKEN'] = gitlabToken;
          const projectId = this.resolveTemplate(String(cfg.projectId ?? ''), ctx);
          const variables = inputs;
          const variableList = Object.entries(variables).map(([key, value]) => ({ key, value }));
          const res = await fetch(`${gitlabUrl}/api/v4/projects/${projectId}/pipeline`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ref, variables: variableList }),
          });
          if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`GitLab pipeline trigger failed (${res.status}): ${errBody}`);
          }
          const data = (await res.json()) as { id: number; web_url: string };
          return {
            runId: String(data.id),
            url: data.web_url,
            status: 'queued',
            provider,
            projectId,
            ref,
          };
        }

        throw new Error(
          `ci_trigger: unsupported provider "${provider}". Supported: github-actions, gitlab`
        );
      }

      case 'ci_wait': {
        // Poll a CI run until it reaches a terminal state.
        const provider = String(cfg.provider ?? 'github-actions');
        const runId = this.resolveTemplate(String(cfg.runId ?? ''), ctx);
        const pollMs = Number(cfg.pollIntervalMs ?? 10_000);
        const timeoutMs = Number(cfg.timeoutMs ?? 1_800_000); // 30 min default

        this.logger.info('ci_wait: polling CI run', { provider, runId, pollMs, timeoutMs });

        const deadline = Date.now() + timeoutMs;
        const startedAt = Date.now();

        if (provider === 'github-actions') {
          const owner = this.resolveTemplate(String(cfg.owner ?? ''), ctx);
          const repo = this.resolveTemplate(String(cfg.repo ?? ''), ctx);
          const token =
            this.cicdConfig?.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
          const headers: Record<string, string> = {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          };
          if (token) headers.Authorization = `Bearer ${token}`;
          const terminalStatuses = new Set(['completed']);
          while (Date.now() < deadline) {
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
              { headers }
            );
            if (res.ok) {
              const data = (await res.json()) as {
                status: string;
                conclusion: string;
                logs_url?: string;
                html_url: string;
              };
              if (terminalStatuses.has(data.status)) {
                return {
                  status: data.status,
                  conclusion: data.conclusion,
                  logs_url: data.logs_url ?? data.html_url,
                  durationMs: Date.now() - startedAt,
                };
              }
            }
            await new Promise((r) => setTimeout(r, pollMs));
          }
          throw new Error(
            `ci_wait: GitHub Actions run ${runId} did not complete within ${timeoutMs}ms`
          );
        }

        if (provider === 'gitlab') {
          const gitlabUrl = (this.cicdConfig?.gitlabUrl ?? 'https://gitlab.com').replace(/\/$/, '');
          const gitlabToken = this.cicdConfig?.gitlabToken;
          const projectId = this.resolveTemplate(String(cfg.projectId ?? ''), ctx);
          const headers: Record<string, string> = {};
          if (gitlabToken) headers['PRIVATE-TOKEN'] = gitlabToken;
          const terminalStatuses = new Set(['success', 'failed', 'canceled', 'skipped']);
          while (Date.now() < deadline) {
            const res = await fetch(
              `${gitlabUrl}/api/v4/projects/${projectId}/pipelines/${runId}`,
              { headers }
            );
            if (res.ok) {
              const data = (await res.json()) as { status: string; web_url: string };
              if (terminalStatuses.has(data.status)) {
                return {
                  status: data.status,
                  conclusion: data.status,
                  logs_url: data.web_url,
                  durationMs: Date.now() - startedAt,
                };
              }
            }
            await new Promise((r) => setTimeout(r, pollMs));
          }
          throw new Error(
            `ci_wait: GitLab pipeline ${runId} did not complete within ${timeoutMs}ms`
          );
        }

        throw new Error(
          `ci_wait: unsupported provider "${provider}". Supported: github-actions, gitlab`
        );
      }

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // ── Polling helper ────────────────────────────────────────────

  /**
   * Poll a status function until it returns one of the terminal statuses,
   * or until the deadline is reached.
   */
  private async pollUntilDone(
    getStatus: () => Promise<string>,
    terminalStatuses: string[],
    timeoutMs: number,
    pollIntervalMs: number
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await getStatus();
      if (terminalStatuses.includes(status)) return status;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Job did not complete within ${timeoutMs}ms timeout`);
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
      let fn = this._conditionCache.get(expr);
      if (!fn) {
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        fn = new Function('steps', 'input', `"use strict"; return !!(${expr});`) as (
          ...args: unknown[]
        ) => unknown;
        if (this._conditionCache.size >= WorkflowEngine.MAX_CONDITION_CACHE) {
          const oldest = this._conditionCache.keys().next().value;
          if (oldest !== undefined) this._conditionCache.delete(oldest);
        }
        this._conditionCache.set(expr, fn);
      }
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
