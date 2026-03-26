/**
 * AgnosAI Bridge — converts between SY swarm/agent types and agnosai crew types.
 *
 * This layer maps SY's SwarmTemplate + AgentProfile into agnosai's CrewSpec
 * format, runs the crew via native NAPI, and maps results back into SY's
 * SwarmRun + SwarmMember response shapes so the dashboard is unaffected.
 */

import type {
  SwarmTemplate,
  SwarmRunParams,
  SwarmRun,
  SwarmMember,
  SwarmStrategy,
} from '@secureyeoman/shared';
import type { AgentProfile } from '@secureyeoman/shared';
import * as agnosai from '../native/agnosai.js';
import type { AgnosaiCrewState, AgnosaiTaskResult } from '../native/agnosai.js';

// ── SY → AgnosAI Conversion ────────────────────────────────────────────────

interface AgnosaiAgent {
  agent_key: string;
  name: string;
  role: string;
  goal: string;
  backstory?: string;
  tools: string[];
  complexity: string;
  domain?: string;
}

interface AgnosaiTask {
  description: string;
  expected_output?: string;
  priority?: number;
  dependencies?: number[];
}

interface AgnosaiCrewSpec {
  name: string;
  agents: AgnosaiAgent[];
  tasks: AgnosaiTask[];
  process?: string;
}

function mapStrategy(strategy: SwarmStrategy): string {
  switch (strategy) {
    case 'sequential':
      return 'sequential';
    case 'parallel':
      return 'parallel';
    default:
      return 'sequential';
  }
}

function profileToAgnosaiAgent(profile: AgentProfile, role: string): AgnosaiAgent {
  return {
    agent_key: profile.name.toLowerCase().replace(/\s+/g, '-'),
    name: profile.name,
    role,
    goal: profile.systemPrompt.substring(0, 500),
    backstory: profile.description || undefined,
    tools: profile.allowedTools,
    complexity: 'medium',
    domain: undefined,
  };
}

/**
 * Build an agnosai CrewSpec JSON from SY swarm data.
 */
export function buildCrewSpec(
  template: SwarmTemplate,
  params: SwarmRunParams,
  profiles: Map<string, AgentProfile>
): string | null {
  const agents: AgnosaiAgent[] = [];
  const tasks: AgnosaiTask[] = [];

  for (const roleConfig of template.roles) {
    const profile = profiles.get(roleConfig.profileName);
    if (!profile) continue;

    agents.push(profileToAgnosaiAgent(profile, roleConfig.role));

    tasks.push({
      description: `[${roleConfig.role}] ${params.task}`,
      expected_output: `Result from ${roleConfig.role} agent`,
      priority: 2, // Normal
    });
  }

  if (agents.length === 0) return null;

  // For sequential, chain tasks as dependencies
  if (template.strategy === 'sequential') {
    for (let i = 1; i < tasks.length; i++) {
      tasks[i]!.dependencies = [i - 1];
    }
  }

  const spec: AgnosaiCrewSpec = {
    name: `${template.name}-${Date.now()}`,
    agents,
    tasks,
    process: mapStrategy(template.strategy),
  };

  return JSON.stringify(spec);
}

// ── AgnosAI → SY Conversion ────────────────────────────────────────────────

/**
 * Map agnosai CrewState back to SY SwarmRun + SwarmMember shapes.
 * Preserves REST API response format so the dashboard is unaffected.
 */
export function crewStateToSwarmRun(
  crewState: AgnosaiCrewState,
  template: SwarmTemplate,
  params: SwarmRunParams
): SwarmRun {
  const now = Date.now();
  const members = crewState.results.map((result, i) =>
    taskResultToSwarmMember(result, template, crewState.crew_id, i)
  );

  const totalPromptTokens = crewState.profile?.cost_usd
    ? Math.round(crewState.profile.cost_usd * 1_000_000)
    : 0;

  const lastResult = crewState.results[crewState.results.length - 1];

  return {
    id: crewState.crew_id,
    templateId: template.id,
    templateName: template.name,
    task: params.task,
    context: params.context ?? null,
    status: mapCrewStatus(crewState.status),
    strategy: template.strategy,
    result: lastResult?.output ?? null,
    error:
      crewState.status === 'Failed'
        ? (crewState.results.find((r) => r.status === 'Failed')?.output ?? 'Crew execution failed')
        : null,
    tokenBudget: params.tokenBudget ?? 100000,
    tokensUsedPrompt: totalPromptTokens,
    tokensUsedCompletion: 0,
    createdAt: now - (crewState.profile?.wall_ms ?? 0),
    startedAt: now - (crewState.profile?.wall_ms ?? 0),
    completedAt: now,
    initiatedBy: params.initiatedBy ?? null,
    members,
  };
}

function taskResultToSwarmMember(
  result: AgnosaiTaskResult,
  template: SwarmTemplate,
  swarmRunId: string,
  index: number
): SwarmMember {
  const role = template.roles[index];
  const now = Date.now();

  return {
    id: result.task_id,
    swarmRunId,
    role: role?.role ?? `agent-${index}`,
    profileName: role?.profileName ?? 'unknown',
    delegationId: null,
    status: mapTaskStatus(result.status),
    result: result.output || null,
    seqOrder: index,
    createdAt: now,
    startedAt: now,
    completedAt: now,
  };
}

function mapCrewStatus(status: string): SwarmRun['status'] {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}

function mapTaskStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}

// ── Eligibility Check ──────────────────────────────────────────────────────

/**
 * Check if a swarm run is eligible for native agnosai execution.
 * Returns false if strategy is dynamic or any role uses binary/mcp-bridge.
 */
export function isEligibleForNative(
  template: SwarmTemplate,
  profiles: Map<string, AgentProfile>
): boolean {
  if (template.strategy === 'dynamic') return false;

  for (const role of template.roles) {
    const profile = profiles.get(role.profileName);
    if (!profile) return false;
    if (profile.type === 'binary' || profile.type === 'mcp-bridge') return false;
  }

  return true;
}

/**
 * Execute a swarm run via native agnosai orchestration.
 * Returns SwarmRun in SY format, or null if native unavailable.
 */
export async function executeViaNative(
  template: SwarmTemplate,
  params: SwarmRunParams,
  profiles: Map<string, AgentProfile>
): Promise<SwarmRun | null> {
  const specJson = buildCrewSpec(template, params, profiles);
  if (!specJson) return null;

  const crewState = await agnosai.runCrew(specJson);
  if (!crewState) return null;

  return crewStateToSwarmRun(crewState, template, params);
}
