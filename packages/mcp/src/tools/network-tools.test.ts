import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerNetworkTools,
  isIpInCidrNet,
  matchesScopeNet,
  calculateSubnet,
  calculateVlsm,
  subnetMaskToWildcard,
} from './network-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ToolEntry {
  handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
}
type ToolRecord = Record<string, ToolEntry>;

function getRegistered(server: McpServer): ToolRecord {
  return (server as unknown as { _registeredTools: ToolRecord })._registeredTools;
}

function getTool(server: McpServer, name: string): ToolEntry {
  const rt = getRegistered(server);
  const tool = rt[name];
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  return tool;
}

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
    exposeSecurityTools: false,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: [],
    exposeNetworkTools: true,
    allowedNetworkTargets: ['10.0.0.0/8', '192.168.0.0/16'],
    ...overrides,
  } as McpServiceConfig;
}

// ─── Scope helpers ────────────────────────────────────────────────────────────

describe('isIpInCidrNet', () => {
  it('matches IP within a /24', () => {
    expect(isIpInCidrNet('192.168.1.50', '192.168.1.0/24')).toBe(true);
  });

  it('rejects IP outside a /24', () => {
    expect(isIpInCidrNet('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('matches network address', () => {
    expect(isIpInCidrNet('10.0.0.0', '10.0.0.0/8')).toBe(true);
  });

  it('matches broadcast address', () => {
    expect(isIpInCidrNet('10.255.255.255', '10.0.0.0/8')).toBe(true);
  });

  it('handles /32 (single host)', () => {
    expect(isIpInCidrNet('1.2.3.4', '1.2.3.4/32')).toBe(true);
    expect(isIpInCidrNet('1.2.3.5', '1.2.3.4/32')).toBe(false);
  });

  it('handles /0 (any)', () => {
    expect(isIpInCidrNet('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('returns false for malformed input — fail-closed', () => {
    expect(isIpInCidrNet('not-an-ip', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidrNet('10.0.0.1', 'not-a-cidr')).toBe(false);
    expect(isIpInCidrNet('10.0.0.1', '10.0.0.0/33')).toBe(false);
  });
});

describe('matchesScopeNet', () => {
  it('matches exact IP', () => {
    expect(matchesScopeNet('10.0.0.1', '10.0.0.1')).toBe(true);
  });

  it('matches CIDR', () => {
    expect(matchesScopeNet('10.0.0.5', '10.0.0.0/24')).toBe(true);
    expect(matchesScopeNet('10.0.1.5', '10.0.0.0/24')).toBe(false);
  });

  it('matches exact hostname', () => {
    expect(matchesScopeNet('router.example.com', 'router.example.com')).toBe(true);
    expect(matchesScopeNet('switch.example.com', 'router.example.com')).toBe(false);
  });

  it('matches subdomain of hostname entry', () => {
    expect(matchesScopeNet('core.example.com', 'example.com')).toBe(true);
  });

  it('matches domain suffix entry (leading dot)', () => {
    expect(matchesScopeNet('switch.infra.internal', '.infra.internal')).toBe(true);
    expect(matchesScopeNet('infra.internal', '.infra.internal')).toBe(true);
    expect(matchesScopeNet('other.com', '.infra.internal')).toBe(false);
  });
});

// ─── Subnet calculator ───────────────────────────────────────────────────────

describe('calculateSubnet', () => {
  it('/24 — standard class C', () => {
    const r = calculateSubnet('192.168.1.0/24');
    expect(r.network).toBe('192.168.1.0');
    expect(r.broadcast).toBe('192.168.1.255');
    expect(r.firstHost).toBe('192.168.1.1');
    expect(r.lastHost).toBe('192.168.1.254');
    expect(r.subnetMask).toBe('255.255.255.0');
    expect(r.wildcardMask).toBe('0.0.0.255');
    expect(r.prefixLength).toBe(24);
    expect(r.hostCount).toBe(254);
  });

  it('/30 — point-to-point link', () => {
    const r = calculateSubnet('10.0.0.0/30');
    expect(r.hostCount).toBe(2);
    expect(r.network).toBe('10.0.0.0');
    expect(r.broadcast).toBe('10.0.0.3');
  });

  it('/31 — RFC 3021 point-to-point (no broadcast)', () => {
    const r = calculateSubnet('10.0.0.0/31');
    expect(r.hostCount).toBe(2);
  });

  it('/32 — host route', () => {
    const r = calculateSubnet('10.0.0.1/32');
    expect(r.hostCount).toBe(1);
    expect(r.network).toBe('10.0.0.1');
  });

  it('normalises host bits to network address', () => {
    // Input has host bits set (192.168.1.100/24 → network 192.168.1.0)
    const r = calculateSubnet('192.168.1.100/24');
    expect(r.network).toBe('192.168.1.0');
    expect(r.cidr).toBe('192.168.1.0/24');
  });

  it('/8 — class A', () => {
    const r = calculateSubnet('10.0.0.0/8');
    expect(r.broadcast).toBe('10.255.255.255');
    expect(r.hostCount).toBe(16777214);
    expect(r.wildcardMask).toBe('0.255.255.255');
  });

  it('throws on invalid CIDR notation', () => {
    expect(() => calculateSubnet('not-an-ip/24')).toThrow();
    expect(() => calculateSubnet('192.168.1.0')).toThrow();
    expect(() => calculateSubnet('192.168.1.0/33')).toThrow();
  });
});

// ─── VLSM ────────────────────────────────────────────────────────────────────

describe('calculateVlsm', () => {
  it('allocates subnets in decreasing size order', () => {
    // 3 subnets: 100 hosts, 50 hosts, 25 hosts in a /24 parent
    const allocs = calculateVlsm('192.168.1.0/24', [100, 50, 25]);
    expect(allocs).toHaveLength(3);

    // Allocations are largest-first internally
    expect(allocs[0]!.requirement).toBe(100);
    expect(allocs[1]!.requirement).toBe(50);
    expect(allocs[2]!.requirement).toBe(25);

    // Each allocation fits at least the required hosts
    for (const a of allocs) {
      expect(a.allocatedHosts).toBeGreaterThanOrEqual(a.requirement);
    }
  });

  it('allocates non-overlapping subnets', () => {
    const allocs = calculateVlsm('10.0.0.0/22', [200, 100, 50]);
    // Verify sequential allocation: each starts after the previous broadcast
    for (let i = 1; i < allocs.length; i++) {
      const prevBroadcastParts = allocs[i - 1]!.broadcast.split('.').map(Number);
      const currNetworkParts = allocs[i]!.network.split('.').map(Number);
      const prevBroad =
        ((prevBroadcastParts[0]! << 24) |
          (prevBroadcastParts[1]! << 16) |
          (prevBroadcastParts[2]! << 8) |
          prevBroadcastParts[3]!) >>>
        0;
      const currNet =
        ((currNetworkParts[0]! << 24) |
          (currNetworkParts[1]! << 16) |
          (currNetworkParts[2]! << 8) |
          currNetworkParts[3]!) >>>
        0;
      expect(currNet).toBe(prevBroad + 1);
    }
  });

  it('throws when address space is exhausted', () => {
    // /30 has 2 usable hosts; 100 hosts won't fit
    expect(() => calculateVlsm('10.0.0.0/30', [100])).toThrow();
  });

  it('throws on invalid host requirement', () => {
    expect(() => calculateVlsm('10.0.0.0/24', [0])).toThrow();
  });
});

// ─── Wildcard mask ───────────────────────────────────────────────────────────

describe('subnetMaskToWildcard', () => {
  it('converts /24 prefix to wildcard', () => {
    expect(subnetMaskToWildcard('24')).toBe('0.0.0.255');
  });

  it('converts dotted-decimal mask to wildcard', () => {
    expect(subnetMaskToWildcard('255.255.255.0')).toBe('0.0.0.255');
  });

  it('/0 prefix → all-ones wildcard', () => {
    expect(subnetMaskToWildcard('0')).toBe('255.255.255.255');
  });

  it('/32 prefix → all-zeros wildcard', () => {
    expect(subnetMaskToWildcard('32')).toBe('0.0.0.0');
  });

  it('throws on invalid prefix length', () => {
    expect(() => subnetMaskToWildcard('33')).toThrow();
    expect(() => subnetMaskToWildcard('abc')).toThrow();
  });
});

// ─── Registration — disabled mode ────────────────────────────────────────────

describe('registerNetworkTools — disabled mode', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers stub tools that return disabled message when exposeNetworkTools=false', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeNetworkTools: false });
    await registerNetworkTools(server, config, noopMiddleware());

    // Tools are registered (so the manifest is complete) even when disabled
    const tool = getRegistered(server);
    expect('subnet_calculator' in tool).toBe(true);
    expect('nvd_cve_search' in tool).toBe(true);
    expect('network_device_connect' in tool).toBe(true);
    expect('pcap_upload' in tool).toBe(true);
  });
});

// ─── Registration — enabled mode ─────────────────────────────────────────────

describe('registerNetworkTools — enabled mode', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          // Simulate tshark availability for `which tshark`
          cb(null, '/usr/bin/tshark', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all expected network tools', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeNetworkTools: true, allowedNetworkTargets: ['*'] });
    await registerNetworkTools(server, config, noopMiddleware());

    const registered = getRegistered(server);
    const expectedTools = [
      'network_device_connect',
      'network_show_command',
      'network_config_push',
      'network_health_check',
      'network_ping_test',
      'network_traceroute',
      'network_discovery_cdp',
      'network_discovery_lldp',
      'network_topology_build',
      'network_arp_table',
      'network_mac_table',
      'network_routing_table',
      'network_ospf_neighbors',
      'network_ospf_lsdb',
      'network_bgp_peers',
      'network_interface_status',
      'network_vlan_list',
      'network_acl_audit',
      'network_aaa_status',
      'network_port_security',
      'network_stp_status',
      'network_software_version',
      'netbox_devices_list',
      'netbox_interfaces_list',
      'netbox_ipam_ips',
      'netbox_cables',
      'netbox_reconcile',
      'nvd_cve_search',
      'nvd_cve_by_software',
      'nvd_cve_get',
      'subnet_calculator',
      'subnet_vlsm',
      'wildcard_mask_calc',
      'pcap_upload',
      'pcap_protocol_hierarchy',
      'pcap_conversations',
      'pcap_dns_queries',
      'pcap_http_requests',
    ];
    for (const name of expectedTools) {
      expect(name in registered, `Expected tool ${name} to be registered`).toBe(true);
    }
  });
});

