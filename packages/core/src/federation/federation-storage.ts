/**
 * FederationStorage — PostgreSQL-backed storage for federation peers and sync log.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

export interface FederationPeer {
  id: string;
  name: string;
  url: string;
  sharedSecretHash: string;
  sharedSecretEnc: string;
  status: 'online' | 'offline' | 'unknown';
  features: { knowledge: boolean; marketplace: boolean; personalities: boolean };
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncLogEntry {
  id: string;
  peerId: string;
  type: 'knowledge_search' | 'skill_install' | 'personality_import' | 'health_check';
  status: 'success' | 'error';
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface PeerRow {
  id: string;
  name: string;
  url: string;
  shared_secret_hash: string;
  shared_secret_enc: string;
  status: string;
  features: unknown;
  last_seen: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToPeer(row: PeerRow): FederationPeer {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    sharedSecretHash: row.shared_secret_hash,
    sharedSecretEnc: row.shared_secret_enc,
    status: row.status as FederationPeer['status'],
    features: row.features as FederationPeer['features'],
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FederationStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  async create(peer: Omit<FederationPeer, 'createdAt' | 'updatedAt'>): Promise<FederationPeer> {
    const row = await this.queryOne<PeerRow>(
      `INSERT INTO federation.peers (id, name, url, shared_secret_hash, shared_secret_enc, status, features, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        peer.id,
        peer.name,
        peer.url,
        peer.sharedSecretHash,
        peer.sharedSecretEnc,
        peer.status,
        JSON.stringify(peer.features),
        peer.lastSeen,
      ]
    );
    return rowToPeer(row!);
  }

  async findById(id: string): Promise<FederationPeer | null> {
    const row = await this.queryOne<PeerRow>('SELECT * FROM federation.peers WHERE id = $1', [id]);
    return row ? rowToPeer(row) : null;
  }

  async findBySharedSecretHash(hash: string): Promise<FederationPeer | null> {
    const row = await this.queryOne<PeerRow>(
      'SELECT * FROM federation.peers WHERE shared_secret_hash = $1',
      [hash]
    );
    return row ? rowToPeer(row) : null;
  }

  async list(): Promise<FederationPeer[]> {
    const rows = await this.queryMany<PeerRow>(
      'SELECT * FROM federation.peers ORDER BY created_at ASC'
    );
    return rows.map(rowToPeer);
  }

  async updateStatus(id: string, status: string, lastSeen?: Date): Promise<void> {
    await this.execute(
      `UPDATE federation.peers SET status = $1, last_seen = COALESCE($2, last_seen), updated_at = now() WHERE id = $3`,
      [status, lastSeen ?? null, id]
    );
  }

  async updateFeatures(id: string, features: Partial<FederationPeer['features']>): Promise<void> {
    await this.execute(
      `UPDATE federation.peers
       SET features = features || $1::jsonb, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(features), id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.execute('DELETE FROM federation.peers WHERE id = $1', [id]);
  }

  async logSync(entry: Omit<SyncLogEntry, 'id' | 'createdAt'>): Promise<void> {
    const { uuidv7 } = await import('../utils/crypto.js');
    await this.execute(
      `INSERT INTO federation.sync_log (id, peer_id, type, status, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [uuidv7(), entry.peerId, entry.type, entry.status, JSON.stringify(entry.metadata)]
    );
  }

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }
}
