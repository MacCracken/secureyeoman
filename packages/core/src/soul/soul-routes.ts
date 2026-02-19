/**
 * Soul Routes — API endpoints for personality and skill management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SoulManager } from './manager.js';
import type {
  PersonalityCreate,
  PersonalityUpdate,
  SkillCreate,
  SkillUpdate,
  UserProfileCreate,
  UserProfileUpdate,
} from './types.js';

export interface SoulRoutesOptions {
  soulManager: SoulManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerSoulRoutes(app: FastifyInstance, opts: SoulRoutesOptions): void {
  const { soulManager } = opts;

  // ── Personality ─────────────────────────────────────────────

  app.get('/api/v1/soul/personality', async () => {
    const personality = await soulManager.getActivePersonality();
    return { personality };
  });

  app.get('/api/v1/soul/personalities', async () => {
    const personalities = await soulManager.listPersonalities();
    return { personalities };
  });

  app.post(
    '/api/v1/soul/personalities',
    async (request: FastifyRequest<{ Body: PersonalityCreate }>, reply: FastifyReply) => {
      try {
        const personality = await soulManager.createPersonality(request.body);
        return await reply.code(201).send({ personality });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.put(
    '/api/v1/soul/personalities/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: PersonalityUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const personality = await soulManager.updatePersonality(request.params.id, request.body);
        return { personality };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/soul/personalities/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.deletePersonality(request.params.id);
        return { message: 'Personality deleted' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/activate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.setPersonality(request.params.id);
        const personality = await soulManager.getActivePersonality();
        return { personality };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Skills ──────────────────────────────────────────────────

  app.get(
    '/api/v1/soul/skills',
    async (request: FastifyRequest<{ Querystring: { status?: string; source?: string } }>) => {
      const { status, source } = request.query;
      const skills = await soulManager.listSkills({ status, source });
      return { skills };
    }
  );

  app.post(
    '/api/v1/soul/skills',
    async (request: FastifyRequest<{ Body: SkillCreate }>, reply: FastifyReply) => {
      try {
        const skill = await soulManager.createSkill(request.body);
        return await reply.code(201).send({ skill });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.put(
    '/api/v1/soul/skills/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SkillUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const skill = await soulManager.updateSkill(request.params.id, request.body);
        return { skill };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/soul/skills/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.deleteSkill(request.params.id);
        return { message: 'Skill deleted' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/enable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.enableSkill(request.params.id);
        return { message: 'Skill enabled' };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/disable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.disableSkill(request.params.id);
        return { message: 'Skill disabled' };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const skill = await soulManager.approveSkill(request.params.id);
        return { skill };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/reject',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.rejectSkill(request.params.id);
        return { message: 'Skill rejected' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Users ──────────────────────────────────────────────────

  app.get('/api/v1/soul/users', async () => {
    const users = await soulManager.listUsers();
    return { users };
  });

  app.get('/api/v1/soul/owner', async () => {
    const owner = await soulManager.getOwner();
    return { owner };
  });

  app.get(
    '/api/v1/soul/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await soulManager.getUser(request.params.id);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      return { user };
    }
  );

  app.post(
    '/api/v1/soul/users',
    async (request: FastifyRequest<{ Body: UserProfileCreate }>, reply: FastifyReply) => {
      try {
        const user = await soulManager.createUser(request.body);
        return await reply.code(201).send({ user });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.put(
    '/api/v1/soul/users/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UserProfileUpdate }>,
      reply: FastifyReply
    ) => {
      try {
        const user = await soulManager.updateUser(request.params.id, request.body);
        return { user };
      } catch (err) {
        return reply.code(404).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/soul/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await soulManager.deleteUser(request.params.id);
        if (!deleted) {
          return await reply.code(404).send({ error: 'User not found' });
        }
        return { message: 'User deleted' };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Prompt Preview ──────────────────────────────────────────

  app.get(
    '/api/v1/soul/prompt/preview',
    async (request: FastifyRequest<{ Querystring: { personalityId?: string } }>) => {
      const { personalityId } = request.query;
      const prompt = await soulManager.composeSoulPrompt(undefined, personalityId);
      const tools = await soulManager.getActiveTools();
      return {
        prompt,
        tools,
        charCount: prompt.length,
        estimatedTokens: Math.ceil(prompt.length / 4),
      };
    }
  );

  // ── Config ──────────────────────────────────────────────────

  app.get('/api/v1/soul/config', async () => {
    const config = soulManager.getConfig();
    return { config };
  });

  // ── Agent Name ─────────────────────────────────────────────

  app.get('/api/v1/soul/agent-name', async () => {
    const agentName = await soulManager.getAgentName();
    return { agentName };
  });

  app.put(
    '/api/v1/soul/agent-name',
    async (request: FastifyRequest<{ Body: { agentName: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.setAgentName(request.body.agentName);
        return { agentName: await soulManager.getAgentName() };
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  // ── Onboarding ──────────────────────────────────────────────

  app.get('/api/v1/soul/onboarding/status', async () => {
    const needed = await soulManager.needsOnboarding();
    const agentName = await soulManager.getAgentName();
    const personality = await soulManager.getActivePersonality();
    return { needed, agentName, personality };
  });

  app.post(
    '/api/v1/soul/onboarding/complete',
    async (
      request: FastifyRequest<{ Body: Partial<PersonalityCreate> & { agentName?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        // Step 1: Set agent name (first item in onboarding)
        const agentName = request.body?.agentName ?? request.body?.name ?? 'FRIDAY';
        await soulManager.setAgentName(agentName);

        const defaults = {
          name: agentName,
          description: 'Friendly, Reliable, Intelligent Digitally Adaptable Yeoman',
          systemPrompt: `You are ${agentName}, a helpful and security-conscious AI assistant. You are direct, technically precise, and proactive about identifying risks.`,
          traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
          sex: 'unspecified' as const,
          voice: '',
          preferredLanguage: '',
        };

        const data: PersonalityCreate = {
          name: request.body?.name ?? defaults.name,
          description: request.body?.description ?? defaults.description,
          systemPrompt: request.body?.systemPrompt ?? defaults.systemPrompt,
          traits: request.body?.traits ?? defaults.traits,
          sex: request.body?.sex ?? defaults.sex,
          voice: request.body?.voice ?? defaults.voice,
          preferredLanguage: request.body?.preferredLanguage ?? defaults.preferredLanguage,
          defaultModel: request.body?.defaultModel ?? null,
          modelFallbacks: request.body?.modelFallbacks ?? [],
          includeArchetypes: request.body?.includeArchetypes ?? agentName === 'FRIDAY',
          body: request.body?.body ?? {
            enabled: false,
            capabilities: [],
            heartEnabled: true,
            creationConfig: {
              skills: false,
              tasks: false,
              personalities: false,
              subAgents: false,
              customRoles: false,
              roleAssignments: false,
              experiments: false,
              allowA2A: false,
              allowSwarms: false,
              allowDynamicTools: false,
            },
            selectedServers: [],
            selectedIntegrations: [],
            mcpFeatures: {
              exposeGit: false,
              exposeFilesystem: false,
              exposeWeb: false,
              exposeWebScraping: false,
              exposeWebSearch: false,
              exposeBrowser: false,
            },
            proactiveConfig: {
              enabled: false,
              approvalMode: 'suggest',
              builtins: {
                dailyStandup: false,
                weeklySummary: false,
                contextualFollowup: false,
                integrationHealthAlert: false,
                securityAlertDigest: false,
              },
              learning: { enabled: true, minConfidence: 0.7 },
            },
          },
        };

        const personality = await soulManager.createPersonality(data);
        await soulManager.setPersonality(personality.id);

        return await reply.code(201).send({
          agentName: await soulManager.getAgentName(),
          personality: await soulManager.getActivePersonality(),
        });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );
}
