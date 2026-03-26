/**
 * SwarmManager — Orchestrates agent swarms across sequential, parallel, and dynamic strategies.
 *
 * Includes cost-aware scheduling (ADR 085): profiles each role's task type and routes
 * summarisation/classification subtasks to cheaper/faster models while reserving capable
 * models for reasoning-heavy steps.
 */

import type { SecureLogger } from '../logging/logger.js';
import type { SubAgentManager } from './manager.js';
import { SwarmStorage } from './swarm-storage.js';
import { ModelRouter, profileTask } from '../ai/model-router.js';
import type { CostCalculator } from '../ai/cost-calculator.js';
import type {
  SwarmTemplate,
  SwarmTemplateCreate,
  SwarmRun,
  SwarmRunParams,
  SwarmMember,
} from '@secureyeoman/shared';
import { errorToString } from '../utils/errors.js';
import { isEligibleForNative, executeViaNative } from './agnosai-bridge.js';
import type { AgentProfile } from './types.js';

export interface SwarmManagerDeps {
  storage: SwarmStorage;
  subAgentManager: SubAgentManager;
  logger: SecureLogger;
  /** Cost calculator injected for cost-aware swarm scheduling. */
  costCalculator?: CostCalculator;
  /** Per-personality model allowlist forwarded to the model router. */
  allowedModels?: string[];
  /** Active LLM provider name. When 'hoosh', model routing delegates provider selection. */
  activeProvider?: string;
}

export class SwarmManager {
  private readonly storage: SwarmStorage;
  private readonly subAgentManager: SubAgentManager;
  private readonly logger: SecureLogger;
  private readonly modelRouter: ModelRouter | null;
  private readonly allowedModels: string[];
  private readonly activeProvider: string | undefined;

  constructor(deps: SwarmManagerDeps) {
    this.storage = deps.storage;
    this.subAgentManager = deps.subAgentManager;
    this.logger = deps.logger;
    this.modelRouter = deps.costCalculator ? new ModelRouter(deps.costCalculator) : null;
    this.allowedModels = deps.allowedModels ?? [];
    this.activeProvider = deps.activeProvider;
  }

  /**
   * Estimate total cost for a proposed swarm run before execution.
   * Returns cost in USD and the per-role model decisions.
   */
  estimateSwarmCost(
    template: SwarmTemplate,
    task: string,
    tokenBudget = 500000,
    context?: string
  ): {
    estimatedCostUsd: number;
    roleDecisions: { role: string; model: string | null; costUsd: number }[];
  } {
    if (!this.modelRouter) {
      return { estimatedCostUsd: 0, roleDecisions: [] };
    }

    const perBudget = Math.floor(tokenBudget / Math.max(template.roles.length, 1));
    const roleDecisions: { role: string; model: string | null; costUsd: number }[] = [];
    let totalCost = 0;

    for (const roleConfig of template.roles) {
      const decision = this.modelRouter.route(task, {
        allowedModels: this.allowedModels,
        tokenBudget: perBudget,
        context,
        activeProvider: this.activeProvider,
      });
      roleDecisions.push({
        role: roleConfig.role,
        model: decision.selectedModel,
        costUsd: decision.estimatedCostUsd,
      });
      totalCost += decision.estimatedCostUsd;
    }

    return { estimatedCostUsd: totalCost, roleDecisions };
  }

  /**
   * Select a model override for a specific swarm role based on task complexity.
   * Returns null when no router is available or no suitable candidate found.
   */
  private selectModelForRole(task: string, tokenBudget: number, context?: string): string | null {
    if (!this.modelRouter) return null;
    const decision = this.modelRouter.route(task, {
      allowedModels: this.allowedModels,
      tokenBudget,
      context,
      activeProvider: this.activeProvider,
    });
    if (decision.selectedModel && decision.confidence >= 0.5) {
      return decision.selectedModel;
    }
    return null;
  }

