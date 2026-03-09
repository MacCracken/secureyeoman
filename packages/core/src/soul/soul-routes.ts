/**
 * Soul Routes — API endpoints for personality and skill management.
 */

import { mkdirSync, createReadStream, readdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SoulManager } from './manager.js';
import { isPersonalityWithinActiveHours } from './manager.js';
import type { Personality } from './types.js';
import type { ApprovalManager } from './approval-manager.js';
import type {
  PersonalityCreate,
  PersonalityUpdate,
  SkillCreate,
  SkillUpdate,
  SoulConfig,
  UserProfileCreate,
  UserProfileUpdate,
} from './types.js';
import { getAvatarDir } from './storage.js';
import { toErrorMessage, sendError } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import type { HeartbeatManager } from '../body/heartbeat.js';
import type { InputValidator } from '../security/input-validator.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { PersonalityMarkdownSerializer } from './personality-serializer.js';
import { computeUnifiedDiff } from './diff-utils.js';
import type { PersonalityVersionManager } from './personality-version-manager.js';

export interface SoulRoutesOptions {
  soulManager: SoulManager;
  approvalManager?: ApprovalManager;
  broadcast?: (payload: unknown) => void;
  heartbeatManager?: HeartbeatManager | null;
  validator?: InputValidator;
  auditChain?: AuditChain;
  dataDir?: string;
  personalityVersionManager?: PersonalityVersionManager | null;
}

/**
 * Scans instruction text for common credential patterns.
 * Returns a list of warning messages for any matches found.
 * Skips matches that are $VAR_NAME environment variable references.
 */
export function detectCredentials(text: string): string[] {
  const warnings: string[] = [];
  const VAR_REF = /^\$[A-Z_][A-Z0-9_]*$/;

  const patterns: { re: RegExp; label: string }[] = [
    { re: /Bearer\s+([A-Za-z0-9\-._~+/]{20,})/g, label: 'Bearer token' },
    { re: /\bsk-[A-Za-z0-9]{20,}/g, label: 'API key (sk-)' },
    { re: /\b(ghp_|gho_|github_pat_)[A-Za-z0-9_]{10,}/g, label: 'GitHub token' },
    { re: /password\s*[=:]\s*(\S{6,})/gi, label: 'inline password' },
    { re: /api[_-]?key\s*[=:]\s*(\S{8,})/gi, label: 'inline API key' },
  ];

  for (const { re, label } of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const captured = m[1] ?? m[0];
      if (VAR_REF.test(captured.trim())) continue;
      warnings.push(`${label} detected — use a $VAR_NAME reference instead`);
      break; // one warning per pattern type
    }
  }

  return warnings;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

