/**
 * Bote MCP Service — TypeScript wrapper for Rust NAPI bindings.
 *
 * Provides tool registry, schema validation, and JSON-RPC 2.0 protocol
 * utilities. Falls back to JS implementations when native module is unavailable.
 */

import { native } from './index.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  version?: string;
  input_schema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface JsonRpcParseResult {
  valid: boolean;
  method?: string;
  id?: string;
  error?: string;
}

// ── Tool Registry ──────────────────────────────────────────────────────────

/**
 * Register a tool definition in the Rust-backed registry.
 */
export function registerTool(tool: ToolDef): void {
  if (native?.boteRegisterTool) {
    native.boteRegisterTool(JSON.stringify(tool));
    return;
  }
  jsTools.set(tool.name, tool);
}

/**
 * List all registered tools.
 */
export function listTools(): ToolDef[] {
  if (native?.boteListTools) {
    return JSON.parse(native.boteListTools()) as ToolDef[];
  }
  return [...jsTools.values()];
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): ToolDef | null {
  if (native?.boteGetTool) {
    const json = native.boteGetTool(name);
    return json ? (JSON.parse(json) as ToolDef) : null;
  }
  return jsTools.get(name) ?? null;
}

/**
 * Validate parameters against a tool's input schema.
 */
export function validateParams(toolName: string, params: unknown): ValidationResult {
  if (native?.boteValidateParams) {
    return JSON.parse(
      native.boteValidateParams(toolName, JSON.stringify(params))
    ) as ValidationResult;
  }
  // JS fallback: no validation
  return { valid: true };
}

/**
 * Remove a tool from the registry.
 */
export function removeTool(name: string): boolean {
  if (native?.boteRemoveTool) {
    return native.boteRemoveTool(name);
  }
  return jsTools.delete(name);
}

/**
 * Number of registered tools.
 */
export function toolCount(): number {
  return native?.boteToolCount?.() ?? jsTools.size;
}

// ── JSON-RPC Protocol ──────────────────────────────────────────────────────

/**
 * Parse a JSON-RPC 2.0 request.
 */
export function parseJsonRpc(requestJson: string): JsonRpcParseResult {
  if (native?.boteParseJsonrpc) {
    return JSON.parse(native.boteParseJsonrpc(requestJson)) as JsonRpcParseResult;
  }
  try {
    const req = JSON.parse(requestJson) as { method?: string; id?: string; jsonrpc?: string };
    if (req.jsonrpc !== '2.0' || !req.method) {
      return { valid: false, error: 'Invalid JSON-RPC 2.0 request' };
    }
    return { valid: true, method: req.method, id: req.id };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

/**
 * Create a JSON-RPC 2.0 success response.
 */
export function jsonRpcSuccess(id: string, result: unknown): string {
  if (native?.boteJsonrpcSuccess) {
    return native.boteJsonrpcSuccess(id, JSON.stringify(result));
  }
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

/**
 * Create a JSON-RPC 2.0 error response.
 */
export function jsonRpcError(id: string, code: number, message: string): string {
  if (native?.boteJsonrpcError) {
    return native.boteJsonrpcError(id, code, message);
  }
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── JS Fallback ────────────────────────────────────────────────────────────

const jsTools = new Map<string, ToolDef>();
