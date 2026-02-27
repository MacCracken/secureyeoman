/**
 * Tool utilities — shared helpers for wrapping tool handlers with middleware.
 */

import type { ToolMiddleware } from './index.js';

/**
 * Global tool registry — populated by wrapToolHandler so the MCP server can
 * expose an internal callthrough endpoint without going through the full MCP
 * protocol (init → tools/call → close). Used by core's McpClientManager.callTool().
 */
export const globalToolRegistry = new Map<
  string,
  (args: Record<string, unknown>) => Promise<ToolResult>
>();

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export function wrapToolHandler<T extends Record<string, unknown>>(
  toolName: string,
  middleware: ToolMiddleware,
  handler: (args: T) => Promise<ToolResult>
): (args: T) => Promise<ToolResult> {
  const wrapped = async (args: T): Promise<ToolResult> => {
    // 1. Rate limit check
    const rateResult = middleware.rateLimiter.check(toolName);
    if (!rateResult.allowed) {
      return {
        content: [
          {
            type: 'text',
            text: `Rate limit exceeded for "${toolName}". Retry after ${rateResult.retryAfterMs}ms.`,
          },
        ],
        isError: true,
      };
    }

    // 2. Input validation
    const validation = middleware.inputValidator.validate(args as Record<string, unknown>);
    if (validation.blocked) {
      return {
        content: [
          {
            type: 'text',
            text: `Input blocked: ${validation.blockReason ?? 'Injection detected'}`,
          },
        ],
        isError: true,
      };
    }

    // 3. Execute with audit logging
    try {
      const result = await middleware.auditLogger.wrap(
        toolName,
        args as Record<string, unknown>,
        async () => {
          return handler(args);
        }
      );

      // 4. Redact secrets from output
      const redacted = middleware.secretRedactor.redact(result) as ToolResult;
      return redacted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Tool "${toolName}" failed: ${message}` }],
        isError: true,
      };
    }
  };

  // Register in the global callthrough registry so the internal tool-call
  // endpoint can invoke handlers without going through the MCP protocol.
  globalToolRegistry.set(
    toolName,
    wrapped as (args: Record<string, unknown>) => Promise<ToolResult>
  );

  return wrapped;
}
