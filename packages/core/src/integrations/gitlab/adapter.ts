/**
 * GitLab Integration
 *
 * GitLab adapter using the REST API v4 + webhook verification.
 * Handles push, merge_request, note (comments), and issue events.
 * Normalizes inbound webhook payloads to UnifiedMessage.
 */

import type { IntegrationConfig, UnifiedMessage, Platform } from '@friday/shared';
import type { WebhookIntegration, IntegrationDeps, PlatformRateLimit } from '../types.js';
import type { SecureLogger } from '../../logging/logger.js';

// ─── Config types ─────────────────────────────────────────

interface GitLabConfig {
  personalAccessToken: string;
  webhookSecret: string;
  gitlabUrl?: string;
}

// ─── Webhook payload types ────────────────────────────────

interface GitLabPushPayload {
  object_kind: 'push';
  ref: string;
  user_name: string;
  user_username: string;
  project: { path_with_namespace: string; web_url: string };
  commits: Array<{ id: string; message: string; author: { name: string } }>;
  total_commits_count: number;
}

interface GitLabMergeRequestPayload {
  object_kind: 'merge_request';
  user: { username: string; name: string };
  project: { path_with_namespace: string; web_url: string };
  object_attributes: {
    iid: number;
    title: string;
    state: string;
    action: string;
    url: string;
    target_branch: string;
    source_branch: string;
  };
}

interface GitLabNotePayload {
  object_kind: 'note';
  user: { username: string; name: string };
  project: { path_with_namespace: string };
  object_attributes: {
    id: number;
    note: string;
    noteable_type: string;
    url: string;
    created_at: string;
  };
  merge_request?: { iid: number; title: string };
  issue?: { iid: number; title: string };
}

interface GitLabIssuePayload {
  object_kind: 'issue';
  user: { username: string; name: string };
  project: { path_with_namespace: string };
  object_attributes: {
    iid: number;
    title: string;
    state: string;
    action: string;
    url: string;
    created_at: string;
  };
}

type GitLabWebhookPayload =
  | GitLabPushPayload
  | GitLabMergeRequestPayload
  | GitLabNotePayload
  | GitLabIssuePayload;

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

export class GitLabIntegration implements WebhookIntegration {
  readonly platform: Platform = 'gitlab';
  readonly platformRateLimit: PlatformRateLimit = { maxPerSecond: 10 };

  private config: IntegrationConfig | null = null;
  private deps: IntegrationDeps | null = null;
  private logger: SecureLogger | null = null;
  private running = false;
  private personalAccessToken = '';
  private webhookSecret = '';
  private gitlabUrl = DEFAULT_GITLAB_URL;

  async init(config: IntegrationConfig, deps: IntegrationDeps): Promise<void> {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger;

    const gc = config.config as unknown as GitLabConfig;
    this.personalAccessToken = gc.personalAccessToken;
    this.webhookSecret = gc.webhookSecret;
    this.gitlabUrl = gc.gitlabUrl ?? DEFAULT_GITLAB_URL;

    if (!this.personalAccessToken) {
      throw new Error('GitLab integration requires a personalAccessToken');
    }
    if (!this.webhookSecret) {
      throw new Error('GitLab integration requires a webhookSecret');
    }

    this.logger?.info('GitLab integration initialized');
  }

  async start(): Promise<void> {
    if (!this.config) throw new Error('Integration not initialized');
    if (this.running) return;
    this.running = true;
    this.logger?.info('GitLab integration started (webhook listener ready)');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.logger?.info('GitLab integration stopped');
  }

  /**
   * Send a message to GitLab by posting a comment (note).
   * chatId format: `project-id/issues/123` or `project-id/merge_requests/123`
   */
  async sendMessage(chatId: string, text: string, _metadata?: Record<string, unknown>): Promise<string> {
    const parts = chatId.split('/');
    if (parts.length < 3) {
      throw new Error(`Invalid chatId format: expected "projectId/issues|merge_requests/iid", got "${chatId}"`);
    }

    // Support both "projectId/issues/123" and "namespace/project/issues/123"
    const iidStr = parts[parts.length - 1]!;
    const type = parts[parts.length - 2]!;
    const projectPath = parts.slice(0, parts.length - 2).join('/');
    const iid = parseInt(iidStr, 10);
    if (isNaN(iid)) {
      throw new Error(`Invalid issue/MR IID in chatId: ${iidStr}`);
    }

    const encodedProject = encodeURIComponent(projectPath);
    const notePath = type === 'merge_requests'
      ? `/api/v4/projects/${encodedProject}/merge_requests/${iid}/notes`
      : `/api/v4/projects/${encodedProject}/issues/${iid}/notes`;

    const resp = await fetch(`${this.gitlabUrl}${notePath}`, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': this.personalAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: text }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to post GitLab note: ${err}`);
    }

    const note = (await resp.json()) as { id: number };
    return String(note.id);
  }

