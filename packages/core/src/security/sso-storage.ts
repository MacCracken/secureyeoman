/**
 * SSO Storage — PostgreSQL persistence for identity providers, user mappings,
 * and ephemeral PKCE authorization state.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

// ── Identity provider ────────────────────────────────────────────────

export interface IdentityProvider {
  id: string;
  name: string;
  type: 'oidc' | 'saml';
  issuerUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scopes: string;
  metadataUrl: string | null;
  entityId: string | null;
  acsUrl: string | null;
  enabled: boolean;
  autoProvision: boolean;
  defaultRole: string;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type IdentityProviderCreate = Omit<IdentityProvider, 'id' | 'createdAt' | 'updatedAt'>;
export type IdentityProviderUpdate = Partial<IdentityProviderCreate>;

interface IdpRow {
  id: string;
  name: string;
  type: string;
  issuer_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  scopes: string;
  metadata_url: string | null;
  entity_id: string | null;
  acs_url: string | null;
  enabled: boolean;
  auto_provision: boolean;
  default_role: string;
  config: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

function idpFromRow(r: IdpRow): IdentityProvider {
  return {
    id: r.id,
    name: r.name,
    type: r.type as 'oidc' | 'saml',
    issuerUrl: r.issuer_url,
    clientId: r.client_id,
    clientSecret: r.client_secret,
    scopes: r.scopes,
    metadataUrl: r.metadata_url,
    entityId: r.entity_id,
    acsUrl: r.acs_url,
    enabled: r.enabled,
    autoProvision: r.auto_provision,
    defaultRole: r.default_role,
    config: r.config ?? {},
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// ── Identity mapping ─────────────────────────────────────────────────

export interface IdentityMapping {
  id: string;
  idpId: string;
  localUserId: string;
  externalSubject: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  lastLoginAt: number | null;
}

interface MappingRow {
  id: string;
  idp_id: string;
  local_user_id: string;
  external_subject: string;
  attributes: Record<string, unknown>;
  created_at: number;
  last_login_at: number | null;
}

function mappingFromRow(r: MappingRow): IdentityMapping {
  return {
    id: r.id,
    idpId: r.idp_id,
    localUserId: r.local_user_id,
    externalSubject: r.external_subject,
    attributes: r.attributes ?? {},
    createdAt: Number(r.created_at),
    lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null,
  };
}

// ── SSO state ────────────────────────────────────────────────────────

export interface SsoState {
  state: string;
  providerId: string;
  redirectUri: string;
  codeVerifier: string | null;
  workspaceId: string | null;
  createdAt: number;
  expiresAt: number;
}

// ── Storage class ────────────────────────────────────────────────────

export class SsoStorage extends PgBaseStorage {
  // ─── Identity Providers ─────────────────────────────────────────

  async createIdentityProvider(data: IdentityProviderCreate): Promise<IdentityProvider> {
    const now = Date.now();
    const id = uuidv7();
    await this.execute(
      `INSERT INTO auth.identity_providers
         (id, name, type, issuer_url, client_id, client_secret, scopes,
          metadata_url, entity_id, acs_url, enabled, auto_provision, default_role, config, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)`,
      [
        id,
        data.name,
        data.type,
        data.issuerUrl,
        data.clientId,
        data.clientSecret,
        data.scopes ?? 'openid email profile',
        data.metadataUrl,
        data.entityId,
        data.acsUrl,
        data.enabled ?? true,
        data.autoProvision ?? true,
        data.defaultRole ?? 'viewer',
        JSON.stringify(data.config ?? {}),
        now,
        now,
      ]
    );
    return {
      id,
      ...data,
      scopes: data.scopes ?? 'openid email profile',
      config: data.config ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async getIdentityProvider(id: string): Promise<IdentityProvider | null> {
    const row = await this.queryOne<IdpRow>('SELECT * FROM auth.identity_providers WHERE id = $1', [
      id,
    ]);
    return row ? idpFromRow(row) : null;
  }

  async listIdentityProviders(enabledOnly = false): Promise<IdentityProvider[]> {
    const sql = enabledOnly
      ? 'SELECT * FROM auth.identity_providers WHERE enabled = true ORDER BY name ASC'
      : 'SELECT * FROM auth.identity_providers ORDER BY name ASC';
    const rows = await this.queryMany<IdpRow>(sql);
    return rows.map(idpFromRow);
  }

  async updateIdentityProvider(
    id: string,
    data: IdentityProviderUpdate
  ): Promise<IdentityProvider | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const fields: [keyof IdentityProviderUpdate, string][] = [
      ['name', 'name'],
      ['type', 'type'],
      ['issuerUrl', 'issuer_url'],
      ['clientId', 'client_id'],
      ['clientSecret', 'client_secret'],
      ['scopes', 'scopes'],
      ['metadataUrl', 'metadata_url'],
      ['entityId', 'entity_id'],
      ['acsUrl', 'acs_url'],
      ['enabled', 'enabled'],
      ['autoProvision', 'auto_provision'],
      ['defaultRole', 'default_role'],
    ];
    for (const [key, col] of fields) {
      if (data[key] !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (data.config !== undefined) {
      updates.push(`config = $${idx++}::jsonb`);
      values.push(JSON.stringify(data.config));
    }
    if (updates.length === 0) return this.getIdentityProvider(id);
    updates.push(`updated_at = $${idx++}`);
    values.push(Date.now());
    values.push(id);
    await this.execute(
      `UPDATE auth.identity_providers SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    return this.getIdentityProvider(id);
  }

  async deleteIdentityProvider(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM auth.identity_providers WHERE id = $1', [id]);
    return count > 0;
  }

  // ─── Identity Mappings ──────────────────────────────────────────

  async createIdentityMapping(data: {
    idpId: string;
    localUserId: string;
    externalSubject: string;
    attributes?: Record<string, unknown>;
  }): Promise<IdentityMapping> {
    const now = Date.now();
    const id = uuidv7();
    await this.execute(
      `INSERT INTO auth.identity_mappings (id, idp_id, local_user_id, external_subject, attributes, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (idp_id, external_subject) DO UPDATE SET attributes = EXCLUDED.attributes`,
      [
        id,
        data.idpId,
        data.localUserId,
        data.externalSubject,
        JSON.stringify(data.attributes ?? {}),
        now,
      ]
    );
    return {
      id,
      idpId: data.idpId,
      localUserId: data.localUserId,
      externalSubject: data.externalSubject,
      attributes: data.attributes ?? {},
      createdAt: now,
      lastLoginAt: null,
    };
  }

  async getMappingByExternalSubject(
    idpId: string,
    externalSubject: string
  ): Promise<IdentityMapping | null> {
    const row = await this.queryOne<MappingRow>(
      'SELECT * FROM auth.identity_mappings WHERE idp_id = $1 AND external_subject = $2',
      [idpId, externalSubject]
    );
    return row ? mappingFromRow(row) : null;
  }

  async getMappingsByUser(localUserId: string): Promise<IdentityMapping[]> {
    const rows = await this.queryMany<MappingRow>(
      'SELECT * FROM auth.identity_mappings WHERE local_user_id = $1',
      [localUserId]
    );
    return rows.map(mappingFromRow);
  }

  async updateMappingLastLogin(id: string): Promise<void> {
    await this.execute('UPDATE auth.identity_mappings SET last_login_at = $1 WHERE id = $2', [
      Date.now(),
      id,
    ]);
  }

  // ─── SSO State ──────────────────────────────────────────────────

  async createSsoState(data: Omit<SsoState, 'createdAt'>): Promise<void> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO auth.sso_state (state, provider_id, redirect_uri, code_verifier, workspace_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        data.state,
        data.providerId,
        data.redirectUri,
        data.codeVerifier,
        data.workspaceId,
        now,
        data.expiresAt,
      ]
    );
  }

  async getSsoState(state: string): Promise<SsoState | null> {
    const row = await this.queryOne<{
      state: string;
      provider_id: string;
      redirect_uri: string;
      code_verifier: string | null;
      workspace_id: string | null;
      created_at: number;
      expires_at: number;
    }>('SELECT * FROM auth.sso_state WHERE state = $1', [state]);
    if (!row) return null;
    if (Number(row.expires_at) < Date.now()) {
      await this.deleteSsoState(state);
      return null;
    }
    return {
      state: row.state,
      providerId: row.provider_id,
      redirectUri: row.redirect_uri,
      codeVerifier: row.code_verifier,
      workspaceId: row.workspace_id,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  }

  async deleteSsoState(state: string): Promise<void> {
    await this.execute('DELETE FROM auth.sso_state WHERE state = $1', [state]);
  }

  async cleanupExpiredSsoState(): Promise<void> {
    await this.execute('DELETE FROM auth.sso_state WHERE expires_at < $1', [Date.now()]);
  }

  override close(): void {
    /* pool lifecycle managed globally */
  }
}
