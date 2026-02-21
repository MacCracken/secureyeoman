/**
 * CLI Utilities — Flag parsing, formatting, color output, and HTTP helpers.
 */

import { randomBytes } from 'node:crypto';

// ─── ANSI Color Support ──────────────────────────────────────────────────────

const ANSI_RESET = '\x1b[0m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_DIM = '\x1b[2m';
const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_CYAN = '\x1b[36m';

/** Returns true when the stream supports ANSI colors and NO_COLOR is unset. */
function isTTYStream(stream: NodeJS.WritableStream): boolean {
  return !process.env.NO_COLOR && (stream as NodeJS.WriteStream).isTTY;
}

/**
 * Returns color helper functions bound to the given output stream.
 * All helpers are no-ops (return plain text) when the stream is not a TTY
 * or when the `NO_COLOR` environment variable is set.
 */
export function colorContext(stream: NodeJS.WritableStream) {
  const enabled = isTTYStream(stream);
  const wrap = (code: string) => (text: string) => (enabled ? `${code}${text}${ANSI_RESET}` : text);
  return {
    green: wrap(ANSI_GREEN),
    red: wrap(ANSI_RED),
    yellow: wrap(ANSI_YELLOW),
    dim: wrap(ANSI_DIM),
    bold: wrap(ANSI_BOLD),
    cyan: wrap(ANSI_CYAN),
  };
}

// ─── Progress Spinner ────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Minimal TTY spinner for long-running CLI operations.
 *
 * On non-TTY streams the spinner degrades gracefully: `start()` is silent
 * and `stop()` prints a single summary line. This means pipes and CI logs
 * never receive control characters.
 */
export class Spinner {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly stream: NodeJS.WritableStream;
  private readonly tty: boolean;
  private running = false;

  constructor(stream: NodeJS.WritableStream) {
    this.stream = stream;
    this.tty = isTTYStream(stream);
  }

  start(message: string): void {
    if (!this.tty) return; // non-TTY: stay silent until stop()
    this.running = true;
    this.frame = 0;
    this.stream.write(`  ${SPINNER_FRAMES[0]!} ${message}`);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.stream.write(`\r  ${SPINNER_FRAMES[this.frame]!} ${message}`);
    }, 80);
  }

  stop(finalMessage: string, success = true): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const mark = success ? '✓' : '✗';
    if (this.tty && this.running) {
      const color = success ? ANSI_GREEN : ANSI_RED;
      this.stream.write(`\r  ${color}${mark}${ANSI_RESET} ${finalMessage}\n`);
    } else {
      // non-TTY or spinner was never started on TTY
      this.stream.write(`  ${mark} ${finalMessage}\n`);
    }
    this.running = false;
  }
}

/** Extract a --flag value pair from argv, returning value and remaining args. */
export function extractFlag(
  argv: string[],
  flag: string,
  alias?: string
): { value: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === `--${flag}` || (alias && arg === `-${alias}`)) && i + 1 < argv.length) {
      value = argv[++i];
    } else if (arg !== undefined) {
      rest.push(arg);
    }
  }
  return { value, rest };
}

/** Extract a boolean --flag from argv. */
export function extractBoolFlag(
  argv: string[],
  flag: string,
  alias?: string
): { value: boolean; rest: string[] } {
  const rest: string[] = [];
  let value = false;
  for (const arg of argv) {
    if (arg === `--${flag}` || (alias && arg === `-${alias}`)) {
      value = true;
    } else {
      rest.push(arg);
    }
  }
  return { value, rest };
}

/** Format milliseconds as human-readable uptime. */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${String(h)}h`);
  if (m > 0 || h > 0) parts.push(`${String(m)}m`);
  parts.push(`${String(s)}s`);
  return parts.join(' ');
}

/** Format rows as aligned columns. */
export function formatTable(rows: Record<string, string>[], columns?: string[]): string {
  if (rows.length === 0) return '(no results)';

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((r) => (r[col] ?? '').length)));

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const header = cols.map((col, i) => col.toUpperCase().padEnd(widths[i]!)).join('  ');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const separator = cols.map((_, i) => '─'.repeat(widths[i]!)).join('  ');
  const body = rows.map((row) =>
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    cols.map((col, i) => (row[col] ?? '').padEnd(widths[i]!)).join('  ')
  );

  return [header, separator, ...body].join('\n');
}

/** Generate a random hex secret key. */
export function generateSecretKey(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Prompt the user for input via readline, returning default if empty. */
export function prompt(
  rl: import('node:readline').Interface,
  question: string,
  defaultValue?: string
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Prompt the user to pick from a numbered list of choices. */
export function promptChoice(
  rl: import('node:readline').Interface,
  question: string,
  choices: string[],
  defaultIndex = 0
): Promise<string> {
  return new Promise((resolve) => {
    const lines = choices.map(
      (c, i) => `  ${String(i + 1)}) ${c}${i === defaultIndex ? ' (default)' : ''}`
    );
    rl.question(`${question}\n${lines.join('\n')}\n  Choice: `, (answer) => {
      const idx = answer.trim() ? Number(answer.trim()) - 1 : defaultIndex;
      resolve(
        choices[idx >= 0 && idx < choices.length ? idx : defaultIndex] ?? choices[defaultIndex]!
      );
    });
  });
}

/** Wrapper around fetch for CLI HTTP calls. */
export async function apiCall(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      throw new Error(`Connection refused: ${baseUrl} — is the server running?`);
    }
    throw new Error(`HTTP request failed: ${msg}`);
  }

  let data: unknown;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { ok: response.ok, status: response.status, data };
}