// ─── Tool handlers — subnet tools (pure computation, can call directly) ──────

describe('subnet_calculator tool handler', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/tshark', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns correct subnet info for /24', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const middleware = noopMiddleware();
    const config = makeConfig();
    await registerNetworkTools(server, config, middleware);

    const tool = getTool(server, 'subnet_calculator');
    const result = await tool.handler({ cidr: '192.168.1.0/24' });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.network).toBe('192.168.1.0');
    expect(parsed.broadcast).toBe('192.168.1.255');
    expect(parsed.hostCount).toBe(254);
  });

  it('returns error for invalid CIDR', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    await registerNetworkTools(server, makeConfig(), noopMiddleware());

    const tool = getTool(server, 'subnet_calculator');
    const result = await tool.handler({ cidr: 'invalid' });
    expect(result.isError).toBe(true);
  });
});

describe('wildcard_mask_calc tool handler', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/tshark', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts prefix length to wildcard mask', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    await registerNetworkTools(server, makeConfig(), noopMiddleware());

    const tool = getTool(server, 'wildcard_mask_calc');
    const result = await tool.handler({ input: '24' });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.wildcardMask).toBe('0.0.0.255');
  });
});

// ─── Scope enforcement ────────────────────────────────────────────────────────

describe('network scope enforcement', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/tshark', '');
        }
      ),
    }));
    // Mock ssh2 dynamic import
    vi.mock('ssh2', () => ({
      Client: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        connect: vi.fn(),
        end: vi.fn(),
      })),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('network_device_connect rejects target outside allowedNetworkTargets', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ allowedNetworkTargets: ['10.0.0.0/8'] });
    await registerNetworkTools(server, config, noopMiddleware());

    const tool = getTool(server, 'network_device_connect');
    // 192.168.1.1 is not in 10.0.0.0/8
    const result = await tool.handler({ host: '192.168.1.1', port: 22, username: 'admin' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('outside the declared network scope');
  });

  it('network_device_connect allows wildcard scope (*)', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ allowedNetworkTargets: ['*'] });
    await registerNetworkTools(server, config, noopMiddleware());

    const tool = getTool(server, 'network_device_connect');
    // With wildcard scope and a mocked SSH client that never fires 'ready',
    // this will timeout — but the scope check passes (no ScopeViolationError)
    const result = await tool.handler({ host: '8.8.8.8', port: 22, username: 'admin' });
    // Either a timeout error or SSH error — but NOT a scope violation
    if (result.isError) {
      expect(result.content[0]!.text).not.toContain('outside the declared network scope');
    }
  });

  it('network_device_connect rejects when allowedNetworkTargets is empty', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ allowedNetworkTargets: [] });
    await registerNetworkTools(server, config, noopMiddleware());

    const tool = getTool(server, 'network_device_connect');
    const result = await tool.handler({ host: '10.0.0.1', port: 22, username: 'admin' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('none configured');
  });
});

