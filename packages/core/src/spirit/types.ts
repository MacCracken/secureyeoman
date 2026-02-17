/**
 * Spirit Module — Internal Types
 *
 * Re-exports shared types and defines internal interfaces.
 */

export type {
  SpiritConfig,
  Passion,
  PassionCreate,
  PassionUpdate,
  Inspiration,
  InspirationCreate,
  InspirationUpdate,
  Pain,
  PainCreate,
  PainUpdate,
} from '@secureyeoman/shared';

import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';

export interface SpiritManagerDeps {
  auditChain: AuditChain;
  logger: SecureLogger;
}
