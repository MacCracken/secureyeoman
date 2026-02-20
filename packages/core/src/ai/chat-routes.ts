/**
 * Chat Routes — Conversation with any personality via the dashboard.
 *
 * Accepts an optional `personalityId` to target a specific personality;
 * falls back to the active personality when omitted.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import type { AIRequest, Tool, FallbackModelConfig, AIProviderName } from '@secureyeoman/shared';
import type { McpToolDef } from '@secureyeoman/shared';
import { PreferenceLearner, type FeedbackType } from '../brain/preference-learner.js';
import { sendError } from '../utils/errors.js';

// Map provider name → standard API key env var (no-key providers get empty string)
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  opencode: 'OPENCODE_API_KEY',
};

function resolvePersonalityFallbacks(
  fallbacks: Array<{ provider: string; model: string }>
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
      } = request.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return sendError(reply, 400, 'Message is required');
      }

      let aiClient;
      try {
        aiClient = secureYeoman.getAIClient();
      } catch {
        return sendError(reply, 503, 'AI client is not available. Check provider configuration and API keys.');
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
        ? await soulManager.composeSoulPrompt(message, personalityId)
        : await soulManager.composeSoulPrompt(undefined, personalityId);

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

      const aiRequest: AIRequest = {
        messages,
        stream: false,
        ...(tools.length > 0 ? { tools } : {}),
      };

      try {
        const personalityFallbacks =
          personality?.modelFallbacks?.length
            ? resolvePersonalityFallbacks(personality.modelFallbacks)
            : undefined;

        const response = await aiClient.chat(aiRequest, { source: 'dashboard_chat' }, personalityFallbacks);

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

        return {
          role: 'assistant' as const,
          content: response.content,
          model: response.model,
          provider: response.provider,
          tokensUsed: response.usage.totalTokens,
          brainContext,
          conversationId: conversationId ?? undefined,
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
}
