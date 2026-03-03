/**
 * Strategy Routes — CRUD API for reasoning strategies.
 *
 * All endpoints under /api/v1/soul/strategies.
 * Auth: soul:read for GET, soul:write for POST/PUT/DELETE.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReasoningStrategyCreateSchema, ReasoningStrategyUpdateSchema } from '@secureyeoman/shared';
import type { StrategyStorage } from './strategy-storage.js';
import type { InputValidator } from '../security/input-validator.js';
import type { AuditChain } from '../logging/audit-chain.js';
import { sendError } from '../utils/errors.js';

export interface StrategyRoutesOptions {
  strategyStorage: StrategyStorage;
  validator?: InputValidator;
  auditChain?: AuditChain;
}

export function registerStrategyRoutes(app: FastifyInstance, opts: StrategyRoutesOptions): void {
  const { strategyStorage, validator, auditChain } = opts;

  function validateStrategyText(
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
          message: `Strategy route input blocked (${source})`,
          userId,
          metadata: { source, reason: result.blockReason },
        });
        return 'Input blocked: invalid content';
      }
    }
    return null;
  }

  // GET /api/v1/soul/strategies — list all strategies
  app.get(
    '/api/v1/soul/strategies',
    async (
      request: FastifyRequest<{
        Querystring: { category?: string; limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { category, limit, offset } = request.query;
      const result = await strategyStorage.listStrategies({
        category: category as Parameters<typeof strategyStorage.listStrategies>[0] extends {
          category?: infer C;
        }
          ? C
          : never,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      return reply.send(result);
    }
  );

  // GET /api/v1/soul/strategies/:id — get by ID
  app.get(
    '/api/v1/soul/strategies/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const strategy = await strategyStorage.getStrategy(request.params.id);
      if (!strategy) {
        return sendError(reply, 404, 'Strategy not found');
      }
      return reply.send(strategy);
    }
  );

  // GET /api/v1/soul/strategies/slug/:slug — get by slug
  app.get(
    '/api/v1/soul/strategies/slug/:slug',
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const strategy = await strategyStorage.getStrategyBySlug(request.params.slug);
      if (!strategy) {
        return sendError(reply, 404, 'Strategy not found');
      }
      return reply.send(strategy);
    }
  );

  // POST /api/v1/soul/strategies — create custom strategy
  app.post('/api/v1/soul/strategies', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ReasoningStrategyCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, parsed.error.message);
    }

    const err = validateStrategyText(
      {
        name: parsed.data.name,
        description: parsed.data.description,
        promptPrefix: parsed.data.promptPrefix,
      },
      'strategy_create',
      (request as unknown as { userId?: string }).userId
    );
    if (err) return sendError(reply, 400, err);

    try {
      const strategy = await strategyStorage.createStrategy(parsed.data);
      return reply.code(201).send(strategy);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return sendError(reply, 409, 'A strategy with this slug already exists');
      }
      return sendError(reply, 500, msg);
    }
  });

  // PUT /api/v1/soul/strategies/:id — update strategy
  app.put(
    '/api/v1/soul/strategies/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parsed = ReasoningStrategyUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.message);
      }

      const fieldsToValidate: Record<string, string | undefined> = {};
      if (parsed.data.name) fieldsToValidate.name = parsed.data.name;
      if (parsed.data.description) fieldsToValidate.description = parsed.data.description;
      if (parsed.data.promptPrefix) fieldsToValidate.promptPrefix = parsed.data.promptPrefix;

      if (Object.keys(fieldsToValidate).length > 0) {
        const err = validateStrategyText(
          fieldsToValidate,
          'strategy_update',
          (request as unknown as { userId?: string }).userId
        );
        if (err) return sendError(reply, 400, err);
      }

      try {
        const strategy = await strategyStorage.updateStrategy(request.params.id, parsed.data);
        if (!strategy) {
          return sendError(reply, 404, 'Strategy not found');
        }
        return reply.send(strategy);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (msg.includes('built-in')) {
          return sendError(reply, 403, msg);
        }
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return sendError(reply, 409, 'A strategy with this slug already exists');
        }
        return sendError(reply, 500, msg);
      }
    }
  );

  // DELETE /api/v1/soul/strategies/:id — delete strategy
  app.delete(
    '/api/v1/soul/strategies/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await strategyStorage.deleteStrategy(request.params.id);
        if (!deleted) {
          return sendError(reply, 404, 'Strategy not found');
        }
        return reply.code(204).send();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (msg.includes('built-in')) {
          return sendError(reply, 403, msg);
        }
        return sendError(reply, 500, msg);
      }
    }
  );
}
