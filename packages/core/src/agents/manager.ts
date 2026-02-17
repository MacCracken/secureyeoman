/**
 * SubAgentManager — Execution engine for sub-agent delegation.
 *
 * Spawns subordinate agents with specialized personas, manages their
 * lifecycle (token budgets, timeouts, depth limits), and collects results.
 */

import { AIClient, type AIClientConfig, type AIClientDeps } from '../ai/client.js';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';
import type { BrainManager } from '../brain/manager.js';
import { uuidv7 } from '../utils/crypto.js';
import { SubAgentStorage, type DelegationRecord } from './storage.js';
import { getDelegationTools } from './tools.js';
import type {
  AgentProfile,
  AgentProfileCreate,
  AgentProfileUpdate,
  DelegationConfig,
  DelegationParams,
  DelegationResult,
  SubAgentInfo,
  SecurityConfig,
  AIMessage,
  Tool,
} from '@friday/shared';

export interface SubAgentManagerDeps {
  storage: SubAgentStorage;
  aiClientConfig: AIClientConfig;
  aiClientDeps: AIClientDeps;
  mcpClient?: McpClientManager;
  auditChain: AuditChain;
  logger: SecureLogger;
  brainManager?: BrainManager;
  /** Top-level security config; used to enforce allowSubAgents kill-switch */
  securityConfig?: SecurityConfig;
}

interface ActiveDelegation {
  abortController: AbortController;
  promise: Promise<DelegationResult>;
  startedAt: number;
  profileName: string;
  task: string;
  depth: number;
  tokenBudget: number;
  tokensUsed: number;
}

export class SubAgentManager {
  private readonly storage: SubAgentStorage;
  private readonly config: DelegationConfig;
  private readonly deps: SubAgentManagerDeps;
  private readonly activeDelegations = new Map<string, ActiveDelegation>();

  constructor(config: DelegationConfig, deps: SubAgentManagerDeps) {
    this.config = config;
    this.deps = deps;
    this.storage = deps.storage;
  }

  async initialize(): Promise<void> {
    await this.storage.seedBuiltinProfiles();
    this.deps.logger.debug('SubAgentManager initialized with built-in profiles');
  }

  // ── Delegation ──────────────────────────────────────────────────

  async delegate(
    params: DelegationParams,
    parentContext?: { delegationId?: string; depth?: number; remainingBudget?: number },
  ): Promise<DelegationResult> {
    // Top-level security kill-switch — overrides delegation config and per-personality settings
    if (this.deps.securityConfig && !this.deps.securityConfig.allowSubAgents) {
      throw new Error('Sub-agent delegation is disabled by security policy');
    }

    if (!this.config.enabled) {
      throw new Error('Sub-agent delegation is not enabled');
    }

    const depth = parentContext?.depth ?? 0;
    const maxDepth = params.maxDepth ?? this.config.maxDepth;

    if (depth >= maxDepth) {
      throw new Error(`Maximum delegation depth (${maxDepth}) reached`);
    }

    if (this.activeDelegations.size >= this.config.maxConcurrent) {
      throw new Error(`Maximum concurrent delegations (${this.config.maxConcurrent}) reached`);
    }

    // Resolve profile
    let profile = await this.storage.getProfile(params.profile);
    if (!profile) {
      profile = await this.storage.getProfileByName(params.profile);
    }
    if (!profile) {
      throw new Error(`Agent profile not found: ${params.profile}`);
    }

    // Compute token budget
    const tokenBudget = Math.min(
      params.maxTokenBudget ?? this.config.tokenBudget.default,
      profile.maxTokenBudget,
      this.config.tokenBudget.max,
      parentContext?.remainingBudget ?? this.config.tokenBudget.max,
    );

    const timeoutMs = params.timeout ?? this.config.defaultTimeout;
    const delegationId = uuidv7();

    // Create delegation record
    await this.storage.createDelegation({
      id: delegationId,
      parentDelegationId: parentContext?.delegationId,
      profileId: profile.id,
      task: params.task,
      context: params.context,
      status: 'pending',
      depth,
      maxDepth,
      tokenBudget,
      timeoutMs,
      initiatedBy: parentContext?.delegationId ? 'sub-agent' : 'user',
      correlationId: parentContext?.delegationId,
    });

    // Create abort controller and start execution
    const abortController = new AbortController();
    const promise = this.executeDelegation(
      delegationId,
      profile,
      params,
      depth,
      maxDepth,
      tokenBudget,
      timeoutMs,
      abortController.signal,
      parentContext?.delegationId,
    );

    this.activeDelegations.set(delegationId, {
      abortController,
      promise,
      startedAt: Date.now(),
      profileName: profile.name,
      task: params.task,
      depth,
      tokenBudget,
      tokensUsed: 0,
    });

    try {
      const result = await promise;
      return result;
    } finally {
      this.activeDelegations.delete(delegationId);
    }
  }

