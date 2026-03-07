/**
 * SecretsManager — unified facade over all secret storage backends.
 *
 * Backend priority:
 *   vault   → OpenBao / HashiCorp Vault KV v2  (with optional fallback)
 *   keyring → system OS keyring (macOS Keychain / Linux Secret Service)
 *   file    → AES-256-GCM encrypted file (SecretStore)
 *   env     → process.env (read-only values; writes go to process.env only)
 *   auto    → keyring if available, otherwise file
 *
 * Every read/write also mirrors to `process.env[name]` so that legacy
 * `getSecret()` / `requireSecret()` continue to work unchanged.
 */

import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { SecretStore } from './secrets.js';
import type { KeyringManager } from './keyring/manager.js';
import { VaultBackend, type VaultBackendConfig } from './vault-backend.js';

export type SecretsBackendType = 'auto' | 'keyring' | 'env' | 'file' | 'vault';

export interface SecretsManagerConfig {
  backend: SecretsBackendType;
  /** Required for 'file' / 'auto' (when no keyring) */
  storePath?: string;
  /** Required for 'file' / 'auto' encryption */
  masterKey?: string;
  /** Required for 'vault' */
  vault?: VaultBackendConfig;
  /** Fall back to file/env when Vault is unreachable (default: true) */
  vaultFallback?: boolean;
  /** Keyring manager instance for 'keyring' / 'auto' backends */
  keyringManager?: KeyringManager;
  /** Pre-built VaultBackend instance (used in tests to inject a mock) */
  _vaultBackend?: VaultBackend;
  /** Pre-seed tracked key names for keyring/env backends (which can't enumerate). */
  knownKeys?: string[];
}

export class SecretsManager {
  private readonly config: SecretsManagerConfig;
  private fileStore: SecretStore | null = null;
  private vaultBackend: VaultBackend | null = null;
  private logger: SecureLogger | null = null;
  /** Tracks key names set/deleted through this manager (keyring/env can't enumerate). */
  private readonly managedKeys = new Set<string>();

  constructor(config: SecretsManagerConfig) {
    this.config = config;
    // Pre-seed tracked keys so keys() can enumerate them on keyring/env backends
    if (config.knownKeys) {
      for (const k of config.knownKeys) this.managedKeys.add(k);
    }
  }

  /** Initialize storage (loads file store, validates vault connectivity). */
  async initialize(): Promise<void> {
    const effectiveBackend = this.effectiveBackend();

    if (effectiveBackend === 'vault') {
      if (this.config._vaultBackend) {
        this.vaultBackend = this.config._vaultBackend;
      } else if (this.config.vault) {
        this.vaultBackend = new VaultBackend(this.config.vault);
      } else {
        throw new Error('SecretsManager: vault config required when backend is "vault"');
      }
      this.getLogger().info({
        address: this.config.vault?.address,
        mount: this.config.vault?.mount,
      }, 'SecretsManager initialized with Vault backend');
      return;
    }

    if (effectiveBackend === 'file') {
      if (!this.config.storePath || !this.config.masterKey) {
        throw new Error('SecretsManager: storePath and masterKey required for file backend');
      }
      this.fileStore = new SecretStore({
        storePath: this.config.storePath,
        masterKey: this.config.masterKey,
      });
      await this.fileStore.load();
      this.getLogger().info({
        path: this.config.storePath,
      }, 'SecretsManager initialized with file backend');
      return;
    }

    // keyring or env — backed by KeyringManager / process.env
    this.getLogger().info({ backend: effectiveBackend }, 'SecretsManager initialized');
  }

  /** Retrieve a secret. Returns undefined when not found. */
  async get(name: string): Promise<string | undefined> {
    const backend = this.effectiveBackend();

    if (backend === 'vault' && this.vaultBackend) {
      try {
        return await this.vaultBackend.get(name);
      } catch (err) {
        if (this.config.vaultFallback !== false) {
          this.getLogger().warn({
            name,
            error: err instanceof Error ? err.message : String(err),
          }, 'Vault get failed, falling back to env');
          return process.env[name];
        }
        throw err;
      }
    }

    if (backend === 'file' && this.fileStore) {
      return this.fileStore.get(name) ?? process.env[name];
    }

    if (backend === 'keyring' && this.config.keyringManager) {
      return this.config.keyringManager.getSecret(name) ?? process.env[name];
    }

    return process.env[name];
  }

  /** Store a secret. Also mirrors to process.env for sync access. */
  async set(name: string, value: string): Promise<void> {
    this.managedKeys.add(name);
    const backend = this.effectiveBackend();

    if (backend === 'vault' && this.vaultBackend) {
      try {
        await this.vaultBackend.set(name, value);
        process.env[name] = value;
        this.getLogger().info({ name }, 'Secret stored in Vault');
        return;
      } catch (err) {
        if (this.config.vaultFallback !== false) {
          this.getLogger().warn({
            name,
            error: err instanceof Error ? err.message : String(err),
          }, 'Vault set failed, falling back to env');
          process.env[name] = value;
          return;
        }
        throw err;
      }
    }

    if (backend === 'file' && this.fileStore) {
      await this.fileStore.set(name, value);
      process.env[name] = value;
      return;
    }

    if (backend === 'keyring' && this.config.keyringManager) {
      this.config.keyringManager.storeSecret(name, value);
      // storeSecret already mirrors to process.env
      return;
    }

    // env — only mirror to process.env
    process.env[name] = value;
  }

  /** Delete a secret. Returns true when the secret existed and was removed. */
  async delete(name: string): Promise<boolean> {
    this.managedKeys.delete(name);
    const backend = this.effectiveBackend();

    if (backend === 'vault' && this.vaultBackend) {
      try {
        const deleted = await this.vaultBackend.delete(name);
        delete process.env[name];
        return deleted;
      } catch (err) {
        if (this.config.vaultFallback !== false) {
          this.getLogger().warn({
            name,
            error: err instanceof Error ? err.message : String(err),
          }, 'Vault delete failed');
          const had = name in process.env;
          delete process.env[name];
          return had;
        }
        throw err;
      }
    }

    if (backend === 'file' && this.fileStore) {
      const deleted = await this.fileStore.delete(name);
      delete process.env[name];
      return deleted;
    }

    if (backend === 'keyring' && this.config.keyringManager) {
      this.config.keyringManager.deleteSecret(name);
      return true;
    }

    const had = name in process.env;
    delete process.env[name];
    return had;
  }

  /** Check whether a secret exists. */
  async has(name: string): Promise<boolean> {
    return (await this.get(name)) !== undefined;
  }

  /** List all stored secret names (not values). */
  async keys(): Promise<string[]> {
    const backend = this.effectiveBackend();

    if (backend === 'vault' && this.vaultBackend) {
      try {
        return await this.vaultBackend.keys();
      } catch {
        if (this.config.vaultFallback !== false) return [];
        throw new Error('VaultBackend unavailable');
      }
    }

    if (backend === 'file' && this.fileStore) {
      return this.fileStore.keys();
    }

    // keyring / env — not natively enumerable; return names tracked by set()
    return [...this.managedKeys].filter((k) => process.env[k] !== undefined);
  }

  // ── Private ─────────────────────────────────────────────────────

  private effectiveBackend(): SecretsBackendType {
    const b = this.config.backend;
    if (b !== 'auto') return b;
    // auto: prefer keyring if available, otherwise file (if configured), else env
    if (this.config.keyringManager?.getProvider()) return 'keyring';
    if (this.config.storePath && this.config.masterKey) return 'file';
    return 'env';
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'SecretsManager' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }
}
