import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────

const { mockExecFileSync, mockMkdirSync, mockExistsSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
}));

// ─── Tests ────────────────────────────────────────────────────

import { isOpenSSLAvailable, generateDevCerts, generateClientCert } from './cert-gen.js';

describe('cert-gen', () => {
  beforeEach(() => {
    mockExecFileSync.mockClear();
    mockMkdirSync.mockClear();
    mockExistsSync.mockClear().mockReturnValue(true);
  });

  describe('isOpenSSLAvailable', () => {
    it('returns true when openssl CLI is found', () => {
      mockExecFileSync.mockReturnValueOnce(Buffer.from('OpenSSL 3.0.0'));
      expect(isOpenSSLAvailable()).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith('openssl', ['version'], { stdio: 'pipe' });
    });

    it('returns false when openssl CLI is not found', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      expect(isOpenSSLAvailable()).toBe(false);
    });
  });

  describe('generateDevCerts', () => {
    it('creates output directory', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      generateDevCerts('/tmp/certs');
      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/certs', { recursive: true });
    });

    it('runs all 5 openssl commands', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      generateDevCerts('/tmp/certs');
      // genrsa for CA, req for CA cert, genrsa for server, req for server CSR, x509 sign
      expect(mockExecFileSync).toHaveBeenCalledTimes(5);
    });

    it('returns correct cert paths under outputDir', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      const paths = generateDevCerts('/tmp/certs');
      expect(paths.caKey).toBe('/tmp/certs/ca-key.pem');
      expect(paths.caCert).toBe('/tmp/certs/ca-cert.pem');
      expect(paths.serverKey).toBe('/tmp/certs/server-key.pem');
      expect(paths.serverCert).toBe('/tmp/certs/server-cert.pem');
    });

    it('generates CA certificate with correct subject', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''));
      generateDevCerts('/tmp/certs');
      const calls = mockExecFileSync.mock.calls.map((c: any[]) => c[1]);
      const caCertCall = calls.find((args: string[]) => args.includes('-x509'));
      expect(caCertCall).toBeDefined();
      expect(caCertCall).toContain('/CN=SecureYeoman Dev CA/O=SecureYeoman/C=US');
    });

    it('propagates errors from openssl', () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('openssl not found');
      });
      expect(() => generateDevCerts('/tmp/certs')).toThrow('openssl not found');
    });
  });

  describe('generateClientCert', () => {
    it('throws when CA key/cert files do not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(() =>
        generateClientCert('/tmp/certs', 'test-client', {
          caKey: '/tmp/certs/ca-key.pem',
          caCert: '/tmp/certs/ca-cert.pem',
        })
      ).toThrow('CA key/cert not found');
    });

    it('runs 3 openssl commands when CA files exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      generateClientCert('/tmp/certs', 'my-client', {
        caKey: '/tmp/certs/ca-key.pem',
        caCert: '/tmp/certs/ca-cert.pem',
      });

      // genrsa, req, x509
      expect(mockExecFileSync).toHaveBeenCalledTimes(3);
    });

    it('returns client cert paths with sanitized CN', () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      const paths = generateClientCert('/tmp/certs', 'my client!', {
        caKey: '/tmp/certs/ca-key.pem',
        caCert: '/tmp/certs/ca-cert.pem',
      });

      // CN 'my client!' → 'my_client_'
      expect(paths.clientKey).toContain('my_client_');
      expect(paths.clientCert).toContain('my_client_');
    });

    it('creates the output directory', () => {
      mockExistsSync.mockReturnValue(true);
      mockExecFileSync.mockReturnValue(Buffer.from(''));

      generateClientCert('/tmp/client-certs', 'client', {
        caKey: '/tmp/certs/ca-key.pem',
        caCert: '/tmp/certs/ca-cert.pem',
      });

      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/client-certs', { recursive: true });
    });
  });
});
