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
    opts: { timeout: number }
  ): AsyncIterable<OutputChunk>;
  validateCode(code: string): { valid: boolean; errors: string[] };
  cleanup(session: ExecutionSession): Promise<void>;
}

// ─── Shared helpers ─────────────────────────────────────────────────

async function* spawnAndStream(
  command: string,
  args: string[],
  code: string,
  timeout: number
): AsyncIterable<OutputChunk & { _exitCode?: number }> {
  // Restricted environment — strip sensitive vars to prevent exfiltration
  const safeEnv: Record<string, string> = {};
  const ALLOWED_ENV_PREFIXES = ['PATH', 'HOME', 'USER', 'LANG', 'LC_', 'TERM', 'TZ', 'TMPDIR'];
  for (const [k, v] of Object.entries(process.env)) {
    if (v && ALLOWED_ENV_PREFIXES.some((p) => k.startsWith(p))) {
      safeEnv[k] = v;
    }
  }

  const child = spawn(command, [...args, code], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout,
    killSignal: 'SIGKILL', // ensure process actually dies on timeout
    env: safeEnv,
  });

  // Close stdin immediately — we pass code via argument
  child.stdin.end();

  // Collect chunks in a buffer that the consumer will drain via the async iterator.
  const chunks: (OutputChunk & { _exitCode?: number })[] = [];
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
  /\bimport\s*\(\s*['"]child_process['"]\s*\)/,
  /\brequire\s*\(\s*['"]node:child_process['"]\s*\)/,
  /\bimport\s*\(\s*['"]node:child_process['"]\s*\)/,
  /\bprocess\.exit\b/,
  /\bprocess\.mainModule\b/,
  /\bexecSync\b/,
  /\bspawnSync\b/,
  /\bfs\s*\.\s*(?:rm|rmdir|unlink|writeFile)Sync\b/,
  /\brequire\s*\(\s*['"]node:fs['"]\s*\)/,
  /\bimport\s*\(\s*['"]node:fs['"]\s*\)/,
  // Reverse shell / network exfil
  /\brequire\s*\(\s*['"](?:node:)?net['"]\s*\)/,
  /\bnew\s+net\.Socket\b/,
  /\brequire\s*\(\s*['"](?:node:)?dgram['"]\s*\)/,
  /\bchild_process\b/,
  /\bglobalThis\s*\[\s*['"]process['"]\]/,
];

const PYTHON_DANGEROUS = [
  /\bos\.system\b/,
  /\bsubprocess\b/,
  /\b__import__\b/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bshutil\.rmtree\b/,
  // Reverse shell patterns
  /\bsocket\.socket\b/,
  /\bsocket\.connect\b/,
  /\bpty\.spawn\b/,
  /\bos\.dup2\b/,
  /\bos\.popen\b/,
  /\bos\.exec[lv](?:p|pe|e)?\b/,
  /\bcommands\.getoutput\b/,
  /\breverse.*shell/i,
  // Encoding evasion
  /\bbase64\.b64decode\b/,
  /\bcodecs\.decode\b.*rot/,
  /\bchr\s*\(\s*\d+\s*\).*chr\s*\(\s*\d+\s*\)/,
];

const SHELL_DANGEROUS = [
  /\brm\s+-rf\s+\//,
  /\brm\s+-rf\s+~/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/, // fork bomb
  /\b>\s*\/dev\/sd/,
  /\bcurl\b.*\|\s*(?:sh|bash|zsh)\b/, // pipe to shell
  /\bwget\b.*\|\s*(?:sh|bash|zsh)\b/,
  /\bchmod\s+[0-7]*s/, // setuid
  /\bnc\s+-[el]/, // netcat listener
  // Reverse shell patterns
  /\/dev\/tcp\//, // bash /dev/tcp reverse shell
  /\bmkfifo\b/, // named pipe for reverse shell
  /\bncat\b.*-[el]/, // ncat listener
  /\bsocat\b/, // socat bidirectional relay
  /\btelnet\b.*\|.*(?:sh|bash)\b/, // telnet pipe to shell
  /\bpython[23]?\s+-c\s+.*(?:socket|pty)\b/, // python one-liner reverse shell
  /\bperl\s+-e\s+.*socket\b/, // perl reverse shell
  /\bruby\s+-e\s+.*(?:TCPSocket|socket)\b/, // ruby reverse shell
  /\bphp\s+-r\s+.*fsockopen\b/, // php reverse shell
  /\blua\s+-e\s+.*socket\b/, // lua reverse shell
  /\bexec\s+\d+<>\/dev\/tcp\b/, // fd redirect reverse shell
  /\bbash\s+-i\s+>&?\s*\/dev\/tcp\b/, // interactive bash reverse shell
  /0<&\d+;exec\s/, // fd juggling shell
  // Encoding evasion
  /\$'\x5c[xX][0-9a-fA-F]/, // $'\x41' hex escape
  /\bbase64\s+-d\b/, // base64 decode to exec
  /\bxxd\s+-r\b/, // hex decode
  /\beval\b.*\$\(/, // eval with command substitution
  /\beval\b.*`/, // eval with backtick substitution
];

// ─── Node Runtime ───────────────────────────────────────────────────

export class NodeRuntime implements RuntimeAdapter {
  name: RuntimeType = 'node';

  async *execute(
    code: string,
    _session: ExecutionSession,
    opts: { timeout: number }
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
    opts: { timeout: number }
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
    opts: { timeout: number }
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
