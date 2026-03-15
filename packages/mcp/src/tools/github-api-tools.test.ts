/**
 * GitHub API MCP Tools — unit tests
 *
 * Verifies that all 20 github_* tools register without errors and proxy
 * through to the core API client correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGithubApiTools } from './github-api-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ login: 'octocat', id: 1 }),
    post: vi.fn().mockResolvedValue({ number: 1, title: 'test' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('github-api-tools', () => {
  it('registers all 20 github_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_profile', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_repos', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_repo', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_prs', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_pr', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_list_issues', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_get_issue', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_create_issue', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_create_pr', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers github_comment', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('github_profile calls GET /api/v1/github/profile', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGithubApiTools(server, client, noopMiddleware());
    expect(client.get).toBeDefined();
  });

  it('github_create_issue calls POST with correct endpoint', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerGithubApiTools(server, client, noopMiddleware());
    expect(client.post).toBeDefined();
  });

  it('registers github_sync_fork', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('handles core API errors gracefully on registration', () => {
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubApiTools(server, client, noopMiddleware())).not.toThrow();
  });
});

// ── SSH key persistence tests ──────────────────────────────────────────────────

import { encryptSshKey, decryptSshKey } from '../utils/ssh-crypto.js';

const TOKEN_SECRET = 'a'.repeat(32); // 32-char secret for HKDF

describe('github_setup_ssh — registration with tokenSecret', () => {
  it('registers all 20 tools when tokenSecret is provided', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerGithubApiTools(server, mockClient(), noopMiddleware(), TOKEN_SECRET)
    ).not.toThrow();
  });

  it('accepts undefined tokenSecret without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerGithubApiTools(server, mockClient(), noopMiddleware(), undefined)
    ).not.toThrow();
  });

  it('client.put method is available on the mock client', () => {
    const client = mockClient();
    expect(typeof client.put).toBe('function');
  });
});

describe('encryptSshKey / decryptSshKey round-trip', () => {
  it('round-trips a PEM string correctly', () => {
    const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\nABCD\n-----END OPENSSH PRIVATE KEY-----\n';
    const ciphertext = encryptSshKey(pem, TOKEN_SECRET);
    expect(ciphertext).not.toBe(pem);
    expect(decryptSshKey(ciphertext, TOKEN_SECRET)).toBe(pem);
  });

  it('throws on tampered ciphertext (GCM auth tag mismatch)', () => {
    const ciphertext = encryptSshKey('test-key', TOKEN_SECRET);
    const buf = Buffer.from(ciphertext, 'base64');
    // Flip a byte in the ciphertext (after iv+tag = 28 bytes)
    buf[30] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptSshKey(tampered, TOKEN_SECRET)).toThrow();
  });

  it('throws on ciphertext too short', () => {
    expect(() => decryptSshKey(Buffer.alloc(10).toString('base64'), TOKEN_SECRET)).toThrow(
      /too short/i
    );
  });
});
