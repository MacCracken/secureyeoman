import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import {
  loadConfig,
  getSecret,
  requireSecret,
  validateSecrets,
  encryptConfigFile,
  decryptConfigFile,
} from './loader.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default configuration when no file or env vars are set', () => {
    // Clear relevant env vars
    delete process.env.SECUREYEOMAN_ENV;
    delete process.env.SECUREYEOMAN_LOG_LEVEL;
    delete process.env.SECUREYEOMAN_HOST;
    delete process.env.SECUREYEOMAN_PORT;

    const config = loadConfig({ skipEnv: true });

    // Check default values exist
    expect(config.version).toBe('1.0');
    expect(config.core).toBeDefined();
    expect(config.core.environment).toBe('development');
    expect(config.gateway).toBeDefined();
    expect(config.security).toBeDefined();
    expect(config.logging).toBeDefined();
  });

  it('should apply programmatic overrides for core environment', () => {
    const config = loadConfig({
      skipEnv: true,
      overrides: {
        core: {
          environment: 'production',
        },
      } as any, // Partial config - validated by Zod at runtime
    });

    expect(config.core.environment).toBe('production');
  });

  it('should apply programmatic overrides for gateway port', () => {
    const config = loadConfig({
      skipEnv: true,
      overrides: {
        gateway: {
          port: 9000,
        },
      } as any, // Partial config - validated by Zod at runtime
    });

    expect(config.gateway.port).toBe(9000);
  });

  it('should load environment variables when not skipped', () => {
    process.env.SECUREYEOMAN_ENV = 'staging';
    process.env.SECUREYEOMAN_PORT = '4000';

    const config = loadConfig();

    expect(config.core.environment).toBe('staging');
    expect(config.gateway.port).toBe(4000);
  });

  it('should ignore invalid port environment variable', () => {
    process.env.SECUREYEOMAN_PORT = 'not-a-number';

    const config = loadConfig({ skipEnv: true });

    // Should use default port since env var is invalid
    expect(config.gateway.port).toBeDefined();
    expect(typeof config.gateway.port).toBe('number');
  });

  it('should throw error for explicit config file that does not exist', () => {
    expect(() =>
      loadConfig({
        configPath: '/nonexistent/path/config.yaml',
      })
    ).toThrow('Config file not found');
  });

  it('should handle SECUREYEOMAN_MODEL environment variable', () => {
    process.env.SECUREYEOMAN_MODEL = 'claude-3-opus-20240229';

    const config = loadConfig();

    expect(config.model.model).toBe('claude-3-opus-20240229');
  });

  it('should handle SECUREYEOMAN_PROVIDER environment variable', () => {
    process.env.SECUREYEOMAN_PROVIDER = 'anthropic';

    const config = loadConfig();

    expect(config.model.provider).toBe('anthropic');
  });

  it('should have valid security defaults', () => {
    const config = loadConfig({ skipEnv: true });

    // Security defaults should be strict
    expect(config.security.sandbox.enabled).toBe(true);
    expect(config.security.inputValidation.enableInjectionDetection).toBe(true);
    expect(config.security.rateLimiting.enabled).toBe(true);
    expect(config.security.encryption.enabled).toBe(true);
  });

  it('should have valid logging defaults', () => {
    const config = loadConfig({ skipEnv: true });

    expect(config.logging.level).toBeDefined();
    expect(config.logging.format).toBeDefined();
    expect(config.logging.audit.enabled).toBe(true);
  });

  it('should override deeply nested values', () => {
    const config = loadConfig({
      skipEnv: true,
      overrides: {
        security: {
          inputValidation: {
            maxInputLength: 100000,
          },
        },
      } as any, // Partial config - validated by Zod at runtime
    });

    expect(config.security.inputValidation.maxInputLength).toBe(100000);
  });

  it('should handle SECUREYEOMAN_LOG_LEVEL environment variable', () => {
    process.env.SECUREYEOMAN_LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.core.logLevel).toBe('debug');
  });

  it('should handle SECUREYEOMAN_WORKSPACE environment variable', () => {
    process.env.SECUREYEOMAN_WORKSPACE = '/custom/workspace';
    const config = loadConfig();
    expect(config.core.workspace).toBe('/custom/workspace');
  });

  it('should handle SECUREYEOMAN_HOST environment variable', () => {
    process.env.SECUREYEOMAN_HOST = '0.0.0.0';
    const config = loadConfig();
    expect(config.gateway.host).toBe('0.0.0.0');
  });

  it('should handle SECUREYEOMAN_LOG_FORMAT=json environment variable', () => {
    process.env.SECUREYEOMAN_LOG_FORMAT = 'json';
    const config = loadConfig();
    // Logging config includes stdout output with json format
    expect(config.logging).toBeDefined();
  });

  it('should handle SECUREYEOMAN_LOG_FORMAT=pretty environment variable', () => {
    process.env.SECUREYEOMAN_LOG_FORMAT = 'pretty';
    const config = loadConfig();
    expect(config.logging).toBeDefined();
  });

  it('should handle SECUREYEOMAN_BASE_URL environment variable', () => {
    process.env.SECUREYEOMAN_BASE_URL = 'https://api.example.com';
    const config = loadConfig();
    expect(config.model.baseUrl).toBe('https://api.example.com');
  });

  it('should handle SECUREYEOMAN_EXTERNAL_BRAIN_ENABLED=true', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_ENABLED = 'true';
    const config = loadConfig();
    expect(config.externalBrain?.enabled).toBe(true);
  });

  it('should handle valid SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER = 'obsidian';
    const config = loadConfig();
    expect(config.externalBrain?.provider).toBe('obsidian');
  });

  it('should ignore invalid SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PROVIDER = 'invalid_provider';
    const config = loadConfig();
    // Invalid provider is silently ignored — value should not be 'invalid_provider'
    expect(config.externalBrain?.provider).not.toBe('invalid_provider');
  });

  it('should handle SECUREYEOMAN_EXTERNAL_BRAIN_PATH and SUBDIR', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_PATH = '/my/brain';
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SUBDIR = 'notes';
    const config = loadConfig();
    expect(config.externalBrain?.path).toBe('/my/brain');
    expect(config.externalBrain?.subdir).toBe('notes');
  });

  it('should handle SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS = '30000';
    const config = loadConfig();
    expect(config.externalBrain?.syncIntervalMs).toBe(30000);
  });

  it('should ignore invalid SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS', () => {
    process.env.SECUREYEOMAN_EXTERNAL_BRAIN_SYNC_INTERVAL_MS = 'not-a-number';
    const config = loadConfig();
    // NaN is ignored — syncIntervalMs should not be set to the invalid value
    expect(config.externalBrain?.syncIntervalMs).not.toBe(NaN);
    // and not the parsed-as-nan value
    expect(config.externalBrain?.syncIntervalMs).not.toBe(999999);
  });

  it('should throw when encrypted config file has no master key', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
    try {
      // Create a plain YAML file, rename to .enc.yaml to simulate encrypted
      const encPath = join(tmpDir, 'config.enc.yaml');
      writeFileSync(encPath, 'core:\n  environment: production\n', 'utf-8');
      expect(() => loadConfig({ configPath: encPath, skipEnv: true })).toThrow('no master key');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should throw when config file has invalid YAML content', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
    try {
      const yamlPath = join(tmpDir, 'config.yaml');
      writeFileSync(yamlPath, '{ invalid: yaml: : content }', 'utf-8');
      expect(() => loadConfig({ configPath: yamlPath, skipEnv: true })).toThrow();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('getSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return environment variable value when set', () => {
    process.env.MY_SECRET = 'secret-value';

    expect(getSecret('MY_SECRET')).toBe('secret-value');
  });

  it('should return undefined when environment variable is not set', () => {
    delete process.env.UNSET_SECRET;

    expect(getSecret('UNSET_SECRET')).toBeUndefined();
  });

  it('should return empty string if environment variable is empty', () => {
    process.env.EMPTY_SECRET = '';

    expect(getSecret('EMPTY_SECRET')).toBe('');
  });
});

describe('requireSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return value when secret is set', () => {
    process.env.REQUIRED_SECRET = 'secret-value';

    expect(requireSecret('REQUIRED_SECRET')).toBe('secret-value');
  });

  it('should throw error when secret is not set', () => {
    delete process.env.MISSING_SECRET;

    expect(() => requireSecret('MISSING_SECRET')).toThrow(
      'Required secret not set: MISSING_SECRET'
    );
  });

  it('should throw error when secret is empty string', () => {
    process.env.EMPTY_REQUIRED = '';

    expect(() => requireSecret('EMPTY_REQUIRED')).toThrow(
      'Required secret not set: EMPTY_REQUIRED'
    );
  });
});

