/**
 * Sandboxed Code Execution Types (Phase 6.4b)
 */

export type RuntimeType = 'node' | 'python' | 'shell';
export type ApprovalPolicy = 'none' | 'first-time' | 'always';

export interface ExecutionSession {
  id: string;
  runtime: RuntimeType;
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'expired' | 'terminated';
}

export interface ExecutionRequest {
  runtime: RuntimeType;
  code: string;
  sessionId?: string;
  timeout?: number;
}

export interface ExecutionResult {
  id: string;
  sessionId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  truncated: boolean;
}

export interface OutputChunk {
  stream: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

export interface ApprovalRecord {
  id: string;
  requestId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  resolvedAt?: number;
}
