/**
 * TUI Command — Full-screen terminal dashboard for SecureYeoman.
 *
 * A lightweight, zero-dependency TUI built on Node.js readline + ANSI
 * escape codes. Renders a header bar, a status pane, a scrolling chat
 * history, and an input line with live chat support.
 *
 * Usage:
 *   secureyeoman tui [--url URL]
 *
 * Key bindings (shown in footer):
 *   Enter       Send message / execute command
 *   Ctrl+R      Refresh status pane
 *   Ctrl+L      Clear chat history
 *   Ctrl+C / q  Quit
 *   Tab         Toggle focus: chat ↔ command bar
 */

import * as readline from 'node:readline';
import type { Command, CommandContext } from '../router.js';
import { extractFlag, extractBoolFlag, apiCall, formatUptime } from '../utils.js';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const A = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  // Foreground
  black: `${CSI}30m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  magenta: `${CSI}35m`,
  cyan: `${CSI}36m`,
  white: `${CSI}37m`,
  brightBlack: `${CSI}90m`,
  brightWhite: `${CSI}97m`,
  // Background
  bgBlack: `${CSI}40m`,
  bgBlue: `${CSI}44m`,
  bgCyan: `${CSI}46m`,
  bgWhite: `${CSI}47m`,
  bgBrightBlack: `${CSI}100m`,
  // Cursor
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  save: `${ESC}7`,
  restore: `${ESC}8`,
  // Screen
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  home: `${CSI}H`,
  altScreenOn: `${CSI}?1049h`,
  altScreenOff: `${CSI}?1049l`,
};

function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

function padEnd(str: string, width: number): string {
  // Strip ANSI codes to get visual length
  const visual = str.replace(/\x1b\[[^m]*m/g, '');
  const pad = Math.max(0, width - visual.length);
  return str + ' '.repeat(pad);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[^m]*m/g, '');
}

// ── Layout constants ──────────────────────────────────────────────────────────

const HEADER_ROWS = 3;   // header bar + divider
const STATUS_ROWS = 7;   // status pane
const FOOTER_ROWS = 3;   // input bar + key hints
const MIN_CHAT_ROWS = 4;

// ── Chat message types ────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: string;
}

// ── Status data ───────────────────────────────────────────────────────────────

interface StatusData {
  status: string;
  version: string;
  uptime: string;
  personality: string;
  model: string;
  provider: string;
  error?: string;
}

// ── TUI renderer ─────────────────────────────────────────────────────────────

class TuiRenderer {
  private readonly out: NodeJS.WriteStream;
  private rows: number;
  private cols: number;
  private messages: ChatMessage[] = [];
  private statusData: StatusData = {
    status: 'connecting…',
    version: '',
    uptime: '',
    personality: '',
    model: '',
    provider: '',
  };
  private inputBuffer = '';
  private inputLabel = 'Chat';
  private scrollOffset = 0; // lines from bottom (0 = latest)
  private thinking = false;

  constructor(out: NodeJS.WriteStream) {
    this.out = out;
    this.rows = out.rows ?? 24;
    this.cols = out.columns ?? 80;
  }

  private chatRows(): number {
    return Math.max(MIN_CHAT_ROWS, this.rows - HEADER_ROWS - STATUS_ROWS - FOOTER_ROWS);
  }

  onResize(): void {
    this.rows = this.out.rows ?? 24;
    this.cols = this.out.columns ?? 80;
    this.render();
  }

  // ── Partial-update helpers ──────────────────────────────────────────────────

  private write(s: string): void {
    this.out.write(s);
  }

  // ── Full render ─────────────────────────────────────────────────────────────

  render(): void {
    this.write(A.hide + A.save);

    this.renderHeader();
    this.renderStatus();
    this.renderChatArea();
    this.renderFooter();

    this.write(A.restore + A.show);
  }

  private renderHeader(): void {
    const w = this.cols;
    const title = ' SecureYeoman ';
    const brand = `${A.bold}${A.cyan}${title}${A.reset}`;
    const sub = `${A.dim}  Terminal Dashboard${A.reset}`;
    const right = `${A.dim}Ctrl+C to quit  ${A.reset}`;

    const fill = w - stripAnsi(title).length - stripAnsi('  Terminal Dashboard').length - stripAnsi('Ctrl+C to quit  ').length;
    const spacing = fill > 0 ? ' '.repeat(fill) : ' ';

    this.write(moveTo(1, 1));
    this.write(A.bgBlue + A.white);
    this.write(padEnd(brand + sub + spacing + right, w));
    this.write(A.reset);

    // Divider
    this.write(moveTo(2, 1));
    this.write(A.dim + '─'.repeat(w) + A.reset);

    // Blank separator
    this.write(moveTo(3, 1));
    this.write(' '.repeat(w));
  }

  private renderStatus(): void {
    const w = this.cols;
    const sd = this.statusData;
    const startRow = HEADER_ROWS + 1;

    const dot = sd.status === 'ok'
      ? `${A.green}●${A.reset}`
      : sd.status === 'connecting…'
        ? `${A.yellow}◌${A.reset}`
        : `${A.red}●${A.reset}`;

    const statusLabel = sd.status === 'ok' ? `${A.green}OK${A.reset}` : `${A.red}${sd.status}${A.reset}`;

    const lines: string[] = [
      `${A.bold}${A.cyan}── Status ──────────────────────────────────────────${A.reset}`,
      `  ${dot}  Status    ${statusLabel}`,
      `  ${A.dim}⏱${A.reset}  Uptime    ${sd.uptime || '—'}    ${A.dim}v${sd.version || '?'}${A.reset}`,
      `  ${A.magenta}◎${A.reset}  Identity  ${A.bold}${sd.personality || '—'}${A.reset}`,
      `  ${A.cyan}⚙${A.reset}  Model     ${sd.model || '—'} ${A.dim}(${sd.provider || '—'})${A.reset}`,
      sd.error ? `  ${A.red}⚠  ${sd.error}${A.reset}` : '',
      '',
    ];

    for (let i = 0; i < STATUS_ROWS; i++) {
      this.write(moveTo(startRow + i, 1));
      this.write(A.clearLine);
      const line = lines[i] ?? '';
      this.write(padEnd(line, w));
    }
  }

  private renderChatArea(): void {
    const w = this.cols;
    const chatRows = this.chatRows();
    const startRow = HEADER_ROWS + STATUS_ROWS + 1;

    // Divider
    this.write(moveTo(startRow, 1));
    this.write(A.dim + '─'.repeat(w) + A.reset);

    const visibleRows = chatRows - 1; // reserve first row for divider
    const allLines: string[] = [];

    for (const msg of this.messages) {
      const lines = this.formatMessage(msg, w - 4);
      allLines.push(...lines, '');
    }

    if (this.thinking) {
      allLines.push(`  ${A.dim}${A.italic}thinking…${A.reset}`, '');
    }

    // Apply scroll: 0 = bottom-pinned
    const total = allLines.length;
    const start = Math.max(0, total - visibleRows - this.scrollOffset);
    const slice = allLines.slice(start, start + visibleRows);

    for (let i = 0; i < visibleRows; i++) {
      this.write(moveTo(startRow + 1 + i, 1));
      this.write(A.clearLine);
      if (i < slice.length) {
        this.write('  ' + (slice[i] ?? ''));
      }
    }
  }

  private formatMessage(msg: ChatMessage, maxWidth: number): string[] {
    const lines: string[] = [];

    const roleColor =
      msg.role === 'user'
        ? A.cyan
        : msg.role === 'assistant'
          ? A.green
          : msg.role === 'error'
            ? A.red
            : A.dim;

    const roleLabel =
      msg.role === 'user'
        ? 'You'
        : msg.role === 'assistant'
          ? 'Agent'
          : msg.role === 'error'
            ? 'Error'
            : 'System';

    lines.push(
      `${roleColor}${A.bold}${roleLabel}${A.reset}${A.dim}  ${msg.timestamp}${A.reset}`
    );

    // Word-wrap content
    const words = msg.content.split('\n');
    for (const paragraph of words) {
      if (paragraph.length === 0) {
        lines.push('');
        continue;
      }
      let current = '';
      for (const word of paragraph.split(' ')) {
        if (current.length + word.length + 1 > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = current ? current + ' ' + word : word;
        }
      }
      if (current) lines.push(current);
    }

    return lines;
  }

  private renderFooter(): void {
    const w = this.cols;
    const inputRow = this.rows - 2;
    const hintRow = this.rows - 1;
    const divRow = this.rows - 3;

    // Divider
    this.write(moveTo(divRow, 1));
    this.write(A.dim + '─'.repeat(w) + A.reset);

    // Input bar
    const labelStr = `${A.bold}${A.cyan}${this.inputLabel}${A.reset}`;
    const prompt = `${labelStr}${A.dim}>${A.reset} `;
    const promptPlain = `${this.inputLabel}> `;
    const available = w - promptPlain.length - 1;
    const displayInput = truncate(this.inputBuffer, available);
    this.write(moveTo(inputRow, 1));
    this.write(A.clearLine);
    this.write(prompt + displayInput + '█');

    // Hints
    const hints = [
      `${A.dim}Enter${A.reset} send`,
      `${A.dim}Ctrl+R${A.reset} refresh`,
      `${A.dim}Ctrl+L${A.reset} clear`,
      `${A.dim}↑↓${A.reset} scroll`,
      `${A.dim}Ctrl+C${A.reset} quit`,
    ].join('   ');
    this.write(moveTo(hintRow, 1));
    this.write(A.clearLine);
    this.write('  ' + hints);
  }

  // ── Mutation helpers ────────────────────────────────────────────────────────

  setStatus(data: Partial<StatusData>): void {
    this.statusData = { ...this.statusData, ...data };
  }

  addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    this.scrollOffset = 0; // snap to bottom on new message
  }

  clearMessages(): void {
    this.messages = [];
    this.scrollOffset = 0;
  }

  setInput(buf: string): void {
    this.inputBuffer = buf;
  }

  setThinking(v: boolean): void {
    this.thinking = v;
  }

  scrollUp(lines = 3): void {
    const chatRows = this.chatRows();
    const allLines = this.messages.reduce((acc, m) => acc + this.formatMessage(m, this.cols - 4).length + 1, 0);
    this.scrollOffset = Math.min(this.scrollOffset + lines, Math.max(0, allLines - chatRows + 2));
  }

  scrollDown(lines = 3): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
  }
}

// ── Main command ──────────────────────────────────────────────────────────────

export const tuiCommand: Command = {
  name: 'tui',
  aliases: ['dashboard'],
  description: 'Full-screen terminal dashboard',
  usage: 'secureyeoman tui [--url URL]',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value) {
      ctx.stdout.write(`
