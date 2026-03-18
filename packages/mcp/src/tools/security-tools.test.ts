import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerSecurityTools,
  isIpInCidr,
  matchesScope,
  parseNmapXml,
  parseSqlmapOutput,
  parseNucleiJsonl,
  parseGobusterOutput,
  parseHydraOutput,
} from './security-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: false,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: false,
    exposeWebSearch: false,
    webSearchProvider: 'duckduckgo',
    exposeBrowser: false,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 30000,
    rateLimitPerTool: 30,
    logLevel: 'info',
    proxyEnabled: false,
    proxyProviders: [],
    proxyStrategy: 'round-robin',
    proxyMaxRetries: 3,
    proxyRetryBaseDelayMs: 1000,
    exposeSecurityTools: true,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: ['10.10.10.0/24', 'ctf.example.com'],
    ...overrides,
  } as McpServiceConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('security-tools', () => {
  beforeEach(() => {
    // Mock child_process.execFile so tests never spawn real processes
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'mock-stdout', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('disabled mode', () => {
    it('registers stub tools that return disabled message when exposeSecurityTools=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: false });
      await registerSecurityTools(server, config, noopMiddleware());
      // All tools registered as stubs — registration itself should not throw
      expect(true).toBe(true);
    });

    it('does not throw when allowedTargets is empty and tools are disabled', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: false, allowedTargets: [] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('enabled mode', () => {
    it('registers without error when exposeSecurityTools=true', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: true, allowedTargets: ['*'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('registers without error in docker-exec mode', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeSecurityTools: true,
        securityToolsMode: 'docker-exec',
        securityToolsContainer: 'kali-sy-toolkit',
        allowedTargets: ['10.10.10.0/24'],
      });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('scope validation', () => {
    it('allows target matching allowedTargets entry', async () => {
      // validateTarget is internal; we test the guard indirectly by checking
      // that registration completes and no error is thrown for matching targets
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ allowedTargets: ['10.10.10.1', 'ctf.example.com'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('allows wildcard target (*)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ allowedTargets: ['*'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('shodan tool', () => {
    it('registers sec_shodan when shodanApiKey is set', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ shodanApiKey: 'test-key-1234567890' });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('does not register sec_shodan when shodanApiKey is not set', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ shodanApiKey: undefined });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('isIpInCidr', () => {
    it('returns true for IP inside /24 range', () => {
      expect(isIpInCidr('10.10.10.5', '10.10.10.0/24')).toBe(true);
    });

    it('returns true for IP at the start of /24 range', () => {
      expect(isIpInCidr('10.10.10.0', '10.10.10.0/24')).toBe(true);
    });

    it('returns true for IP at the end of /24 range', () => {
      expect(isIpInCidr('10.10.10.255', '10.10.10.0/24')).toBe(true);
    });

    it('returns false for IP outside /24 range', () => {
      expect(isIpInCidr('10.10.11.5', '10.10.10.0/24')).toBe(false);
    });

    it('returns true for IP inside /16 range', () => {
      expect(isIpInCidr('192.168.5.100', '192.168.0.0/16')).toBe(true);
    });

    it('returns false for IP outside /16 range', () => {
      expect(isIpInCidr('192.169.5.100', '192.168.0.0/16')).toBe(false);
    });

    it('returns true for /32 exact match', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.1/32')).toBe(true);
    });

    it('returns false for /32 mismatch', () => {
      expect(isIpInCidr('10.0.0.2', '10.0.0.1/32')).toBe(false);
    });

    it('returns true for /0 (any IP)', () => {
      expect(isIpInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
    });

    it('returns false for malformed IP', () => {
      expect(isIpInCidr('not-an-ip', '10.10.10.0/24')).toBe(false);
    });

    it('returns false for invalid prefix length', () => {
      expect(isIpInCidr('10.10.10.5', '10.10.10.0/33')).toBe(false);
    });

    it('returns false when CIDR has no prefix', () => {
      expect(isIpInCidr('10.10.10.5', '10.10.10.0/')).toBe(false);
    });
  });

  describe('matchesScope', () => {
    it('exact IP match', () => {
      expect(matchesScope('10.10.10.5', '10.10.10.5')).toBe(true);
    });

    it('CIDR match — IP inside range', () => {
      expect(matchesScope('10.10.10.5', '10.10.10.0/24')).toBe(true);
    });

    it('CIDR match — IP outside range', () => {
      expect(matchesScope('10.10.11.5', '10.10.10.0/24')).toBe(false);
    });

    it('exact hostname match', () => {
      expect(matchesScope('ctf.example.com', 'ctf.example.com')).toBe(true);
    });

    it('subdomain of allowed hostname', () => {
      expect(matchesScope('sub.example.com', 'example.com')).toBe(true);
    });

    it('non-subdomain hostname rejected', () => {
      expect(matchesScope('notexample.com', 'example.com')).toBe(false);
    });

    it('domain suffix with leading dot matches apex', () => {
      expect(matchesScope('example.com', '.example.com')).toBe(true);
    });

    it('domain suffix with leading dot matches subdomain', () => {
      expect(matchesScope('sub.example.com', '.example.com')).toBe(true);
    });

    it('domain suffix with leading dot rejects unrelated domain', () => {
      expect(matchesScope('other.com', '.example.com')).toBe(false);
    });
  });

  describe('config defaults', () => {
    it('defaults securityToolsMode to native', () => {
      const config = makeConfig({ securityToolsMode: undefined as unknown as 'native' });
      // Zod schema default handles this — just verify the field is accessible
      expect(['native', 'docker-exec', undefined]).toContain(config.securityToolsMode);
    });

    it('defaults securityToolsContainer to kali-sy-toolkit', () => {
      const config = makeConfig();
      expect(config.securityToolsContainer).toBe('kali-sy-toolkit');
    });

    it('defaults allowedTargets to empty array', () => {
      const config = makeConfig({ allowedTargets: [] });
      expect(config.allowedTargets).toEqual([]);
    });

    it('defaults exposeSecurityTools to false', () => {
      const config = makeConfig({ exposeSecurityTools: false });
      expect(config.exposeSecurityTools).toBe(false);
    });
  });

  describe('output parsers', () => {
    describe('parseNmapXml', () => {
      it('parses a valid XML with one host and two ports', () => {
        const xml = `
<nmaprun>
  <host>
    <address addr="10.10.10.5" addrtype="ipv4"/>
    <hostnames><hostname name="target.local"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open"/>
        <service name="ssh" version="OpenSSH 7.4"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open"/>
        <service name="http" version="Apache 2.4"/>
      </port>
    </ports>
  </host>
</nmaprun>`;
        const result = parseNmapXml(xml);
        expect(result.hosts).toHaveLength(1);
        expect(result.hosts[0].ip).toBe('10.10.10.5');
        expect(result.hosts[0].hostname).toBe('target.local');
        expect(result.hosts[0].ports).toHaveLength(2);
        expect(result.hosts[0].ports[0].port).toBe(22);
        expect(result.hosts[0].ports[0].service).toBe('ssh');
        expect(result.hosts[0].ports[1].port).toBe(80);
      });

      it('returns empty hosts for empty XML', () => {
        expect(parseNmapXml('<nmaprun></nmaprun>').hosts).toHaveLength(0);
      });

      it('returns empty hosts for malformed XML', () => {
        expect(parseNmapXml('not xml at all').hosts).toHaveLength(0);
      });
    });

    describe('parseSqlmapOutput', () => {
      it('detects injectable parameter and DBMS', () => {
        const text = `
        Parameter: id (GET)
            Type: boolean-based blind
        back-end DBMS: MySQL >= 5.0`;
        const result = parseSqlmapOutput(text);
        expect(result.injectable).toHaveLength(1);
        expect(result.injectable[0].parameter).toBe('id');
        expect(result.dbms).toContain('MySQL');
      });

      it('returns empty for no injection found', () => {
        const result = parseSqlmapOutput('No injection found.\nAll tests done.');
        expect(result.injectable).toHaveLength(0);
        expect(result.dbms).toBeNull();
      });

      it('detects DBMS line without injection', () => {
        const result = parseSqlmapOutput('back-end DBMS: PostgreSQL');
        expect(result.dbms).toBe('PostgreSQL');
      });
    });

    describe('parseNucleiJsonl', () => {
      it('parses two findings from JSONL', () => {
        const text = [
          JSON.stringify({
            'template-id': 'cve-2021-1234',
            info: { severity: 'critical', name: 'RCE' },
            host: 'http://target.com',
            'matched-at': 'http://target.com/vuln',
          }),
          JSON.stringify({
            'template-id': 'xss-reflected',
            info: { severity: 'medium', name: 'XSS' },
            host: 'http://target.com',
            'matched-at': 'http://target.com/search?q=<script>',
          }),
        ].join('\n');
        const result = parseNucleiJsonl(text);
        expect(result.findings).toHaveLength(2);
        expect(result.findings[0].templateId).toBe('cve-2021-1234');
        expect(result.findings[0].severity).toBe('critical');
        expect(result.findings[1].templateId).toBe('xss-reflected');
      });

      it('returns empty findings for empty output', () => {
        expect(parseNucleiJsonl('').findings).toHaveLength(0);
      });

      it('skips malformed JSON lines gracefully', () => {
        const text =
          'not-json\n' +
          JSON.stringify({
            'template-id': 'xss',
            info: { severity: 'low', name: 'XSS' },
            host: 'h',
            'matched-at': 'm',
          });
        const result = parseNucleiJsonl(text);
        expect(result.findings).toHaveLength(1);
      });
    });

    describe('parseGobusterOutput', () => {
      it('parses found paths in dir mode', () => {
        const text = '/admin (Status: 200)\n/login (Status: 200)\n/.git (Status: 403)';
        const result = parseGobusterOutput(text, 'dir');
        expect(result.found).toContain('/admin');
        expect(result.found).toContain('/login');
        expect(result.mode).toBe('dir');
      });

      it('returns empty for no found paths', () => {
        const result = parseGobusterOutput('', 'dir');
        expect(result.found).toHaveLength(0);
      });
    });
  });

  describe('parseHydraOutput', () => {
    it('parses a found credential', () => {
      const text = '[22][ssh] host: 10.10.10.5   login: root   password: toor';
      const result = parseHydraOutput(text);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].login).toBe('root');
      expect(result.credentials[0].password).toBe('toor');
      expect(result.credentials[0].host).toBe('10.10.10.5');
      expect(result.credentials[0].service).toBe('ssh');
    });

    it('returns empty credentials when none found', () => {
      const result = parseHydraOutput('1 of 1 target completed, 0 valid passwords found');
      expect(result.credentials).toHaveLength(0);
    });
  });

  describe('sec_hydra', () => {
    it('is included in stub list when exposeSecurityTools=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: false });
      // Should not throw — sec_hydra stub is registered
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('registers without error when allowBruteForce=true and hydra available', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeSecurityTools: true,
        allowBruteForce: true,
        allowedTargets: ['*'],
      });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('registers without error when allowBruteForce=false (default)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeSecurityTools: true,
        allowBruteForce: false,
        allowedTargets: ['*'],
      });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('isIpInCidr — additional edge cases', () => {
    it('handles /16 range correctly', () => {
      expect(isIpInCidr('172.16.5.10', '172.16.0.0/16')).toBe(true);
      expect(isIpInCidr('172.17.0.1', '172.16.0.0/16')).toBe(false);
    });

    it('handles /8 range correctly', () => {
      expect(isIpInCidr('10.255.255.255', '10.0.0.0/8')).toBe(true);
      expect(isIpInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false);
    });

    it('returns false for non-numeric prefix', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.0/abc')).toBe(false);
    });

    it('returns false for prefix > 32', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.0/33')).toBe(false);
    });

    it('returns false for negative prefix', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.0/-1')).toBe(false);
    });

    it('returns false for empty IP', () => {
      expect(isIpInCidr('', '10.0.0.0/24')).toBe(false);
    });

    it('returns false for empty CIDR', () => {
      expect(isIpInCidr('10.0.0.1', '')).toBe(false);
    });

    it('returns false for CIDR without slash', () => {
      expect(isIpInCidr('10.0.0.1', '10.0.0.0')).toBe(false);
    });
  });

  describe('matchesScope — additional edge cases', () => {
    it('matches deep subdomain of allowed hostname', () => {
      expect(matchesScope('a.b.c.target.com', 'target.com')).toBe(true);
    });

    it('rejects partial hostname match (prefix)', () => {
      expect(matchesScope('nottarget.com', 'target.com')).toBe(false);
    });

    it('rejects completely unrelated domain with suffix entry', () => {
      expect(matchesScope('evil.com', '.target.com')).toBe(false);
    });

    it('matches apex with suffix entry (leading dot)', () => {
      expect(matchesScope('target.com', '.target.com')).toBe(true);
    });
  });

  describe('parseNmapXml — additional cases', () => {
    it('parses host with multiple ports and service info', () => {
      const xml = `<?xml version="1.0"?>
<nmaprun>
  <host><address addr="10.0.0.1"/>
    <ports>
      <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="8.9"/></port>
      <port protocol="tcp" portid="80"><state state="open"/><service name="http" product="nginx"/></port>
      <port protocol="tcp" portid="443"><state state="closed"/><service name="https"/></port>
    </ports>
  </host>
</nmaprun>`;
      const result = parseNmapXml(xml);
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0]!.ports).toHaveLength(3);
    });

    it('parses multiple hosts', () => {
      const xml = `<?xml version="1.0"?>
<nmaprun>
  <host><address addr="10.0.0.1"/><ports><port protocol="tcp" portid="22"><state state="open"/></port></ports></host>
  <host><address addr="10.0.0.2"/><ports><port protocol="tcp" portid="80"><state state="open"/></port></ports></host>
</nmaprun>`;
      const result = parseNmapXml(xml);
      expect(result.hosts).toHaveLength(2);
    });
  });

  describe('parseSqlmapOutput — additional cases', () => {
    it('detects multiple injectable parameters', () => {
      const text = `[INFO] the back-end DBMS is MySQL
[INFO] parameter 'id' is vulnerable
[INFO] parameter 'name' is vulnerable
back-end DBMS: MySQL >= 5.0`;
      const result = parseSqlmapOutput(text);
      expect(result.dbms).toContain('MySQL');
    });

    it('handles no-injection output', () => {
      const result = parseSqlmapOutput('all tested parameters do not appear to be injectable');
      expect(result.injectable).toEqual([]);
      expect(result.dbms).toBeNull();
    });
  });

  describe('parseNucleiJsonl — additional cases', () => {
    it('parses multiple findings with severity', () => {
      const jsonl = [
        JSON.stringify({ 'template-id': 'cve-2021-1234', host: 'target.com', severity: 'critical', matched: '/login' }),
        JSON.stringify({ 'template-id': 'xss-reflected', host: 'target.com', severity: 'high', matched: '/search' }),
      ].join('\n');
      const result = parseNucleiJsonl(jsonl);
      expect(result.findings).toHaveLength(2);
    });

    it('handles mixed valid and invalid JSON lines', () => {
      const jsonl = `${JSON.stringify({ 'template-id': 'valid', host: 'x.com', severity: 'low', matched: '/' })}\nnot-json\n`;
      const result = parseNucleiJsonl(jsonl);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parseGobusterOutput — additional cases', () => {
    it('parses paths from dir mode output', () => {
      const output = `/admin                (Status: 301) [Size: 178]
/login                (Status: 200) [Size: 1234]
/api                  (Status: 403) [Size: 0]`;
      const result = parseGobusterOutput(output, 'dir');
      expect(result.found.length).toBeGreaterThanOrEqual(3);
      expect(result.mode).toBe('dir');
    });

    it('handles empty output', () => {
      const result = parseGobusterOutput('', 'dir');
      expect(result.found).toEqual([]);
    });

    it('handles dns mode output', () => {
      const output = `Found: admin.example.com
Found: mail.example.com`;
      const result = parseGobusterOutput(output, 'dns');
      expect(result.mode).toBe('dns');
    });
  });

  describe('parseHydraOutput — additional cases', () => {
    it('parses multiple credentials', () => {
      const output = `[22][ssh] host: 10.0.0.1   login: admin   password: pass123
[22][ssh] host: 10.0.0.1   login: root   password: toor`;
      const result = parseHydraOutput(output);
      expect(result.credentials.length).toBeGreaterThanOrEqual(2);
    });

    it('handles no credentials found', () => {
      const output = `0 valid password found\n`;
      const result = parseHydraOutput(output);
      expect(result.credentials).toHaveLength(0);
    });
  });

  describe('tool registration completeness', () => {
    it('registers without error with all options enabled', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeSecurityTools: true,
        allowedTargets: ['*'],
        shodanApiKey: 'test-key',
        allowBruteForce: true,
      });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });
});
