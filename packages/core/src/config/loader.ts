/**
 * Configuration Loader for SecureYeoman
 *
 * Security considerations:
 * - Config files are validated against strict schemas
 * - Environment variables are used for secrets (never stored in config)
 * - Path traversal is prevented in file paths
 * - Defaults are secure (e.g., sandbox enabled, strict validation)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { isLoggerInitialized, getLogger } from '../logging/logger.js';
import {
  ConfigSchema,
  PartialConfigSchema,
  type Config,
  type PartialConfig,
} from '@secureyeoman/shared';
import { KeyringManager } from '../security/keyring/manager.js';
import { encrypt, decrypt, serializeEncrypted, deserializeEncrypted } from '../security/secrets.js';

// Default config file locations (checked in order)
const DEFAULT_CONFIG_PATHS = [
  './secureyeoman.yaml',
  './secureyeoman.yml',
  './config/secureyeoman.yaml',
  '~/.secureyeoman/config.yaml',
  '/etc/secureyeoman/config.yaml',
];

// Encrypted config extensions
const ENCRYPTED_EXTENSIONS = ['.enc.yaml', '.encrypted.yaml'];

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

/**
 * Check if a path refers to an encrypted config file
 */
function isEncryptedConfig(path: string): boolean {
  return ENCRYPTED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Load and decrypt an encrypted config file
 */
function loadEncryptedConfigFile(path: string, masterKey: string): PartialConfig {
  const expandedPath = expandPath(path);
  const fileData = readFileSync(expandedPath);
  const encrypted = deserializeEncrypted(fileData);
  const decrypted = decrypt(encrypted, masterKey);
  const yamlContent = decrypted.toString('utf-8');
  decrypted.fill(0);

  const parsed = parseYaml(yamlContent) as unknown;
  const result = PartialConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid configuration in ${expandedPath}: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Encrypt a YAML config file for secure storage
 */
export function encryptConfigFile(inputPath: string, outputPath: string, masterKey: string): void {
  const expandedInput = expandPath(inputPath);
  const expandedOutput = expandPath(outputPath);

  const content = readFileSync(expandedInput, 'utf-8');
  // Validate it's a valid config before encrypting
  const parsed = parseYaml(content) as unknown;
  PartialConfigSchema.parse(parsed);

  const encrypted = encrypt(content, masterKey);
  const serialized = serializeEncrypted(encrypted);
  writeFileSync(expandedOutput, serialized, { mode: 0o600 });
}

/**
 * Decrypt an encrypted config file for inspection
 */
export function decryptConfigFile(inputPath: string, masterKey: string): string {
  const expandedInput = expandPath(inputPath);
  const fileData = readFileSync(expandedInput);
  const encrypted = deserializeEncrypted(fileData);
  const decrypted = decrypt(encrypted, masterKey);
  const content = decrypted.toString('utf-8');
  decrypted.fill(0);
  return content;
}

/**
 * Load configuration from a YAML file (plain or encrypted)
 */
function loadConfigFile(path: string, masterKey?: string): PartialConfig | null {
  const expandedPath = expandPath(path);

  if (!existsSync(expandedPath)) {
    return null;
  }

  // Handle encrypted config files
  if (isEncryptedConfig(expandedPath)) {
    if (!masterKey) {
      throw new Error(
        `Encrypted config file found at ${expandedPath} but no master key provided (set SECUREYEOMAN_CONFIG_KEY)`
      );
    }
    return loadEncryptedConfigFile(expandedPath, masterKey);
  }

  try {
    const content = readFileSync(expandedPath, 'utf-8');
    const parsed = parseYaml(content) as unknown;

    // Validate against partial schema (allows missing fields)
    const result = PartialConfigSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid configuration in ${expandedPath}: ${result.error.message}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new Error(
      `Failed to load config from ${expandedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error }
    );
  }
}

/**
 * Load configuration from environment variables
 * Only loads non-secret config values
 */
function loadEnvConfig(): PartialConfig {
  const config: PartialConfig = {};

  // Build core settings
  const core: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_ENV) {
    core.environment = process.env.SECUREYEOMAN_ENV;
  }
  if (process.env.SECUREYEOMAN_LOG_LEVEL) {
    core.logLevel = process.env.SECUREYEOMAN_LOG_LEVEL;
  }
  if (process.env.SECUREYEOMAN_WORKSPACE) {
    core.workspace = process.env.SECUREYEOMAN_WORKSPACE;
  }
  if (Object.keys(core).length > 0) {
    config.core = core as PartialConfig['core'];
  }

  // Build logging settings
  const logFormat = process.env.SECUREYEOMAN_LOG_FORMAT;
  if (logFormat === 'json' || logFormat === 'pretty') {
    config.logging = {
      output: [{ type: 'stdout' as const, format: logFormat }],
    } as PartialConfig['logging'];
  }

  // Build gateway settings
  const gateway: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_HOST) {
    gateway.host = process.env.SECUREYEOMAN_HOST;
  }
  if (process.env.SECUREYEOMAN_PORT) {
    const port = parseInt(process.env.SECUREYEOMAN_PORT, 10);
    if (!isNaN(port)) {
      gateway.port = port;
    }
  }
  if (process.env.SECUREYEOMAN_ALLOW_REMOTE_ACCESS) {
    gateway.allowRemoteAccess = process.env.SECUREYEOMAN_ALLOW_REMOTE_ACCESS === 'true';
  }

  // TLS gateway settings — unified vars (TLS_*) take precedence over legacy (SECUREYEOMAN_TLS_*)
  const tls: Record<string, unknown> = {};
  const tlsEnabled = process.env.TLS_ENABLED ?? process.env.SECUREYEOMAN_TLS_ENABLED;
  if (tlsEnabled) {
    tls.enabled = tlsEnabled === 'true';
  }
  const tlsCertPath = process.env.TLS_CERT_PATH ?? process.env.SECUREYEOMAN_TLS_CERT_PATH;
  if (tlsCertPath) {
    tls.certPath = tlsCertPath;
  }
  const tlsKeyPath = process.env.TLS_KEY_PATH ?? process.env.SECUREYEOMAN_TLS_KEY_PATH;
  if (tlsKeyPath) {
    tls.keyPath = tlsKeyPath;
  }
  if (process.env.SECUREYEOMAN_TLS_CA_PATH) {
    tls.caPath = process.env.SECUREYEOMAN_TLS_CA_PATH;
  }
  if (process.env.SECUREYEOMAN_TLS_AUTO_GENERATE) {
    tls.autoGenerate = process.env.SECUREYEOMAN_TLS_AUTO_GENERATE === 'true';
  }
  if (process.env.TLS_DOMAIN) {
    tls.domain = process.env.TLS_DOMAIN;
  }
  if (Object.keys(tls).length > 0) {
    gateway.tls = tls;
  }

  // CORS origins (comma-separated)
  if (process.env.SECUREYEOMAN_CORS_ORIGINS) {
    gateway.cors = {
      origins: process.env.SECUREYEOMAN_CORS_ORIGINS.split(',').map((o) => o.trim()),
    };
  }

  if (Object.keys(gateway).length > 0) {
    config.gateway = gateway as PartialConfig['gateway'];
  }

  // Build model settings
  const model: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_MODEL) {
    model.model = process.env.SECUREYEOMAN_MODEL;
  }
  if (process.env.SECUREYEOMAN_PROVIDER) {
    model.provider = process.env.SECUREYEOMAN_PROVIDER;
  }
  if (process.env.SECUREYEOMAN_BASE_URL) {
    model.baseUrl = process.env.SECUREYEOMAN_BASE_URL;
  }
  if (Object.keys(model).length > 0) {
    config.model = model as PartialConfig['model'];
  }

  // Build external brain settings
  const externalBrain: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_EXTERNAL_BRAIN_ENABLED === 'true') {
    externalBrain.enabled = true;
  }
  if (process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER) {
    const validProviders = ['obsidian', 'git_repo', 'filesystem'];
    const provider = process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER;
    if (validProviders.includes(provider)) {
      externalBrain.provider = provider;
    }
  }
  if (process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PATH) {
    externalBrain.path = process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PATH;
  }
  if (process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SUBDIR) {
    externalBrain.subdir = process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SUBDIR;
  }
  if (process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS) {
    const interval = parseInt(process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS, 10);
    if (!isNaN(interval)) {
      externalBrain.syncIntervalMs = interval;
    }
  }
  if (Object.keys(externalBrain).length > 0) {
    config.externalBrain = externalBrain as PartialConfig['externalBrain'];
  }

  // Build security / rate-limiting settings
  const rateLimiting: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_AUTH_LOGIN_MAX_ATTEMPTS) {
    const n = parseInt(process.env.SECUREYEOMAN_AUTH_LOGIN_MAX_ATTEMPTS, 10);
    if (!isNaN(n) && n > 0) rateLimiting.authLoginMaxAttempts = n;
  }
  if (process.env.SECUREYEOMAN_AUTH_LOGIN_WINDOW_MS) {
    const n = parseInt(process.env.SECUREYEOMAN_AUTH_LOGIN_WINDOW_MS, 10);
    if (!isNaN(n) && n > 0) rateLimiting.authLoginWindowMs = n;
  }
  if (Object.keys(rateLimiting).length > 0) {
    config.security = {
      ...config.security,
      rateLimiting: {
        ...(config.security?.rateLimiting as Record<string, unknown> | undefined),
        ...rateLimiting,
      },
    } as PartialConfig['security'];
  }

  // Gateway external URLs
  if (process.env.SECUREYEOMAN_EXTERNAL_URL) {
    gateway.externalUrl = process.env.SECUREYEOMAN_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (process.env.OAUTH_REDIRECT_BASE_URL) {
    gateway.oauthRedirectBaseUrl = process.env.OAUTH_REDIRECT_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.SECUREYEOMAN_DASHBOARD_DIST) {
    gateway.dashboardDist = process.env.SECUREYEOMAN_DASHBOARD_DIST;
  }

  // Licensing
  const licensing: Record<string, unknown> = {};
  if (process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT) {
    licensing.enforcement = process.env.SECUREYEOMAN_LICENSE_ENFORCEMENT === 'true';
  }
  if (process.env.SECUREYEOMAN_LICENSE_KEY) {
    licensing.licenseKeyEnv = 'SECUREYEOMAN_LICENSE_KEY';
  }
  if (Object.keys(licensing).length > 0) {
    config.licensing = licensing as PartialConfig['licensing'];
  }

  // Intent / OPA
  if (process.env.OPA_ADDR) {
    config.intent = {
      ...config.intent,
      opaAddr: process.env.OPA_ADDR,
    } as PartialConfig['intent'];
  }

  // Community / plugin path overrides
  const securityPaths: Record<string, unknown> = {};
  if (process.env.COMMUNITY_REPO_PATH) {
    securityPaths.communityRepoPath = process.env.COMMUNITY_REPO_PATH;
  }
  if (process.env.COMMUNITY_GIT_URL) {
    securityPaths.communityGitUrl = process.env.COMMUNITY_GIT_URL;
  }
  if (process.env.INTEGRATION_PLUGIN_DIR) {
    securityPaths.integrationPluginDir = process.env.INTEGRATION_PLUGIN_DIR;
  }
  if (Object.keys(securityPaths).length > 0) {
    config.security = {
      ...config.security,
      ...securityPaths,
    } as PartialConfig['security'];
  }

  return config;
}

/**
 * Deep merge two config objects
 * Later values override earlier ones
 */
function mergeConfigs(base: PartialConfig, override: PartialConfig): PartialConfig {
  const result: PartialConfig = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key as keyof PartialConfig];

    if (
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value !== null
    ) {
      if (typeof baseValue === 'object' && !Array.isArray(baseValue) && baseValue !== null) {
        // Recursively merge objects
        (result as Record<string, unknown>)[key] = mergeConfigs(
          baseValue as PartialConfig,
          value as PartialConfig
        );
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    } else if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

export interface LoadConfigOptions {
  /** Explicit config file path */
  configPath?: string;
  /** Override config values */
  overrides?: PartialConfig;
  /** Skip environment variable loading */
  skipEnv?: boolean;
  /** Master key for encrypted config files (defaults to SECUREYEOMAN_CONFIG_KEY env var) */
  configMasterKey?: string;
}

/**
 * Load and validate configuration
 *
 * Loading order (later overrides earlier):
 * 1. Default values from schema
 * 2. Config file (explicit path or auto-discovered)
 * 3. Environment variables
 * 4. Programmatic overrides
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
  let fileConfig: PartialConfig = {};
  const masterKey = options.configMasterKey ?? process.env.SECUREYEOMAN_CONFIG_KEY;

  // Try to load config file
  if (options.configPath) {
    const loaded = loadConfigFile(options.configPath, masterKey);
    if (!loaded) {
      throw new Error(`Config file not found: ${options.configPath}`);
    }
    fileConfig = loaded;
  } else {
    // Auto-discover config file (check encrypted variants first)
    const allPaths = [
      ...DEFAULT_CONFIG_PATHS.flatMap((p) =>
        ENCRYPTED_EXTENSIONS.map((ext) => p.replace(/\.ya?ml$/, ext))
      ),
      ...DEFAULT_CONFIG_PATHS,
    ];

    for (const path of allPaths) {
      const loaded = loadConfigFile(path, masterKey);
      if (loaded) {
        fileConfig = loaded;
        break;
      }
    }
  }

  // Load env config
  const envConfig = options.skipEnv ? {} : loadEnvConfig();

  // Merge configs
  let mergedConfig = mergeConfigs(fileConfig, envConfig);

  if (options.overrides) {
    mergedConfig = mergeConfigs(mergedConfig, options.overrides);
  }

  // Validate and apply defaults
  const result = ConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  // Expand ~ in core paths so they resolve to the actual home directory
  const config = result.data;
  config.core.dataDir = expandPath(config.core.dataDir);
  config.core.workspace = expandPath(config.core.workspace);

  return config;
}

/**
 * Initialize the keyring manager, pre-loading secrets from the system keyring
 * into process.env so that getSecret() continues to work synchronously.
 * Must be called before validateSecrets().
 */
export function initializeKeyring(
  backend: 'auto' | 'keyring' | 'env' | 'file' | 'vault',
  knownKeys: string[]
): KeyringManager {
  const manager = new KeyringManager();
  // vault backend is handled by SecretsManager; fall back to env for keyring init
  const keyringBackend = backend === 'vault' ? 'env' : backend;
  manager.initialize(keyringBackend, knownKeys);
  return manager;
}

/**
 * Get a secret value from environment variable
 * This is the only way to access secrets - they are never stored in config objects
 */
export function getSecret(envVarName: string): string | undefined {
  return process.env[envVarName];
}

/**
 * Get a required secret value from environment variable
 * Throws if the secret is not set
 */
export function requireSecret(envVarName: string): string {
  const value = getSecret(envVarName);
  if (!value) {
    throw new Error(`Required secret not set: ${envVarName}`);
  }
  return value;
}

/**
 * Validate that required secrets are set
 * Call this during startup to fail fast if secrets are missing
 */
export function validateSecrets(config: Config): void {
  const requiredSecrets: string[] = [];

  // TOKEN_SECRET and SIGNING_KEY are auto-generated in SecurityModule.initEarly() if not
  // set externally — no longer required as environment secrets.

  // Encryption key is auto-generated in SecurityModule.initEarly() if not set externally.
  // No longer required as an environment secret.

  // Warn (don't fail) on missing AI provider API keys.
  // The server starts without them; chat is disabled in the dashboard until a key
  // is added via Administration > Secrets > AI Provider Keys.
  if (config.model.provider !== 'ollama' && !getSecret(config.model.apiKeyEnv)) {
    const msg = `AI provider key not set (${config.model.apiKeyEnv}). Chat will be unavailable until a key is configured.`;
    if (isLoggerInitialized()) {
      getLogger().warn(msg);
    } else {
      process.stderr.write(`[warn] ${msg}\n`);
    }
  }

  // Warn on missing fallback API keys
  if (config.model.fallbacks) {
    for (const fb of config.model.fallbacks) {
      if (fb.provider !== 'ollama' && !getSecret(fb.apiKeyEnv)) {
        if (isLoggerInitialized()) {
          getLogger().warn(`Fallback ${fb.provider}/${fb.model} API key not set: ${fb.apiKeyEnv}`);
        } else {
          process.stderr.write(
            `[warn] Fallback ${fb.provider}/${fb.model} API key not set: ${fb.apiKeyEnv}\n`
          );
        }
      }
    }
  }

  // Admin password for bootstrap auth — always required (users must set their own)
  requiredSecrets.push(config.gateway.auth.adminPasswordEnv);

  const missing = requiredSecrets.filter((name) => !getSecret(name));

  if (missing.length > 0) {
    throw new Error(`Missing required secrets:\n  ${missing.join('\n  ')}`);
  }
}
