/**
 * SCIM 2.0 Provisioning Routes
 *
 * Implements the SCIM 2.0 protocol (RFC 7644) for automated user/group
 * provisioning from identity providers (Okta, Azure AD, etc.).
 *
 * All endpoints are enterprise-gated via the sso_saml license feature.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { ScimManager, ScimError, SCIM_SCHEMAS } from './scim.js';
import type { ScimPatchRequest } from './scim.js';
import { ScimStorage } from './scim-storage.js';
import { licenseGuard } from '../licensing/license-guard.js';
import { sendError } from '../utils/errors.js';

// ── Route options ────────────────────────────────────────────────────

export interface ScimRoutesOptions {
  secureYeoman?: SecureYeoman;
  scimManager?: ScimManager;
}

// ── Registration ─────────────────────────────────────────────────────

export function registerScimRoutes(app: FastifyInstance, opts: ScimRoutesOptions): void {
  const { secureYeoman } = opts;
  const manager = opts.scimManager ?? new ScimManager(new ScimStorage());
  const guardOpts = licenseGuard('sso_saml', secureYeoman);

  const PREFIX = '/api/v1/scim/v2';

  // ── Users ─────────────────────────────────────────────────────────

  app.get(
    `${PREFIX}/Users`,
    guardOpts as Record<string, unknown>,
    async (
      request: FastifyRequest<{
        Querystring: { filter?: string; startIndex?: string; count?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { filter, startIndex, count } = request.query;
        const result = await manager.listUsers(
          filter,
          startIndex ? parseInt(startIndex, 10) : 1,
          count ? parseInt(count, 10) : 100
        );
        return reply.send(result);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.post(
    `${PREFIX}/Users`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const resource = await manager.createUser(request.body as Record<string, unknown>);
        return reply.code(201).send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.get(
    `${PREFIX}/Users/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.getUser(request.params.id);
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.put(
    `${PREFIX}/Users/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.replaceUser(
          request.params.id,
          request.body as Record<string, unknown>
        );
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.patch(
    `${PREFIX}/Users/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.patchUser(
          request.params.id,
          request.body as ScimPatchRequest
        );
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.delete(
    `${PREFIX}/Users/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await manager.deleteUser(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  // ── Groups ────────────────────────────────────────────────────────

  app.get(
    `${PREFIX}/Groups`,
    guardOpts as Record<string, unknown>,
    async (
      request: FastifyRequest<{
        Querystring: { filter?: string; startIndex?: string; count?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { filter, startIndex, count } = request.query;
        const result = await manager.listGroups(
          filter,
          startIndex ? parseInt(startIndex, 10) : 1,
          count ? parseInt(count, 10) : 100
        );
        return reply.send(result);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.post(
    `${PREFIX}/Groups`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const resource = await manager.createGroup(request.body as Record<string, unknown>);
        return reply.code(201).send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.get(
    `${PREFIX}/Groups/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.getGroup(request.params.id);
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.put(
    `${PREFIX}/Groups/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.replaceGroup(
          request.params.id,
          request.body as Record<string, unknown>
        );
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.patch(
    `${PREFIX}/Groups/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const resource = await manager.patchGroup(
          request.params.id,
          request.body as ScimPatchRequest
        );
        return reply.send(resource);
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  app.delete(
    `${PREFIX}/Groups/:id`,
    guardOpts as Record<string, unknown>,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await manager.deleteGroup(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return handleScimError(reply, err);
      }
    }
  );

  // ── Discovery endpoints ───────────────────────────────────────────

  app.get(
    `${PREFIX}/ServiceProviderConfig`,
    guardOpts as Record<string, unknown>,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
        documentationUri: 'https://docs.secureyeoman.io/scim',
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
          {
            type: 'oauthbearertoken',
            name: 'OAuth Bearer Token',
            description: 'Authentication scheme using the OAuth Bearer Token Standard',
            specUri: 'https://www.rfc-editor.org/info/rfc6750',
            primary: true,
          },
        ],
      });
    }
  );

  app.get(
    `${PREFIX}/ResourceTypes`,
    guardOpts as Record<string, unknown>,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send([
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          description: 'User Account',
          schema: SCIM_SCHEMAS.User,
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/Groups',
          description: 'Group',
          schema: SCIM_SCHEMAS.Group,
        },
      ]);
    }
  );

  app.get(
    `${PREFIX}/Schemas`,
    guardOpts as Record<string, unknown>,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send([
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: SCIM_SCHEMAS.User,
          name: 'User',
          description: 'User Account',
          attributes: [
            {
              name: 'userName',
              type: 'string',
              multiValued: false,
              required: true,
              uniqueness: 'server',
            },
            { name: 'displayName', type: 'string', multiValued: false, required: false },
            { name: 'emails', type: 'complex', multiValued: true, required: false },
            { name: 'active', type: 'boolean', multiValued: false, required: false },
            { name: 'externalId', type: 'string', multiValued: false, required: false },
            { name: 'roles', type: 'string', multiValued: true, required: false },
          ],
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: SCIM_SCHEMAS.Group,
          name: 'Group',
          description: 'Group',
          attributes: [
            {
              name: 'displayName',
              type: 'string',
              multiValued: false,
              required: true,
              uniqueness: 'server',
            },
            { name: 'members', type: 'complex', multiValued: true, required: false },
            { name: 'externalId', type: 'string', multiValued: false, required: false },
          ],
        },
      ]);
    }
  );
}

// ── Error handler ───────────────────────────────────────────────────

function handleScimError(reply: FastifyReply, err: unknown) {
  if (err instanceof ScimError) {
    return reply.code(err.statusCode).send(ScimManager.scimError(err.message, err.statusCode));
  }
  return sendError(reply, 500, err instanceof Error ? err.message : 'Internal server error');
}
