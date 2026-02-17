/**
 * Proactive Assistance — Internal types (Phase 7.2)
 */

import type { ProactiveTrigger, ProactiveAction, Suggestion } from '@friday/shared';
import type { BrainManager } from '../brain/manager.js';
import type { IntegrationManager } from '../integrations/manager.js';
import type { SecureLogger } from '../logging/logger.js';

export interface ProactiveTriggerInternal extends ProactiveTrigger {
  lastFiredAt?: number;
  fireCount: number;
  hookRegistrationId?: string;
  heartbeatCheckName?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface TriggerEvaluationResult {
  shouldFire: boolean;
  reason?: string;
  context?: Record<string, unknown>;
}

export interface ProactiveManagerDeps {
  logger: SecureLogger;
  brainManager: BrainManager;
  integrationManager?: IntegrationManager;
  broadcast?: (channel: string, payload: unknown) => void;
}
