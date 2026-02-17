/**
 * Memory Consolidation Module
 */

export { ConsolidationManager, type ConsolidationConfig, type ConsolidationManagerDeps } from './manager.js';
export { ConsolidationExecutor, type ExecutorDeps } from './executor.js';
export type { ConsolidationActionType, ConsolidationAction, ConsolidationReport, ConsolidationCandidate } from './types.js';
export { buildConsolidationPrompt, parseConsolidationResponse, CONSOLIDATION_SYSTEM_PROMPT } from './prompts.js';
