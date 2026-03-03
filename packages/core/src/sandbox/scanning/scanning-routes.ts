/**
 * Scanning Routes — Phase 116: Sandbox Artifact Scanning API
 *
 * REST endpoints for scan history, quarantine management, threat intelligence,
 * manual scanning, and externalization policy.
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ScanHistoryStore } from './scan-history-store.js';
import type { QuarantineStorage } from './quarantine-storage.js';
import type { ScannerPipeline } from './scanner-pipeline.js';
import type { SandboxArtifact } from './types.js';
import type { ExternalizationPolicy } from '@secureyeoman/shared';
import { BUILTIN_THREAT_PATTERNS } from './threat-patterns.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

export interface ScanningRoutesOptions {
  scanHistoryStore?: ScanHistoryStore | null;
  quarantineStorage?: QuarantineStorage | null;
  pipeline?: ScannerPipeline | null;
  policy?: ExternalizationPolicy | null;
  auditChain?: {
    record: (event: string, level: string, message: string, metadata?: Record<string, unknown>) => Promise<void>;
  } | null;
}

export function registerScanningRoutes(app: FastifyInstance, opts: ScanningRoutesOptions): void {
  const { scanHistoryStore, quarantineStorage, pipeline, policy, auditChain } = opts;

  // ── GET /api/v1/sandbox/scans — List scan history ─────────────────────

  app.get('/api/v1/sandbox/scans', async (req, reply) => {
    if (!scanHistoryStore) return sendError(reply, 503, 'Scan history not available');
    const query = req.query as {
      limit?: string;
      offset?: string;
      verdict?: string;
      sourceContext?: string;
      personalityId?: string;
      from?: string;
      to?: string;
    };
    try {
      const result = await scanHistoryStore.list({
        limit: query.limit ? Math.min(Number(query.limit), 100) : undefined,
        offset: query.offset ? Math.max(Number(query.offset), 0) : undefined,
        verdict: query.verdict,
        sourceContext: query.sourceContext,
        personalityId: query.personalityId,
        from: query.from ? Number(query.from) : undefined,
        to: query.to ? Number(query.to) : undefined,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/scans/stats — Aggregated stats ────────────────

  app.get('/api/v1/sandbox/scans/stats', async (_req, reply) => {
    if (!scanHistoryStore) return sendError(reply, 503, 'Scan history not available');
    try {
      const stats = await scanHistoryStore.getStats();
      return reply.send({ stats });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/scans/:id — Scan details ─────────────────────

  app.get('/api/v1/sandbox/scans/:id', async (req, reply) => {
    if (!scanHistoryStore) return sendError(reply, 503, 'Scan history not available');
    const { id } = req.params as { id: string };
    try {
      const record = await scanHistoryStore.getById(id);
      if (!record) return sendError(reply, 404, 'Scan record not found');
      return reply.send({ record });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/quarantine — List quarantined items ───────────

  app.get('/api/v1/sandbox/quarantine', async (_req, reply) => {
    if (!quarantineStorage) return sendError(reply, 503, 'Quarantine storage not available');
    try {
      const items = await quarantineStorage.list();
      return reply.send({ items });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/quarantine/:id — Quarantine entry details ─────

  app.get('/api/v1/sandbox/quarantine/:id', async (req, reply) => {
    if (!quarantineStorage) return sendError(reply, 503, 'Quarantine storage not available');
    const { id } = req.params as { id: string };
    try {
      const entry = await quarantineStorage.get(id);
      if (!entry) return sendError(reply, 404, 'Quarantine entry not found');
      return reply.send({ entry });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/sandbox/quarantine/:id/approve — Approve and release ─

  app.post('/api/v1/sandbox/quarantine/:id/approve', async (req, reply) => {
    if (!quarantineStorage) return sendError(reply, 503, 'Quarantine storage not available');
    const { id } = req.params as { id: string };
    const userId = (req as any).authUser?.userId ?? 'unknown';
    try {
      const entry = await quarantineStorage.get(id);
      if (!entry) return sendError(reply, 404, 'Quarantine entry not found');

      await quarantineStorage.approve(id, userId);

      if (auditChain) {
        try {
          await auditChain.record(
            'artifact_released',
            'info',
            `Quarantined artifact ${id} approved by ${userId}`,
            { quarantineId: id, approvedBy: userId },
          );
        } catch {
          // Non-critical
        }
      }

      return reply.send({ message: 'Quarantine entry approved', id });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── DELETE /api/v1/sandbox/quarantine/:id — Permanently delete ────────

  app.delete('/api/v1/sandbox/quarantine/:id', async (req, reply) => {
    if (!quarantineStorage) return sendError(reply, 503, 'Quarantine storage not available');
    const { id } = req.params as { id: string };
    try {
      const entry = await quarantineStorage.get(id);
      if (!entry) return sendError(reply, 404, 'Quarantine entry not found');

      await quarantineStorage.delete(id);
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/threats — Threat intelligence summary ─────────

  app.get('/api/v1/sandbox/threats', async (_req, reply) => {
    try {
      const patterns = BUILTIN_THREAT_PATTERNS.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        killChainStage: p.killChainStage,
        intentWeight: p.intentWeight,
        version: p.version,
        indicatorCount: p.indicators.length,
      }));
      const categories = [...new Set(patterns.map((p) => p.category))];
      const stages = [...new Set(patterns.map((p) => p.killChainStage))];
      return reply.send({
        patternCount: patterns.length,
        categories,
        stages,
        patterns,
      });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/sandbox/scan — Manual artifact scan (admin) ──────────

  app.post('/api/v1/sandbox/scan', async (req, reply) => {
    if (!pipeline) return sendError(reply, 503, 'Scanning pipeline not available');
    const body = req.body as { content?: string; type?: string; sourceContext?: string } | undefined;
    if (!body?.content) {
      return sendError(reply, 400, 'content is required');
    }
    try {
      const artifact: SandboxArtifact = {
        id: randomUUID(),
        type: body.type ?? 'text/plain',
        content: body.content,
        sourceContext: body.sourceContext ?? 'manual-scan',
        userId: (req as any).authUser?.userId,
        sizeBytes: Buffer.byteLength(body.content),
      };
      const scanResult = await pipeline.scan(artifact);

      if (scanHistoryStore) {
        try {
          await scanHistoryStore.record({
            artifactId: artifact.id,
            artifactType: artifact.type,
            sourceContext: artifact.sourceContext,
            userId: artifact.userId,
            scanResult,
          });
        } catch {
          // Non-critical
        }
      }

      return reply.send({ scanResult });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/sandbox/policy — Current externalization policy ───────

  app.get('/api/v1/sandbox/policy', async (_req, reply) => {
    try {
      return reply.send({ policy: policy ?? { enabled: false } });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
