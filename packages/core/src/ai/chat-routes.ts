/**
 * Chat Routes — Conversation with any personality via the dashboard.
 *
 * Accepts an optional `personalityId` to target a specific personality;
 * falls back to the active personality when omitted.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import type {
  AIRequest,
  Tool,
  FallbackModelConfig,
  AIProviderName,
  ChatStreamEvent,
} from '@secureyeoman/shared';
import type { McpToolDef } from '@secureyeoman/shared';
import { PreferenceLearner, type FeedbackType } from '../brain/preference-learner.js';
import { sendError } from '../utils/errors.js';
import { ToolOutputScanner } from '../security/tool-output-scanner.js';
import { ContextCompactor } from './context-compactor.js';
import { getLogger } from '../logging/logger.js';
import { executeCreationTool } from '../soul/creation-tool-executor.js';

// Map provider name → standard API key env var (no-key providers get empty string)
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  grok: 'XAI_API_KEY',
};

function resolvePersonalityFallbacks(
  fallbacks: { provider: string; model: string }[]
): FallbackModelConfig[] {
  return fallbacks.map((f) => ({
    provider: f.provider as AIProviderName,
    model: f.model,
    apiKeyEnv: PROVIDER_KEY_ENV[f.provider] ?? '',
  }));
}

export interface ChatRoutesOptions {
  secureYeoman: SecureYeoman;
}

interface ChatRequestBody {
  message: string;
  history?: { role: string; content: string }[];
  personalityId?: string;
  saveAsMemory?: boolean;
  memoryEnabled?: boolean;
  conversationId?: string;
  clientContext?: { viewportHint?: 'mobile' | 'tablet' | 'desktop' };
}

interface RememberRequestBody {
  content: string;
  context?: Record<string, string>;
}

interface FeedbackRequestBody {
  conversationId: string;
  messageId: string;
  feedback: FeedbackType;
  details?: string;
}

interface BrainContextMeta {
  memoriesUsed: number;
  knowledgeUsed: number;
  contextSnippets: string[];
}

export function registerChatRoutes(app: FastifyInstance, opts: ChatRoutesOptions): void {
  const { secureYeoman } = opts;

  // Scanner is instantiated once per route registration; logger is best-effort.
  let scanner: ToolOutputScanner;
  try {
    scanner = new ToolOutputScanner({ logger: getLogger().child({ component: 'chat-routes' }) });
  } catch {
    scanner = new ToolOutputScanner();
  }

  // Context compactor — triggers at 80% of the model's context window.
  const compactor = new ContextCompactor();

  app.post(
    '/api/v1/chat',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      const {
        message,
        history,
        personalityId,
        saveAsMemory,
        memoryEnabled = true,
        conversationId,
        clientContext,
      } = request.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return sendError(reply, 400, 'Message is required');
      }

      // Input validation — check message and history for injection patterns
      const validator = secureYeoman.getValidator();
      const msgValidation = validator.validate(message, { source: 'chat' });
      if (msgValidation.blocked) {
        void secureYeoman.getAuditChain().record({
          event: 'injection_attempt',
          level: 'warn',
          message: 'Chat message blocked by input validator',
          userId: (request as FastifyRequest & { user?: { id?: string } }).user?.id,
          metadata: { endpoint: '/api/v1/chat', reason: msgValidation.blockReason },
        });
        return sendError(reply, 400, 'Message blocked: invalid content');
      }
      if (history && Array.isArray(history)) {
        for (const entry of history) {
          if (typeof entry.content === 'string') {
            const hv = validator.validate(entry.content, { source: 'chat_history' });
            if (hv.blocked) {
              void secureYeoman.getAuditChain().record({
                event: 'injection_attempt',
                level: 'warn',
                message: 'Chat history entry blocked by input validator',
                userId: (request as FastifyRequest & { user?: { id?: string } }).user?.id,
                metadata: { endpoint: '/api/v1/chat', reason: hv.blockReason },
              });
              return sendError(reply, 400, 'Message blocked: invalid content in history');
            }
          }
        }
      }

      // Validate viewportHint if present
      const VALID_VIEWPORTS = ['mobile', 'tablet', 'desktop'] as const;
      const viewportHint =
        clientContext?.viewportHint &&
        (VALID_VIEWPORTS as readonly string[]).includes(clientContext.viewportHint)
          ? (clientContext.viewportHint as 'mobile' | 'tablet' | 'desktop')
          : undefined;

      let aiClient;
      try {
        aiClient = secureYeoman.getAIClient();
      } catch {
        return sendError(
          reply,
          503,
          'AI client is not available. Check provider configuration and API keys.'
        );
      }

      // Gather Brain context metadata (best-effort — Brain may not be available)
      let brainContext: BrainContextMeta = {
        memoriesUsed: 0,
        knowledgeUsed: 0,
        contextSnippets: [],
      };
      if (memoryEnabled) {
        try {
          const brainManager = secureYeoman.getBrainManager();
          const memories = await brainManager.recall({ search: message, limit: 5 });
          const knowledge = await brainManager.queryKnowledge({ search: message, limit: 5 });
          const snippets: string[] = [];
          for (const m of memories) snippets.push(`[${m.type}] ${m.content}`);
          for (const k of knowledge) snippets.push(`[${k.topic}] ${k.content}`);
          brainContext = {
            memoriesUsed: memories.length,
            knowledgeUsed: knowledge.length,
            contextSnippets: snippets,
          };
        } catch {
          // Brain not available — brainContext stays empty
        }
      }

      const soulManager = secureYeoman.getSoulManager();
      let systemPrompt = memoryEnabled
        ? await soulManager.composeSoulPrompt(message, personalityId, { viewportHint })
        : await soulManager.composeSoulPrompt(undefined, personalityId, { viewportHint });

      // Inject learned preferences into system prompt
      if (memoryEnabled && systemPrompt) {
        try {
          const brainManager = secureYeoman.getBrainManager();
          const learner = new PreferenceLearner(brainManager);
          systemPrompt = await learner.injectPreferences(systemPrompt);
        } catch {
          // Preference injection is best-effort
        }
      }

      const messages: AIRequest['messages'] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // Append conversation history
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          const role = msg.role === 'assistant' ? 'assistant' : 'user';
          if (msg.content && typeof msg.content === 'string') {
            messages.push({ role, content: msg.content });
          }
        }
      }

      // Append the new user message
      messages.push({ role: 'user', content: message.trim() });

      // Collect tools from personality MCP config + skill tools
      const tools: Tool[] = [];

      // Resolve personality first so tool gathering is scoped correctly
      const personality = personalityId
        ? ((await soulManager.getPersonality(personalityId)) ??
          (await soulManager.getActivePersonality()))
        : await soulManager.getActivePersonality();

      // Rate limiting — global chat_requests rule + optional per-personality override
      {
        const rateLimiter = secureYeoman.getRateLimiter();
        const userId = request.authUser?.userId ?? request.ip ?? 'anonymous';
        const rlCtx = { userId: request.authUser?.userId, ipAddress: request.ip };

        const rateLimitConfig = personality?.body?.resourcePolicy?.rateLimitConfig;
        const rlEnabled = rateLimitConfig?.enabled ?? true;

        if (rlEnabled) {
          // Check global rule first
          const globalResult = await Promise.resolve(
            rateLimiter.check('chat_requests', userId, rlCtx)
          );
          if (!globalResult.allowed) {
            void secureYeoman.getAuditChain().record({
              event: 'rate_limit',
              level: 'warn',
              message: 'Chat rate limit exceeded (global)',
              userId: request.authUser?.userId,
              metadata: { rule: 'chat_requests', endpoint: '/api/v1/chat' },
            });
            return reply.code(429).send({
              error: 'Too many requests. Please slow down.',
              retryAfter: globalResult.retryAfter,
            });
          }

          // Per-personality override
          if (rateLimitConfig?.chatRequestsPerMinute !== undefined) {
            const ruleName = `chat_personality_${personality!.id}`;
            rateLimiter.addRule({
              name: ruleName,
              windowMs: 60000,
              maxRequests: rateLimitConfig.chatRequestsPerMinute,
              keyType: 'user',
              onExceed: 'reject',
            });
            const perResult = await Promise.resolve(
              rateLimiter.check(ruleName, userId, rlCtx)
            );
            if (!perResult.allowed) {
              void secureYeoman.getAuditChain().record({
                event: 'rate_limit',
                level: 'warn',
                message: 'Chat rate limit exceeded (per-personality)',
                userId: request.authUser?.userId,
                metadata: { rule: ruleName, endpoint: '/api/v1/chat', personalityId: personality!.id },
              });
              return reply.code(429).send({
                error: 'Too many requests for this personality.',
                retryAfter: perResult.retryAfter,
              });
            }
          }
        }
      }

      // Skill-based tools — scoped to this personality + global skills
      tools.push(...(await soulManager.getActiveTools(personality?.id ?? null)));

      const mcpClient = secureYeoman.getMcpClientManager();
      const mcpStorage = secureYeoman.getMcpStorage();

      if (personality?.body?.enabled && mcpClient && mcpStorage) {
        const selectedServers = personality.body.selectedServers ?? [];
        const perPersonalityFeatures = personality.body.mcpFeatures ?? {
          exposeGit: false,
          exposeFilesystem: false,
          exposeWeb: false,
          exposeWebScraping: false,
          exposeWebSearch: false,
          exposeBrowser: false,
        };
        const globalConfig = await mcpStorage.getConfig();

        if (selectedServers.length > 0) {
          const allMcpTools: McpToolDef[] = mcpClient.getAllTools();

          for (const tool of allMcpTools) {
            // Only include tools from servers the personality has selected
            if (!selectedServers.includes(tool.serverName)) continue;

            // For YEOMAN MCP tools, apply per-personality AND global feature gates
            if (tool.serverName === 'YEOMAN MCP') {
              const isGitTool = tool.name.startsWith('git_') || tool.name.includes('git');
              const isFsTool =
                tool.name.startsWith('fs_') ||
                tool.name.includes('filesystem') ||
                tool.name.includes('file_');

              if (isGitTool && !(globalConfig.exposeGit && perPersonalityFeatures.exposeGit))
                continue;
              if (
                isFsTool &&
                !(globalConfig.exposeFilesystem && perPersonalityFeatures.exposeFilesystem)
              )
                continue;
            }

            tools.push({
              name: tool.name,
              description: tool.description || undefined,
              parameters: tool.inputSchema as Tool['parameters'],
            });
          }
        }
      }

      // Proactive context compaction — summarise older turns before the API
      // call when token usage approaches the model's context-window limit.
      // This prevents "context length exceeded" failures and avoids wasting a
      // full API round-trip on a doomed request.
      const currentModel = personality?.defaultModel?.model ?? 'unknown';
      if (compactor.needsCompaction(messages, currentModel)) {
        try {
          const compactionResult = await compactor.compact(
            messages,
            currentModel,
            async (prompt) => {
              const summaryReq: AIRequest = {
                messages: [{ role: 'user', content: prompt }],
                stream: false,
              };
              const summaryResp = await aiClient.chat(summaryReq, { source: 'context_compaction' });
              return summaryResp.content;
            }
          );
          if (compactionResult.compacted) {
            messages.length = 0;
            messages.push(...compactionResult.messages);
          }
        } catch (compactErr) {
          // Compaction is best-effort — proceed with original messages on failure
          const logger = getLogger().child({ component: 'chat-routes' });
          logger.warn('Context compaction failed, proceeding with uncompacted context', {
            error: String(compactErr),
          });
        }
      }

      // Read thinking config from personality body
      const thinkingBudgetTokens =
        personality?.body?.thinkingConfig?.enabled
          ? (personality.body.thinkingConfig.budgetTokens ?? 10000)
          : undefined;

      const aiRequest: AIRequest = {
        messages,
        stream: false,
        ...(tools.length > 0 ? { tools } : {}),
        ...(thinkingBudgetTokens ? { thinkingBudgetTokens } : {}),
      };

      try {
        const personalityFallbacks = personality?.modelFallbacks?.length
          ? resolvePersonalityFallbacks(personality.modelFallbacks)
          : undefined;

        // Agentic tool-execution loop.
        // When the model returns stopReason 'tool_use' we execute each tool,
        // append the results as tool-role messages, and call the model again.
        // This repeats until the model produces a final text response or we
        // hit the iteration cap (prevents infinite loops on misbehaving models).
        const MAX_TOOL_ITERATIONS = 10;
        let iterationCount = 0;

        // Accumulate thinking content across all iterations
        const thinkingParts: string[] = [];

        // Collect resource-action events to surface in the chat UI and task history.
        const creationEvents: Array<{ tool: string; label: string; action: string; name: string; id?: string }> =
          [];

        // Human-readable action verb derived from the tool name prefix.
        const toolAction = (toolName: string): string => {
          if (toolName.startsWith('create_')) return 'Created';
          if (toolName.startsWith('update_')) return 'Updated';
          if (toolName.startsWith('delete_')) return 'Deleted';
          if (toolName.startsWith('trigger_')) return 'Triggered';
          if (toolName.startsWith('assign_')) return 'Assigned';
          if (toolName.startsWith('revoke_')) return 'Revoked';
          if (toolName === 'a2a_connect') return 'Connected';
          if (toolName === 'delegate_task') return 'Delegated';
          return 'Created';
        };

        // Map tool names → human-readable resource labels.
        const CREATION_TOOL_LABELS: Record<string, string> = {
          create_skill: 'Skill',
          update_skill: 'Skill',
          delete_skill: 'Skill',
          create_task: 'Task',
          update_task: 'Task',
          create_personality: 'Personality',
          update_personality: 'Personality',
          delete_personality: 'Personality',
          create_experiment: 'Experiment',
          delete_experiment: 'Experiment',
          create_swarm: 'Swarm',
          create_custom_role: 'Custom Role',
          delete_custom_role: 'Custom Role',
          assign_role: 'Role Assignment',
          revoke_role: 'Role Assignment',
          a2a_connect: 'A2A Connection',
          delegate_task: 'Delegation',
          create_workflow: 'Workflow',
          update_workflow: 'Workflow',
          delete_workflow: 'Workflow',
          trigger_workflow: 'Workflow Run',
        };

        // Resolve once — used inside the tool loop to record every resource action.
        const { uuidv7, sha256 } = await import('../utils/crypto.js');
        const { TaskStatus } = await import('@secureyeoman/shared');
        const taskStorage = secureYeoman.getTaskStorage?.();

        let rawResponse = await aiClient.chat(
          aiRequest,
          { source: 'dashboard_chat' },
          personalityFallbacks
        );
        if (rawResponse.thinkingContent) thinkingParts.push(rawResponse.thinkingContent);

        while (
          rawResponse.stopReason === 'tool_use' &&
          rawResponse.toolCalls?.length &&
          iterationCount < MAX_TOOL_ITERATIONS
        ) {
          iterationCount++;

          // Append assistant's tool-call turn to the running message list,
          // including thinking blocks so they are round-tripped to the API
          messages.push({
            role: 'assistant' as const,
            content: rawResponse.content || undefined,
            toolCalls: rawResponse.toolCalls,
            thinkingBlocks: rawResponse.thinkingBlocks,
          });

          // Execute every tool call and collect results
          const executionContext = {
            personalityId: personality?.id ?? null,
            personalityName: personality?.name ?? null,
          };
          for (const toolCall of rawResponse.toolCalls) {
            // Check if this is an MCP tool and route appropriately
            const mcpTool = mcpClient?.getAllTools().find((t) => t.name === toolCall.name);
            let result: { output: unknown; isError: boolean };

            if (mcpTool) {
              try {
                const mcpResult = await mcpClient!.callTool(
                  mcpTool.serverId,
                  toolCall.name,
                  toolCall.arguments as Record<string, unknown>
                );
                result = { output: mcpResult, isError: false };
              } catch (err) {
                result = {
                  output: { error: err instanceof Error ? err.message : String(err) },
                  isError: true,
                };
              }
            } else {
              result = await executeCreationTool(toolCall, secureYeoman, executionContext);
            }

            // Record every recognised resource action: sparkle card + task history entry.
            const label = CREATION_TOOL_LABELS[toolCall.name];
            if (label && !result.isError) {
              const out = result.output as Record<string, unknown>;
              const item = (out.skill ?? out.task ?? out.personality ?? out.experiment ??
                out.swarm ?? out.workflow ?? out.run) as Record<string, unknown> | undefined;
              const name = String(
                item?.name ?? item?.workflowName ??
                (typeof out.name === 'string' ? out.name : undefined) ??
                (toolCall.arguments as Record<string, unknown>)?.name ??
                toolCall.name
              );
              const action = toolAction(toolCall.name);
              const id = typeof item?.id === 'string' ? item.id : undefined;

              // Sparkle card in the chat bubble
              creationEvents.push({ tool: toolCall.name, label, action, name, id });

              // Task history entry — status is taken from the result item when
              // present (e.g. PENDING for a newly created task) or defaults to
              // COMPLETED for every other resource action.
              if (taskStorage) {
                const status =
                  typeof item?.status === 'string' ? (item.status as any) : TaskStatus.COMPLETED;
                const now = Date.now();
                await taskStorage.storeTask({
                  id: uuidv7(),
                  type: 'execute' as any,
                  name: `${label} ${action}: ${name}`,
                  description: toolCall.name,
                  status,
                  createdAt: now,
                  ...(status === TaskStatus.COMPLETED ? { completedAt: now, durationMs: 0 } : {}),
                  inputHash: sha256(JSON.stringify(toolCall.arguments ?? {})),
                  securityContext: { userId: 'ai', role: 'operator', permissionsUsed: [] },
                  timeoutMs: 0,
                });
              }
            }

            messages.push({
              role: 'tool' as const,
              toolResult: {
                toolCallId: toolCall.id,
                content: JSON.stringify(result.output),
                isError: result.isError,
              },
            });
          }

          // Re-call the model with the updated conversation
          rawResponse = await aiClient.chat(
            { ...aiRequest, messages },
            { source: 'dashboard_chat' },
            personalityFallbacks
          );
          if (rawResponse.thinkingContent) thinkingParts.push(rawResponse.thinkingContent);
        }

        // Scan LLM response for credential leaks before returning to caller.
        const scanResult = scanner.scan(rawResponse.content, 'llm_response');
        const response = scanResult.redacted
          ? { ...rawResponse, content: scanResult.text }
          : rawResponse;

        // Persist messages to conversation storage when conversationId is provided
        if (conversationId) {
          try {
            const convStorage = secureYeoman.getConversationStorage();
            if (convStorage) {
              await convStorage.addMessage({
                conversationId,
                role: 'user',
                content: message.trim(),
              });
              await convStorage.addMessage({
                conversationId,
                role: 'assistant',
                content: response.content,
                model: response.model,
                provider: response.provider,
                tokensUsed: response.usage.totalTokens,
                brainContext,
                creationEvents: creationEvents.length > 0 ? creationEvents : null,
              });
            }
          } catch {
            // Conversation storage not available — skip persistence
          }
        }

        // Optionally store the exchange as an episodic memory
        if (memoryEnabled && saveAsMemory) {
          try {
            const brainManager = secureYeoman.getBrainManager();
            await brainManager.remember(
              'episodic',
              `User: ${message.trim()}\nAssistant: ${response.content}`,
              'dashboard_chat',
              { personalityId: personalityId ?? 'default' }
            );
          } catch {
            // Brain not available — skip memory storage
          }
        }

        const thinkingContent = thinkingParts.join('\n\n---\n\n') || undefined;

        return {
          role: 'assistant' as const,
          content: response.content,
          model: response.model,
          provider: response.provider,
          tokensUsed: response.usage.totalTokens,
          brainContext,
          conversationId: conversationId ?? undefined,
          creationEvents: creationEvents.length > 0 ? creationEvents : undefined,
          thinkingContent,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        return sendError(reply, 502, `AI request failed: ${errMsg}`);
      }
    }
  );

  // ── Remember endpoint — store a message as an episodic memory ──

  app.post(
    '/api/v1/chat/remember',
    async (request: FastifyRequest<{ Body: RememberRequestBody }>, reply: FastifyReply) => {
      const { content, context } = request.body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return sendError(reply, 400, 'Content is required');
      }

      try {
        const brainManager = secureYeoman.getBrainManager();
        const memory = await brainManager.remember(
          'episodic',
          content.trim(),
          'dashboard_chat',
          context
        );
        return { memory };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Brain is not available';
        return sendError(reply, 503, errMsg);
      }
    }
  );

  // ── Feedback endpoint — record user feedback for adaptive learning ──

  app.post(
    '/api/v1/chat/feedback',
    async (request: FastifyRequest<{ Body: FeedbackRequestBody }>, reply: FastifyReply) => {
      const { conversationId, messageId, feedback, details } = request.body;

      if (!conversationId || !messageId || !feedback) {
        return sendError(reply, 400, 'conversationId, messageId, and feedback are required');
      }

      const validFeedback: FeedbackType[] = ['positive', 'negative', 'correction'];
      if (!validFeedback.includes(feedback)) {
        return sendError(reply, 400, `feedback must be one of: ${validFeedback.join(', ')}`);
      }

      try {
        const brainManager = secureYeoman.getBrainManager();
        const learner = new PreferenceLearner(brainManager);
        await learner.recordFeedback(conversationId, messageId, feedback, details);
        return { stored: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Brain is not available';
        return sendError(reply, 503, errMsg);
      }
    }
  );

  // ── Streaming chat endpoint ────────────────────────────────────────────────

  app.post(
    '/api/v1/chat/stream',
    async (request: FastifyRequest<{ Body: ChatRequestBody }>, reply: FastifyReply) => {
      const {
        message,
        history,
        personalityId,
        saveAsMemory,
        memoryEnabled = true,
        conversationId,
        clientContext,
      } = request.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        reply.code(400).send({ error: 'Message is required' });
        return;
      }

      // Input validation — check message and history for injection patterns
      const validator = secureYeoman.getValidator();
      const msgValidation = validator.validate(message, { source: 'chat_stream' });
      if (msgValidation.blocked) {
        void secureYeoman.getAuditChain().record({
          event: 'injection_attempt',
          level: 'warn',
          message: 'Stream chat message blocked by input validator',
          userId: (request as FastifyRequest & { user?: { id?: string } }).user?.id,
          metadata: { endpoint: '/api/v1/chat/stream', reason: msgValidation.blockReason },
        });
        reply.code(400).send({ error: 'Message blocked: invalid content' });
        return;
      }
      if (history && Array.isArray(history)) {
        for (const entry of history) {
          if (typeof entry.content === 'string') {
            const hv = validator.validate(entry.content, { source: 'chat_stream_history' });
            if (hv.blocked) {
              void secureYeoman.getAuditChain().record({
                event: 'injection_attempt',
                level: 'warn',
                message: 'Stream chat history entry blocked by input validator',
                userId: (request as FastifyRequest & { user?: { id?: string } }).user?.id,
                metadata: { endpoint: '/api/v1/chat/stream', reason: hv.blockReason },
              });
              reply.code(400).send({ error: 'Message blocked: invalid content in history' });
              return;
            }
          }
        }
      }

      // Validate viewportHint if present
      const VALID_VIEWPORTS_S = ['mobile', 'tablet', 'desktop'] as const;
      const viewportHintS =
        clientContext?.viewportHint &&
        (VALID_VIEWPORTS_S as readonly string[]).includes(clientContext.viewportHint)
          ? (clientContext.viewportHint as 'mobile' | 'tablet' | 'desktop')
          : undefined;

      let aiClient;
      try {
        aiClient = secureYeoman.getAIClient();
      } catch {
        reply.code(503).send({ error: 'AI client is not available.' });
        return;
      }

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const emit = (event: ChatStreamEvent): void => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        // ── Setup (mirrors non-streaming path) ────────────────────────

        // Brain context
        let brainContext: BrainContextMeta = { memoriesUsed: 0, knowledgeUsed: 0, contextSnippets: [] };
        if (memoryEnabled) {
          try {
            const brainManager = secureYeoman.getBrainManager();
            const memories = await brainManager.recall({ search: message, limit: 5 });
            const knowledge = await brainManager.queryKnowledge({ search: message, limit: 5 });
            const snippets: string[] = [];
            for (const m of memories) snippets.push(`[${m.type}] ${m.content}`);
            for (const k of knowledge) snippets.push(`[${k.topic}] ${k.content}`);
            brainContext = { memoriesUsed: memories.length, knowledgeUsed: knowledge.length, contextSnippets: snippets };
          } catch { /* Brain not available */ }
        }

        const soulManager = secureYeoman.getSoulManager();
        let systemPrompt = memoryEnabled
          ? await soulManager.composeSoulPrompt(message, personalityId, { viewportHint: viewportHintS })
          : await soulManager.composeSoulPrompt(undefined, personalityId, { viewportHint: viewportHintS });

        if (memoryEnabled && systemPrompt) {
          try {
            const brainManager = secureYeoman.getBrainManager();
            const learner = new PreferenceLearner(brainManager);
            systemPrompt = await learner.injectPreferences(systemPrompt);
          } catch { /* best-effort */ }
        }

        const messages: AIRequest['messages'] = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

        if (history && Array.isArray(history)) {
          for (const msg of history) {
            const role = msg.role === 'assistant' ? 'assistant' : 'user';
            if (msg.content && typeof msg.content === 'string') {
              messages.push({ role, content: msg.content });
            }
          }
        }
        messages.push({ role: 'user', content: message.trim() });

        // Tools
        const tools: Tool[] = [];
        const personality = personalityId
          ? ((await soulManager.getPersonality(personalityId)) ?? (await soulManager.getActivePersonality()))
          : await soulManager.getActivePersonality();

        // Rate limiting — global chat_requests rule + optional per-personality override
        {
          const rateLimiter = secureYeoman.getRateLimiter();
          const userId = request.authUser?.userId ?? request.ip ?? 'anonymous';
          const rlCtx = { userId: request.authUser?.userId, ipAddress: request.ip };
          const rateLimitConfig = personality?.body?.resourcePolicy?.rateLimitConfig;
          const rlEnabled = rateLimitConfig?.enabled ?? true;

          if (rlEnabled) {
            const globalResult = await Promise.resolve(
              rateLimiter.check('chat_requests', userId, rlCtx)
            );
            if (!globalResult.allowed) {
              void secureYeoman.getAuditChain().record({
                event: 'rate_limit',
                level: 'warn',
                message: 'Stream chat rate limit exceeded (global)',
                userId: request.authUser?.userId,
                metadata: { rule: 'chat_requests', endpoint: '/api/v1/chat/stream' },
              });
              emit({ type: 'error', message: 'Rate limit exceeded. Please slow down.' });
              reply.raw.end();
              return;
            }

            if (rateLimitConfig?.chatRequestsPerMinute !== undefined) {
              const ruleName = `chat_personality_${personality!.id}`;
              rateLimiter.addRule({
                name: ruleName,
                windowMs: 60000,
                maxRequests: rateLimitConfig.chatRequestsPerMinute,
                keyType: 'user',
                onExceed: 'reject',
              });
              const perResult = await Promise.resolve(
                rateLimiter.check(ruleName, userId, rlCtx)
              );
              if (!perResult.allowed) {
                void secureYeoman.getAuditChain().record({
                  event: 'rate_limit',
                  level: 'warn',
                  message: 'Stream chat rate limit exceeded (per-personality)',
                  userId: request.authUser?.userId,
                  metadata: { rule: ruleName, endpoint: '/api/v1/chat/stream', personalityId: personality!.id },
                });
                emit({ type: 'error', message: 'Rate limit exceeded for this personality.' });
                reply.raw.end();
                return;
              }
            }
          }
        }

        tools.push(...(await soulManager.getActiveTools(personality?.id ?? null)));

        const mcpClientStream = secureYeoman.getMcpClientManager();
        const mcpStorageStream = secureYeoman.getMcpStorage();

        if (personality?.body?.enabled && mcpClientStream && mcpStorageStream) {
          const selectedServers = personality.body.selectedServers ?? [];
          const perPersonalityFeatures = personality.body.mcpFeatures ?? {
            exposeGit: false, exposeFilesystem: false, exposeWeb: false,
            exposeWebScraping: false, exposeWebSearch: false, exposeBrowser: false,
          };
          const globalConfig = await mcpStorageStream.getConfig();
          if (selectedServers.length > 0) {
            const allMcpTools: McpToolDef[] = mcpClientStream.getAllTools();
            for (const tool of allMcpTools) {
              if (!selectedServers.includes(tool.serverName)) continue;
              if (tool.serverName === 'YEOMAN MCP') {
                const isGitTool = tool.name.startsWith('git_') || tool.name.includes('git');
                const isFsTool = tool.name.startsWith('fs_') || tool.name.includes('filesystem') || tool.name.includes('file_');
                if (isGitTool && !(globalConfig.exposeGit && perPersonalityFeatures.exposeGit)) continue;
                if (isFsTool && !(globalConfig.exposeFilesystem && perPersonalityFeatures.exposeFilesystem)) continue;
              }
              tools.push({ name: tool.name, description: tool.description || undefined, parameters: tool.inputSchema as Tool['parameters'] });
            }
          }
        }

        // Compaction
        const currentModel = personality?.defaultModel?.model ?? 'unknown';
        if (compactor.needsCompaction(messages, currentModel)) {
          try {
            const compactionResult = await compactor.compact(messages, currentModel, async (prompt) => {
              const summaryResp = await aiClient.chat({ messages: [{ role: 'user', content: prompt }], stream: false }, { source: 'context_compaction' });
              return summaryResp.content;
            });
            if (compactionResult.compacted) {
              messages.length = 0;
              messages.push(...compactionResult.messages);
            }
          } catch { /* best-effort */ }
        }

        // Thinking config
        const streamThinkingBudget = personality?.body?.thinkingConfig?.enabled
          ? (personality.body.thinkingConfig.budgetTokens ?? 10000)
          : undefined;

        const personalityFallbacks = personality?.modelFallbacks?.length
          ? resolvePersonalityFallbacks(personality.modelFallbacks)
          : undefined;
        void personalityFallbacks; // streaming path uses default provider

        const aiRequest: AIRequest = {
          messages,
          stream: true,
          ...(tools.length > 0 ? { tools } : {}),
          ...(streamThinkingBudget ? { thinkingBudgetTokens: streamThinkingBudget } : {}),
        };

        const { uuidv7, sha256 } = await import('../utils/crypto.js');
        const { TaskStatus } = await import('@secureyeoman/shared');
        const taskStorage = secureYeoman.getTaskStorage?.();

        const CREATION_TOOL_LABELS_S: Record<string, string> = {
          create_skill: 'Skill', update_skill: 'Skill', delete_skill: 'Skill',
          create_task: 'Task', update_task: 'Task',
          create_personality: 'Personality', update_personality: 'Personality', delete_personality: 'Personality',
          create_experiment: 'Experiment', delete_experiment: 'Experiment',
          create_swarm: 'Swarm', create_custom_role: 'Custom Role', delete_custom_role: 'Custom Role',
          assign_role: 'Role Assignment', revoke_role: 'Role Assignment',
          a2a_connect: 'A2A Connection', delegate_task: 'Delegation',
          create_workflow: 'Workflow', update_workflow: 'Workflow', delete_workflow: 'Workflow',
          trigger_workflow: 'Workflow Run',
        };

        const toolActionS = (toolName: string): string => {
          if (toolName.startsWith('create_')) return 'Created';
          if (toolName.startsWith('update_')) return 'Updated';
          if (toolName.startsWith('delete_')) return 'Deleted';
          if (toolName.startsWith('trigger_')) return 'Triggered';
          if (toolName.startsWith('assign_')) return 'Assigned';
          if (toolName.startsWith('revoke_')) return 'Revoked';
          if (toolName === 'a2a_connect') return 'Connected';
          if (toolName === 'delegate_task') return 'Delegated';
          return 'Created';
        };

        // ── Streaming agentic loop ────────────────────────────────────

        const MAX_TOOL_ITERATIONS_S = 10;
        let iterationCountS = 0;
        const thinkingPartsS: string[] = [];
        const contentPartsS: string[] = [];
        const creationEventsS: Array<{ tool: string; label: string; action: string; name: string; id?: string }> = [];
        let totalTokensUsed = 0;
        let finalModel = '';
        let finalProvider = '';
        let stopReason: string = 'end_turn';

        while (iterationCountS <= MAX_TOOL_ITERATIONS_S) {
          // Collect tool calls and final metadata from this iteration
          const pendingToolCalls: Map<string, { id: string; name: string; argsJson: string }> = new Map();
          let currentToolId = '';
          stopReason = 'end_turn';

          // Stream model response
          for await (const chunk of aiClient.chatStream({ ...aiRequest, messages })) {
            if (chunk.type === 'thinking_delta') {
              thinkingPartsS.push(chunk.thinking);
              emit({ type: 'thinking_delta', thinking: chunk.thinking });
            } else if (chunk.type === 'content_delta') {
              contentPartsS.push(chunk.content);
              emit({ type: 'content_delta', content: chunk.content });
            } else if (chunk.type === 'tool_call_delta') {
              const tc = chunk.toolCall;
              if (tc.id && tc.name) {
                currentToolId = tc.id;
                pendingToolCalls.set(tc.id, { id: tc.id, name: tc.name, argsJson: '' });
              }
            } else if (chunk.type === 'done') {
              stopReason = chunk.stopReason;
              if (chunk.usage) {
                totalTokensUsed += chunk.usage.totalTokens;
              }
              // Use complete tool calls from the done event (includes full args JSON)
              if (chunk.toolCalls) {
                for (const tc of chunk.toolCalls) {
                  pendingToolCalls.set(tc.id, {
                    id: tc.id,
                    name: tc.name,
                    argsJson: JSON.stringify(tc.arguments ?? {}),
                  });
                }
              }
            }
          }

            // Determine model/provider from personality config (once)
          if (!finalModel) {
            finalModel = personality?.defaultModel?.model ?? 'unknown';
            finalProvider = personality?.defaultModel?.provider ?? 'unknown';
          }

          if (stopReason !== 'tool_use' || pendingToolCalls.size === 0) break;

          // Append assistant turn with tool calls
          const toolCallsForMsg = Array.from(pendingToolCalls.values()).map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: (() => {
              try { return JSON.parse(tc.argsJson || '{}') as Record<string, unknown>; }
              catch { return {} as Record<string, unknown>; }
            })(),
          }));

          messages.push({
            role: 'assistant' as const,
            content: contentPartsS.join('') || undefined,
            toolCalls: toolCallsForMsg,
          });

          // Execute tools
          const executionContextS = { personalityId: personality?.id ?? null, personalityName: personality?.name ?? null };
          for (const toolCall of toolCallsForMsg) {
            const mcpToolS = mcpClientStream?.getAllTools().find((t) => t.name === toolCall.name);

            if (mcpToolS) {
              emit({ type: 'mcp_tool_start', toolName: toolCall.name, serverName: mcpToolS.serverName, iteration: iterationCountS });
              try {
                const mcpResult = await mcpClientStream!.callTool(mcpToolS.serverId, toolCall.name, toolCall.arguments);
                emit({ type: 'mcp_tool_result', toolName: toolCall.name, serverName: mcpToolS.serverName, success: true });
                messages.push({ role: 'tool' as const, toolResult: { toolCallId: toolCall.id, content: JSON.stringify(mcpResult), isError: false } });
              } catch (err) {
                emit({ type: 'mcp_tool_result', toolName: toolCall.name, serverName: mcpToolS.serverName, success: false });
                messages.push({ role: 'tool' as const, toolResult: { toolCallId: toolCall.id, content: JSON.stringify({ error: String(err) }), isError: true } });
              }
            } else {
              const label = CREATION_TOOL_LABELS_S[toolCall.name] ?? toolCall.name;
              emit({ type: 'tool_start', toolName: toolCall.name, label, iteration: iterationCountS });
              const result = await executeCreationTool(toolCall, secureYeoman, executionContextS);
              emit({ type: 'tool_result', toolName: toolCall.name, success: !result.isError, isError: result.isError });

              if (!result.isError && CREATION_TOOL_LABELS_S[toolCall.name]) {
                const out = result.output as Record<string, unknown>;
                const item = (out.skill ?? out.task ?? out.personality ?? out.experiment ?? out.swarm ?? out.workflow ?? out.run) as Record<string, unknown> | undefined;
                const name = String(item?.name ?? item?.workflowName ?? (typeof out.name === 'string' ? out.name : undefined) ?? (toolCall.arguments as Record<string, unknown>)?.name ?? toolCall.name);
                const action = toolActionS(toolCall.name);
                const id = typeof item?.id === 'string' ? item.id : undefined;
                const evt = { tool: toolCall.name, label, action, name, id };
                creationEventsS.push(evt);
                emit({ type: 'creation_event', event: evt });

                if (taskStorage) {
                  const status = typeof item?.status === 'string' ? (item.status as any) : TaskStatus.COMPLETED;
                  const now = Date.now();
                  await taskStorage.storeTask({
                    id: uuidv7(), type: 'execute' as any,
                    name: `${label} ${action}: ${name}`, description: toolCall.name,
                    status, createdAt: now,
                    ...(status === TaskStatus.COMPLETED ? { completedAt: now, durationMs: 0 } : {}),
                    inputHash: sha256(JSON.stringify(toolCall.arguments ?? {})),
                    securityContext: { userId: 'ai', role: 'operator', permissionsUsed: [] },
                    timeoutMs: 0,
                  });
                }
              }
              messages.push({ role: 'tool' as const, toolResult: { toolCallId: toolCall.id, content: JSON.stringify(result.output), isError: result.isError } });
            }
          }

          iterationCountS++;
        }

        const finalContent = contentPartsS.join('');
        const finalThinking = thinkingPartsS.join('') || undefined;

        // Credential scan
        const scanResult = scanner.scan(finalContent, 'llm_response');
        const safeContent = scanResult.redacted ? scanResult.text : finalContent;

        // Persist conversation
        if (conversationId) {
          try {
            const convStorage = secureYeoman.getConversationStorage();
            if (convStorage) {
              await convStorage.addMessage({ conversationId, role: 'user', content: message.trim() });
              await convStorage.addMessage({
                conversationId, role: 'assistant', content: safeContent,
                model: finalModel, provider: finalProvider,
                tokensUsed: totalTokensUsed, brainContext,
                creationEvents: creationEventsS.length > 0 ? creationEventsS : null,
              });
            }
          } catch { /* best-effort */ }
        }

        if (memoryEnabled && saveAsMemory) {
          try {
            const brainManager = secureYeoman.getBrainManager();
            await brainManager.remember('episodic', `User: ${message.trim()}\nAssistant: ${safeContent}`, 'dashboard_chat', { personalityId: personalityId ?? 'default' });
          } catch { /* best-effort */ }
        }

        emit({
          type: 'done',
          content: safeContent,
          model: finalModel,
          provider: finalProvider,
          tokensUsed: totalTokensUsed,
          thinkingContent: finalThinking,
          creationEvents: creationEventsS,
        });
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        reply.raw.end();
      }
    }
  );
}