describe('validateSecrets', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should pass when all required secrets are set', () => {
    const config = loadConfig({ skipEnv: true });

    // Set all required secrets
    process.env[config.logging.audit.signingKeyEnv] = 'signing-key';
    process.env[config.model.apiKeyEnv] = 'api-key';
    process.env[config.gateway.auth.tokenSecret] = 'token-secret';
    process.env[config.gateway.auth.adminPasswordEnv] = 'admin-password';
    process.env[config.security.encryption.keyEnv] = 'encryption-key';

    expect(() => validateSecrets(config)).not.toThrow();
  });

  it('should throw when audit signing key is missing', () => {
    const config = loadConfig({ skipEnv: true });

    // Set all secrets except signing key
    process.env[config.model.apiKeyEnv] = 'api-key';
    process.env[config.gateway.auth.tokenSecret] = 'token-secret';
    process.env[config.security.encryption.keyEnv] = 'encryption-key';
    delete process.env[config.logging.audit.signingKeyEnv];

    expect(() => validateSecrets(config)).toThrow('Missing required secrets');
  });

  it('should warn but not throw when API key is missing for non-ollama provider', () => {
    const config = loadConfig({ skipEnv: true });

    // Set all required secrets except API key
    process.env[config.logging.audit.signingKeyEnv] = 'signing-key';
    process.env[config.gateway.auth.tokenSecret] = 'token-secret';
    process.env[config.gateway.auth.adminPasswordEnv] = 'admin-password';
    process.env[config.security.encryption.keyEnv] = 'encryption-key';
    delete process.env[config.model.apiKeyEnv];

    // Should not throw — API key is optional; chat is disabled until configured
    expect(() => validateSecrets(config)).not.toThrow();
  });

  it('should not require API key for ollama provider', () => {
    const config = loadConfig({
      skipEnv: true,
      overrides: {
        model: {
          provider: 'ollama',
        },
      } as any, // Partial config - validated by Zod at runtime
    });

    // Set all secrets except API key
    process.env[config.logging.audit.signingKeyEnv] = 'signing-key';
    process.env[config.gateway.auth.tokenSecret] = 'token-secret';
    process.env[config.gateway.auth.adminPasswordEnv] = 'admin-password';
    process.env[config.security.encryption.keyEnv] = 'encryption-key';
    delete process.env[config.model.apiKeyEnv];

    expect(() => validateSecrets(config)).not.toThrow();
  });

  it('should throw when token secret is missing', () => {
    const config = loadConfig({ skipEnv: true });

    // Set all secrets except token secret
    process.env[config.logging.audit.signingKeyEnv] = 'signing-key';
    process.env[config.model.apiKeyEnv] = 'api-key';
    process.env[config.security.encryption.keyEnv] = 'encryption-key';
    delete process.env[config.gateway.auth.tokenSecret];

    expect(() => validateSecrets(config)).toThrow('Missing required secrets');
  });

  it('should throw when encryption key is missing and encryption is enabled', () => {
    const config = loadConfig({ skipEnv: true });

    // Set all secrets except encryption key
    process.env[config.logging.audit.signingKeyEnv] = 'signing-key';
    process.env[config.model.apiKeyEnv] = 'api-key';
    process.env[config.gateway.auth.tokenSecret] = 'token-secret';
    delete process.env[config.security.encryption.keyEnv];

    expect(() => validateSecrets(config)).toThrow('Missing required secrets');
  });

  it('should list all missing secrets in error message', () => {
    const config = loadConfig({ skipEnv: true });

    // Don't set any secrets
    delete process.env[config.logging.audit.signingKeyEnv];
    delete process.env[config.model.apiKeyEnv];
    delete process.env[config.gateway.auth.tokenSecret];
    delete process.env[config.security.encryption.keyEnv];

    try {
      validateSecrets(config);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('Missing required secrets');
      expect(message).toContain(config.logging.audit.signingKeyEnv);
      // API key is no longer required — it's a warning, not fatal
      expect(message).not.toContain(config.model.apiKeyEnv);
      expect(message).toContain(config.gateway.auth.tokenSecret);
    }
  });
});