  isHealthy(): boolean {
    return this.running;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const resp = await fetch(`${this.gitlabUrl}/api/v4/user`, {
        headers: { 'PRIVATE-TOKEN': this.personalAccessToken },
      });

      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, message: `GitLab API error: ${err}` };
      }

      const user = (await resp.json()) as { username: string; name: string };
      return { ok: true, message: `Connected as ${user.name} (@${user.username})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── WebhookIntegration methods ─────────────────────────

  getWebhookPath(): string {
    return `/api/v1/webhooks/gitlab/${this.config?.id ?? 'unknown'}`;
  }

  verifyWebhook(_payload: string, signature: string): boolean {
    // GitLab uses a shared secret token via X-Gitlab-Token header
    return signature === this.webhookSecret;
  }

  /**
   * Handle a raw webhook event. Called by the webhook route handler.
   */
  async handleWebhook(eventName: string, payloadStr: string, token: string): Promise<void> {
    if (token !== this.webhookSecret) {
      throw new Error('Invalid webhook token');
    }

    const payload = JSON.parse(payloadStr) as GitLabWebhookPayload;
    const objectKind = payload.object_kind;

    let unified: UnifiedMessage | null = null;

    switch (objectKind) {
      case 'push':
        unified = this.handlePush(payload as GitLabPushPayload);
        break;
      case 'merge_request':
        unified = this.handleMergeRequest(payload as GitLabMergeRequestPayload);
        break;
      case 'note':
        unified = this.handleNote(payload as GitLabNotePayload);
        break;
      case 'issue':
        unified = this.handleIssue(payload as GitLabIssuePayload);
        break;
      default:
        this.logger?.debug(`Ignoring GitLab event: ${eventName}`);
        return;
    }

    if (unified && this.deps) {
      await this.deps.onMessage(unified);
    }
  }

  // ─── Event handlers ────────────────────────────────────

  private handlePush(payload: GitLabPushPayload): UnifiedMessage {
    return {
      id: `gl_push_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'gitlab',
      direction: 'inbound',
      senderId: payload.user_username,
      senderName: payload.user_name,
      chatId: payload.project.path_with_namespace,
      text: `Push to ${payload.ref}: ${payload.commits.map((c) => c.message).join(', ')}`,
      attachments: [],
      platformMessageId: `push_${Date.now()}`,
      metadata: {
        event: 'push',
        ref: payload.ref,
        commitCount: payload.total_commits_count,
      },
      timestamp: Date.now(),
    };
  }

  private handleMergeRequest(payload: GitLabMergeRequestPayload): UnifiedMessage {
    const mr = payload.object_attributes;
    return {
      id: `gl_mr_${mr.iid}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'gitlab',
      direction: 'inbound',
      senderId: payload.user.username,
      senderName: payload.user.name,
      chatId: `${payload.project.path_with_namespace}/merge_requests/${mr.iid}`,
      text: `MR !${mr.iid} ${mr.action}: ${mr.title}`,
      attachments: [],
      platformMessageId: String(mr.iid),
      metadata: {
        event: 'merge_request',
        action: mr.action,
        mrIid: mr.iid,
        mrState: mr.state,
        mrUrl: mr.url,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
      },
      timestamp: Date.now(),
    };
  }

  private handleNote(payload: GitLabNotePayload): UnifiedMessage {
    const note = payload.object_attributes;
    const context = payload.merge_request
      ? `MR !${payload.merge_request.iid}`
      : payload.issue
        ? `Issue #${payload.issue.iid}`
        : note.noteable_type;

    const chatId = payload.merge_request
      ? `${payload.project.path_with_namespace}/merge_requests/${payload.merge_request.iid}`
      : payload.issue
        ? `${payload.project.path_with_namespace}/issues/${payload.issue.iid}`
        : payload.project.path_with_namespace;

    return {
      id: `gl_note_${note.id}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'gitlab',
      direction: 'inbound',
      senderId: payload.user.username,
      senderName: payload.user.name,
      chatId,
      text: `Comment on ${context}: ${note.note}`,
      attachments: [],
      platformMessageId: String(note.id),
      metadata: {
        event: 'note',
        noteableType: note.noteable_type,
        noteUrl: note.url,
      },
      timestamp: new Date(note.created_at).getTime(),
    };
  }

  private handleIssue(payload: GitLabIssuePayload): UnifiedMessage {
    const issue = payload.object_attributes;
    return {
      id: `gl_issue_${issue.iid}_${Date.now()}`,
      integrationId: this.config!.id,
      platform: 'gitlab',
      direction: 'inbound',
      senderId: payload.user.username,
      senderName: payload.user.name,
      chatId: `${payload.project.path_with_namespace}/issues/${issue.iid}`,
      text: `Issue #${issue.iid} ${issue.action}: ${issue.title}`,
      attachments: [],
      platformMessageId: String(issue.iid),
      metadata: {
        event: 'issue',
        action: issue.action,
        issueIid: issue.iid,
        issueState: issue.state,
        issueUrl: issue.url,
      },
      timestamp: new Date(issue.created_at).getTime(),
    };
  }
}
