/**
 * MCP QuickBooks Command Tests
 *
 * Tests all subcommands (status, enable, disable) plus help and unknown subcommands.
 * No external deps required.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mcpQuickbooksCommand } from './mcp-quickbooks.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(argv: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    argv,
    stdout: { write: (s: string) => { out.push(s); } },
    stderr: { write: (s: string) => { err.push(s); } },
    output: out,
    errors: err,
    text: () => out.join(''),
    errText: () => err.join(''),
  };
}

const ALL_CREDS = [
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'QUICKBOOKS_REALM_ID',
  'QUICKBOOKS_REFRESH_TOKEN',
] as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mcpQuickbooksCommand metadata', () => {
  it('has name mcp-quickbooks', () => {
    expect(mcpQuickbooksCommand.name).toBe('mcp-quickbooks');
  });

  it('has aliases mcp-qbo', () => {
    expect(mcpQuickbooksCommand.aliases).toContain('mcp-qbo');
  });

  it('has description', () => {
    expect(mcpQuickbooksCommand.description).toBeTruthy();
  });
});

describe('mcpQuickbooksCommand — help', () => {
  it('prints help when no subcommand given', async () => {
    const ctx = makeCtx([]);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('Usage:');
    expect(ctx.text()).toContain('status');
    expect(ctx.text()).toContain('enable');
    expect(ctx.text()).toContain('disable');
  });

  it('prints help for --help flag', async () => {
    const ctx = makeCtx(['--help']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('MCP_EXPOSE_QUICKBOOKS_TOOLS');
  });

  it('prints help for -h flag', async () => {
    const ctx = makeCtx(['-h']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('qbo_');
  });
});

describe('mcpQuickbooksCommand — unknown subcommand', () => {
  it('writes to stderr and returns 1', async () => {
    const ctx = makeCtx(['bogus']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(1);
    expect(ctx.errText()).toContain('Unknown subcommand: bogus');
    expect(ctx.errText()).toContain('--help');
  });
});

describe('mcpQuickbooksCommand — enable', () => {
  it('prints env var instruction and returns 0', async () => {
    const ctx = makeCtx(['enable']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('MCP_EXPOSE_QUICKBOOKS_TOOLS=true');
    expect(ctx.text()).toContain('QUICKBOOKS_CLIENT_ID');
    expect(ctx.text()).toContain('QUICKBOOKS_ENVIRONMENT=sandbox');
  });
});

describe('mcpQuickbooksCommand — disable', () => {
  it('prints env var instruction and returns 0', async () => {
    const ctx = makeCtx(['disable']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('MCP_EXPOSE_QUICKBOOKS_TOOLS=false');
  });
});

describe('mcpQuickbooksCommand — status', () => {
  // Save/restore env vars
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [...ALL_CREDS, 'MCP_EXPOSE_QUICKBOOKS_TOOLS', 'QUICKBOOKS_ENVIRONMENT']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it('shows disabled + missing creds and returns 0', async () => {
    const ctx = makeCtx(['status']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    const text = ctx.text();
    expect(text).toContain('(not set)');
    expect(text).toContain('Missing credentials');
    expect(text).toContain('QUICKBOOKS_CLIENT_ID');
  });

  it('shows enabled + missing creds and returns 1', async () => {
    process.env.MCP_EXPOSE_QUICKBOOKS_TOOLS = 'true';
    const ctx = makeCtx(['status']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(1);
    expect(ctx.text()).toContain('MCP_EXPOSE_QUICKBOOKS_TOOLS=true');
    expect(ctx.text()).toContain('Missing credentials');
  });

  it('shows all present + disabled and returns 0', async () => {
    for (const key of ALL_CREDS) {
      process.env[key] = 'set-value';
    }
    // Tool disabled (no MCP_EXPOSE_QUICKBOOKS_TOOLS)
    const ctx = makeCtx(['status']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    const text = ctx.text();
    expect(text).toContain('Credentials are configured but tools are disabled');
    expect(text).not.toContain('Missing credentials');
  });

  it('shows all present + enabled — ready message and returns 0', async () => {
    for (const key of ALL_CREDS) {
      process.env[key] = 'set-value';
    }
    process.env.MCP_EXPOSE_QUICKBOOKS_TOOLS = 'true';
    const ctx = makeCtx(['status']);
    const code = await mcpQuickbooksCommand.run(ctx as any);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('QBO tools are ready');
  });

  it('uses QUICKBOOKS_ENVIRONMENT from env', async () => {
    process.env.QUICKBOOKS_ENVIRONMENT = 'production';
    const ctx = makeCtx(['status']);
    await mcpQuickbooksCommand.run(ctx as any);
    expect(ctx.text()).toContain('QUICKBOOKS_ENVIRONMENT=production');
  });

  it('defaults QUICKBOOKS_ENVIRONMENT to sandbox when unset', async () => {
    const ctx = makeCtx(['status']);
    await mcpQuickbooksCommand.run(ctx as any);
    expect(ctx.text()).toContain('QUICKBOOKS_ENVIRONMENT=sandbox');
  });

  it('shows checkmark for each credential that is set', async () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'id123';
    const ctx = makeCtx(['status']);
    await mcpQuickbooksCommand.run(ctx as any);
    const text = ctx.text();
    expect(text).toContain('✓ QUICKBOOKS_CLIENT_ID=[set]');
    expect(text).toContain('✗ QUICKBOOKS_CLIENT_SECRET=(not set)');
  });
});
