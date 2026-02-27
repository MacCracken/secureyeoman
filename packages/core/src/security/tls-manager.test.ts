/**
 * TlsManager unit tests
 *
 * Stubs the filesystem and openssl calls to avoid side-effects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TlsManager } from './tls-manager.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:fs')>();
  return { ...orig, existsSync: vi.fn(() => false) };
});

vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>();
  return { ...orig, execFileSync: vi.fn(() => Buffer.from('')) };
});

vi.mock('./cert-gen.js', () => ({
  isOpenSSLAvailable: vi.fn(() => true),
  generateDevCerts: vi.fn(() => ({
    caKey: '/certs/ca-key.pem',
    caCert: '/certs/ca-cert.pem',
    serverKey: '/certs/server-key.pem',
    serverCert: '/certs/server-cert.pem',
  })),
}));

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isOpenSSLAvailable, generateDevCerts } from './cert-gen.js';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockExecFileSync = execFileSync as ReturnType<typeof vi.fn>;
const mockIsOpenSSLAvailable = isOpenSSLAvailable as ReturnType<typeof vi.fn>;
const mockGenerateDevCerts = generateDevCerts as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TlsManager — disabled', () => {
  it('ensureCerts() returns null when TLS is disabled', async () => {
    const mgr = new TlsManager({
      enabled: false,
      autoGenerate: false,
      certDir: '/certs',
    });
    expect(await mgr.ensureCerts()).toBeNull();
  });
});

describe('TlsManager — configured cert paths', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => vi.resetAllMocks());

  it('ensureCerts() returns configured paths when files exist', async () => {
    const mgr = new TlsManager({
      enabled: true,
      certPath: '/my/server.crt',
      keyPath: '/my/server.key',
      caPath: '/my/ca.crt',
      autoGenerate: false,
      certDir: '/certs',
    });
    const result = await mgr.ensureCerts();
    expect(result).toEqual({
      certPath: '/my/server.crt',
      keyPath: '/my/server.key',
      caPath: '/my/ca.crt',
    });
  });

  it('throws when certPath does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => !p.endsWith('.crt'));
    const mgr = new TlsManager({
      enabled: true,
      certPath: '/missing/server.crt',
      keyPath: '/my/server.key',
      autoGenerate: false,
      certDir: '/certs',
    });
    await expect(mgr.ensureCerts()).rejects.toThrow('TLS certPath not found');
  });
});

describe('TlsManager — autoGenerate', () => {
  afterEach(() => vi.resetAllMocks());

  it('generates certs when none exist', async () => {
    mockExistsSync.mockReturnValue(false);
    mockIsOpenSSLAvailable.mockReturnValue(true);

    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: true,
      certDir: '/certs',
    });
    const result = await mgr.ensureCerts();
    expect(mockGenerateDevCerts).toHaveBeenCalledWith('/certs');
    expect(result).toEqual({
      certPath: '/certs/server-cert.pem',
      keyPath: '/certs/server-key.pem',
      caPath: '/certs/ca-cert.pem',
    });
  });

  it('reuses cached generated certs within same process', async () => {
    mockExistsSync.mockReturnValue(false);
    mockIsOpenSSLAvailable.mockReturnValue(true);

    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: true,
      certDir: '/certs',
    });
    await mgr.ensureCerts();
    await mgr.ensureCerts(); // second call
    // generateDevCerts should only be called once
    expect(mockGenerateDevCerts).toHaveBeenCalledTimes(1);
  });

  it('reuses on-disk certs when they exist and are not expired', async () => {
    // cert + key exist on disk
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith('server-cert.pem') || p.endsWith('server-key.pem')
    );
    // expiry check: cert not expired (far future)
    const futureDate = new Date(Date.now() + 365 * 86400 * 1000).toUTCString();
    mockExecFileSync.mockReturnValue(Buffer.from(`notAfter=${futureDate}\n`));

    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: true,
      certDir: '/certs',
    });
    const result = await mgr.ensureCerts();
    expect(mockGenerateDevCerts).not.toHaveBeenCalled();
    expect(result?.certPath).toContain('server-cert.pem');
  });

  it('regenerates when existing cert is expired', async () => {
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith('server-cert.pem') || p.endsWith('server-key.pem')
    );
    // expired cert
    mockExecFileSync.mockReturnValue(Buffer.from('notAfter=Jan  1 00:00:00 2000 GMT\n'));
    mockIsOpenSSLAvailable.mockReturnValue(true);

    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: true,
      certDir: '/certs',
    });
    await mgr.ensureCerts();
    expect(mockGenerateDevCerts).toHaveBeenCalledWith('/certs');
  });

  it('throws when openssl is not available', async () => {
    mockExistsSync.mockReturnValue(false);
    mockIsOpenSSLAvailable.mockReturnValue(false);

    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: true,
      certDir: '/certs',
    });
    await expect(mgr.ensureCerts()).rejects.toThrow('openssl is not available');
  });

  it('throws when TLS enabled, autoGenerate=false, no certPath', async () => {
    const mgr = new TlsManager({
      enabled: true,
      autoGenerate: false,
      certDir: '/certs',
    });
    await expect(mgr.ensureCerts()).rejects.toThrow('certPath/keyPath are not configured');
  });
});

describe('TlsManager — getCertStatus()', () => {
  afterEach(() => vi.resetAllMocks());

  it('returns enabled=false when TLS is disabled', async () => {
    const mgr = new TlsManager({ enabled: false, autoGenerate: false, certDir: '/certs' });
    const status = await mgr.getCertStatus();
    expect(status.enabled).toBe(false);
    expect(status.expiresAt).toBeNull();
  });

  it('reports expiry warning within 30 days', async () => {
    mockExistsSync.mockReturnValue(true);
    // 10 days from now
    const soonDate = new Date(Date.now() + 10 * 86400 * 1000).toUTCString();
    mockExecFileSync.mockReturnValue(Buffer.from(`notAfter=${soonDate}\n`));

    const mgr = new TlsManager({
      enabled: true,
      certPath: '/my/server.crt',
      keyPath: '/my/server.key',
      autoGenerate: false,
      certDir: '/certs',
    });
    const status = await mgr.getCertStatus();
    expect(status.expiryWarning).toBe(true);
    expect(status.expired).toBe(false);
  });

  it('reports expired when cert is in the past', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExecFileSync.mockReturnValue(Buffer.from('notAfter=Jan  1 00:00:00 2000 GMT\n'));

    const mgr = new TlsManager({
      enabled: true,
      certPath: '/my/server.crt',
      keyPath: '/my/server.key',
      autoGenerate: false,
      certDir: '/certs',
    });
    const status = await mgr.getCertStatus();
    expect(status.expired).toBe(true);
  });
});