describe('encrypted config', () => {
  const MASTER_KEY = 'test-master-key-at-least-16chars';
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'secureyeoman-config-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should encrypt and decrypt a config file round-trip', () => {
    const yamlPath = join(tmpDir, 'config.yaml');
    const encPath = join(tmpDir, 'config.enc.yaml');

    const partialConfig = { core: { environment: 'production' as const } };
    writeFileSync(yamlPath, stringifyYaml(partialConfig), 'utf-8');

    encryptConfigFile(yamlPath, encPath, MASTER_KEY);
    const decrypted = decryptConfigFile(encPath, MASTER_KEY);
    expect(decrypted).toContain('production');
  });

  it('should reject invalid master key on decrypt', () => {
    const yamlPath = join(tmpDir, 'config.yaml');
    const encPath = join(tmpDir, 'config.enc.yaml');

    writeFileSync(yamlPath, stringifyYaml({ core: { logLevel: 'debug' } }), 'utf-8');
    encryptConfigFile(yamlPath, encPath, MASTER_KEY);

    expect(() => decryptConfigFile(encPath, 'wrong-key-wrong-key!')).toThrow();
  });

  it('should load encrypted config via loadConfig', () => {
    const yamlPath = join(tmpDir, 'secureyeoman.yaml');
    const encPath = join(tmpDir, 'secureyeoman.enc.yaml');

    writeFileSync(yamlPath, stringifyYaml({ core: { environment: 'staging' as const } }), 'utf-8');
    encryptConfigFile(yamlPath, encPath, MASTER_KEY);

    const config = loadConfig({
      configPath: encPath,
      skipEnv: true,
      configMasterKey: MASTER_KEY,
    });

    expect(config.core.environment).toBe('staging');
  });

  it('should fall back to plain YAML when no .enc extension', () => {
    const yamlPath = join(tmpDir, 'config.yaml');
    writeFileSync(
      yamlPath,
      stringifyYaml({ core: { environment: 'production' as const } }),
      'utf-8'
    );

    const config = loadConfig({
      configPath: yamlPath,
      skipEnv: true,
    });

    expect(config.core.environment).toBe('production');
  });
});
