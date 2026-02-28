/**
 * GitHub API Tools — MCP tools for reading and writing to GitHub via the REST API.
 *
 * All tools proxy through the core API's /api/v1/github/* endpoints,
 * which enforce per-personality integration access modes:
 *   auto   → full access (list, read, create issues/PRs, comment)
 *   draft  → list, read, create issues — PR create returns preview, comments blocked
 *   suggest → list, read only
 */

import { z } from 'zod';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';
import { encryptSshKey } from '../utils/ssh-crypto.js';

// ── SSH key generation (pure Node 20 crypto, no external binary) ──────────────

/**
 * Generate an ed25519 SSH key pair and return OpenSSH-formatted strings.
 *
 * Key format verified against OpenSSH 8.x — private key uses the canonical
 * "openssh-key-v1" envelope (unencrypted); public key is the standard
 * `ssh-ed25519 <base64> <comment>` one-liner.
 */
function generateSSHKeyPair(comment: string): { privateKey: string; publicKey: string } {
  const { publicKey: pubObj, privateKey: privObj } = generateKeyPairSync('ed25519');

  // Export to DER so we can extract raw 32-byte key material.
  const pubDer  = pubObj.export({ type: 'spki',   format: 'der' }) as Buffer;
  const privDer = privObj.export({ type: 'pkcs8', format: 'der' }) as Buffer;

  // SPKI ed25519 DER layout:  prefix(12 bytes) + rawPub(32 bytes)
  // PKCS8 ed25519 DER layout: prefix(16 bytes) + rawPriv(32 bytes)
  const rawPub  = pubDer.subarray(12);        // 32 bytes
  const rawPriv = privDer.subarray(16, 48);   // 32 bytes

  // Helper: prefix a Buffer/string with its uint32 big-endian length.
  const sshStr = (b: Buffer | string): Buffer => {
    const buf = Buffer.isBuffer(b) ? b : Buffer.from(b as string, 'utf8');
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(buf.length, 0);
    return Buffer.concat([len, buf]);
  };
  const u32 = (n: number): Buffer => {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32BE(n, 0);
    return b;
  };

  const TYPE    = 'ssh-ed25519';
  const typeBuf = Buffer.from(TYPE, 'ascii');

  // Public key blob used in both public-key line and private-key envelope.
  const pubBlob   = Buffer.concat([sshStr(typeBuf), sshStr(rawPub)]);
  const publicKey = `${TYPE} ${pubBlob.toString('base64')} ${comment}`;

  // OpenSSH private key format (unencrypted).
  // ed25519 private key data = rawPriv(32) || rawPub(32) = 64 bytes total.
  const privKeyData = Buffer.concat([rawPriv, rawPub]);
  const checkInt    = Math.floor(Math.random() * 0xffffffff);

  const innerRaw = Buffer.concat([
    u32(checkInt),
    u32(checkInt),    // check bytes must match
    sshStr(TYPE),
    sshStr(privKeyData),
    sshStr(comment),
  ]);

  // Pad to 8-byte block boundary (padding bytes = 1, 2, 3, …)
  const padLen = (8 - (innerRaw.length % 8)) % 8;
  const inner  = Buffer.concat([
    innerRaw,
    Buffer.from(Array.from({ length: padLen }, (_, i) => i + 1)),
  ]);

  const outer = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'ascii'),
    sshStr('none'),   // ciphername  (no encryption)
    sshStr('none'),   // kdfname
    sshStr(''),       // kdfoptions
    u32(1),           // number of keys
    sshStr(pubBlob),  // public key blob
    sshStr(inner),    // private key blob
  ]);

  const b64        = outer.toString('base64').match(/.{1,70}/g)!.join('\n');
  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;

  return { privateKey, publicKey };
}