  async listActive(): Promise<SubAgentInfo[]> {
    const infos: SubAgentInfo[] = [];
    for (const [delegationId, active] of this.activeDelegations) {
      infos.push({
        delegationId,
        profileId: '',
        profileName: active.profileName,
        task: active.task,
        status: 'running',
        depth: active.depth,
        tokensUsed: active.tokensUsed,
        tokenBudget: active.tokenBudget,
        startedAt: active.startedAt,
        elapsedMs: Date.now() - active.startedAt,
      });
    }
    return infos;
  }

  async cancel(delegationId: string): Promise<void> {
    const active = this.activeDelegations.get(delegationId);
    if (active) {
      active.abortController.abort();
      await this.storage.updateDelegation(delegationId, {
        status: 'cancelled',
        completedAt: Date.now(),
      });
    }
  }

  async getResult(delegationId: string): Promise<DelegationResult | null> {
    const record = await this.storage.getDelegation(delegationId);
    if (!record) return null;
    return this.buildResultFromRecord(record);
  }

  // ── Profile CRUD passthrough ────────────────────────────────────

  async getProfile(id: string): Promise<AgentProfile | null> {
    return this.storage.getProfile(id);
  }

  async listProfiles(): Promise<AgentProfile[]> {
    return this.storage.listProfiles();
  }

  async createProfile(data: AgentProfileCreate): Promise<AgentProfile> {
    return this.storage.createProfile(data);
  }

  async updateProfile(id: string, data: AgentProfileUpdate): Promise<AgentProfile | null> {
    return this.storage.updateProfile(id, data);
  }

  async deleteProfile(id: string): Promise<boolean> {
    return this.storage.deleteProfile(id);
  }

  // ── Delegation queries ──────────────────────────────────────────

  async getDelegation(id: string): Promise<DelegationRecord | null> {
    return this.storage.getDelegation(id);
  }

