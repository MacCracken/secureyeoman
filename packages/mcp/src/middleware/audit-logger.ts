/**
 * Audit Logger Middleware — logs every tool call to core's audit API.
 */

import type { CoreApiClient } from '../core-client.js';

export interface AuditLoggerMiddleware {
  log(entry: AuditEntry): Promise<void>;
  wrap<T>(toolName: string, args: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
}

export interface AuditEntry {
  event: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export function createAuditLogger(client: CoreApiClient): AuditLoggerMiddleware {
  return {
    async log(entry: AuditEntry): Promise<void> {
      try {
        await client.post('/api/v1/audit', entry);
      } catch {
        // Audit logging is best-effort — don't fail the tool call
      }
    },

    async wrap<T>(toolName: string, args: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        await this.log({
          event: 'mcp_tool_call',
          level: 'info',
          message: `MCP tool call: ${toolName}`,
          metadata: { toolName, args, duration, success: true },
        });
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        await this.log({
          event: 'mcp_tool_call',
          level: 'error',
          message: `MCP tool call failed: ${toolName}`,
          metadata: { toolName, args, duration, success: false, error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    },
  };
}
