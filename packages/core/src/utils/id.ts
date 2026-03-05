/**
 * UUID generation utility — re-exports the RFC 9562 compliant uuidv7
 * from crypto.ts to avoid duplicate implementations.
 */

export { uuidv7 } from './crypto.js';