  /**
   * Append a skills catalog to the context string for a given profile.
   * Skills are loaded from agents.profile_skills and injected as a concise
   * "Available skills" section, matching the SoulManager pattern (Phase 89).
   */
  private async buildContextWithProfileSkills(
    profileName: string,
    context: string
  ): Promise<string> {
    try {
      // Look up profile by name to get its id
      const profile = await this.subAgentManager.getProfileByName(profileName);
      if (!profile) return context;

      const skills = await this.storage.getProfileSkills(profile.id);
      if (skills.length === 0) return context;

      const skillCatalog = skills
        .map((s) => `- **${s.name}**: ${s.description || s.instructions.slice(0, 120)}`)
        .join('\n');
      const skillSection = `\n\n[Available skills for this agent]\n${skillCatalog}`;
      return context ? `${context}${skillSection}` : skillSection;
    } catch {
      // Non-fatal — proceed without skill injection
      return context;
    }
  }

  async initialize(): Promise<void> {
    await this.storage.seedBuiltinTemplates();
    this.logger.debug('SwarmManager initialized with built-in templates');
  }

  // ── Templates ─────────────────────────────────────────────────

  async listTemplates(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ templates: SwarmTemplate[]; total: number }> {
    return this.storage.listTemplates(opts);
  }

  async getTemplate(id: string): Promise<SwarmTemplate | null> {
    return this.storage.getTemplate(id);
  }

  async createTemplate(data: SwarmTemplateCreate): Promise<SwarmTemplate> {
    return this.storage.createTemplate(data);
  }

  async updateTemplate(
    id: string,
    data: Partial<SwarmTemplateCreate>
  ): Promise<SwarmTemplate | null> {
    const existing = await this.storage.getTemplate(id);
    if (!existing) return null;
    if (existing.isBuiltin) throw new Error('Cannot edit built-in templates');
    return this.storage.updateTemplate(id, data);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.storage.deleteTemplate(id);
  }

  // ── Runs ──────────────────────────────────────────────────────

  async getSwarmRun(id: string): Promise<SwarmRun | null> {
    const run = await this.storage.getRun(id);
    if (!run) return null;
    const members = await this.storage.getMembersForRun(id);
    return { ...run, members };
  }

  async listSwarmRuns(filter?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: SwarmRun[]; total: number }> {
    return this.storage.listRuns(filter);
  }

  async cancelSwarm(id: string): Promise<void> {
    const run = await this.storage.getRun(id);
    if (!run) throw new Error(`Swarm run not found: ${id}`);
    if (run.status !== 'pending' && run.status !== 'running') {
      throw new Error(`Cannot cancel swarm in status: ${run.status}`);
    }
    await this.storage.updateRun(id, { status: 'cancelled', completedAt: Date.now() });
  }

  // ── Execution ─────────────────────────────────────────────────

  async executeSwarm(params: SwarmRunParams): Promise<SwarmRun> {
    const template = await this.storage.getTemplate(params.templateId);
    if (!template) {
      throw new Error(`Swarm template not found: ${params.templateId}`);
    }

    const run = await this.storage.createRun(params, template);

    await this.storage.updateRun(run.id, { status: 'running', startedAt: Date.now() });

    try {
      let result: string;

      // Try native agnosai orchestration for sequential/parallel (2000-4500x faster)
      const profiles = await this.resolveProfiles(template);
      if (profiles && isEligibleForNative(template, profiles)) {
        const nativeResult = await executeViaNative(template, params, profiles);
        if (nativeResult) {
          this.logger.debug({ runId: run.id, strategy: template.strategy }, 'Swarm executed via native agnosai');
          result = nativeResult.result ?? '';

          // Persist members from native result
          if (nativeResult.members) {
            for (const member of nativeResult.members) {
              await this.storage.createMember({
                swarmRunId: run.id,
                role: member.role,
                profileName: member.profileName,
                seqOrder: member.seqOrder,
              });
            }
          }

          const totals = await this.collectTokenTotals(run.id);
          await this.storage.updateRun(run.id, {
            status: 'completed',
            result,
            completedAt: Date.now(),
            tokensUsedPrompt: totals.prompt,
            tokensUsedCompletion: totals.completion,
          });
          return (await this.getSwarmRun(run.id))!;
        }
      }

      // Fallback: TS orchestration
      switch (template.strategy) {
        case 'sequential':
          result = await this.runSequential(run, template, params);
          break;
        case 'parallel':
          result = await this.runParallel(run, template, params);
          break;
        case 'dynamic':
          result = await this.runDynamic(run, template, params);
          break;
        default:
          throw new Error(`Unknown swarm strategy: ${String(template.strategy)}`);
      }

      const totals = await this.collectTokenTotals(run.id);
      await this.storage.updateRun(run.id, {
        status: 'completed',
        result,
        completedAt: Date.now(),
        tokensUsedPrompt: totals.prompt,
        tokensUsedCompletion: totals.completion,
      });
    } catch (err) {
      const msg = errorToString(err);
      this.logger.error({ runId: run.id, error: msg }, 'Swarm execution failed');
      await this.storage.updateRun(run.id, {
        status: 'failed',
        error: msg,
        completedAt: Date.now(),
      });
    }

    return (await this.getSwarmRun(run.id))!;
  }

