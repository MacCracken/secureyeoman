/**
 * Skill Executor
 *
 * Executes skill actions in a sandboxed environment.
 * See ADR 021: Skill Actions Architecture
 */

import type { Skill, SkillAction } from '@secureyeoman/shared';

export interface ActionContext {
  sessionId: string;
  personalityId: string;
  userId: string;
  variables?: Record<string, string>;
}

export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  logs?: string[];
}

export interface ExecutorConfig {
  timeoutMs: number;
  memoryLimitMb: number;
  allowedDomains?: string[];
  sandboxed?: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  timeoutMs: 30000,
  memoryLimitMb: 256,
  allowedDomains: [],
  sandboxed: true,
};

export class SkillExecutor {
  constructor(private config: ExecutorConfig = DEFAULT_CONFIG) {}

  async executeAction(
    skill: Skill,
    actionId: string,
    _context: ActionContext
  ): Promise<ActionResult> {
    const startTime = Date.now();

    const action = skill.actions?.find((a) => a.id === actionId);
    if (!action) {
      return {
        success: false,
        error: `Action ${actionId} not found in skill ${skill.name}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // Try code action first (deterministic preference — future sandbox runtime)
      if (action.code) {
        return {
          success: false,
          error: 'Code actions require a sandbox runtime',
          durationMs: Date.now() - startTime,
        };
      }

      // Then HTTP action
      if (action.type === 'http' && action.http) {
        return this.executeHttpAction(action, startTime);
      }

      return {
        success: false,
        error: 'Action has no valid configuration',
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeHttpAction(action: SkillAction, startTime: number): Promise<ActionResult> {
    const httpConfig = action.http;
    if (!httpConfig) {
      return { success: false, error: 'Missing HTTP config', durationMs: 0 };
    }

    const timeoutMs = httpConfig.timeoutMs ?? 30000;

    // Validate URL and enforce domain restrictions
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(httpConfig.url);
    } catch {
      return { success: false, error: 'Invalid URL', durationMs: Date.now() - startTime };
    }

    // Block private/reserved IPs and cloud metadata endpoints (SSRF protection)
    const hostname = parsedUrl.hostname.toLowerCase();
    const BLOCKED_HOSTS = [
      'localhost',
      '127.0.0.1',
      '::1',
      '0.0.0.0',
      '169.254.169.254', // AWS/GCP metadata
      'metadata.google.internal', // GCP metadata
      'metadata.internal', // Generic cloud metadata
    ];
    if (
      BLOCKED_HOSTS.includes(hostname) ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return {
        success: false,
        error: 'Requests to private/internal addresses are not allowed',
        durationMs: Date.now() - startTime,
      };
    }

    // Enforce allowlist if configured
    if (this.config.allowedDomains?.length) {
      if (!this.config.allowedDomains.includes(hostname)) {
        return {
          success: false,
          error: `Domain ${hostname} not in allowlist`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(httpConfig.url, {
        method: httpConfig.method,
        headers: httpConfig.headers,
        body: httpConfig.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') ?? '';
      let output: unknown;

      if (contentType.includes('application/json')) {
        output = await response.json();
      } else {
        output = await response.text();
      }

      return {
        success: response.ok,
        output: { status: response.status, body: output },
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Request timeout', durationMs: Date.now() - startTime };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'HTTP request failed',
        durationMs: Date.now() - startTime,
      };
    }
  }
}
