/**
 * TUI Command Tests
 *
 * Tests the branches of tuiCommand that don't require a real TTY:
 * - Help flag output
 * - Non-TTY early exit
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { tuiCommand } from './tui.js';

function makeCtx(argv: string[] = []) {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    argv,
    stdout: {
      write: (s: string) => {
        outLines.push(s);
      },
    },
    stderr: {
      write: (s: string) => {
        errLines.push(s);
      },
    },
    outLines,
    errLines,
  };
}

describe('tuiCommand', () => {
  it('exports the correct name and aliases', () => {
    expect(tuiCommand.name).toBe('tui');
    expect(tuiCommand.aliases).toContain('dashboard');
  });

  describe('--help flag', () => {
    it('prints usage and returns 0 for --help', async () => {
      const ctx = makeCtx(['--help']);
      const code = await tuiCommand.run(ctx as any);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('Usage:');
      expect(out).toContain('--url');
    });

    it('prints usage and returns 0 for -h', async () => {
      const ctx = makeCtx(['-h']);
      const code = await tuiCommand.run(ctx as any);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('--help');
    });
  });

  describe('non-TTY guard', () => {
    afterEach(() => {
      // Restore isTTY to its original undefined-like state
      Object.defineProperty(process.stdout, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('returns 1 when stdout is not a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      const ctx = makeCtx([]);
      const code = await tuiCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('TTY');
    });
  });
});
