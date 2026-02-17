/**
 * Comms Storage — PostgreSQL-backed storage for peer agents and message logs.
 */

import type { AgentIdentity, MessageType, MessageLogQuery } from './types.js';
import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

interface MessageLogRow {
  id: string;
  direction: string;
  peer_agent_id: string;
  message_type: string;
  encrypted_payload: string;
  timestamp: number;
}

function rowToPeer(row: Record<string, unknown>): AgentIdentity {
  return {
    id: row.id as string,
    name: row.name as string,
    publicKey: row.public_key as string,
    signingKey: row.signing_key as string,
    endpoint: row.endpoint as string,
    capabilities: row.capabilities as string[],
    lastSeenAt: row.last_seen_at as number,
  };
}

export class CommsStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Peers ────────────────────────────────────────────────────

  async addPeer(identity: AgentIdentity): Promise<void> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO comms.peers
        (id, name, public_key, signing_key, endpoint, capabilities, last_seen_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET
         name = $2, public_key = $3, signing_key = $4,
         endpoint = $5, capabilities = $6, last_seen_at = $7`,
      [
        identity.id,
        identity.name,
        identity.publicKey,
        identity.signingKey,
        identity.endpoint,
        JSON.stringify(identity.capabilities),
        identity.lastSeenAt,
        now,
      ]
    );
  }

  async getPeer(id: string): Promise<AgentIdentity | null> {
    const row = await this.queryOne<Record<string, unknown>>(
      'SELECT * FROM comms.peers WHERE id = $1',
      [id]
    );
    return row ? rowToPeer(row) : null;
  }

  async listPeers(): Promise<AgentIdentity[]> {
    const rows = await this.queryMany<Record<string, unknown>>(
      'SELECT * FROM comms.peers ORDER BY last_seen_at DESC'
    );
    return rows.map(rowToPeer);
  }

  async removePeer(id: string): Promise<boolean> {
    const changes = await this.execute('DELETE FROM comms.peers WHERE id = $1', [id]);
    return changes > 0;
  }

  async updatePeerLastSeen(id: string): Promise<void> {
    await this.execute('UPDATE comms.peers SET last_seen_at = $1 WHERE id = $2', [Date.now(), id]);
  }

  async getPeerCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM comms.peers');
    return parseInt(row?.count ?? '0', 10);
  }

  // ── Message Log ──────────────────────────────────────────────

  async logMessage(
    direction: 'sent' | 'received',
    peerAgentId: string,
    messageType: MessageType,
    encryptedPayload: string
  ): Promise<string> {
    const id = uuidv7();
    await this.execute(
      `INSERT INTO comms.message_log
        (id, direction, peer_agent_id, message_type, encrypted_payload, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, direction, peerAgentId, messageType, encryptedPayload, Date.now()]
    );
    return id;
  }

  async queryMessageLog(query: MessageLogQuery = {}): Promise<MessageLogRow[]> {
    let paramIdx = 1;
    let sql = 'SELECT * FROM comms.message_log WHERE 1=1';
    const params: unknown[] = [];

    if (query.peerId) {
      sql += ` AND peer_agent_id = $${paramIdx}`;
      params.push(query.peerId);
      paramIdx += 1;
    }
    if (query.type) {
      sql += ` AND message_type = $${paramIdx}`;
      params.push(query.type);
      paramIdx += 1;
    }

    sql += ' ORDER BY timestamp DESC';

    if (query.limit) {
      sql += ` LIMIT $${paramIdx}`;
      params.push(query.limit);
      paramIdx += 1;
    }

    return this.queryMany<MessageLogRow>(sql, params);
  }

  async pruneOldMessages(retentionDays: number): Promise<number> {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    return this.execute('DELETE FROM comms.message_log WHERE timestamp < $1', [cutoff]);
  }

  async getMessageCount(): Promise<number> {
    const row = await this.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM comms.message_log'
    );
    return parseInt(row?.count ?? '0', 10);
  }
}
