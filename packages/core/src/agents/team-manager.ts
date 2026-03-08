/**
 * TeamManager — Dynamic auto-manager Team primitive (Phase 83).
 *
 * A Team differs from a Swarm: instead of pre-wired delegation graphs,
 * a coordinator LLM reads member descriptions and dynamically decides
 * who to assign each task to. No topology definition required.
 */

import { AIClient, type AIClientConfig, type AIClientDeps } from '../ai/client.js';
import type { SubAgentManager } from './manager.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import { TeamStorage } from './team-storage.js';
import type {
  TeamDefinition,
  TeamCreate,
  TeamUpdate,
  TeamRun,
  TeamRunParams,
} from '@secureyeoman/shared';

export interface TeamManagerDeps {
  storage: TeamStorage;
  subAgentManager: SubAgentManager;
  aiClientConfig: AIClientConfig;
  aiClientDeps: AIClientDeps;
  auditChain?: AuditChain | null;
  logger: SecureLogger;
}

interface CoordinatorDecision {
  assignTo: string[];
  reasoning: string;
}

export class TeamManager {
  private readonly storage: TeamStorage;
  private readonly subAgentManager: SubAgentManager;
  private readonly aiClientConfig: AIClientConfig;
  private readonly aiClientDeps: AIClientDeps;
  private readonly auditChain: AuditChain | null;
  private readonly logger: SecureLogger;

  constructor(deps: TeamManagerDeps) {
    this.storage = deps.storage;
    this.subAgentManager = deps.subAgentManager;
    this.aiClientConfig = deps.aiClientConfig;
    this.aiClientDeps = deps.aiClientDeps;
    this.auditChain = deps.auditChain ?? null;
    this.logger = deps.logger;
  }

  async initialize(): Promise<void> {
    await this.storage.seedBuiltinTeams();
    this.logger.debug('Team manager initialized');
  }

  // ── Team CRUD ─────────────────────────────────────────────────

  async createTeam(data: TeamCreate): Promise<TeamDefinition> {
    return this.storage.createTeam(data);
  }

  async getTeam(id: string): Promise<TeamDefinition | null> {
    return this.storage.getTeam(id);
  }

  async listTeams(opts?: { limit?: number; offset?: number }): Promise<{
    teams: TeamDefinition[];
    total: number;
  }> {
    return this.storage.listTeams(opts);
  }

  async updateTeam(id: string, updates: TeamUpdate): Promise<TeamDefinition> {
    const team = await this.storage.getTeam(id);
    if (!team) throw new Error(`Team not found: ${id}`);
    if (team.isBuiltin) throw new Error('Cannot modify a builtin team');
    return this.storage.updateTeam(id, updates);
  }

  async deleteTeam(id: string): Promise<void> {
    const team = await this.storage.getTeam(id);
    if (!team) throw new Error(`Team not found: ${id}`);
    if (team.isBuiltin) throw new Error('Cannot delete a builtin team');
    await this.storage.deleteTeam(id);
  }

  // ── Run Execution ────────────────────────────────────────────