Usage: ${this.usage}

Open an interactive full-screen TUI dashboard with live status, chat, and
memory monitoring. Requires a running SecureYeoman server.

Options:
      --url <url>    Server URL (default: http://127.0.0.1:3000)
  -h, --help         Show this help
\n`);
      return 0;
    }
    argv = helpResult.rest;

    if (!process.stdout.isTTY) {
      ctx.stderr.write('Error: TUI requires an interactive terminal (TTY).\n');
      return 1;
    }

    const urlResult = extractFlag(argv, 'url');
    const baseUrl = urlResult.value ?? 'http://127.0.0.1:3000';

    const out = process.stdout as NodeJS.WriteStream;
    const renderer = new TuiRenderer(out);

    // ── Alternate screen + raw mode ───────────────────────────────────────────
    out.write(A.altScreenOn + A.clear + A.home);

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    let running = true;
    let inputBuf = '';
    let conversationId: string | undefined;

    const now = (): string => {
      const d = new Date();
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const sysMsg = (content: string): void => {
      renderer.addMessage({ role: 'system', content, timestamp: now() });
    };

    // ── Status polling ────────────────────────────────────────────────────────

    const fetchStatus = async (): Promise<void> => {
      try {
        const [healthRes, personalityRes] = await Promise.all([
          apiCall(baseUrl, '/health').catch(() => null),
          apiCall(baseUrl, '/api/v1/soul/personality').catch(() => null),
        ]);

        if (!healthRes?.ok) {
          renderer.setStatus({ status: 'unreachable', error: `Cannot reach ${baseUrl}` });
          return;
        }

        const health = healthRes.data as Record<string, unknown>;
        const personality = personalityRes?.ok
          ? ((personalityRes.data as Record<string, unknown>)?.personality as Record<string, unknown> | null)
          : null;

        // Try to get model info from usage or config endpoint
        let model = '';
        let provider = '';
        try {
          const cfgRes = await apiCall(baseUrl, '/api/v1/config');
          if (cfgRes?.ok) {
            const cfg = cfgRes.data as Record<string, unknown>;
            const modelCfg = cfg?.model as Record<string, unknown> | null;
            model = (modelCfg?.model as string) ?? '';
            provider = (modelCfg?.provider as string) ?? '';
          }
        } catch {
          // ignore
        }

        renderer.setStatus({
          status: (health.status as string) ?? 'unknown',
          version: (health.version as string) ?? '',
          uptime: formatUptime((health.uptime as number) ?? 0),
          personality: (personality?.name as string) ?? '—',
          model,
          provider,
          error: undefined,
        });
      } catch (err) {
        renderer.setStatus({ status: 'error', error: String(err) });
      }
    };

    // ── Chat send ─────────────────────────────────────────────────────────────

    const sendChat = async (message: string): Promise<void> => {
      renderer.addMessage({ role: 'user', content: message, timestamp: now() });
      renderer.setThinking(true);
      renderer.render();

      try {
        const body: Record<string, unknown> = { message };
        if (conversationId) body.conversationId = conversationId;

        const res = await apiCall(baseUrl, '/api/v1/chat', {
          method: 'POST',
          body,
        });

        renderer.setThinking(false);

        if (!res?.ok) {
          renderer.addMessage({
            role: 'error',
            content: `Request failed: ${JSON.stringify(res?.data ?? 'No response')}`,
            timestamp: now(),
          });
          return;
        }

        const data = res.data as Record<string, unknown>;
        if (data.conversationId) conversationId = data.conversationId as string;

        renderer.addMessage({
          role: 'assistant',
          content: (data.content as string) ?? '',
          timestamp: now(),
        });
      } catch (err) {
        renderer.setThinking(false);
        renderer.addMessage({ role: 'error', content: String(err), timestamp: now() });
      }
    };

    // ── Resize handler ────────────────────────────────────────────────────────
    process.stdout.on('resize', () => {
      renderer.onResize();
    });

    // ── Keypress handler ──────────────────────────────────────────────────────
    process.stdin.on('keypress', (_ch, key) => {
      if (!key) return;

      // Quit
      if ((key.ctrl && key.name === 'c') || (inputBuf === '' && key.name === 'q')) {
        running = false;
        return;
      }

      // Refresh status
      if (key.ctrl && key.name === 'r') {
        fetchStatus().then(() => renderer.render()).catch(() => null);
        return;
      }

      // Clear chat
      if (key.ctrl && key.name === 'l') {
        renderer.clearMessages();
        conversationId = undefined;
        sysMsg('Chat cleared.');
        renderer.render();
        return;
      }

      // Scroll up/down
      if (key.name === 'up') {
        renderer.scrollUp(3);
        renderer.render();
        return;
      }
      if (key.name === 'down') {
        renderer.scrollDown(3);
        renderer.render();
        return;
      }
      if (key.name === 'pageup') {
        renderer.scrollUp(10);
        renderer.render();
        return;
      }
      if (key.name === 'pagedown') {
        renderer.scrollDown(10);
        renderer.render();
        return;
      }

      // Submit
      if (key.name === 'return' || key.name === 'enter') {
        const msg = inputBuf.trim();
        inputBuf = '';
        renderer.setInput('');
        if (msg) {
          sendChat(msg).then(() => renderer.render()).catch(() => null);
        }
        renderer.render();
        return;
      }

      // Backspace
      if (key.name === 'backspace') {
        inputBuf = inputBuf.slice(0, -1);
        renderer.setInput(inputBuf);
        renderer.render();
        return;
      }

      // Typed character
      if (!key.ctrl && !key.meta && key.sequence && key.sequence.length === 1) {
        inputBuf += key.sequence;
        renderer.setInput(inputBuf);
        renderer.render();
      }
    });

    // ── Startup ───────────────────────────────────────────────────────────────
    sysMsg(`Connecting to ${baseUrl}…`);
    renderer.render();

    await fetchStatus();
    sysMsg('Type a message and press Enter to chat. Ctrl+C to quit.');
    renderer.render();

    // Periodic status refresh (every 30 s)
    const pollInterval = setInterval(() => {
      if (!running) return;
      fetchStatus().then(() => {
        if (running) renderer.render();
      }).catch(() => null);
    }, 30_000);

    // ── Main loop — wait until quit ───────────────────────────────────────────
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!running) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    clearInterval(pollInterval);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    out.write(A.altScreenOff);
    process.stdin.pause();

    return 0;
  },
};