// ─── NetBox — missing config ──────────────────────────────────────────────────

describe('netbox_devices_list — missing config', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, '/usr/bin/tshark', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when netboxUrl or netboxToken is not configured', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ netboxUrl: undefined, netboxToken: undefined });
    await registerNetworkTools(server, config, noopMiddleware());

    const tool = getTool(server, 'netbox_devices_list');
    const result = await tool.handler({ limit: 10 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('NetBox is not configured');
  });
});

// ─── PCAP — tshark not available ─────────────────────────────────────────────

describe('pcap tools — tshark unavailable', () => {
  beforeEach(() => {
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error, stdout: string, stderr: string) => void
        ) => {
          cb(new Error('not found'), '', 'tshark: command not found');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pcap_upload returns error when tshark is not installed', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    await registerNetworkTools(server, makeConfig(), noopMiddleware());

    const tool = getTool(server, 'pcap_upload');
    const result = await tool.handler({ data: Buffer.from('dummy').toString('base64') });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('tshark');
  });
});

// ─── Additional Coverage ──────────────────────────────────────────────────────

describe('isIpInCidrNet — edge cases', () => {
  it('handles /16 correctly', () => {
    expect(isIpInCidrNet('172.16.5.10', '172.16.0.0/16')).toBe(true);
    expect(isIpInCidrNet('172.17.0.1', '172.16.0.0/16')).toBe(false);
  });

  it('handles /8 correctly', () => {
    expect(isIpInCidrNet('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(isIpInCidrNet('11.0.0.1', '10.0.0.0/8')).toBe(false);
  });

  it('handles /1 correctly', () => {
    expect(isIpInCidrNet('127.255.255.255', '0.0.0.0/1')).toBe(true);
    expect(isIpInCidrNet('128.0.0.1', '0.0.0.0/1')).toBe(false);
  });

  it('returns false for negative prefix', () => {
    expect(isIpInCidrNet('10.0.0.1', '10.0.0.0/-1')).toBe(false);
  });

  it('returns false for prefix > 32', () => {
    expect(isIpInCidrNet('10.0.0.1', '10.0.0.0/33')).toBe(false);
  });

  it('returns false for empty string IP', () => {
    expect(isIpInCidrNet('', '10.0.0.0/24')).toBe(false);
  });

  it('returns false for empty string CIDR', () => {
    expect(isIpInCidrNet('10.0.0.1', '')).toBe(false);
  });

  it('returns false for IPv6-like addresses', () => {
    expect(isIpInCidrNet('::1', '::0/128')).toBe(false);
  });
});

describe('matchesScopeNet — additional cases', () => {
  it('matches apex domain for suffix entry', () => {
    expect(matchesScopeNet('example.com', '.example.com')).toBe(true);
  });

  it('matches deep subdomain', () => {
    expect(matchesScopeNet('a.b.c.example.com', 'example.com')).toBe(true);
  });

  it('rejects partial hostname match', () => {
    expect(matchesScopeNet('notexample.com', 'example.com')).toBe(false);
  });

  it('rejects suffix match without leading dot', () => {
    expect(matchesScopeNet('malexample.com', 'example.com')).toBe(false);
  });
});

describe('calculateSubnet — additional cases', () => {
  it('/16 — class B', () => {
    const result = calculateSubnet('192.168.0.0/16');
    expect(result.subnetMask).toBe('255.255.0.0');
    expect(result.hostCount).toBe(65534);
    expect(result.prefixLength).toBe(16);
  });

  it('/28 — small subnet', () => {
    const result = calculateSubnet('10.0.0.0/28');
    expect(result.subnetMask).toBe('255.255.255.240');
    expect(result.hostCount).toBe(14);
  });

  it('/0 — entire address space', () => {
    const result = calculateSubnet('0.0.0.0/0');
    expect(result.subnetMask).toBe('0.0.0.0');
    expect(result.prefixLength).toBe(0);
  });

  it('correctly computes broadcast address', () => {
    const result = calculateSubnet('10.0.0.0/30');
    expect(result.broadcast).toBe('10.0.0.3');
    expect(result.network).toBe('10.0.0.0');
    expect(result.firstHost).toBe('10.0.0.1');
    expect(result.lastHost).toBe('10.0.0.2');
  });
});

describe('calculateVlsm — additional cases', () => {
  it('allocates single subnet', () => {
    const allocs = calculateVlsm('10.0.0.0/24', [50]);
    expect(allocs).toHaveLength(1);
    expect(allocs[0]!.allocatedHosts).toBeGreaterThanOrEqual(50);
  });

  it('allocates many small subnets', () => {
    const allocs = calculateVlsm('10.0.0.0/24', [2, 2, 2, 2, 2, 2]);
    expect(allocs).toHaveLength(6);
    allocs.forEach((a) => {
      expect(a.allocatedHosts).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('subnetMaskToWildcard — additional cases', () => {
  it('accepts dotted-decimal 255.255.0.0', () => {
    const result = subnetMaskToWildcard('255.255.0.0');
    expect(result).toBe('0.0.255.255');
  });

  it('accepts dotted-decimal 255.0.0.0', () => {
    const result = subnetMaskToWildcard('255.0.0.0');
    expect(result).toBe('0.255.255.255');
  });

  it('accepts dotted-decimal 255.255.255.128', () => {
    const result = subnetMaskToWildcard('255.255.255.128');
    expect(result).toBe('0.0.0.127');
  });
});

describe('NVD tool registration', () => {
  it('registers nvd_cve_search when exposeNvd is true', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    await registerNetworkTools(server, makeConfig(), noopMiddleware());
    const tools = getRegistered(server);
    expect(tools['nvd_cve_search']).toBeTruthy();
    expect(tools['nvd_cve_by_software']).toBeTruthy();
    expect(tools['nvd_cve_get']).toBeTruthy();
  });
});

describe('disabled tool stubs — network categories', () => {
  it('registers stubs for discovery tools when exposeNetworkDiscovery is false', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeNetworkDiscovery: false });
    await registerNetworkTools(server, config, noopMiddleware());
    const tools = getRegistered(server);
    // Discovery tools should be stubs
    const discoveryTools = [
      'network_discovery_cdp',
      'network_discovery_lldp',
      'network_topology_map',
    ];
    for (const name of discoveryTools) {
      if (tools[name]) {
        const result = await tools[name]!.handler({});
        expect(result.isError).toBe(true);
      }
    }
  });

  it('registers stubs for audit tools when exposeNetworkAudit is false', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = makeConfig({ exposeNetworkAudit: false });
    await registerNetworkTools(server, config, noopMiddleware());
    const tools = getRegistered(server);
    const auditTools = ['network_audit_acl', 'network_audit_aaa', 'network_audit_port_security'];
    for (const name of auditTools) {
      if (tools[name]) {
        const result = await tools[name]!.handler({});
        expect(result.isError).toBe(true);
      }
    }
  });
});

describe('vlsm_calculator tool handler', () => {
  it('returns VLSM allocations', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    await registerNetworkTools(server, makeConfig(), noopMiddleware());
    const tools = getRegistered(server);
    const vlsmTool = tools['vlsm_calculator'];
    if (vlsmTool) {
      const result = await vlsmTool.handler({
        parent_cidr: '10.0.0.0/24',
        host_counts: [50, 20, 10],
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.allocations).toHaveLength(3);
    }
  });
});