  // ── Sequential ────────────────────────────────────────────────

  private async runSequential(
    run: SwarmRun,
    template: SwarmTemplate,
    params: SwarmRunParams
  ): Promise<string> {
    const completedMembers: SwarmMember[] = [];
    let lastResult: string | null = null;

    for (let i = 0; i < template.roles.length; i++) {
      const roleConfig = template.roles[i]!;

      const member = await this.storage.createMember({
        swarmRunId: run.id,
        role: roleConfig.role,
        profileName: roleConfig.profileName,
        seqOrder: i,
      });

      await this.storage.updateMember(member.id, { status: 'running', startedAt: Date.now() });

      // Build context: original task + prior member results
      let context = params.context ?? '';
      if (completedMembers.length > 0) {
        const priorResults = completedMembers
          .map((m) => `[${m.role} result]:\n${m.result ?? ''}`)
          .join('\n\n');
        context = context ? `${context}\n\n${priorResults}` : priorResults;
      }

      try {
        const perBudget = Math.floor((params.tokenBudget ?? 500000) / template.roles.length);
        const roleTaskProfile = profileTask(params.task, context || undefined);
        const modelOverride = this.selectModelForRole(params.task, perBudget, context || undefined);
        if (modelOverride) {
          this.logger.debug(
            {
              runId: run.id,
              role: roleConfig.role,
              model: modelOverride,
              taskType: roleTaskProfile.taskType,
              complexity: roleTaskProfile.complexity,
            },
            'Cost-aware swarm: selected model for role'
          );
        }

        // Inject profile skills into context (Phase 89)
        const enrichedContext = await this.buildContextWithProfileSkills(
          roleConfig.profileName,
          context
        );

        const delegation = await this.subAgentManager.delegate({
          profile: roleConfig.profileName,
          task: params.task,
          context: enrichedContext || undefined,
          maxTokenBudget: perBudget,
          modelOverride: modelOverride ?? undefined,
        });

        lastResult = delegation.result ?? '';
        await this.storage.updateMember(member.id, {
          status: delegation.status === 'completed' ? 'completed' : 'failed',
          result: lastResult,
          delegationId: delegation.delegationId,
          completedAt: Date.now(),
        });

        completedMembers.push({ ...member, result: lastResult });
      } catch (err) {
        const msg = errorToString(err);
        await this.storage.updateMember(member.id, {
          status: 'failed',
          result: `Error: ${msg}`,
          completedAt: Date.now(),
        });
        completedMembers.push({ ...member, result: `Error: ${msg}` });
        lastResult = `Error: ${msg}`;
      }
    }

    return lastResult ?? '';
  }

  // ── Parallel ──────────────────────────────────────────────────

