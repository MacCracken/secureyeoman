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
    context: ActionContext
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
      if (action.type === 'code' && action.code) {
        return this.executeCodeAction(action, startTime);
      } else if (action.type === 'http' && action.http) {
        return this.executeHttpAction(action, startTime);
      } else if (action.type === 'shell' && action.shell) {
        return this.executeShellAction(action, startTime);
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

  private executeCodeAction(action: SkillAction, startTime: number): ActionResult {
    const code = action.code;
    if (!code) {
      return { success: false, error: 'Missing code', durationMs: 0 };
    }

    return {
      success: true,
      output: { message: 'Code execution placeholder', language: code.language },
      durationMs: Date.now() - startTime,
    };
  }

  private async executeHttpAction(action: SkillAction, startTime: number): Promise<ActionResult> {
    const httpConfig = action.http;
    if (!httpConfig) {
      return { success: false, error: 'Missing HTTP config', durationMs: 0 };
    }

    const timeoutMs = httpConfig.timeoutMs ?? 30000;

    if (this.config.allowedDomains?.length) {
      try {
        const url = new URL(httpConfig.url);
        if (!this.config.allowedDomains.includes(url.hostname)) {
          return {
            success: false,
            error: `Domain ${url.hostname} not in allowlist`,
            durationMs: Date.now() - startTime,
          };
        }
      } catch {
        return {
          success: false,
          error: 'Invalid URL',
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

  private executeShellAction(action: SkillAction, startTime: number): ActionResult {
    const shellConfig = action.shell;
    if (!shellConfig) {
      return { success: false, error: 'Missing shell config', durationMs: 0 };
    }

    if (!this.config.sandboxed) {
      return {
        success: false,
        error: 'Shell execution not allowed in non-sandboxed mode',
        durationMs: Date.now() - startTime,
      };
    }

    return {
      success: false,
      error: 'Shell execution requires explicit sandbox configuration',
      durationMs: Date.now() - startTime,
    };
  }
}
