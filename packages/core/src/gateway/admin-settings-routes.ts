/**
 * Admin Settings Routes — CRUD for system preferences (database-backed).
 *
 * Provides a REST API for reading and writing admin-level settings stored
 * in the `system_preferences` table. These replace environment variables
 * for settings that operators may want to change at runtime.
 *
 * Route: GET/PATCH /api/v1/admin/settings
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SystemPreferencesStorage } from '../config/system-preferences-storage.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

/** Settings that can be managed via the admin API. */
const KNOWN_SETTINGS = ['external_url', 'oauth_redirect_base_url'] as const;

export interface AdminSettingsRoutesOptions {
  systemPreferences: SystemPreferencesStorage;
}

export function registerAdminSettingsRoutes(
  app: FastifyInstance,
  opts: AdminSettingsRoutesOptions
): void {
  const { systemPreferences } = opts;

  // GET /api/v1/admin/settings — list all admin settings
  app.get('/api/v1/admin/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const all = await systemPreferences.list();
      const settings: Record<string, string | null> = {};
      for (const key of KNOWN_SETTINGS) {
        const entry = all.find((p) => p.key === key);
        settings[key] = entry?.value ?? null;
      }
      return reply.send({ settings });
    } catch (err) {
      return sendError(reply, 500, `Failed to read settings: ${toErrorMessage(err)}`);
    }
  });

  // PATCH /api/v1/admin/settings — update one or more settings
  app.patch('/api/v1/admin/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    try {
      const updated: Record<string, string | null> = {};

      for (const [key, value] of Object.entries(body)) {
        if (!(KNOWN_SETTINGS as readonly string[]).includes(key)) {
          return sendError(
            reply,
            400,
            `Unknown setting: ${key}. Valid: ${KNOWN_SETTINGS.join(', ')}`
          );
        }

        if (value === null || value === '') {
          await systemPreferences.delete(key);
          updated[key] = null;
        } else if (typeof value === 'string') {
          // Strip trailing slashes from URLs
          const cleaned = value.replace(/\/$/, '');
          await systemPreferences.set(key, cleaned);
          updated[key] = cleaned;
        } else {
          return sendError(reply, 400, `Setting "${key}" must be a string or null`);
        }
      }

      return reply.send({ updated });
    } catch (err) {
      return sendError(reply, 500, `Failed to update settings: ${toErrorMessage(err)}`);
    }
  });
}
