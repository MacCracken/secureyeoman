/**
 * Vault / OpenBao Backend for SecretsManager
 *
 * Supports two auth modes:
 *   1. Static token — set VAULT_TOKEN (or configured tokenEnv)
 *   2. AppRole      — set VAULT_ROLE_ID + VAULT_SECRET_ID (or configured envs)
 *
 * Uses the KV v2 secrets engine.  All reads/writes go to:
 *   GET  {address}/v1/{mount}/data/{key}
 *   POST {address}/v1/{mount}/data/{key}   { data: { value } }
 *   DELETE {address}/v1/{mount}/metadata/{key}  (deletes all versions)
 *   LIST {address}/v1/{mount}/metadata/{prefix}
 *
 * Token caching: the short-lived AppRole token is kept in memory and re-fetched
 * automatically on 403 responses.
 */

export interface VaultBackendConfig {
  /** Base URL, e.g. "http://127.0.0.1:8200" */
  address: string;
  /** KV v2 mount path, e.g. "secret" */
  mount: string;
  /** Optional namespace header (Vault Enterprise / OpenBao namespaces) */
  namespace?: string;
  /** Static token — used as-is when present */
  token?: string;
  /** AppRole role_id — ignored when `token` is set */
  roleId?: string;
  /** AppRole secret_id — ignored when `token` is set */
  secretId?: string;
}

export class VaultBackend {
  private cachedToken: string | null = null;
  private readonly config: VaultBackendConfig;

  constructor(config: VaultBackendConfig) {
    this.config = config;
  }

  // ── Public API ────────────────────────────────────────────────────

  async get(key: string): Promise<string | undefined> {
    const res = await this.request('GET', this.dataPath(key));
    if (res.status === 404) return undefined;
    if (!res.ok) await this.throwVaultError(res, `GET ${key}`);
    const body = (await res.json()) as { data?: { data?: { value?: string } } };
    return body?.data?.data?.value;
  }

  async set(key: string, value: string): Promise<void> {
    const res = await this.request('POST', this.dataPath(key), { data: { value } });
    if (!res.ok) await this.throwVaultError(res, `SET ${key}`);
  }

  async delete(key: string): Promise<boolean> {
    // Delete all versions via the metadata endpoint
    const res = await this.request('DELETE', this.metaPath(key));
    if (res.status === 404) return false;
    if (!res.ok) await this.throwVaultError(res, `DELETE ${key}`);
    return true;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async keys(prefix = ''): Promise<string[]> {
    const res = await this.request('LIST', this.metaPath(prefix));
    if (res.status === 404) return [];
    if (!res.ok) await this.throwVaultError(res, `LIST ${prefix}`);
    const body = (await res.json()) as { data?: { keys?: string[] } };
    return (body?.data?.keys ?? []).filter((k) => !k.endsWith('/'));
  }

  // ── Private helpers ───────────────────────────────────────────────

  private dataPath(key: string): string {
    return `/v1/${this.config.mount}/data/${encodeURIComponent(key)}`;
  }

  private metaPath(key: string): string {
    const suffix = key ? `/${encodeURIComponent(key)}` : '';
    return `/v1/${this.config.mount}/metadata${suffix}`;
  }

  private async getToken(): Promise<string> {
    if (this.config.token) return this.config.token;
    if (this.cachedToken) return this.cachedToken;
    return this.loginAppRole();
  }

  private async loginAppRole(): Promise<string> {
    if (!this.config.roleId || !this.config.secretId) {
      throw new Error(
        'VaultBackend: no token or AppRole credentials configured. ' +
          'Set vault.tokenEnv or both vault.roleIdEnv and vault.secretIdEnv.'
      );
    }

    const res = await fetch(`${this.config.address}/v1/auth/approle/login`, {
      method: 'POST',
      headers: this.baseHeaders(false),
      body: JSON.stringify({ role_id: this.config.roleId, secret_id: this.config.secretId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`VaultBackend: AppRole login failed (${res.status}): ${text}`);
    }

    const body = (await res.json()) as { auth?: { client_token?: string } };
    const token = body?.auth?.client_token;
    if (!token) throw new Error('VaultBackend: AppRole login returned no client_token');

    this.cachedToken = token;
    return token;
  }

  private baseHeaders(includeToken = true): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.namespace) headers['X-Vault-Namespace'] = this.config.namespace;
    if (includeToken && this.config.token) headers['X-Vault-Token'] = this.config.token;
    return headers;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    retry = true
  ): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(`${this.config.address}${path}`, {
      method,
      headers: { ...this.baseHeaders(false), 'X-Vault-Token': token },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    // On 403 with AppRole auth, the short-lived token may have expired; refresh once
    if (res.status === 403 && !this.config.token && retry) {
      this.cachedToken = null;
      return this.request(method, path, body, false);
    }

    return res;
  }

  private async throwVaultError(res: Response, op: string): Promise<never> {
    const text = await res.text().catch(() => '');
    throw new Error(`VaultBackend: ${op} failed (${res.status}): ${text}`);
  }
}
