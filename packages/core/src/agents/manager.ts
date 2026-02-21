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
import type { ExtensionManager } from '../extensions/manager.js';
import { uuidv7 } from '../utils/crypto.js';
import { spawn } from 'node:child_process';
import { SubAgentStorage, type DelegationRecord } from './storage.js';
import { getDelegationTools } from './tools.js';
import { ModelRouter } from '../ai/model-router.js';
import type { CostCalculator } from '../ai/cost-calculator.js';
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
} from '@secureyeoman/shared';

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
  /** Optional extension manager for lifecycle hook emissions */
  extensionManager?: ExtensionManager;
  /** Cost calculator injected for intelligent model routing. */
  costCalculator?: CostCalculator;
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
  private readonly modelRouter: ModelRouter | null;

  constructor(config: DelegationConfig, deps: SubAgentManagerDeps) {
    this.config = config;
    this.deps = deps;
    this.storage = deps.storage;
    this.modelRouter = deps.costCalculator ? new ModelRouter(deps.costCalculator) : null;
  }

  async initialize(): Promise<void> {
    await this.storage.seedBuiltinProfiles();
    this.deps.logger.debug('SubAgentManager initialized with built-in profiles');
  }

  // ── Delegation ──────────────────────────────────────────────────

  async delegate(
    params: DelegationParams,
    parentContext?: { delegationId?: string; depth?: number; remainingBudget?: number }
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
      parentContext?.remainingBudget ?? this.config.tokenBudget.max
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
      parentContext?.delegationId
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

  async listProfiles(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ profiles: AgentProfile[]; total: number }> {
    return this.storage.listProfiles(opts);
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
    return this.storage.listDelegations(
      filter as Parameters<SubAgentStorage['listDelegations']>[0]
    );
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
    parentDelegationId?: string
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
      // Type dispatch: binary and mcp-bridge are zero-cost; llm is the default agentic loop
      const profileType = (profile as any).type ?? 'llm';
      if (profileType === 'binary') {
        return await this.executeBinaryDelegation(
          delegationId,
          profile,
          params,
          startTime,
          timeoutMs,
          signal
        );
      }
      if (profileType === 'mcp-bridge') {
        return await this.executeMcpBridgeDelegation(
          delegationId,
          profile,
          params,
          startTime,
          timeoutMs,
          signal
        );
      }

      // Resolve model: explicit override > intelligent router > profile default > system default
      let resolvedModel: string | undefined;

      if (params.modelOverride) {
        // Swarm scheduler or caller already selected a model
        resolvedModel = params.modelOverride;
      } else if (this.modelRouter) {
        const routingDecision = this.modelRouter.route(params.task, {
          defaultModel: profile.defaultModel ?? undefined,
          tokenBudget,
          context: params.context,
        });

        if (routingDecision.selectedModel && routingDecision.confidence >= 0.5) {
          resolvedModel = routingDecision.selectedModel;
          this.deps.logger.debug('ModelRouter selected model for delegation', {
            delegationId,
            selectedModel: routingDecision.selectedModel,
            tier: routingDecision.tier,
            confidence: routingDecision.confidence,
            taskType: routingDecision.taskProfile.taskType,
            complexity: routingDecision.taskProfile.complexity,
          });
        } else {
          resolvedModel = profile.defaultModel ?? undefined;
        }
      } else {
        resolvedModel = profile.defaultModel ?? undefined;
      }

      // Create fresh AIClient with resolved model
      const aiConfig: AIClientConfig = {
        ...this.deps.aiClientConfig,
        model: {
          ...this.deps.aiClientConfig.model,
          ...(resolvedModel ? { model: resolvedModel } : {}),
        },
      };
      const aiClient = new AIClient(aiConfig, this.deps.aiClientDeps);

      // Build tools: delegation tools (depth-filtered) + MCP tools
      const delegationTools = getDelegationTools(depth, maxDepth);
      // Fix: wire MCP tools to the LLM sub-agent (ADR 069)
      const mcpTools: Tool[] = this.deps.mcpClient
        ? this.deps.mcpClient
            .getAllTools()
            .filter(
              (t) => profile.allowedTools.length === 0 || profile.allowedTools.includes(t.name)
            )
            .map((t) => ({
              name: t.name,
              description: t.description || undefined,
              parameters: t.inputSchema as Tool['parameters'],
            }))
        : [];
      const tools: Tool[] = [...delegationTools, ...mcpTools];

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
                  }
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
              } else if (this.deps.mcpClient) {
                // Attempt to dispatch to MCP tool
                try {
                  const mcpToolDef = this.deps.mcpClient
                    .getAllTools()
                    .find((t) => t.name === toolCall.name);
                  const mcpResult = await this.deps.mcpClient.callTool(
                    mcpToolDef?.serverId ?? '',
                    toolCall.name,
                    toolCall.arguments ?? {}
                  );
                  toolContent =
                    typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult);
                } catch (mcpErr) {
                  toolContent = JSON.stringify({
                    error: `MCP tool error: ${mcpErr instanceof Error ? mcpErr.message : String(mcpErr)}`,
                  });
                  isError = true;
                }
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
        status: status,
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
        status: status,
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

  /**
   * Execute a 'binary' profile: spawn the configured executable, write a JSON
   * payload to stdin, parse stdout as { result: string, cost?: number }.
   * Zero LLM token cost.
   */
  private async executeBinaryDelegation(
    delegationId: string,
    profile: AgentProfile,
    params: DelegationParams,
    startTime: number,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<DelegationResult> {
    if (!this.deps.securityConfig?.allowBinaryAgents) {
      const err = 'Binary sub-agents are disabled by security policy (allowBinaryAgents: false)';
      await this.storage.updateDelegation(delegationId, {
        status: 'failed',
        error: err,
        completedAt: Date.now(),
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
      });
      return {
        delegationId,
        profile: profile.name,
        status: 'failed',
        result: null,
        error: err,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    }

    const p = profile as any;
    const command: string = p.command;
    const commandArgs: string[] = p.commandArgs ?? [];
    const commandEnv: Record<string, string> = { ...(process.env as any), ...(p.commandEnv ?? {}) };

    const payload = JSON.stringify({
      delegationId,
      task: params.task,
      context: params.context,
      tokenBudget: params.maxTokenBudget,
    });

    await this.deps.extensionManager?.emit('agent:binary-before-execute', {
      event: 'agent:binary-before-execute',
      data: { delegationId, profileName: profile.name, command, commandArgs, task: params.task },
      timestamp: Date.now(),
    });

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn(command, commandArgs, {
          env: commandEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const killChild = (reason: string) => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          // Force-kill after 5 s grace if the process ignores SIGTERM
          const forceKill = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              /* already exited */
            }
          }, 5000);
          if (forceKill.unref) forceKill.unref();
          reject(new Error(reason));
        };

        // Timeout kill
        const timeoutHandle = setTimeout(() => {
          killChild(`Binary agent timed out after ${timeoutMs}ms`);
        }, timeoutMs);

        // Abort-signal kill
        if (signal.aborted) {
          clearTimeout(timeoutHandle);
          killChild('Delegation aborted before binary execution');
        } else {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutHandle);
              killChild('Delegation aborted');
            },
            { once: true }
          );
        }

        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timeoutHandle);
          settled = true;
          reject(err);
        });

        child.on('close', (code) => {
          clearTimeout(timeoutHandle);
          if (settled) return;
          settled = true;
          if (code !== 0) {
            reject(new Error(`Binary exited with code ${code}: ${stderr}`));
            return;
          }
          try {
            const parsed = JSON.parse(stdout.trim());
            resolve(typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed));
          } catch {
            resolve(stdout.trim());
          }
        });

        child.stdin.write(payload + '\n');
        child.stdin.end();
      });

      await this.deps.extensionManager?.emit('agent:binary-after-execute', {
        event: 'agent:binary-after-execute',
        data: {
          delegationId,
          profileName: profile.name,
          result,
          status: 'completed',
          durationMs: Date.now() - startTime,
        },
        timestamp: Date.now(),
      });

      await this.storage.updateDelegation(delegationId, {
        status: 'completed',
        result,
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
        completedAt: Date.now(),
      });

      return {
        delegationId,
        profile: profile.name,
        status: 'completed',
        result,
        error: null,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Binary execution failed';
      await this.deps.extensionManager?.emit('agent:binary-after-execute', {
        event: 'agent:binary-after-execute',
        data: {
          delegationId,
          profileName: profile.name,
          result: null,
          status: 'failed',
          durationMs: Date.now() - startTime,
          error: errorMsg,
        },
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  /**
   * Execute an 'mcp-bridge' profile: call a named MCP tool with a Mustache-style
   * template interpolated input. Zero LLM token cost.
   */
  private async executeMcpBridgeDelegation(
    delegationId: string,
    profile: AgentProfile,
    params: DelegationParams,
    startTime: number,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<DelegationResult> {
    if (!this.deps.mcpClient) {
      const err = 'MCP client not available — cannot execute mcp-bridge delegation';
      await this.storage.updateDelegation(delegationId, {
        status: 'failed',
        error: err,
        completedAt: Date.now(),
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
      });
      return {
        delegationId,
        profile: profile.name,
        status: 'failed',
        result: null,
        error: err,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    }

    const p = profile as any;
    const mcpTool: string = p.mcpTool;
    const templateStr: string = p.mcpToolInput ?? '{"task":"{{task}}","context":"{{context}}"}';

    // Simple Mustache-style template interpolation
    const interpolated = templateStr
      .replace(/\{\{task\}\}/g, params.task.replace(/"/g, '\\"'))
      .replace(/\{\{context\}\}/g, (params.context ?? '').replace(/"/g, '\\"'));

    let toolInput: Record<string, unknown>;
    try {
      toolInput = JSON.parse(interpolated);
    } catch (parseErr) {
      const err =
        `mcp-bridge profile "${profile.name}" mcpToolInput produced invalid JSON after interpolation. ` +
        `Check the template for unescaped characters. ` +
        `Template: ${templateStr}`;
      this.deps.logger.warn('MCP bridge template interpolation failed', {
        mcpTool,
        template: templateStr,
        interpolated,
        error: String(parseErr),
      });
      await this.storage.updateDelegation(delegationId, {
        status: 'failed',
        error: err,
        completedAt: Date.now(),
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
      });
      return {
        delegationId,
        profile: profile.name,
        status: 'failed',
        result: null,
        error: err,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    }

    const mcpBridgeToolDef = this.deps.mcpClient.getAllTools().find((t) => t.name === mcpTool);
    if (!mcpBridgeToolDef) {
      const err =
        `MCP tool "${mcpTool}" not found in any connected server — ` +
        `ensure the MCP server is running and the tool name is correct`;
      await this.storage.updateDelegation(delegationId, {
        status: 'failed',
        error: err,
        completedAt: Date.now(),
        tokensUsedPrompt: 0,
        tokensUsedCompletion: 0,
      });
      return {
        delegationId,
        profile: profile.name,
        status: 'failed',
        result: null,
        error: err,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        durationMs: Date.now() - startTime,
        subDelegations: [],
      };
    }

    await this.deps.extensionManager?.emit('agent:mcp-bridge-before-execute', {
      event: 'agent:mcp-bridge-before-execute',
      data: { delegationId, profileName: profile.name, mcpTool, toolInput, task: params.task },
      timestamp: Date.now(),
    });

    const mcpResultRaw = await Promise.race([
      this.deps.mcpClient.callTool(mcpBridgeToolDef.serverId, mcpTool, toolInput),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error('MCP bridge timeout'));
        }, timeoutMs)
      ),
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('Delegation aborted'));
        signal.addEventListener('abort', () => {
          reject(new Error('Delegation aborted'));
        });
      }),
    ]);

    const result = typeof mcpResultRaw === 'string' ? mcpResultRaw : JSON.stringify(mcpResultRaw);

    await this.deps.extensionManager?.emit('agent:mcp-bridge-after-execute', {
      event: 'agent:mcp-bridge-after-execute',
      data: {
        delegationId,
        profileName: profile.name,
        mcpTool,
        result,
        status: 'completed',
        durationMs: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });

    await this.storage.updateDelegation(delegationId, {
      status: 'completed',
      result,
      tokensUsedPrompt: 0,
      tokensUsedCompletion: 0,
      completedAt: Date.now(),
    });

    return {
      delegationId,
      profile: profile.name,
      status: 'completed',
      result,
      error: null,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      durationMs: Date.now() - startTime,
      subDelegations: [],
    };
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
      durationMs:
        record.completedAt && record.startedAt ? record.completedAt - record.startedAt : 0,
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
