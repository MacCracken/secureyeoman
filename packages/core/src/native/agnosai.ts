/**
 * AgnosAI Orchestration Engine — typed wrappers over native NAPI bindings.
 *
 * Every function returns `T | null` (sync) or `Promise<T | null>` (async).
 * Null means native module unavailable — caller falls back to TS implementation.
 */

import { native } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgnosaiCrewState {
  crew_id: string;
  status: string;
  results: AgnosaiTaskResult[];
  profile?: {
    wall_ms: number;
    task_count: number;
    cost_usd: number;
  };
}

export interface AgnosaiTaskResult {
  task_id: string;
  output: string;
  status: string;
  metadata: Record<string, unknown>;
}

export interface AgnosaiValidation {
  valid: boolean;
  errors: string[];
}

export interface AgnosaiModelRoute {
  tier: string;
  model: string;
}

export interface AgnosaiTopoResult {
  order: string[];
  has_cycle: boolean;
  error?: string;
}

export interface AgnosaiUcb1Result {
  selected: string;
  ucb_score: number;
}

// ── Crew Execution (Async) ─────────────────────────────────────────────────

export async function runCrew(specJson: string): Promise<AgnosaiCrewState | null> {
  if (!native) return null;
  try {
    const result = await native.agnosaiRunCrew(specJson);
    return JSON.parse(result);
  } catch {
    return null;
  }
}

export async function cancelCrew(crewId: string): Promise<boolean> {
  if (!native) return false;
  try {
    await native.agnosaiCancelCrew(crewId);
    return true;
  } catch {
    return false;
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateCrew(specJson: string): AgnosaiValidation | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiValidateCrew(specJson));
  } catch {
    return null;
  }
}

// ── Scheduling ─────────────────────────────────────────────────────────────

export function scheduleTasks(tasksJson: string): string[] | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiScheduleTasks(tasksJson));
  } catch {
    return null;
  }
}

export function topologicalSort(tasksJson: string): AgnosaiTopoResult | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiTopologicalSort(tasksJson));
  } catch {
    return null;
  }
}

// ── Model Routing ──────────────────────────────────────────────────────────

export function routeModel(
  taskType: string,
  complexity: string,
): AgnosaiModelRoute | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiRouteModel(taskType, complexity));
  } catch {
    return null;
  }
}

// ── Agent Scoring ──────────────────────────────────────────────────────────

export function rankAgents(
  agentsJson: string,
  taskJson: string,
): [number, number][] | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiRankAgents(agentsJson, taskJson));
  } catch {
    return null;
  }
}

// ── Agent Definition ───────────────────────────────────────────────────────

export function createAgentDef(profileJson: string): string | null {
  if (!native) return null;
  try {
    return native.agnosaiCreateAgentDef(profileJson);
  } catch {
    return null;
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────

export function listBuiltinTools(): string[] | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiListBuiltinTools());
  } catch {
    return null;
  }
}

// ── Learning ───────────────────────────────────────────────────────────────

export function ucb1Select(
  arms: { name: string; rewards: number; pulls: number }[],
): AgnosaiUcb1Result | null {
  if (!native) return null;
  try {
    return JSON.parse(native.agnosaiUcb1Select(JSON.stringify(arms)));
  } catch {
    return null;
  }
}