  async listDelegations(filter?: {
    status?: string;
    profileId?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.storage.listDelegations(filter as Parameters<SubAgentStorage['listDelegations']>[0]);
  }

  async getActiveDelegations() {
    return this.storage.getActiveDelegations();
  }

  async getDelegationTree(rootId: string) {
    return this.storage.getDelegationTree(rootId);
  }

  async getDelegationMessages(delegationId: string) {
    return this.storage.getDelegationMessages(delegationId);
  }

  getConfig(): DelegationConfig {
    return this.config;
  }

  /** Whether sub-agents are allowed by top-level security policy */
  isAllowedBySecurityPolicy(): boolean {
    return this.deps.securityConfig?.allowSubAgents !== false;
  }

  // ── Execution engine ────────────────────────────────────────────

  private async executeDelegation(
    delegationId: string,
    profile: AgentProfile,
    params: DelegationParams,
    depth: number,
    maxDepth: number,
    tokenBudget: number,
    timeoutMs: number,
    signal: AbortSignal,
    parentDelegationId?: string,
  ): Promise<DelegationResult> {
    const startTime = Date.now();
    let tokensUsedPrompt = 0;
    let tokensUsedCompletion = 0;

    // Update status to running
    await this.storage.updateDelegation(delegationId, {
      status: 'running',
      startedAt: startTime,
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      const active = this.activeDelegations.get(delegationId);
      if (active) {
        active.abortController.abort();
      }
    }, timeoutMs);

    try {
      // Create fresh AIClient with profile's model override
      const aiConfig: AIClientConfig = {
        ...this.deps.aiClientConfig,
        model: {
          ...this.deps.aiClientConfig.model,
          ...(profile.defaultModel ? { model: profile.defaultModel } : {}),
        },
      };
      const aiClient = new AIClient(aiConfig, this.deps.aiClientDeps);

      // Build tools: delegation tools (depth-filtered) + MCP tools
      const delegationTools = getDelegationTools(depth, maxDepth);
      const tools: Tool[] = [...delegationTools];

      // Compose messages
      const messages: AIMessage[] = [
        { role: 'system', content: profile.systemPrompt },
        {
          role: 'user',
          content: params.context
            ? `Context:\n${params.context}\n\nTask:\n${params.task}`
            : params.task,
        },
      ];

      const subDelegations: DelegationResult[] = [];

      // Agentic loop
      while (tokensUsedPrompt + tokensUsedCompletion < tokenBudget) {
        if (signal.aborted) {
          throw new DelegationAbortedError('Delegation was cancelled or timed out');
        }

        const response = await aiClient.chat({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          stream: false,
        });

        // Track token usage
        tokensUsedPrompt += response.usage.inputTokens;
        tokensUsedCompletion += response.usage.outputTokens;

        // Update active tracking
        const active = this.activeDelegations.get(delegationId);
        if (active) {
          active.tokensUsed = tokensUsedPrompt + tokensUsedCompletion;
        }

        if (response.stopReason === 'end_turn' || !response.toolCalls?.length) {
          // Done — extract result
          const result = response.content;

          // Seal conversation
          if (this.config.context.sealOnComplete) {
            for (const msg of messages) {
              await this.storage.storeDelegationMessage({
                delegationId,
                role: msg.role,
                content: msg.content,
                toolCalls: msg.toolCalls,
                toolResult: msg.toolResult,
              });
            }
            // Store final assistant message
            await this.storage.storeDelegationMessage({
              delegationId,
              role: 'assistant',
              content: result,
              tokenCount: response.usage.outputTokens,
            });
          }

          await this.storage.updateDelegation(delegationId, {
            status: 'completed',
            result,
            tokensUsedPrompt,
            tokensUsedCompletion,
            completedAt: Date.now(),
          });

          await this.auditRecord('delegation_completed', {
            delegationId,
            profile: profile.name,
            depth,
            tokensUsed: tokensUsedPrompt + tokensUsedCompletion,
            durationMs: Date.now() - startTime,
          });

          return {
            delegationId,
            profile: profile.name,
            status: 'completed',
            result,
            error: null,
            tokenUsage: {
              prompt: tokensUsedPrompt,
              completion: tokensUsedCompletion,
              total: tokensUsedPrompt + tokensUsedCompletion,
            },
            durationMs: Date.now() - startTime,
            subDelegations,
          };
        }

        // Process tool calls
        if (response.toolCalls?.length) {
          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: response.content || '',
            toolCalls: response.toolCalls,
          });

          for (const toolCall of response.toolCalls) {
            let toolContent: string;
            let isError = false;

            try {
              if (toolCall.name === 'delegate_task') {
                const subResult = await this.delegate(
                  {
                    profile: toolCall.arguments.profile as string,
                    task: toolCall.arguments.task as string,
                    context: toolCall.arguments.context as string | undefined,
                    maxTokenBudget: toolCall.arguments.maxTokenBudget as number | undefined,
                  },
                  {
                    delegationId,
                    depth: depth + 1,
                    remainingBudget: tokenBudget - (tokensUsedPrompt + tokensUsedCompletion),
                  },
                );
                subDelegations.push(subResult);
                toolContent = JSON.stringify({
                  status: subResult.status,
                  result: subResult.result,
                  tokenUsage: subResult.tokenUsage,
                  durationMs: subResult.durationMs,
                });
              } else if (toolCall.name === 'list_sub_agents') {
                const active = await this.listActive();
                toolContent = JSON.stringify(active);
              } else if (toolCall.name === 'get_delegation_result') {
                const result = await this.getResult(toolCall.arguments.delegationId as string);
                toolContent = result
                  ? JSON.stringify(result)
                  : JSON.stringify({ error: 'Delegation not found' });
              } else {
                // Unknown tool — return error
                toolContent = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
                isError = true;
              }
            } catch (err) {
              toolContent = JSON.stringify({
                error: err instanceof Error ? err.message : 'Tool execution failed',
              });
              isError = true;
            }

            messages.push({
              role: 'tool',
              content: toolContent,
              toolResult: {
                toolCallId: toolCall.id,
                content: toolContent,
                isError,
              },
            });
          }
        }
      }

      // Budget exhausted
      await this.storage.updateDelegation(delegationId, {
        status: 'failed',
        error: 'Token budget exhausted',
        tokensUsedPrompt,
        tokensUsedCompletion,
        completedAt: Date.now(),
      });

      return {
        delegationId,
        profile: profile.name,
        status: 'failed',
        result: null,
        error: 'Token budget exhausted',
        tokenUsage: {
          prompt: tokensUsedPrompt,
          completion: tokensUsedCompletion,
          total: tokensUsedPrompt + tokensUsedCompletion,
        },
        durationMs: Date.now() - startTime,
        subDelegations,
      };
    } catch (err) {
      const isAbort = err instanceof DelegationAbortedError || signal.aborted;
      const status = isAbort ? (signal.aborted ? 'timeout' : 'cancelled') : 'failed';
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      await this.storage.updateDelegation(delegationId, {
        status: status as 'timeout' | 'cancelled' | 'failed',
        error: errorMsg,
        tokensUsedPrompt,
        tokensUsedCompletion,
        completedAt: Date.now(),
      });

      await this.auditRecord('delegation_failed', {
        delegationId,
        profile: profile.name,
        depth,
        status,
        error: errorMsg,
      });

      return {
        delegationId,
        profile: profile.name,
        status: status as 'timeout' | 'cancelled' | 'failed',
        result: null,
        error: errorMsg,
        tokenUsage: {
          prompt: tokensUsedPrompt,
          completion: tokensUsedCompletion,
          total: tokensUsedPrompt + tokensUsedCompletion,
        },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async buildResultFromRecord(record: DelegationRecord): Promise<DelegationResult> {
    const children = await this.storage.getDelegationTree(record.id);
    const childResults: DelegationResult[] = [];
    for (const child of children) {
      if (child.id !== record.id && child.parentDelegationId === record.id) {
        childResults.push(await this.buildResultFromRecord(child));
      }
    }

    const profile = await this.storage.getProfile(record.profileId);
    return {
      delegationId: record.id,
      profile: profile?.name ?? record.profileId,
      status: record.status,
      result: record.result,
      error: record.error,
      tokenUsage: {
        prompt: record.tokensUsedPrompt,
        completion: record.tokensUsedCompletion,
        total: record.tokensUsedPrompt + record.tokensUsedCompletion,
      },
      durationMs: record.completedAt && record.startedAt
        ? record.completedAt - record.startedAt
        : 0,
      subDelegations: childResults,
    };
  }

  private async auditRecord(event: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.auditChain.record({
        event,
        level: 'info',
        message: `Sub-agent delegation: ${event}`,
        metadata,
      });
    } catch {
      this.deps.logger.warn('Failed to record delegation audit event', { event });
    }
  }
}

class DelegationAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelegationAbortedError';
  }
}