  private async runParallel(
    run: SwarmRun,
    template: SwarmTemplate,
    params: SwarmRunParams
  ): Promise<string> {
    // Create all member rows
    const members = await Promise.all(
      template.roles.map((roleConfig, i) =>
        this.storage.createMember({
          swarmRunId: run.id,
          role: roleConfig.role,
          profileName: roleConfig.profileName,
          seqOrder: i,
        })
      )
    );

    // Execute all roles in parallel
    const perBudget = Math.floor(
      (params.tokenBudget ?? 500000) /
        (template.roles.length + (template.coordinatorProfile ? 1 : 0))
    );

    const results = await Promise.all(
      members.map(async (member, i) => {
        const roleConfig = template.roles[i]!;
        await this.storage.updateMember(member.id, { status: 'running', startedAt: Date.now() });

        try {
          const modelOverride = this.selectModelForRole(params.task, perBudget, params.context);
          const delegation = await this.subAgentManager.delegate({
            profile: roleConfig.profileName,
            task: params.task,
            context: params.context || undefined,
            maxTokenBudget: perBudget,
            modelOverride: modelOverride ?? undefined,
          });

          const result = delegation.result ?? '';
          await this.storage.updateMember(member.id, {
            status: delegation.status === 'completed' ? 'completed' : 'failed',
            result,
            delegationId: delegation.delegationId,
            completedAt: Date.now(),
          });

          return { role: roleConfig.role, result };
        } catch (err) {
          const msg = errorToString(err);
          await this.storage.updateMember(member.id, {
            status: 'failed',
            result: `Error: ${msg}`,
            completedAt: Date.now(),
          });
          return { role: roleConfig.role, result: `Error: ${msg}` };
        }
      })
    );

    // If coordinator profile is set, synthesize results
    if (template.coordinatorProfile) {
      const synthContext = results.map((r) => `[${r.role} result]:\n${r.result}`).join('\n\n');

      const coordMember = await this.storage.createMember({
        swarmRunId: run.id,
        role: 'coordinator',
        profileName: template.coordinatorProfile,
        seqOrder: members.length,
      });

      await this.storage.updateMember(coordMember.id, { status: 'running', startedAt: Date.now() });

      try {
        const coordDelegation = await this.subAgentManager.delegate({
          profile: template.coordinatorProfile,
          task: params.task,
          context: synthContext,
          maxTokenBudget: perBudget,
        });

        const synthResult = coordDelegation.result ?? '';
        await this.storage.updateMember(coordMember.id, {
          status: coordDelegation.status === 'completed' ? 'completed' : 'failed',
          result: synthResult,
          delegationId: coordDelegation.delegationId,
          completedAt: Date.now(),
        });
        return synthResult;
      } catch (err) {
        const msg = errorToString(err);
        await this.storage.updateMember(coordMember.id, {
          status: 'failed',
          result: `Error: ${msg}`,
          completedAt: Date.now(),
        });
      }
    }

    // Without coordinator, combine all results
    return results.map((r) => `[${r.role}]:\n${r.result}`).join('\n\n');
  }

  // ── Dynamic ───────────────────────────────────────────────────

  private async runDynamic(
    run: SwarmRun,
    template: SwarmTemplate,
    params: SwarmRunParams
  ): Promise<string> {
    const coordinatorProfile = template.coordinatorProfile ?? 'researcher';

    const member = await this.storage.createMember({
      swarmRunId: run.id,
      role: 'coordinator',
      profileName: coordinatorProfile,
      seqOrder: 0,
    });

    await this.storage.updateMember(member.id, { status: 'running', startedAt: Date.now() });

    try {
      const delegation = await this.subAgentManager.delegate({
        profile: coordinatorProfile,
        task: params.task,
        context: params.context || undefined,
        maxTokenBudget: params.tokenBudget ?? 500000,
      });

      const result = delegation.result ?? '';
      await this.storage.updateMember(member.id, {
        status: delegation.status === 'completed' ? 'completed' : 'failed',
        result,
        delegationId: delegation.delegationId,
        completedAt: Date.now(),
      });
      return result;
    } catch (err) {
      const msg = errorToString(err);
      await this.storage.updateMember(member.id, {
        status: 'failed',
        result: `Error: ${msg}`,
        completedAt: Date.now(),
      });
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Resolve all profiles referenced by a template's roles.
   * Returns null if any profile is missing (native path requires all profiles).
   */
  private async resolveProfiles(
    template: SwarmTemplate,
  ): Promise<Map<string, AgentProfile> | null> {
    try {
      const profiles = new Map<string, AgentProfile>();
      for (const role of template.roles) {
        const profile = await this.subAgentManager.getProfileByName(role.profileName);
        if (!profile) return null;
        profiles.set(role.profileName, profile);
      }
      return profiles;
    } catch {
      return null;
    }
  }

  private async collectTokenTotals(runId: string): Promise<{ prompt: number; completion: number }> {
    // Token totals are tracked per delegation; for now we keep it simple
    // and return zero (delegations track their own usage separately).
    void runId;
    return { prompt: 0, completion: 0 };
  }
}
