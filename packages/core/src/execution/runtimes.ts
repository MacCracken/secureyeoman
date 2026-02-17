/**
 * Runtime Adapters — Spawn child processes for code execution.
 *
 * Each adapter wraps a specific interpreter (Node.js, Python, shell) and
 * yields OutputChunk objects from stdout/stderr while respecting timeouts.
 */

import { spawn } from 'node:child_process';
import type { RuntimeType, ExecutionSession, OutputChunk } from './types.js';

export interface RuntimeAdapter {
  name: RuntimeType;
  execute(
    code: string,
    session: ExecutionSession,
    opts: { timeout: number },
  ): AsyncIterable<OutputChunk>;
  validateCode(code: string): { valid: boolean; errors: string[] };
  cleanup(session: ExecutionSession): Promise<void>;
}

// ─── Shared helpers ─────────────────────────────────────────────────

async function* spawnAndStream(
  command: string,
  args: string[],
  code: string,
  timeout: number,
): AsyncIterable<OutputChunk & { _exitCode?: number }> {
  const child = spawn(command, [...args, code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout,
    env: { ...process.env },
  });

  // Close stdin immediately — we pass code via argument
  child.stdin.end();

  // Collect chunks in a buffer that the consumer will drain via the async iterator.
  const chunks: Array<OutputChunk & { _exitCode?: number }> = [];
  let done = false;
  let resolveWait: (() => void) | null = null;

  const enqueue = (chunk: OutputChunk & { _exitCode?: number }) => {
    chunks.push(chunk);
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  };

  child.stdout.on('data', (data: Buffer) => {
    enqueue({ stream: 'stdout', data: data.toString(), timestamp: Date.now() });
  });

  child.stderr.on('data', (data: Buffer) => {
    enqueue({ stream: 'stderr', data: data.toString(), timestamp: Date.now() });
  });

  child.on('close', (exitCode) => {
    enqueue({ stream: 'stdout', data: '', timestamp: Date.now(), _exitCode: exitCode ?? 1 });
    done = true;
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  });

  child.on('error', (err) => {
    enqueue({ stream: 'stderr', data: err.message, timestamp: Date.now(), _exitCode: 1 });
    done = true;
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  });

  while (true) {
    if (chunks.length > 0) {
      const chunk = chunks.shift()!;
      yield chunk;
      if (chunk._exitCode !== undefined) return;
    } else if (done) {
      return;
    } else {
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
  }
}

// ─── Dangerous pattern lists ────────────────────────────────────────

const NODE_DANGEROUS = [
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
  /\bprocess\.exit\b/,
  /\bexecSync\b/,
  /\bspawnSync\b/,
  /\bfs\s*\.\s*(?:rm|rmdir|unlink|writeFile)Sync\b/,
];

const PYTHON_DANGEROUS = [
  /\bos\.system\b/,
  /\bsubprocess\b/,
  /\b__import__\b/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bshutil\.rmtree\b/,
];

const SHELL_DANGEROUS = [
  /\brm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,   // fork bomb
  /\b>\s*\/dev\/sd/,
];

// ─── Node Runtime ───────────────────────────────────────────────────

export class NodeRuntime implements RuntimeAdapter {
  name: RuntimeType = 'node';

  async *execute(
    code: string,
    _session: ExecutionSession,
    opts: { timeout: number },
  ): AsyncIterable<OutputChunk> {
    for await (const chunk of spawnAndStream('node', ['-e'], code, opts.timeout)) {
      yield { stream: chunk.stream, data: chunk.data, timestamp: chunk.timestamp };
    }
  }

  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const pattern of NODE_DANGEROUS) {
      if (pattern.test(code)) {
        errors.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async cleanup(_session: ExecutionSession): Promise<void> {
    // No-op for now
  }
}

// ─── Python Runtime ─────────────────────────────────────────────────

export class PythonRuntime implements RuntimeAdapter {
  name: RuntimeType = 'python';

  async *execute(
    code: string,
    _session: ExecutionSession,
    opts: { timeout: number },
  ): AsyncIterable<OutputChunk> {
    for await (const chunk of spawnAndStream('python3', ['-c'], code, opts.timeout)) {
      yield { stream: chunk.stream, data: chunk.data, timestamp: chunk.timestamp };
    }
  }

  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const pattern of PYTHON_DANGEROUS) {
      if (pattern.test(code)) {
        errors.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async cleanup(_session: ExecutionSession): Promise<void> {
    // No-op for now
  }
}

// ─── Shell Runtime ──────────────────────────────────────────────────

export class ShellRuntime implements RuntimeAdapter {
  name: RuntimeType = 'shell';

  async *execute(
    code: string,
    _session: ExecutionSession,
    opts: { timeout: number },
  ): AsyncIterable<OutputChunk> {
    for await (const chunk of spawnAndStream('sh', ['-c'], code, opts.timeout)) {
      yield { stream: chunk.stream, data: chunk.data, timestamp: chunk.timestamp };
    }
  }

  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const pattern of SHELL_DANGEROUS) {
      if (pattern.test(code)) {
        errors.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async cleanup(_session: ExecutionSession): Promise<void> {
    // No-op for now
  }
}