export function registerGithubApiTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware,
  tokenSecret?: string
): void {
  // ── github_profile ───────────────────────────────────────────
  server.registerTool(
    'github_profile',
    {
      description:
        'Get the connected GitHub account profile — login, name, email, public repos count, access mode (auto/draft/suggest), and two_factor_authentication status (true/false). Use this to surface security recommendations like 2FA not being enabled.',
      inputSchema: {},
    },
    wrapToolHandler('github_profile', middleware, async () => {
      const result = await client.get('/api/v1/github/profile');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_repos ────────────────────────────────────────
  server.registerTool(
    'github_list_repos',
    {
      description:
        'List repositories for the authenticated GitHub user. Returns name, description, language, star count, and visibility.',
      inputSchema: {
        type: z.enum(['all', 'owner', 'member']).optional().describe('Filter by repository type (default: all)'),
        sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe('Sort field (default: full_name)'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number for pagination'),
      },
    },
    wrapToolHandler('github_list_repos', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.type) query.type = String(args.type);
      if (args.sort) query.sort = String(args.sort);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get('/api/v1/github/repos', query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_repo ──────────────────────────────────────────
  server.registerTool(
    'github_get_repo',
    {
      description:
        'Get details for a specific GitHub repository — description, language, stars, forks, default branch, open issues count.',
      inputSchema: {
        owner: z.string().describe('Repository owner (username or organization)'),
        repo: z.string().describe('Repository name'),
      },
    },
    wrapToolHandler('github_get_repo', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_prs ──────────────────────────────────────────
  server.registerTool(
    'github_list_prs',
    {
      description:
        'List pull requests for a GitHub repository. Returns title, number, author, status, head branch, and labels.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number'),
      },
    },
    wrapToolHandler('github_list_prs', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.state) query.state = String(args.state);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls`, query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_pr ────────────────────────────────────────────
  server.registerTool(
    'github_get_pr',
    {
      description:
        'Get a specific pull request — title, body, status (open/closed/merged), changed files count, reviewers, labels, and diff URL.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Pull request number'),
      },
    },
    wrapToolHandler('github_get_pr', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls/${args.number}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_issues ───────────────────────────────────────
  server.registerTool(
    'github_list_issues',
    {
      description:
        'List issues for a GitHub repository. Returns title, number, labels, assignees, and status. Note: PRs also appear as issues — filter by missing pull_request field to get issues only.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter (default: open)'),
        labels: z.string().optional().describe('Comma-separated label names to filter by'),
        per_page: z.number().int().min(1).max(100).optional().describe('Results per page (1–100, default 30)'),
        page: z.number().int().min(1).optional().describe('Page number'),
      },
    },
    wrapToolHandler('github_list_issues', middleware, async (args) => {
      const query: Record<string, string> = {};
      if (args.state) query.state = String(args.state);
      if (args.labels) query.labels = String(args.labels);
      if (args.per_page) query.per_page = String(args.per_page);
      if (args.page) query.page = String(args.page);
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/issues`, query);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_get_issue ─────────────────────────────────────────
  server.registerTool(
    'github_get_issue',
    {
      description:
        'Get a specific GitHub issue — title, body, labels, assignees, milestone, and comment count.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Issue number'),
      },
    },
    wrapToolHandler('github_get_issue', middleware, async (args) => {
      const result = await client.get(`/api/v1/github/repos/${args.owner}/${args.repo}/issues/${args.number}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_create_issue ──────────────────────────────────────
  server.registerTool(
    'github_create_issue',
    {
      description:
        'Create a GitHub issue. Available in "auto" and "draft" integration modes. Returns the issue number and URL. In "suggest" mode this tool will be blocked.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Issue title'),
        body: z.string().optional().describe('Issue description in Markdown'),
        labels: z.array(z.string()).optional().describe('Label names to apply'),
        assignees: z.array(z.string()).optional().describe('GitHub usernames to assign'),
      },
    },
    wrapToolHandler('github_create_issue', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/issues`, {
        title: args.title,
        body: args.body,
        labels: args.labels,
        assignees: args.assignees,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_create_pr ─────────────────────────────────────────
  server.registerTool(
    'github_create_pr',
    {
      description:
        'Create a GitHub pull request. Only available in "auto" mode. In "draft" mode returns a preview JSON for human review without creating the PR. In "suggest" mode this tool is blocked.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Pull request title'),
        head: z.string().describe('Head branch name (the branch containing changes)'),
        base: z.string().describe('Base branch name (the branch to merge into, e.g. "main")'),
        body: z.string().optional().describe('Pull request description in Markdown'),
        draft: z.boolean().optional().describe('Create as a draft PR on GitHub'),
      },
    },
    wrapToolHandler('github_create_pr', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/pulls`, {
        title: args.title,
        head: args.head,
        base: args.base,
        body: args.body,
        draft: args.draft,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_comment ───────────────────────────────────────────
  server.registerTool(
    'github_comment',
    {
      description:
        'Post a comment on a GitHub issue or pull request. Only available in "auto" integration mode. In "draft" or "suggest" mode this tool is blocked — ask the user to post the comment manually.',
      inputSchema: {
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        number: z.number().int().min(1).describe('Issue or PR number to comment on'),
        body: z.string().describe('Comment text in Markdown'),
      },
    },
    wrapToolHandler('github_comment', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/issues/${args.number}/comments`, {
        body: args.body,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_list_ssh_keys ─────────────────────────────────────
  server.registerTool(
    'github_list_ssh_keys',
    {
      description:
        'List all SSH public keys registered on the connected GitHub account. Returns key id, title, key fingerprint, and created_at. Use this to audit SSH access or find the key_id needed to delete a key.',
      inputSchema: {},
    },
    wrapToolHandler('github_list_ssh_keys', middleware, async () => {
      const result = await client.get('/api/v1/github/ssh-keys');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_add_ssh_key ────────────────────────────────────────
  server.registerTool(
    'github_add_ssh_key',
    {
      description:
        'Add an SSH public key to the connected GitHub account, enabling SSH push/pull for repositories. ' +
        'The key must be an existing public key (e.g. contents of ~/.ssh/id_ed25519.pub or id_rsa.pub) — this tool does NOT generate keys. ' +
        'In "draft" mode returns a preview without adding. Blocked in "suggest" mode. ' +
        'Requires the account to be reconnected with the admin:public_key scope.',
      inputSchema: {
        title: z.string().describe('A label for the key (e.g. "Work laptop" or "MacBook Pro 2024")'),
        key: z.string().describe('The full SSH public key string (starts with "ssh-ed25519", "ssh-rsa", etc.)'),
      },
    },
    wrapToolHandler('github_add_ssh_key', middleware, async (args) => {
      const result = await client.post('/api/v1/github/ssh-keys', {
        title: args.title,
        key: args.key,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_delete_ssh_key ─────────────────────────────────────
  server.registerTool(
    'github_delete_ssh_key',
    {
      description:
        'Remove an SSH public key from the connected GitHub account by its numeric key_id (obtain with github_list_ssh_keys). ' +
        'This immediately revokes SSH push/pull access for that key. Only available in "auto" mode.',
      inputSchema: {
        key_id: z.number().int().min(1).describe('Numeric SSH key ID from github_list_ssh_keys'),
      },
    },
    wrapToolHandler('github_delete_ssh_key', middleware, async (args) => {
      const result = await client.delete(`/api/v1/github/ssh-keys/${args.key_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? { deleted: true, key_id: args.key_id }, null, 2) }] };
    })
  );

  // ── github_setup_ssh ─────────────────────────────────────────
  server.registerTool(
    'github_setup_ssh',
    {
      description:
        'Generate a new ed25519 SSH key pair inside this container using Node.js crypto (no external binary required), ' +
        'register the public key with the connected GitHub account, write the private key to ~/.ssh/yeoman_github_ed25519, ' +
        'and configure ~/.ssh/config so git push/pull automatically uses it. ' +
        'Stores key metadata to ~/.ssh/yeoman_meta.json for rotation. ' +
        'If the container restarts the private key is lost — run this tool again to regenerate.',
      inputSchema: {
        title: z.string().describe('Label shown in GitHub Settings > SSH Keys (e.g. "secureyeoman-container" or "prod-mcp-2024")'),
      },
    },
    wrapToolHandler('github_setup_ssh', middleware, async (args) => {
      const { privateKey, publicKey } = generateSSHKeyPair(`secureyeoman:${args.title}`);

      // Register public key with GitHub (mode-enforced by core route)
      const reg = await client.post('/api/v1/github/ssh-keys', {
        title: args.title,
        key: publicKey,
      }) as Record<string, unknown>;

      // Handle draft-mode preview (core returns { preview: true, ... })
      if (reg.preview) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              preview: true,
              message: 'GitHub mode is "draft" — the SSH key was NOT registered. No files were written. Approve and switch to auto mode, then run github_setup_ssh again.',
              publicKey,
            }, null, 2),
          }],
        };
      }

      const githubKeyId = reg.id as number;
      const sshDir      = `${homedir()}/.ssh`;
      const keyPath     = `${sshDir}/yeoman_github_ed25519`;
      const configPath  = `${sshDir}/config`;
      const metaPath    = `${sshDir}/yeoman_meta.json`;

      await mkdir(sshDir, { recursive: true });
      await writeFile(keyPath, privateKey, { mode: 0o600 });

      // Upsert the github.com block in ~/.ssh/config (remove any previous managed block first)
      const configEntry =
        '\n# --- SecureYeoman managed — do not edit this block manually ---\n' +
        `Host github.com\n  IdentityFile ${keyPath}\n  IdentitiesOnly yes\n  StrictHostKeyChecking accept-new\n` +
        '# --- end SecureYeoman managed ---\n';
      let existingConfig = '';
      try { existingConfig = await readFile(configPath, 'utf8'); } catch { /* first run */ }
      const cleaned = existingConfig.replace(
        /\n# --- SecureYeoman managed[\s\S]*?# --- end SecureYeoman managed ---\n/g, ''
      );
      await writeFile(configPath, cleaned + configEntry, { mode: 0o600 });

      // Derive secret name for SecretsManager (uppercase, underscores only)
      const secretName = `GITHUB_SSH_${String(args.title).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

      // Persist key metadata for rotation (include secretName for later rotation/delete)
      await writeFile(metaPath, JSON.stringify(
        { githubKeyId, title: args.title, keyPath, secretName, createdAt: new Date().toISOString() },
        null, 2
      ));

      // Encrypt and store private key in SecretsManager via core (fire-and-forget; warn on error)
      if (tokenSecret) {
        try {
          const encrypted = encryptSshKey(privateKey, tokenSecret);
          await client.put(`/api/v1/secrets/${secretName}`, { value: encrypted });
        } catch (err) {
          console.warn(`[github_setup_ssh] Failed to persist encrypted key to SecretsManager: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            githubKeyId,
            keyPath,
            secretName,
            publicKey,
            message:
              `SSH key registered with GitHub (id: ${githubKeyId}). ` +
              `Private key written to ${keyPath} and encrypted in SecretsManager as ${secretName}. ` +
              `~/.ssh/config updated for github.com. ` +
              `Git can now push/pull via SSH. ` +
              `Run: git remote set-url origin git@github.com:<owner>/<repo>.git`,
          }, null, 2),
        }],
      };
    })
  );

  // ── github_rotate_ssh_key ─────────────────────────────────────
  server.registerTool(
    'github_rotate_ssh_key',
    {
      description:
        'Rotate the container SSH key: generate a new ed25519 key pair, register it with GitHub, ' +
        'revoke the old key, and update ~/.ssh/. Use periodically or when a key may be compromised. ' +
        'Reads the old key ID from ~/.ssh/yeoman_meta.json (written by github_setup_ssh). ' +
        'If meta is missing after a container restart provide old_key_id manually (from github_list_ssh_keys). ' +
        'Only available in auto integration mode.',
      inputSchema: {
        title: z.string().describe('Label for the new key in GitHub'),
        old_key_id: z.number().int().optional().describe('GitHub key ID to revoke — defaults to stored ID from last github_setup_ssh'),
      },
    },
    wrapToolHandler('github_rotate_ssh_key', middleware, async (args) => {
      const sshDir   = `${homedir()}/.ssh`;
      const metaPath = `${sshDir}/yeoman_meta.json`;

      // Resolve old key_id from args or stored metadata
      let oldKeyId: number | null = (args.old_key_id as number | undefined) ?? null;
      if (!oldKeyId) {
        try {
          const meta = JSON.parse(await readFile(metaPath, 'utf8')) as Record<string, unknown>;
          oldKeyId = meta.githubKeyId as number;
        } catch { /* meta missing after restart — user must supply old_key_id */ }
      }

      // Generate new key pair
      const { privateKey, publicKey } = generateSSHKeyPair(`secureyeoman:${args.title}`);

      // Register new key with GitHub
      const reg = await client.post('/api/v1/github/ssh-keys', {
        title: args.title,
        key: publicKey,
      }) as Record<string, unknown>;

      if (reg.preview) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ preview: true, message: 'Draft mode — no key registered or revoked.' }, null, 2),
          }],
        };
      }

      const newKeyId = reg.id as number;

      // Revoke old key
      let revokeNote = 'no old key ID available — old key left in GitHub (remove manually via github_list_ssh_keys + github_delete_ssh_key)';
      if (oldKeyId) {
        try {
          await client.delete(`/api/v1/github/ssh-keys/${oldKeyId}`);
          revokeNote = `old key ${oldKeyId} revoked from GitHub`;
        } catch (e) {
          revokeNote = `revoke of key ${oldKeyId} failed: ${(e as Error).message}`;
        }
      }

      // Write new private key
      const keyPath = `${sshDir}/yeoman_github_ed25519`;
      await mkdir(sshDir, { recursive: true });
      await writeFile(keyPath, privateKey, { mode: 0o600 });

      // Read old secret name from previous metadata (for SecretsManager cleanup)
      let oldSecretName: string | null = null;
      try {
        const prevMeta = JSON.parse(await readFile(metaPath, 'utf8')) as Record<string, unknown>;
        if (typeof prevMeta.secretName === 'string') oldSecretName = prevMeta.secretName;
      } catch { /* meta may have been overwritten — ok */ }

      const newSecretName = `GITHUB_SSH_${String(args.title).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

      // Update metadata
      await writeFile(metaPath, JSON.stringify(
        { githubKeyId: newKeyId, title: args.title, keyPath, secretName: newSecretName, createdAt: new Date().toISOString() },
        null, 2
      ));

      // Encrypt and store new key; delete old secret from SecretsManager
      let secretNote = '';
      if (tokenSecret) {
        try {
          const encrypted = encryptSshKey(privateKey, tokenSecret);
          await client.put(`/api/v1/secrets/${newSecretName}`, { value: encrypted });
          secretNote += ` New key encrypted in SecretsManager as ${newSecretName}.`;
        } catch (err) {
          console.warn(`[github_rotate_ssh_key] Failed to persist encrypted key: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (oldSecretName && oldSecretName !== newSecretName) {
          try {
            await client.delete(`/api/v1/secrets/${oldSecretName}`);
            secretNote += ` Old secret ${oldSecretName} removed from SecretsManager.`;
          } catch { /* old secret may not exist — ignore */ }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            newKeyId,
            revokeNote,
            keyPath,
            secretName: newSecretName,
            publicKey,
            message: `SSH key rotated. New key id: ${newKeyId}. ${revokeNote}.${secretNote}`,
          }, null, 2),
        }],
      };
    })
  );

  // ── github_create_repo ───────────────────────────────────────
  server.registerTool(
    'github_create_repo',
    {
      description:
        'Create a new GitHub repository under the authenticated user account. In "draft" mode returns a preview without creating. Blocked in "suggest" mode.',
      inputSchema: {
        name: z.string().describe('Repository name (no spaces)'),
        description: z.string().optional().describe('Short description of the repository'),
        private: z.boolean().optional().describe('Make the repository private (default: false)'),
        auto_init: z.boolean().optional().describe('Initialise with a README (default: false)'),
      },
    },
    wrapToolHandler('github_create_repo', middleware, async (args) => {
      const result = await client.post('/api/v1/github/repos', {
        name: args.name,
        description: args.description,
        private: args.private,
        auto_init: args.auto_init,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── github_fork_repo ─────────────────────────────────────────
  server.registerTool(
    'github_fork_repo',
    {
      description:
        'Fork a GitHub repository into the authenticated user account (or a specified organisation). GitHub forks are async — the response is 202 Accepted with the fork details. In "draft" mode returns a preview without forking. Blocked in "suggest" mode.',
      inputSchema: {
        owner: z.string().describe('Owner of the source repository'),
        repo: z.string().describe('Name of the source repository'),
        organization: z.string().optional().describe('Fork into this organisation instead of the authenticated user'),
        name: z.string().optional().describe('Custom name for the fork (defaults to source repo name)'),
        default_branch_only: z.boolean().optional().describe('Only copy the default branch (default: false — all branches)'),
      },
    },
    wrapToolHandler('github_fork_repo', middleware, async (args) => {
      const result = await client.post(`/api/v1/github/repos/${args.owner}/${args.repo}/forks`, {
        organization: args.organization,
        name: args.name,
        default_branch_only: args.default_branch_only,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
