/**
 * EdgeStore — Postgres-backed CRUD for edge fleet management.
 *
 * Tables: edge.nodes, edge.deployments, edge.ota_updates
 */

import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Row types ────────────────────────────────────────────────────────────────

export interface EdgeNodeRow {
  id: string;
  peerId: string | null;
  nodeId: string;
  hostname: string;
  arch: string;
  platform: string;
  totalMemoryMb: number;
  cpuCores: number;
  hasGpu: boolean;
  tags: string[];
  bandwidthMbps: number | null;
  latencyMs: number | null;
  wireguardPubkey: string | null;
  wireguardEndpoint: string | null;
  wireguardIp: string | null;
  currentVersion: string;
  lastUpdateCheck: string | null;
  status: 'registered' | 'online' | 'offline' | 'decommissioned';
  lastHeartbeat: string;
  registeredAt: string;
  updatedAt: string;
}

export interface EdgeDeploymentRow {
  id: string;
  nodeId: string;
  taskType: string;
  configJson: Record<string, unknown>;
  status: 'pending' | 'deploying' | 'running' | 'stopped' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface OtaUpdateRow {
  id: string;
  nodeId: string;
  fromVersion: string;
  toVersion: string;
  sha256: string | null;
  ed25519Signature: string | null;
  status: 'pending' | 'downloading' | 'verifying' | 'applied' | 'failed' | 'rolled_back';
  errorMessage: string | null;
  initiatedAt: string;
  completedAt: string | null;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapNodeRow(r: Record<string, unknown>): EdgeNodeRow {
  return {
    id: r.id as string,
    peerId: r.peer_id as string | null,
    nodeId: r.node_id as string,
    hostname: r.hostname as string,
    arch: r.arch as string,
    platform: r.platform as string,
    totalMemoryMb: r.total_memory_mb as number,
    cpuCores: r.cpu_cores as number,
    hasGpu: r.has_gpu as boolean,
    tags: (r.tags as string[]) ?? [],
    bandwidthMbps: r.bandwidth_mbps as number | null,
    latencyMs: r.latency_ms as number | null,
    wireguardPubkey: r.wireguard_pubkey as string | null,
    wireguardEndpoint: r.wireguard_endpoint as string | null,
    wireguardIp: r.wireguard_ip as string | null,
    currentVersion: r.current_version as string,
    lastUpdateCheck: r.last_update_check as string | null,
    status: r.status as EdgeNodeRow['status'],
    lastHeartbeat: r.last_heartbeat as string,
    registeredAt: r.registered_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapDeploymentRow(r: Record<string, unknown>): EdgeDeploymentRow {
  return {
    id: r.id as string,
    nodeId: r.node_id as string,
    taskType: r.task_type as string,
    configJson: (r.config_json as Record<string, unknown>) ?? {},
    status: r.status as EdgeDeploymentRow['status'],
    errorMessage: r.error_message as string | null,
    createdAt: r.created_at as string,
    startedAt: r.started_at as string | null,
    stoppedAt: r.stopped_at as string | null,
  };
}

function mapOtaRow(r: Record<string, unknown>): OtaUpdateRow {
  return {
    id: r.id as string,
    nodeId: r.node_id as string,
    fromVersion: r.from_version as string,
    toVersion: r.to_version as string,
    sha256: r.sha256 as string | null,
    ed25519Signature: r.ed25519_signature as string | null,
    status: r.status as OtaUpdateRow['status'],
    errorMessage: r.error_message as string | null,
    initiatedAt: r.initiated_at as string,
    completedAt: r.completed_at as string | null,
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

export class EdgeStore {
  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  // ── Nodes ──────────────────────────────────────────────────────────────

  async upsertNode(node: {
    nodeId: string;
    hostname: string;
    arch: string;
    platform: string;
    totalMemoryMb: number;
    cpuCores: number;
    hasGpu: boolean;
    tags: string[];
    currentVersion?: string;
    peerId?: string;
    bandwidthMbps?: number;
    latencyMs?: number;
  }): Promise<EdgeNodeRow> {
    const sql = `
      INSERT INTO edge.nodes (node_id, hostname, arch, platform, total_memory_mb, cpu_cores,
        has_gpu, tags, current_version, peer_id, bandwidth_mbps, latency_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (node_id) DO UPDATE SET
        hostname = EXCLUDED.hostname,
        arch = EXCLUDED.arch,
        platform = EXCLUDED.platform,
        total_memory_mb = EXCLUDED.total_memory_mb,
        cpu_cores = EXCLUDED.cpu_cores,
        has_gpu = EXCLUDED.has_gpu,
        tags = EXCLUDED.tags,
        current_version = COALESCE(EXCLUDED.current_version, edge.nodes.current_version),
        peer_id = COALESCE(EXCLUDED.peer_id, edge.nodes.peer_id),
        bandwidth_mbps = COALESCE(EXCLUDED.bandwidth_mbps, edge.nodes.bandwidth_mbps),
        latency_ms = COALESCE(EXCLUDED.latency_ms, edge.nodes.latency_ms),
        status = 'online',
        last_heartbeat = now(),
        updated_at = now()
      RETURNING *`;
    const { rows } = await this.pool.query(sql, [
      node.nodeId,
      node.hostname,
      node.arch,
      node.platform,
      node.totalMemoryMb,
      node.cpuCores,
      node.hasGpu,
      node.tags,
      node.currentVersion ?? 'unknown',
      node.peerId ?? null,
      node.bandwidthMbps ?? null,
      node.latencyMs ?? null,
    ]);
    return mapNodeRow(rows[0]);
  }

  async getNode(id: string): Promise<EdgeNodeRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM edge.nodes WHERE id = $1', [id]);
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async getNodeByNodeId(nodeId: string): Promise<EdgeNodeRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM edge.nodes WHERE node_id = $1', [nodeId]);
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async listNodes(filters?: {
    status?: string;
    arch?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<EdgeNodeRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.arch) {
      conditions.push(`arch = $${idx++}`);
      params.push(filters.arch);
    }
    if (filters?.tags?.length) {
      conditions.push(`tags @> $${idx++}`);
      params.push(filters.tags);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 100;
    const offset = filters?.offset ?? 0;
    params.push(limit, offset);

    const sql = `SELECT * FROM edge.nodes ${where} ORDER BY last_heartbeat DESC LIMIT $${idx++} OFFSET $${idx}`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(mapNodeRow);
  }

  async updateNodeStatus(id: string, status: EdgeNodeRow['status']): Promise<EdgeNodeRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE edge.nodes SET status = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async updateNodeHeartbeat(
    id: string,
    opts?: {
      bandwidthMbps?: number;
      latencyMs?: number;
      currentVersion?: string;
    }
  ): Promise<EdgeNodeRow | null> {
    const sets = ['last_heartbeat = now()', "status = 'online'", 'updated_at = now()'];
    const params: unknown[] = [id];
    let idx = 2;

    if (opts?.bandwidthMbps !== undefined) {
      sets.push(`bandwidth_mbps = $${idx++}`);
      params.push(opts.bandwidthMbps);
    }
    if (opts?.latencyMs !== undefined) {
      sets.push(`latency_ms = $${idx++}`);
      params.push(opts.latencyMs);
    }
    if (opts?.currentVersion) {
      sets.push(`current_version = $${idx}`);
      params.push(opts.currentVersion);
    }

    const sql = `UPDATE edge.nodes SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async updateWireguard(
    id: string,
    wg: { pubkey: string; endpoint: string; ip: string }
  ): Promise<EdgeNodeRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE edge.nodes SET wireguard_pubkey = $2, wireguard_endpoint = $3,
       wireguard_ip = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, wg.pubkey, wg.endpoint, wg.ip]
    );
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async decommissionNode(id: string): Promise<EdgeNodeRow | null> {
    const { rows } = await this.pool.query(
      `UPDATE edge.nodes SET status = 'decommissioned', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  async deleteNode(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM edge.nodes WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  // ── Capability-based routing (Phase 14C) ───────────────────────────────

  async findBestNodeForTask(requirements: {
    minMemoryMb?: number;
    minCores?: number;
    needsGpu?: boolean;
    arch?: string;
    tags?: string[];
    maxLatencyMs?: number;
  }): Promise<EdgeNodeRow | null> {
    const conditions = ["status = 'online'"];
    const params: unknown[] = [];
    let idx = 1;

    if (requirements.minMemoryMb) {
      conditions.push(`total_memory_mb >= $${idx++}`);
      params.push(requirements.minMemoryMb);
    }
    if (requirements.minCores) {
      conditions.push(`cpu_cores >= $${idx++}`);
      params.push(requirements.minCores);
    }
    if (requirements.needsGpu) {
      conditions.push('has_gpu = true');
    }
    if (requirements.arch) {
      conditions.push(`arch = $${idx++}`);
      params.push(requirements.arch);
    }
    if (requirements.tags?.length) {
      conditions.push(`tags @> $${idx++}`);
      params.push(requirements.tags);
    }
    if (requirements.maxLatencyMs) {
      conditions.push(`(latency_ms IS NULL OR latency_ms <= $${idx})`);
      params.push(requirements.maxLatencyMs);
    }

    // Score: prefer more memory, more cores, lower latency, available bandwidth
    const sql = `
      SELECT *, (
        total_memory_mb * 0.001 + cpu_cores * 10 +
        CASE WHEN has_gpu THEN 100 ELSE 0 END -
        COALESCE(latency_ms, 50) * 0.1 +
        COALESCE(bandwidth_mbps, 100) * 0.01
      ) AS score
      FROM edge.nodes
      WHERE ${conditions.join(' AND ')}
      ORDER BY score DESC
      LIMIT 1`;

    const { rows } = await this.pool.query(sql, params);
    return rows[0] ? mapNodeRow(rows[0]) : null;
  }

  // ── Deployments ────────────────────────────────────────────────────────

  async createDeployment(deployment: {
    nodeId: string;
    taskType: string;
    configJson?: Record<string, unknown>;
  }): Promise<EdgeDeploymentRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO edge.deployments (node_id, task_type, config_json)
       VALUES ($1, $2, $3) RETURNING *`,
      [deployment.nodeId, deployment.taskType, JSON.stringify(deployment.configJson ?? {})]
    );
    return mapDeploymentRow(rows[0]);
  }

  async getDeployment(id: string): Promise<EdgeDeploymentRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM edge.deployments WHERE id = $1', [id]);
    return rows[0] ? mapDeploymentRow(rows[0]) : null;
  }

  async listDeployments(nodeId?: string): Promise<EdgeDeploymentRow[]> {
    const sql = nodeId
      ? 'SELECT * FROM edge.deployments WHERE node_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM edge.deployments ORDER BY created_at DESC';
    const { rows } = await this.pool.query(sql, nodeId ? [nodeId] : []);
    return rows.map(mapDeploymentRow);
  }

  async updateDeploymentStatus(
    id: string,
    update: { status: EdgeDeploymentRow['status']; errorMessage?: string }
  ): Promise<EdgeDeploymentRow | null> {
    const sets = ['status = $2'];
    const params: unknown[] = [id, update.status];
    const idx = 3;

    if (update.status === 'running') {
      sets.push('started_at = now()');
    }
    if (update.status === 'stopped' || update.status === 'failed') {
      sets.push('stopped_at = now()');
    }
    if (update.errorMessage) {
      sets.push(`error_message = $${idx}`);
      params.push(update.errorMessage);
    }

    const sql = `UPDATE edge.deployments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    return rows[0] ? mapDeploymentRow(rows[0]) : null;
  }

  // ── OTA Updates ────────────────────────────────────────────────────────

  async createOtaUpdate(update: {
    nodeId: string;
    fromVersion: string;
    toVersion: string;
    sha256?: string;
    ed25519Signature?: string;
  }): Promise<OtaUpdateRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO edge.ota_updates (node_id, from_version, to_version, sha256, ed25519_signature)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        update.nodeId,
        update.fromVersion,
        update.toVersion,
        update.sha256 ?? null,
        update.ed25519Signature ?? null,
      ]
    );
    return mapOtaRow(rows[0]);
  }

  async updateOtaStatus(
    id: string,
    update: { status: OtaUpdateRow['status']; errorMessage?: string }
  ): Promise<OtaUpdateRow | null> {
    const isTerminal = ['applied', 'failed', 'rolled_back'].includes(update.status);
    const completedAt = isTerminal ? ', completed_at = now()' : '';
    const errClause = update.errorMessage ? ', error_message = $3' : '';
    const params: unknown[] = [id, update.status];
    if (update.errorMessage) params.push(update.errorMessage);

    const sql = `UPDATE edge.ota_updates SET status = $2${completedAt}${errClause} WHERE id = $1 RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    return rows[0] ? mapOtaRow(rows[0]) : null;
  }

  async listOtaUpdates(nodeId: string): Promise<OtaUpdateRow[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM edge.ota_updates WHERE node_id = $1 ORDER BY initiated_at DESC',
      [nodeId]
    );
    return rows.map(mapOtaRow);
  }
}
