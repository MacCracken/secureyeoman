/**
 * A2AStorage — PostgreSQL-backed storage for A2A peer agents and messages.
 *
 * Extends PgBaseStorage for query helpers and transaction support.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { PeerAgent, Capability, A2AMessage, A2AMessageType, TrustLevel } from './types.js';

// ─── Row types ──────────────────────────────────────────────────────

interface PeerRow {
  id: string;
  name: string;
  url: string;
  public_key: string;
  trust_level: TrustLevel;
  last_seen: string;
  status: 'online' | 'offline' | 'unknown';
  created_at: string;
  updated_at: string;
}

interface CapabilityRow {
  id: string;
  peer_id: string;
  name: string;
  description: string;
  version: string;
}

interface MessageRow {
  id: string;
  type: A2AMessageType;
  from_peer_id: string;
  to_peer_id: string;
  payload: unknown;
  timestamp: string;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function peerFromRow(row: PeerRow, capabilities: Capability[]): PeerAgent {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    publicKey: row.public_key,
    trustLevel: row.trust_level,
    capabilities,
    lastSeen: new Date(row.last_seen).getTime(),
    status: row.status,
  };
}

function capabilityFromRow(row: CapabilityRow): Capability {
  return {
    name: row.name,
    description: row.description,
    version: row.version,
  };
}

function messageFromRow(row: MessageRow): A2AMessage {
  return {
    id: row.id,
    type: row.type,
    fromPeerId: row.from_peer_id,
    toPeerId: row.to_peer_id,
    payload: row.payload,
    timestamp: new Date(row.timestamp).getTime(),
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class A2AStorage extends PgBaseStorage {
  // ── Peer operations ──────────────────────────────────────────

  async addPeer(data: {
    id?: string;
    name: string;
    url: string;
    publicKey: string;
    trustLevel?: TrustLevel;
    status?: 'online' | 'offline' | 'unknown';
  }): Promise<PeerAgent> {
    const id = data.id ?? uuidv7();
    const row = await this.queryOne<PeerRow>(
      `INSERT INTO a2a.peers (id, name, url, public_key, trust_level, status, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         public_key = EXCLUDED.public_key,
         status = EXCLUDED.status,
         last_seen = now(),
         updated_at = now()
       RETURNING *`,
      [
        id,
        data.name,
        data.url,
        data.publicKey,
        data.trustLevel ?? 'untrusted',
        data.status ?? 'online',
      ]
    );
    const caps = await this.getCapabilities(row!.id);
    return peerFromRow(row!, caps);
  }

  async getPeer(id: string): Promise<PeerAgent | null> {
    const row = await this.queryOne<PeerRow>(`SELECT * FROM a2a.peers WHERE id = $1`, [id]);
    if (!row) return null;
    const caps = await this.getCapabilities(id);
    return peerFromRow(row, caps);
  }

  async listPeers(filter?: {
    status?: string;
    trustLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ peers: PeerAgent[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIdx++}`);
      values.push(filter.status);
    }
    if (filter?.trustLevel) {
      conditions.push(`trust_level = $${paramIdx++}`);
      values.push(filter.trustLevel);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM a2a.peers ${where}`,
      values
    );

    const rows = await this.queryMany<PeerRow>(
      `SELECT * FROM a2a.peers ${where} ORDER BY last_seen DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    const peers: PeerAgent[] = [];
    for (const row of rows) {
      const caps = await this.getCapabilities(row.id);
      peers.push(peerFromRow(row, caps));
    }

    return {
      peers,
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async updatePeer(
    id: string,
    data: Partial<{
      name: string;
      url: string;
      publicKey: string;
      trustLevel: TrustLevel;
      status: 'online' | 'offline' | 'unknown';
      lastSeen: number;
    }>
  ): Promise<PeerAgent | null> {
    const existing = await this.getPeer(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      values.push(data.name);
    }
    if (data.url !== undefined) {
      updates.push(`url = $${paramIdx++}`);
      values.push(data.url);
    }
    if (data.publicKey !== undefined) {
      updates.push(`public_key = $${paramIdx++}`);
      values.push(data.publicKey);
    }
    if (data.trustLevel !== undefined) {
      updates.push(`trust_level = $${paramIdx++}`);
      values.push(data.trustLevel);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      values.push(data.status);
    }
    if (data.lastSeen !== undefined) {
      updates.push(`last_seen = to_timestamp($${paramIdx++} / 1000.0)`);
      values.push(data.lastSeen);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = now()');
    values.push(id);

    const row = await this.queryOne<PeerRow>(
      `UPDATE a2a.peers SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    if (!row) return null;
    const caps = await this.getCapabilities(id);
    return peerFromRow(row, caps);
  }

  async removePeer(id: string): Promise<boolean> {
    // Capabilities are removed via ON DELETE CASCADE (or manually)
    await this.execute(`DELETE FROM a2a.capabilities WHERE peer_id = $1`, [id]);
    const count = await this.execute(`DELETE FROM a2a.peers WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Capability operations ────────────────────────────────────

  async setCapabilities(peerId: string, caps: Capability[]): Promise<void> {
    await this.withTransaction(async (client) => {
      await client.query(`DELETE FROM a2a.capabilities WHERE peer_id = $1`, [peerId]);
      for (const cap of caps) {
        const id = uuidv7();
        await client.query(
          `INSERT INTO a2a.capabilities (id, peer_id, name, description, version)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, peerId, cap.name, cap.description, cap.version]
        );
      }
    });
  }

  async getCapabilities(peerId: string): Promise<Capability[]> {
    const rows = await this.queryMany<CapabilityRow>(
      `SELECT * FROM a2a.capabilities WHERE peer_id = $1 ORDER BY name ASC`,
      [peerId]
    );
    return rows.map(capabilityFromRow);
  }

  async searchCapabilities(query: string): Promise<{ peerId: string; capability: Capability }[]> {
    const pattern = `%${query}%`;
    const rows = await this.queryMany<CapabilityRow>(
      `SELECT * FROM a2a.capabilities
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY name ASC`,
      [pattern]
    );
    return rows.map((row) => ({
      peerId: row.peer_id,
      capability: capabilityFromRow(row),
    }));
  }

  // ── Message operations ───────────────────────────────────────

  async logMessage(msg: A2AMessage): Promise<void> {
    await this.query(
      `INSERT INTO a2a.messages (id, type, from_peer_id, to_peer_id, payload, timestamp)
       VALUES ($1, $2, $3, $4, $5::jsonb, to_timestamp($6 / 1000.0))`,
      [msg.id, msg.type, msg.fromPeerId, msg.toPeerId, JSON.stringify(msg.payload), msg.timestamp]
    );
  }

  async listMessages(filter?: {
    peerId?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: A2AMessage[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.peerId) {
      conditions.push(`(from_peer_id = $${paramIdx} OR to_peer_id = $${paramIdx})`);
      values.push(filter.peerId);
      paramIdx++;
    }
    if (filter?.type) {
      conditions.push(`type = $${paramIdx++}`);
      values.push(filter.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM a2a.messages ${where}`,
      values
    );

    const rows = await this.queryMany<MessageRow>(
      `SELECT * FROM a2a.messages ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    return {
      messages: rows.map(messageFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }
}
