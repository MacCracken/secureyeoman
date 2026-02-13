/**
 * Body Module — Vital Signs, Heart & Physical Interfaces
 *
 * In Our Image: No-Thing-Ness → The One → The Plurality → Soul → Spirit → Brain → Body → Heart
 *
 * The Body module owns the agent's physical form and capabilities.
 * The Heart is a subfunction of Body, managing vital signs via the HeartbeatManager.
 */

export { HeartbeatManager, type HeartbeatResult, type HeartbeatCheckResult } from './heartbeat.js';
export { HeartManager } from './heart.js';
export type { BodyConfig } from './types.js';