export function registerSoulRoutes(app: FastifyInstance, opts: SoulRoutesOptions): void {
  const {
    soulManager,
    approvalManager,
    broadcast,
    heartbeatManager,
    validator,
    auditChain,
    dataDir,
    personalityVersionManager,
  } = opts;

  function withActiveHours(p: Personality): Personality & { isWithinActiveHours: boolean } {
    return { ...p, isWithinActiveHours: isPersonalityWithinActiveHours(p) };
  }

  /** Validate text fields that feed directly into the system prompt. Returns an error message or null. */
  function validateSoulText(
    fields: Record<string, string | undefined>,
    source: string,
    userId?: string
  ): string | null {
    if (!validator) return null;
    for (const [, value] of Object.entries(fields)) {
      if (typeof value !== 'string') continue;
      const result = validator.validate(value, { source });
      if (result.blocked) {
        void auditChain?.record({
          event: 'injection_attempt',
          level: 'warn',
          message: `Soul route input blocked (${source})`,
          userId,
          metadata: { source, reason: result.blockReason },
        });
        return 'Input blocked: invalid content';
      }
    }
    return null;
  }

  // ── Personality ─────────────────────────────────────────────

  app.get('/api/v1/soul/personality', async () => {
    const personality = await soulManager.getActivePersonality();
    return { personality: personality ? withActiveHours(personality) : null };
  });

  app.get(
    '/api/v1/soul/personalities',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      const result = await soulManager.listPersonalities({ limit, offset });
      return { personalities: result.personalities.map(withActiveHours), total: result.total };
    }
  );

  app.post(
    '/api/v1/soul/personalities',
    async (request: FastifyRequest<{ Body: PersonalityCreate }>, reply: FastifyReply) => {
      const b = request.body;
      const err = validateSoulText(
        { name: b.name, systemPrompt: b.systemPrompt, description: b.description },
        'personality_create',
        request.authUser?.userId
      );
      if (err) return sendError(reply, 400, err);
      try {
        const personality = await soulManager.createPersonality(b);
        return await reply.code(201).send({ personality });
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  app.put(
    '/api/v1/soul/personalities/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: PersonalityUpdate }>,
      reply: FastifyReply
    ) => {
      const b = request.body;
      const err = validateSoulText(
        { name: b.name, systemPrompt: b.systemPrompt, description: b.description },
        'personality_update',
        request.authUser?.userId
      );
      if (err) return sendError(reply, 400, err);
      try {
        const personality = await soulManager.updatePersonality(request.params.id, b);
        broadcast?.({ event: 'updated', type: 'personality', id: personality.id });
        if (heartbeatManager) {
          const [active, allResult] = await Promise.all([
            soulManager.getActivePersonality(),
            soulManager.listPersonalities({ limit: 200 }),
          ]);
          if (active?.id === personality.id) {
            heartbeatManager.setPersonalitySchedule(personality.body?.activeHours ?? null);
            heartbeatManager.setActivePersonalityId(personality.id);
          }
          heartbeatManager.setActivePersonalityIds(
            allResult.personalities.map((p) => ({
              id: p.id,
              name: p.name,
              omnipresentMind: p.body?.omnipresentMind ?? false,
            }))
          );
        }
        return { personality };
      } catch (e) {
        return sendError(reply, 404, toErrorMessage(e));
      }
    }
  );

  app.delete(
    '/api/v1/soul/personalities/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.deletePersonality(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/activate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.setPersonality(request.params.id);
        const personality = await soulManager.getActivePersonality();
        if (heartbeatManager && personality) {
          const allResult = await soulManager.listPersonalities({ limit: 200 });
          heartbeatManager.setPersonalitySchedule(personality.body?.activeHours ?? null);
          heartbeatManager.setActivePersonalityId(personality.id);
          heartbeatManager.setActivePersonalityIds(
            allResult.personalities.map((p) => ({
              id: p.id,
              name: p.name,
              omnipresentMind: p.body?.omnipresentMind ?? false,
            }))
          );
        }
        return { personality: personality ? withActiveHours(personality) : null };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/enable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.enablePersonality(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/disable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.disablePersonality(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/set-default',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.setDefaultPersonality(request.params.id);
        const personality = await soulManager.getActivePersonality();
        return { personality: personality ? withActiveHours(personality) : null };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post('/api/v1/soul/personalities/clear-default', async () => {
    await soulManager.clearDefaultPersonality();
    return { success: true };
  });

  // ── Personality Presets ─────────────────────────────────────

  app.get('/api/v1/soul/personalities/presets', async () => {
    const presets = soulManager.listPersonalityPresets();
    return { presets };
  });

  app.post(
    '/api/v1/soul/personalities/presets/:id/instantiate',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Partial<PersonalityCreate> }>,
      reply: FastifyReply
    ) => {
      try {
        const personality = await soulManager.createPersonalityFromPreset(
          request.params.id,
          request.body
        );
        return await reply.code(201).send({ personality });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── Personality Export/Import ──────────────────────────────────

  const personalitySerializer = new PersonalityMarkdownSerializer();

  app.get(
    '/api/v1/soul/personalities/:id/export',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { format?: string } }>,
      reply: FastifyReply
    ) => {
      const personality = await soulManager.getPersonality(request.params.id);
      if (!personality) return sendError(reply, 404, 'Personality not found');

      const format = request.query.format ?? 'md';
      // Sanitize filename to prevent header injection
      const safeName = personality.name.replace(/[\r\n"\\]/g, '_');

      if (format === 'json') {
        return reply
          .header('Content-Disposition', `attachment; filename="${safeName}.json"`)
          .send(personality);
      }

      const md = personalitySerializer.toMarkdown(personality);
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${safeName}.md"`)
        .send(md);
    }
  );

  app.post(
    '/api/v1/soul/personalities/import',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = await request.file();
      if (!file) return sendError(reply, 400, 'No file uploaded');

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString('utf-8');
      const ext = file.filename?.toLowerCase().endsWith('.json') ? 'json' : 'md';

      try {
        let data: PersonalityCreate;
        let warnings: string[] = [];

        if (ext === 'json') {
          data = JSON.parse(content) as PersonalityCreate;
        } else {
          const result = personalitySerializer.fromMarkdown(content);
          data = result.data;
          warnings = result.warnings;
        }

        // Validate text content
        const err = validateSoulText(
          { name: data.name, systemPrompt: data.systemPrompt, description: data.description },
          'personality_import',
          request.authUser?.userId
        );
        if (err) return sendError(reply, 400, err);

        const personality = await soulManager.createPersonality(data);
        return await reply.code(201).send({ personality, warnings });
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  // ── Personality Distillation (Phase 107-E) ───────────────────

  app.get(
    '/api/v1/soul/personalities/:id/distill',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { includeMemory?: string };
      }>,
      reply: FastifyReply
    ) => {
      const personality = await soulManager.getPersonality(request.params.id);
      if (!personality) return sendError(reply, 404, 'Personality not found');

      try {
        const includeMemory = request.query.includeMemory === 'true';
        const result = await soulManager.distillPersonality(request.params.id, { includeMemory });

        const accept = request.headers.accept ?? '';
        if (accept.includes('text/markdown')) {
          return reply.header('Content-Type', 'text/markdown; charset=utf-8').send(result.markdown);
        }
        return result;
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  app.get(
    '/api/v1/soul/personalities/:id/distill/diff',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const personality = await soulManager.getPersonality(request.params.id);
      if (!personality) return sendError(reply, 404, 'Personality not found');

      try {
        const distilled = await soulManager.distillPersonality(request.params.id);
        const exportMd = personalitySerializer.toMarkdown(personality);
        const diff = computeUnifiedDiff(exportMd, distilled.markdown, 'export', 'distilled');
        return { diff, hasChanges: diff.length > 0 };
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  // ── Personality Versioning (Phase 114) ──────────────────────

  app.get(
    '/api/v1/soul/personalities/:id/versions',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const { limit, offset } = parsePagination(request.query, { defaultLimit: 50 });
        return await personalityVersionManager.listVersions(request.params.id, { limit, offset });
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  app.get(
    '/api/v1/soul/personalities/:id/versions/:idOrTag',
    async (
      request: FastifyRequest<{ Params: { id: string; idOrTag: string } }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const version = await personalityVersionManager.getVersion(
          request.params.id,
          request.params.idOrTag
        );
        if (!version) return sendError(reply, 404, 'Version not found');
        return version;
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/versions/tag',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { tag?: string } }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const tag = (request.body as any)?.tag;
        const version = await personalityVersionManager.tagRelease(
          request.params.id,
          tag || undefined
        );
        return await reply.code(201).send(version);
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  app.delete(
    '/api/v1/soul/personalities/:id/versions/:vId/tag',
    async (
      request: FastifyRequest<{ Params: { id: string; vId: string } }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const version = await personalityVersionManager.clearTag(request.params.vId);
        if (!version) return sendError(reply, 404, 'Version not found');
        return version;
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  app.post(
    '/api/v1/soul/personalities/:id/versions/:vId/rollback',
    async (
      request: FastifyRequest<{ Params: { id: string; vId: string } }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const version = await personalityVersionManager.rollback(
          request.params.id,
          request.params.vId
        );
        return version;
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  app.get(
    '/api/v1/soul/personalities/:id/drift',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        return await personalityVersionManager.getDrift(request.params.id);
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  app.get(
    '/api/v1/soul/personalities/:id/versions/:a/diff/:b',
    async (
      request: FastifyRequest<{ Params: { id: string; a: string; b: string } }>,
      reply: FastifyReply
    ) => {
      if (!personalityVersionManager) return sendError(reply, 501, 'Versioning not available');
      try {
        const diff = await personalityVersionManager.diffVersions(
          request.params.a,
          request.params.b
        );
        return { diff };
      } catch (e) {
        return sendError(reply, 500, toErrorMessage(e));
      }
    }
  );

  // ── Skills ──────────────────────────────────────────────────

  app.get(
    '/api/v1/soul/skills',
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: string;
          source?: string;
          personalityId?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const { status, source, personalityId } = request.query;
      const { limit, offset } = parsePagination(request.query);
      const filter: Parameters<typeof soulManager.listSkills>[0] = {
        status,
        source,
        limit,
        offset,
      };
      // When personalityId is supplied, return skills for that personality plus global skills
      if (personalityId) filter.forPersonalityId = personalityId;
      return soulManager.listSkills(filter);
    }
  );

  app.post(
    '/api/v1/soul/skills',
    async (request: FastifyRequest<{ Body: SkillCreate }>, reply: FastifyReply) => {
      const b = request.body;
      const err = validateSoulText(
        { name: b.name, description: b.description, instructions: b.instructions },
        'skill_create',
        request.authUser?.userId
      );
      if (err) return sendError(reply, 400, err);
      try {
        const skill = await soulManager.createSkill(b);
        const warnings = detectCredentials(b.instructions ?? '');
        const response: { skill: typeof skill; warnings?: string[] } = { skill };
        if (warnings.length > 0) response.warnings = warnings;
        return await reply.code(201).send(response);
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

  app.put(
    '/api/v1/soul/skills/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SkillUpdate }>,
      reply: FastifyReply
    ) => {
      const b = request.body;
      const err = validateSoulText(
        { name: b.name, description: b.description, instructions: b.instructions },
        'skill_update',
        request.authUser?.userId
      );
      if (err) return sendError(reply, 400, err);
      try {
        // Capture previous level before update for escalation detection
        let prevLevel: string | undefined;
        try {
          const prevSkill = await soulManager.getSkill(request.params.id);
          prevLevel = prevSkill?.autonomyLevel;
        } catch {
          /* ignore — escalation warning is best-effort */
        }

        const skill = await soulManager.updateSkill(request.params.id, b);
        broadcast?.({ event: 'updated', type: 'skill', id: skill.id });
        const credentialWarnings = detectCredentials(b.instructions ?? '');
        const escalationWarnings: string[] = [];
        if (prevLevel && b.autonomyLevel && b.autonomyLevel !== prevLevel) {
          const levelNum = (l: string) => Number(l.replace('L', ''));
          if (levelNum(b.autonomyLevel) > levelNum(prevLevel)) {
            escalationWarnings.push(
              `Autonomy escalated from ${prevLevel} to ${b.autonomyLevel} — confirm this changes the human oversight level`
            );
          }
        }
        const warnings = [...credentialWarnings, ...escalationWarnings];
        const response: { skill: typeof skill; warnings?: string[] } = { skill };
        if (warnings.length > 0) response.warnings = warnings;
        return response;
      } catch (e) {
        return sendError(reply, 404, toErrorMessage(e));
      }
    }
  );

  app.delete(
    '/api/v1/soul/skills/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.deleteSkill(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/enable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.enableSkill(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.post(
    '/api/v1/soul/skills/:id/disable',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await soulManager.disableSkill(request.params.id);
        return { success: true };
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
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
        return sendError(reply, 400, toErrorMessage(err));
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
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── Users ──────────────────────────────────────────────────

  app.get(
    '/api/v1/soul/users',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return soulManager.listUsers({ limit, offset });
    }
  );

  app.get('/api/v1/soul/owner', async () => {
    const owner = await soulManager.getOwner();
    return { owner };
  });

  app.get(
    '/api/v1/soul/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await soulManager.getUser(request.params.id);
      if (!user) {
        return sendError(reply, 404, 'User not found');
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
        return sendError(reply, 400, toErrorMessage(err));
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
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/soul/users/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await soulManager.deleteUser(request.params.id);
        if (!deleted) {
          return sendError(reply, 404, 'User not found');
        }
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
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

  app.patch(
    '/api/v1/soul/config',
    async (request: FastifyRequest<{ Body: Partial<SoulConfig> }>, reply: FastifyReply) => {
      try {
        await soulManager.updateConfig(request.body);
        return { config: soulManager.getConfig() };
      } catch (e) {
        return sendError(reply, 400, toErrorMessage(e));
      }
    }
  );

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
        return sendError(reply, 400, toErrorMessage(err));
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
          traits: {},
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
          injectDateTime: request.body?.injectDateTime ?? false,
          empathyResonance: request.body?.empathyResonance ?? false,
          avatarUrl: request.body?.avatarUrl ?? null,
          body: request.body?.body ?? {
            enabled: false,
            capabilities: [],
            heartEnabled: true,
            warmupOnActivation: false,
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
              workflows: false,
            },
            selectedServers: [],
            selectedIntegrations: [],
            integrationAccess: [],
            mcpFeatures: {
              exposeGit: false,
              exposeFilesystem: false,
              exposeWeb: false,
              exposeWebScraping: false,
              exposeWebSearch: false,
              exposeBrowser: false,
              exposeDesktopControl: false,
              exposeNetworkDevices: false,
              exposeNetworkDiscovery: false,
              exposeNetworkAudit: false,
              exposeNetBox: false,
              exposeNvd: false,
              exposeNetworkUtils: false,
              exposeTwingate: false,
              exposeGmail: false,
              exposeTwitter: false,
              exposeGithub: false,
              exposeDocker: false,
              exposeCicd: false,
              exposeSra: false,
              exposeDiagramming: false,
              exposePdf: false,
              exposePdfAdvanced: false,
              exposeCognitiveMemory: false,
              exposeCharting: false,
              exposeConstitutional: false,
              exposeTee: false,
              exposeEval: false,
              exposeDlp: false,
              exposeTerminal: false,
              exposeBullshift: false,
              exposePhotisnadi: false,
            },
            proactiveConfig: {
              enabled: false,
              builtins: {
                dailyStandup: false,
                weeklySummary: false,
                contextualFollowup: false,
                integrationHealthAlert: false,
                securityAlertDigest: false,
              },
              builtinModes: {
                dailyStandup: 'auto',
                weeklySummary: 'suggest',
                contextualFollowup: 'suggest',
                integrationHealthAlert: 'auto',
                securityAlertDigest: 'suggest',
              },
              learning: { enabled: true, minConfidence: 0.7 },
            },
            activeHours: {
              enabled: false,
              start: '09:00',
              end: '17:00',
              daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
              timezone: 'UTC',
            },
            pollyLexiconNames: [],
            voiceAnnouncements: false,
            voiceAnnouncementEvents: [],
            omnipresentMind: false,
            knowledgeMode: 'rag' as const,
            enableCitations: false,
            groundednessMode: 'off' as const,
            contextOverflowStrategy: 'summarise' as const,
            confidentialCompute: 'off' as const,
          },
        };

        const personality = await soulManager.createPersonality(data);
        await soulManager.setPersonality(personality.id);

        return await reply.code(201).send({
          agentName: await soulManager.getAgentName(),
          personality: await soulManager.getActivePersonality(),
        });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── Pending Approvals ────────────────────────────────────────

  app.get(
    '/api/v1/soul/approvals',
    async (
      request: FastifyRequest<{
        Querystring: { personalityId?: string; status?: string; limit?: string; offset?: string };
      }>
    ) => {
      if (!approvalManager) return { approvals: [], total: 0 };
      const { personalityId, status } = request.query;
      const { limit, offset } = parsePagination(request.query);
      return approvalManager.listApprovals({
        personalityId,
        status: (status as 'pending' | 'approved' | 'rejected') || undefined,
        limit,
        offset,
      });
    }
  );

  app.get(
    '/api/v1/soul/approvals/count',
    async (request: FastifyRequest<{ Querystring: { personalityId?: string } }>) => {
      if (!approvalManager) return { count: 0 };
      const count = await approvalManager.pendingCount(request.query.personalityId);
      return { count };
    }
  );

  app.post(
    '/api/v1/soul/approvals/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!approvalManager) return sendError(reply, 503, 'Approval manager not available');
      const approval = await approvalManager.resolveApproval(request.params.id, 'approved');
      if (!approval) return sendError(reply, 404, 'Approval not found or already resolved');
      return { approval };
    }
  );

  app.post(
    '/api/v1/soul/approvals/:id/reject',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!approvalManager) return sendError(reply, 503, 'Approval manager not available');
      const approval = await approvalManager.resolveApproval(request.params.id, 'rejected');
      if (!approval) return sendError(reply, 404, 'Approval not found or already resolved');
      return { approval };
    }
  );

  // ── Avatar Upload ────────────────────────────────────────────

  app.post(
    '/api/v1/soul/personalities/:id/avatar',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!dataDir) return sendError(reply, 503, 'Avatar storage not configured');
      const { id } = request.params;

      const personality = await soulManager.getPersonality(id);
      if (!personality) return sendError(reply, 404, 'Personality not found');

      const data = await request.file();
      if (!data) return sendError(reply, 400, 'No file uploaded');

      const mime = data.mimetype;
      const ext = MIME_EXT[mime];
      if (!ext) return sendError(reply, 400, `Unsupported image type: ${mime}`);

      const avatarDir = getAvatarDir(dataDir);
      mkdirSync(avatarDir, { recursive: true });

      // Remove any existing avatar file for this personality
      try {
        const existing = readdirSync(avatarDir).filter((f) => f.startsWith(`${id}.`));
        await Promise.all(existing.map((f) => unlink(join(avatarDir, f))));
      } catch {
        /* ignore */
      }

      const destPath = join(avatarDir, `${id}${ext}`);
      await pipeline(data.file, createWriteStream(destPath));

      // Check if the stream was truncated (file too large)
      if (data.file.truncated) {
        await unlink(destPath).catch((err) =>
          request.log.warn({ err, destPath }, 'Failed to delete oversized avatar file')
        );
        return sendError(reply, 413, 'File too large (max 2 MB)');
      }

      const avatarUrl = `/soul/personalities/${id}/avatar`;
      const updated = await soulManager.updatePersonalityAvatar(id, avatarUrl);
      broadcast?.({ event: 'updated', type: 'personality', id });
      return reply.code(200).send({ personality: updated });
    }
  );

  app.delete(
    '/api/v1/soul/personalities/:id/avatar',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!dataDir) return sendError(reply, 503, 'Avatar storage not configured');
      const { id } = request.params;

      const personality = await soulManager.getPersonality(id);
      if (!personality) return sendError(reply, 404, 'Personality not found');

      // Remove avatar files from filesystem
      if (dataDir) {
        const avatarDir = getAvatarDir(dataDir);
        try {
          const existing = readdirSync(avatarDir).filter((f) => f.startsWith(`${id}.`));
          await Promise.all(existing.map((f) => unlink(join(avatarDir, f))));
        } catch {
          /* ignore — directory may not exist */
        }
      }

      const updated = await soulManager.updatePersonalityAvatar(id, null);
      broadcast?.({ event: 'updated', type: 'personality', id });
      return { personality: updated };
    }
  );

  app.get(
    '/api/v1/soul/personalities/:id/avatar',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!dataDir) return sendError(reply, 503, 'Avatar storage not configured');
      const { id } = request.params;

      const avatarDir = getAvatarDir(dataDir);
      let avatarFile: string | undefined;
      try {
        avatarFile = readdirSync(avatarDir).find((f) => f.startsWith(`${id}.`));
      } catch {
        /* directory doesn't exist */
      }

      if (!avatarFile) return sendError(reply, 404, 'No avatar found');

      const filePath = join(avatarDir, avatarFile);
      const fileExt = extname(avatarFile).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      const contentType = contentTypeMap[fileExt] ?? 'application/octet-stream';

      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=31536000');
      return reply.send(createReadStream(filePath));
    }
  );
}