  async run(
    teamId: string,
    params: TeamRunParams,
    opts: { initiatedBy?: string } = {}
  ): Promise<TeamRun> {
    const team = await this.storage.getTeam(teamId);
    if (!team) throw new Error(`Team not found: ${teamId}`);

    const teamRun = await this.storage.createRun({
      teamId: team.id,
      teamName: team.name,
      task: params.task,
      tokenBudget: params.tokenBudget ?? 100000,
      initiatedBy: opts.initiatedBy,
    });

    // Fire-and-forget: update run in background
    void this._executeRun(team, teamRun, params).catch((err: unknown) => {
      this.logger.error(
        {
          runId: teamRun.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'Team run execution failed'
      );
    });

    return teamRun;
  }

  async getRun(runId: string): Promise<TeamRun | null> {
    return this.storage.getRun(runId);
  }

  async listRuns(
    teamId?: string,
    opts?: { limit?: number; offset?: number }
  ): Promise<{ runs: TeamRun[]; total: number }> {
    return this.storage.listRuns(teamId, opts);
  }

  // ── Private execution ────────────────────────────────────────

  private async _executeRun(
    team: TeamDefinition,
    run: TeamRun,
    params: TeamRunParams
  ): Promise<void> {
    await this.storage.updateRun(run.id, { status: 'running', startedAt: Date.now() });

    try {
      // Step 1: Build coordinator prompt
      const memberList = team.members
        .map(
          (m) =>
            `- ${m.role} (profile: ${m.profileName})${m.description ? ': ' + m.description : ''}`
        )
        .join('\n');

      const coordinatorPrompt = `You are a team manager. Analyze the task and decide which team member(s) to assign.

Team members:
${memberList}

Task: ${params.task}${params.context ? `\n\nContext: ${params.context}` : ''}

Respond ONLY with JSON (no markdown, no explanation): {"assignTo": ["profileName1", ...], "reasoning": "..."}`;

      // Step 2: Ask coordinator LLM
      const aiClient = new AIClient(this.aiClientConfig, this.aiClientDeps);
      const coordinatorResponse = await aiClient.chat({
        messages: [{ role: 'user', content: coordinatorPrompt }],
        maxTokens: 512,
        stream: false,
      });

      const responseText = coordinatorResponse.content;

      // Step 3: Parse coordinator decision
      let decision: CoordinatorDecision;
      try {
        const jsonMatch = /\{[\s\S]*\}/.exec(responseText);
        decision = JSON.parse(jsonMatch?.[0] ?? responseText) as CoordinatorDecision;
      } catch {
        // Fallback: assign first member if parsing fails
        decision = {
          assignTo: team.members.slice(0, 1).map((m) => m.profileName),
          reasoning: 'Coordinator response could not be parsed; assigned first available member.',
        };
      }

      // Validate assigned profiles exist in the team
      const validProfileNames = new Set(team.members.map((m) => m.profileName));
      const assignedMembers = (decision.assignTo ?? []).filter((p) => validProfileNames.has(p));
      if (assignedMembers.length === 0) {
        assignedMembers.push(team.members[0]!.profileName);
      }

      void this.auditChain?.record({
        event: 'team_coordinator_assigned',
        level: 'info',
        message: `Team "${team.name}" coordinator assigned members for run ${run.id}`,
        metadata: {
          runId: run.id,
          teamId: team.id,
          assignedMembers,
          reasoning: decision.reasoning,
        },
      });

      // Step 4: Dispatch delegations
      const delegationResults: string[] = [];
      let tokensUsed = coordinatorResponse.usage?.totalTokens ?? 0;

      if (assignedMembers.length === 1) {
        const result = await this.subAgentManager.delegate({
          profile: assignedMembers[0]!,
          task: params.task,
          context: params.context,
          maxTokenBudget: Math.floor((params.tokenBudget ?? 100000) / assignedMembers.length),
        });
        delegationResults.push(result.result ?? '');
        tokensUsed += result.tokenUsage?.total ?? 0;
      } else {
        // Parallel dispatch
        const results = await Promise.allSettled(
          assignedMembers.map((profile) =>
            this.subAgentManager.delegate({
              profile,
              task: params.task,
              context: params.context,
              maxTokenBudget: Math.floor((params.tokenBudget ?? 100000) / assignedMembers.length),
            })
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            delegationResults.push(r.value.result ?? '');
            tokensUsed += r.value.tokenUsage?.total ?? 0;
          }
        }
      }

      // Step 5: Synthesize if multiple results
      let finalResult: string;
      if (delegationResults.length === 1) {
        finalResult = delegationResults[0] ?? '';
      } else if (delegationResults.length === 0) {
        finalResult = '(no results returned by assigned members)';
      } else {
        const synthesisPrompt = `You are a synthesis assistant. Combine the following results from different team members into a single coherent response.

Task: ${params.task}

Results:
${delegationResults.map((r, i) => `--- Member ${i + 1} ---\n${r}`).join('\n\n')}

Provide a unified, synthesized response:`;

        const synthesisResponse = await aiClient.chat({
          messages: [{ role: 'user', content: synthesisPrompt }],
          maxTokens: 2048,
          stream: false,
        });
        finalResult = synthesisResponse.content;
        tokensUsed += synthesisResponse.usage?.totalTokens ?? 0;
      }

      await this.storage.updateRun(run.id, {
        status: 'completed',
        result: finalResult,
        coordinatorReasoning: decision.reasoning,
        assignedMembers,
        tokensUsed,
        completedAt: Date.now(),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.storage.updateRun(run.id, {
        status: 'failed',
        error,
        completedAt: Date.now(),
      });
      this.logger.error({ runId: run.id, error }, 'Team run failed');
    }
  }
}
