import { describe, it, expect } from 'vitest';
import { isPrivateUrl, assertPublicUrl } from './ssrf-guard.js';

describe('isPrivateUrl', () => {
  describe('blocks private IPv4 ranges', () => {
    it('blocks 127.x.x.x loopback', () => {
      expect(isPrivateUrl('http://127.0.0.1/path')).toBe(true);
      expect(isPrivateUrl('http://127.255.255.255')).toBe(true);
    });

    it('blocks RFC 1918 10.0.0.0/8', () => {
      expect(isPrivateUrl('http://10.0.0.1')).toBe(true);
      expect(isPrivateUrl('http://10.255.255.255')).toBe(true);
    });

    it('blocks RFC 1918 172.16.0.0/12', () => {
      expect(isPrivateUrl('http://172.16.0.1')).toBe(true);
      expect(isPrivateUrl('http://172.31.255.255')).toBe(true);
    });

    it('blocks RFC 1918 192.168.0.0/16', () => {
      expect(isPrivateUrl('http://192.168.0.1')).toBe(true);
      expect(isPrivateUrl('http://192.168.100.50')).toBe(true);
    });

    it('blocks link-local / APIPA 169.254.0.0/16', () => {
      expect(isPrivateUrl('http://169.254.169.254')).toBe(true); // cloud metadata endpoint
      expect(isPrivateUrl('http://169.254.0.1')).toBe(true);
    });

    it('blocks carrier-grade NAT 100.64.0.0/10', () => {
      expect(isPrivateUrl('http://100.64.0.1')).toBe(true);
      expect(isPrivateUrl('http://100.127.255.255')).toBe(true);
    });
  });

  describe('blocks loopback hostnames', () => {
    it('blocks localhost', () => {
      expect(isPrivateUrl('http://localhost')).toBe(true);
      expect(isPrivateUrl('https://localhost:8080/api')).toBe(true);
    });

    it('blocks ip6-localhost', () => {
      expect(isPrivateUrl('http://ip6-localhost')).toBe(true);
    });

    it('blocks ip6-loopback', () => {
      expect(isPrivateUrl('http://ip6-loopback')).toBe(true);
    });
  });

  describe('blocks private IPv6 addresses', () => {
    it('blocks ::1 loopback', () => {
      expect(isPrivateUrl('http://[::1]')).toBe(true);
    });

    it('blocks fc::/7 unique-local', () => {
      expect(isPrivateUrl('http://[fc00::1]')).toBe(true);
      expect(isPrivateUrl('http://[fd00::1]')).toBe(true);
    });

    it('blocks fe80:: link-local', () => {
      expect(isPrivateUrl('http://[fe80::1]')).toBe(true);
    });
  });

  describe('blocks non-http(s) schemes', () => {
    it('blocks ftp://', () => {
      expect(isPrivateUrl('ftp://example.com')).toBe(true);
    });

    it('blocks file://', () => {
      expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
    });

    it('blocks gopher://', () => {
      expect(isPrivateUrl('gopher://example.com')).toBe(true);
    });
  });

  describe('allows public URLs', () => {
    it('allows https:// with public IP', () => {
      expect(isPrivateUrl('https://8.8.8.8')).toBe(false);
    });

    it('allows https:// with public domain', () => {
      expect(isPrivateUrl('https://example.com')).toBe(false);
      expect(isPrivateUrl('https://api.github.com/repos')).toBe(false);
    });

    it('allows http:// with public domain', () => {
      expect(isPrivateUrl('http://example.com')).toBe(false);
    });

    it('allows 172.32.x.x (outside private range)', () => {
      // 172.32 is outside the 172.16-172.31 private range
      expect(isPrivateUrl('http://172.32.0.1')).toBe(false);
    });

    it('allows 192.169.x.x (outside private range)', () => {
      expect(isPrivateUrl('http://192.169.0.1')).toBe(false);
    });
  });

  describe('malformed URLs', () => {
    it('returns false for malformed URLs (non-private treatment)', () => {
      expect(isPrivateUrl('not-a-url')).toBe(false);
      expect(isPrivateUrl('')).toBe(false);
    });
  });
});

describe('assertPublicUrl', () => {
  it('does not throw for public URLs', () => {
    expect(() => assertPublicUrl('https://example.com')).not.toThrow();
    expect(() => assertPublicUrl('http://8.8.8.8')).not.toThrow();
  });

  it('throws for private URLs', () => {
    expect(() => assertPublicUrl('http://127.0.0.1')).toThrow('must not target a private');
    expect(() => assertPublicUrl('http://192.168.1.1')).toThrow('must not target a private');
  });

  it('includes label in error message', () => {
    expect(() => assertPublicUrl('http://localhost', 'Webhook URL')).toThrow(
      'Webhook URL must not target'
    );
  });

  it('uses default label when not specified', () => {
    expect(() => assertPublicUrl('http://10.0.0.1')).toThrow('URL must not target');
  });
});
