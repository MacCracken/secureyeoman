/**
 * Security Tools — Kali Linux security tooling exposed as MCP tools.
 *
 * Requires MCP_EXPOSE_SECURITY_TOOLS=true and MCP_ALLOWED_TARGETS to be set.
 *
 * Supports two deployment modes:
 *   native      — tools are invoked directly from the host PATH
 *   docker-exec — tools are invoked via `docker exec` into a running container
 *
 * Use `secureyeoman security setup` to provision the docker-exec container.
 *
 * Active tools (those that reach out to a target) enforce scope validation
 * against MCP_ALLOWED_TARGETS before executing. Passive/offline tools skip it.
 */

import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const MAX_OUTPUT = 10 * 1024 * 1024; // 10MB
const TOOL_TIMEOUT = 120_000; // 2 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

class ScopeViolationError extends Error {
  constructor(target: string, allowed: string[]) {
    super(
      `Target "${target}" is outside the declared scope. ` +
        `Allowed targets: ${allowed.length > 0 ? allowed.join(', ') : '(none configured)'}. ` +
        `Configure MCP_ALLOWED_TARGETS to include this target.`
    );
    this.name = 'ScopeViolationError';
  }
}

/**
 * Check whether a dotted-decimal IPv4 address falls within a CIDR range.
 * Returns false for any malformed input — fail-closed.
 * Exported for unit testing.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr] = cidr.split('/');
  if (bitsStr === undefined) return false;
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  // Require well-formed dotted-decimal for both operands
  const ipv4Re = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (!ipv4Re.test(ip) || !network || !ipv4Re.test(network)) return false;
  const toNum = (s: string): number =>
    s.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toNum(ip) & mask) === (toNum(network) & mask);
}

/**
 * Check whether a resolved target (IP or hostname) matches a single scope entry.
 * Entry forms:
 *   - `10.10.10.0/24`  → CIDR range match for IPv4 targets
 *   - `.example.com`   → domain suffix match (includes the apex)
 *   - `example.com`    → exact hostname or subdomain
 *   - `10.10.10.5`     → exact IP
 * Exported for unit testing.
 */
export function matchesScope(target: string, entry: string): boolean {
  if (entry === target) return true;
  // CIDR range
  if (entry.includes('/')) return isIpInCidr(target, entry);
  // Domain suffix (entry starts with '.')
  if (entry.startsWith('.')) return target.endsWith(entry) || target === entry.slice(1);
  // Exact hostname or subdomain of entry
  return target === entry || target.endsWith(`.${entry}`);
}

function validateTarget(target: string, config: McpServiceConfig): void {
  const { allowedTargets } = config;

  if (allowedTargets.length === 0) {
    throw new ScopeViolationError(target, []);
  }

  // Wildcard — explicit lab/CTF acknowledgement
  if (allowedTargets.includes('*')) return;

  const ok = allowedTargets.some((entry) => matchesScope(target, entry));

  if (!ok) {
    throw new ScopeViolationError(target, allowedTargets);
  }
}

function runTool(
  config: McpServiceConfig,
  toolBin: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  let cmd: string;
  let cmdArgs: string[];

  if (config.securityToolsMode === 'docker-exec') {
    cmd = 'docker';
    cmdArgs = ['exec', '-i', config.securityToolsContainer, toolBin, ...args];
  } else {
    cmd = toolBin;
    cmdArgs = args;
  }

  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      cmdArgs,
      { maxBuffer: MAX_OUTPUT, timeout: TOOL_TIMEOUT },
      (error: Error | null, stdout: string, stderr: string) => {
        // Security tools often exit non-zero even on success (e.g. nmap, nikto)
        // so we resolve as long as we have some output.
        if (error && !stdout && !stderr) {
          reject(error);
          return;
        }
        resolve({
          stdout:
            stdout.length > MAX_OUTPUT ? stdout.slice(0, MAX_OUTPUT) + '\n...[truncated]' : stdout,
          stderr:
            stderr.length > MAX_OUTPUT ? stderr.slice(0, MAX_OUTPUT) + '\n...[truncated]' : stderr,
        });
      }
    );
  });
}

function formatSecResult(
  tool: string,
  target: string,
  command: string,
  stdout: string,
  stderr: string,
  envelope?: string
): string {
  const parts: string[] = [`Tool: ${tool}`, `Target: ${target}`, `Command: ${command}`, '---'];
  if (stdout.trim()) parts.push(stdout.trim());
  if (stderr.trim()) parts.push(`stderr:\n${stderr.trim()}`);
  if (!stdout.trim() && !stderr.trim()) parts.push('(no output)');
  if (envelope) parts.push(`---JSON---\n${envelope}`);
  return parts.join('\n');
}

function buildCommandString(config: McpServiceConfig, toolBin: string, args: string[]): string {
  if (config.securityToolsMode === 'docker-exec') {
    return `docker exec -i ${config.securityToolsContainer} ${toolBin} ${args.join(' ')}`;
  }
  return `${toolBin} ${args.join(' ')}`;
}

// ─── Output Parsers ───────────────────────────────────────────────────────────

export interface NmapResult {
  hosts: {
    ip: string;
    hostname: string;
    ports: { port: number; protocol: string; state: string; service: string; version: string }[];
  }[];
}

export function parseNmapXml(xml: string): NmapResult {
  const result: NmapResult = { hosts: [] };
  try {
    const hostMatches = xml.match(/<host\b[^>]*>([\s\S]*?)<\/host>/g);
    if (!hostMatches) return result;
    for (const hostBlock of hostMatches) {
      const addrMatch = /<address\s+addr="([^"]+)"\s+addrtype="ipv4"/.exec(hostBlock);
      const hostnameMatch = /<hostname\s+name="([^"]+)"/.exec(hostBlock);
      const ip = addrMatch?.[1] ?? '';
      const hostname = hostnameMatch?.[1] ?? ip;
      const ports: NmapResult['hosts'][0]['ports'] = [];
      const portBlocks = hostBlock.match(/<port\b[^>]*>([\s\S]*?)<\/port>/g);
      if (portBlocks) {
        for (const pb of portBlocks) {
          const portIdMatch = /portid="(\d+)"/.exec(pb);
          const protocolMatch = /protocol="(\w+)"/.exec(pb);
          const stateMatch = /<state\s+state="(\w+)"/.exec(pb);
          const serviceMatch = /<service\s+name="([^"]+)"/.exec(pb);
          const versionMatch = /version="([^"]+)"/.exec(pb);
          if (portIdMatch?.[1]) {
            ports.push({
              port: parseInt(portIdMatch[1], 10),
              protocol: protocolMatch?.[1] ?? 'tcp',
              state: stateMatch?.[1] ?? 'unknown',
              service: serviceMatch?.[1] ?? '',
              version: versionMatch?.[1] ?? '',
            });
          }
        }
      }
      result.hosts.push({ ip, hostname, ports });
    }
  } catch {
    // Return partial results on parse error
  }
  return result;
}

export interface SqlmapResult {
  injectable: { parameter: string; type: string }[];
  dbms: string | null;
}

export function parseSqlmapOutput(text: string): SqlmapResult {
  const result: SqlmapResult = { injectable: [], dbms: null };
  try {
    const paramMatches = text.matchAll(/Parameter:\s+(\S+)[^\n]*\n\s+Type:\s+([^\n]+)/g);
    for (const m of paramMatches) {
      const parameter = m[1] ?? '';
      const type = (m[2] ?? '').trim();
      result.injectable.push({ parameter, type });
    }
    const dbmsMatch = /back-end DBMS:\s+([^\n]+)/i.exec(text);
    if (dbmsMatch?.[1]) result.dbms = dbmsMatch[1].trim();
  } catch {
    // Return partial results
  }
  return result;
}

export interface NucleiResult {
  findings: { templateId: string; severity: string; host: string; matched: string; name: string }[];
}

export function parseNucleiJsonl(text: string): NucleiResult {
  const result: NucleiResult = { findings: [] };
  const lines = text.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      result.findings.push({
        templateId: (obj['template-id'] as string) ?? '',
        severity: ((obj.info as Record<string, unknown>)?.severity as string) ?? '',
        host: (obj.host as string) ?? '',
        matched: (obj['matched-at'] as string) ?? '',
        name: ((obj.info as Record<string, unknown>)?.name as string) ?? '',
      });
    } catch {
      // Skip malformed lines
    }
  }
  return result;
}

export interface GobusterResult {
  found: string[];
  mode: 'dir' | 'dns' | 'vhost';
}

export function parseGobusterOutput(
  text: string,
  mode: 'dir' | 'dns' | 'vhost' = 'dir'
): GobusterResult {
  const found: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('/') ||
      (mode !== 'dir' && trimmed.length > 0 && !trimmed.startsWith('='))
    ) {
      // Extract just the path/hostname from gobuster output lines
      const match = /^(\S+)/.exec(trimmed);
      if (match?.[1]) found.push(match[1]);
    }
  }
  return { found, mode };
}

export interface HydraResult {
  credentials: { login: string; password: string; host: string; port: string; service: string }[];
}

export function parseHydraOutput(text: string): HydraResult {
  const result: HydraResult = { credentials: [] };
  // Lines like: [22][ssh] host: 10.x.x.x   login: root   password: toor
  const lineRe = /\[(\d+)\]\[(\w[\w-]*)\]\s+host:\s+(\S+)\s+login:\s+(\S+)\s+password:\s+(\S+)/g;
  const matches = text.matchAll(lineRe);
  for (const m of matches) {
    result.credentials.push({
      port: m[1] ?? '',
      service: m[2] ?? '',
      host: m[3] ?? '',
      login: m[4] ?? '',
      password: m[5] ?? '',
    });
  }
  return result;
}

function buildEnvelope(
  tool: string,
  target: string,
  command: string,
  parsed: unknown,
  exitCode: number
): string {
  return JSON.stringify({ tool, target, command, parsed, exit_code: exitCode });
}

async function checkAvailable(config: McpServiceConfig, bin: string): Promise<boolean> {
  try {
    await runTool(config, 'which', [bin]);
    return true;
  } catch {
    return false;
  }
}

const DISABLED_MSG =
  'Security tools are disabled. Set MCP_EXPOSE_SECURITY_TOOLS=true and configure MCP_ALLOWED_TARGETS.';

// ─── Registration ────────────────────────────────────────────────────────────

export async function registerSecurityTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): Promise<void> {
  // Guard: feature flag check at registration time
  if (!config.exposeSecurityTools) {
    // Register stub tools that return the disabled message so agents understand why
    const stubTools = [
      'sec_nmap',
      'sec_gobuster',
      'sec_ffuf',
      'sec_sqlmap',
      'sec_nikto',
      'sec_nuclei',
      'sec_whatweb',
      'sec_wpscan',
      'sec_hashcat',
      'sec_john',
      'sec_theharvester',
      'sec_dig',
      'sec_whois',
      'sec_shodan',
      'sec_hydra',
    ];
    for (const name of stubTools) {
      server.registerTool(
        name,
        { description: `Security tool (disabled). ${DISABLED_MSG}`, inputSchema: {} },
        wrapToolHandler(name, middleware, async () => ({
          content: [{ type: 'text' as const, text: DISABLED_MSG }],
          isError: true,
        }))
      );
    }
    return;
  }

  // Check availability of each binary concurrently
  const bins = [
    'nmap',
    'gobuster',
    'ffuf',
    'sqlmap',
    'nikto',
    'nuclei',
    'whatweb',
    'wpscan',
    'hashcat',
    'john',
    'theHarvester',
    'dig',
    'whois',
    'hydra',
  ];
  const availability = await Promise.all(bins.map((b) => checkAvailable(config, b)));
  const available = new Map(bins.map((b, i) => [b, availability[i]]));

  const log = (bin: string) => {
    const avail = available.get(bin);
    const status = avail ? 'available' : 'skipped (not found)';
    // eslint-disable-next-line no-console
    console.info(`[security-tools] ${bin}: ${status}`);
  };

  // ── Active tools (require target scope validation) ─────────────────────────

  // sec_nmap
  log('nmap');
  if (available.get('nmap')) {
    server.registerTool(
      'sec_nmap',
      {
        description: 'Run an nmap port/service scan against an authorized target',
        inputSchema: {
          target: z.string().describe('IP address, hostname, or CIDR range to scan'),
          ports: z.string().optional().describe('Port spec, e.g. "22,80,443" or "1-1000"'),
          flags: z.string().optional().describe('Additional nmap flags, e.g. "-sV -sC"'),
        },
      },
      wrapToolHandler('sec_nmap', middleware, async (args) => {
        validateTarget(args.target, config);
        const nmapArgs = ['-v', '-oX', '-'];
        if (args.ports) nmapArgs.push('-p', args.ports);
        if (args.flags) nmapArgs.push(...args.flags.split(/\s+/).filter(Boolean));
        nmapArgs.push(args.target);
        const { stdout, stderr } = await runTool(config, 'nmap', nmapArgs);
        const cmd = buildCommandString(config, 'nmap', nmapArgs);
        const parsed = parseNmapXml(stdout);
        const envelope = buildEnvelope('nmap', args.target, cmd, parsed, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('nmap', args.target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_gobuster
  log('gobuster');
  if (available.get('gobuster')) {
    server.registerTool(
      'sec_gobuster',
      {
        description:
          'Run gobuster directory, DNS, or vhost brute-force against an authorized target',
        inputSchema: {
          target: z.string().describe('Target URL or domain'),
          mode: z.enum(['dir', 'dns', 'vhost']).default('dir').describe('Scan mode'),
          wordlist: z.string().describe('Path to wordlist file'),
        },
      },
      wrapToolHandler('sec_gobuster', middleware, async (args) => {
        validateTarget(args.target, config);
        const gbArgs = [args.mode, '-u', args.target, '-w', args.wordlist, '-q'];
        const { stdout, stderr } = await runTool(config, 'gobuster', gbArgs);
        const cmd = buildCommandString(config, 'gobuster', gbArgs);
        const parsed = parseGobusterOutput(stdout, args.mode);
        const envelope = buildEnvelope('gobuster', args.target, cmd, parsed, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('gobuster', args.target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_ffuf
  log('ffuf');
  if (available.get('ffuf')) {
    server.registerTool(
      'sec_ffuf',
      {
        description:
          'Run ffuf web fuzzer. Place FUZZ in the URL where the wordlist should substitute',
        inputSchema: {
          url: z.string().describe('URL with FUZZ placeholder, e.g. https://target.com/FUZZ'),
          wordlist: z.string().describe('Path to wordlist file'),
          filter: z.string().optional().describe('Filter expression, e.g. "status:404" to exclude'),
        },
      },
      wrapToolHandler('sec_ffuf', middleware, async (args) => {
        // Extract hostname from URL for scope validation
        let target = args.url;
        try {
          target = new URL(args.url.replace('FUZZ', 'test')).hostname;
        } catch {
          /* keep raw */
        }
        validateTarget(target, config);
        const ffufArgs = ['-u', args.url, '-w', args.wordlist, '-s'];
        if (args.filter) ffufArgs.push('-fc', args.filter);
        const { stdout, stderr } = await runTool(config, 'ffuf', ffufArgs);
        const cmd = buildCommandString(config, 'ffuf', ffufArgs);
        const envelope = buildEnvelope('ffuf', target, cmd, null, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('ffuf', target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_sqlmap
  log('sqlmap');
  if (available.get('sqlmap')) {
    server.registerTool(
      'sec_sqlmap',
      {
        description:
          'Run sqlmap SQL injection detection (no --os-shell) against an authorized target',
        inputSchema: {
          url: z.string().describe('Target URL with parameters, e.g. https://target.com/page?id=1'),
          level: z.number().int().min(1).max(5).default(1).describe('Test level (1-5)'),
          risk: z.number().int().min(1).max(3).default(1).describe('Risk level (1-3)'),
        },
      },
      wrapToolHandler('sec_sqlmap', middleware, async (args) => {
        let target = args.url;
        try {
          target = new URL(args.url).hostname;
        } catch {
          /* keep raw */
        }
        validateTarget(target, config);
        // Explicitly block os-shell/os-cmd execution
        const sqlArgs = [
          '-u',
          args.url,
          '--level',
          String(args.level),
          '--risk',
          String(args.risk),
          '--batch',
          '--no-logging',
        ];
        const { stdout, stderr } = await runTool(config, 'sqlmap', sqlArgs);
        const cmd = buildCommandString(config, 'sqlmap', sqlArgs);
        const parsed = parseSqlmapOutput(stdout);
        const envelope = buildEnvelope('sqlmap', target, cmd, parsed, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('sqlmap', target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_nikto
  log('nikto');
  if (available.get('nikto')) {
    server.registerTool(
      'sec_nikto',
      {
        description: 'Run nikto web vulnerability scanner against an authorized target',
        inputSchema: {
          target: z.string().describe('Target URL or hostname'),
        },
      },
      wrapToolHandler('sec_nikto', middleware, async (args) => {
        validateTarget(args.target, config);
        const niktoArgs = ['-h', args.target, '-nointeractive'];
        const { stdout, stderr } = await runTool(config, 'nikto', niktoArgs);
        const cmd = buildCommandString(config, 'nikto', niktoArgs);
        const envelope = buildEnvelope('nikto', args.target, cmd, null, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('nikto', args.target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_nuclei
  log('nuclei');
  if (available.get('nuclei')) {
    server.registerTool(
      'sec_nuclei',
      {
        description: 'Run nuclei template-based vulnerability scanner against an authorized target',
        inputSchema: {
          target: z.string().describe('Target URL'),
          tags: z.string().optional().describe('Comma-separated template tags, e.g. "cve,sqli"'),
        },
      },
      wrapToolHandler('sec_nuclei', middleware, async (args) => {
        let scopeTarget = args.target;
        try {
          scopeTarget = new URL(args.target).hostname;
        } catch {
          /* keep raw */
        }
        validateTarget(scopeTarget, config);
        const nucleiArgs = ['-u', args.target, '-silent', '-j'];
        if (args.tags) nucleiArgs.push('-tags', args.tags);
        const { stdout, stderr } = await runTool(config, 'nuclei', nucleiArgs);
        const cmd = buildCommandString(config, 'nuclei', nucleiArgs);
        const parsed = parseNucleiJsonl(stdout);
        const envelope = buildEnvelope('nuclei', scopeTarget, cmd, parsed, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('nuclei', scopeTarget, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_whatweb
  log('whatweb');
  if (available.get('whatweb')) {
    server.registerTool(
      'sec_whatweb',
      {
        description: 'Fingerprint web technologies on an authorized target',
        inputSchema: {
          target: z.string().describe('Target URL or hostname'),
        },
      },
      wrapToolHandler('sec_whatweb', middleware, async (args) => {
        validateTarget(args.target, config);
        const wwArgs = [args.target, '--quiet'];
        const { stdout, stderr } = await runTool(config, 'whatweb', wwArgs);
        const cmd = buildCommandString(config, 'whatweb', wwArgs);
        const envelope = buildEnvelope('whatweb', args.target, cmd, null, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('whatweb', args.target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // sec_wpscan
  log('wpscan');
  if (available.get('wpscan')) {
    server.registerTool(
      'sec_wpscan',
      {
        description: 'Run WPScan WordPress vulnerability scanner against an authorized target',
        inputSchema: {
          target: z.string().describe('Target URL of a WordPress site'),
        },
      },
      wrapToolHandler('sec_wpscan', middleware, async (args) => {
        let scopeTarget = args.target;
        try {
          scopeTarget = new URL(args.target).hostname;
        } catch {
          /* keep raw */
        }
        validateTarget(scopeTarget, config);
        const wpArgs = ['--url', args.target, '--no-banner', '--quiet'];
        const { stdout, stderr } = await runTool(config, 'wpscan', wpArgs);
        const cmd = buildCommandString(config, 'wpscan', wpArgs);
        const envelope = buildEnvelope('wpscan', scopeTarget, cmd, null, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('wpscan', scopeTarget, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }

  // ── Passive/Offline tools (no scope validation required) ──────────────────

  // sec_hashcat
  log('hashcat');
  if (available.get('hashcat')) {
    server.registerTool(
      'sec_hashcat',
      {
        description: 'Attempt offline hash cracking with hashcat (no live brute-force)',
        inputSchema: {
          hash: z.string().describe('The hash string to crack'),
          mode: z
            .number()
            .int()
            .min(0)
            .describe('Hashcat mode number, e.g. 0 for MD5, 1000 for NTLM'),
          wordlist: z.string().describe('Path to wordlist file'),
        },
      },
      wrapToolHandler('sec_hashcat', middleware, async (args) => {
        const hcArgs = ['-m', String(args.mode), args.hash, args.wordlist, '--quiet'];
        const { stdout, stderr } = await runTool(config, 'hashcat', hcArgs);
        const cmd = buildCommandString(config, 'hashcat', hcArgs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('hashcat', '(offline)', cmd, stdout, stderr),
            },
          ],
        };
      })
    );
  }

  // sec_john
  log('john');
  if (available.get('john')) {
    server.registerTool(
      'sec_john',
      {
        description: 'Attempt offline hash cracking with John the Ripper (no live brute-force)',
        inputSchema: {
          hashfile: z.string().describe('Path to file containing hashes to crack'),
          wordlist: z
            .string()
            .optional()
            .describe('Path to wordlist file (omit for default rules)'),
        },
      },
      wrapToolHandler('sec_john', middleware, async (args) => {
        const johnArgs = [args.hashfile];
        if (args.wordlist) johnArgs.push(`--wordlist=${args.wordlist}`);
        const { stdout, stderr } = await runTool(config, 'john', johnArgs);
        const cmd = buildCommandString(config, 'john', johnArgs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('john', '(offline)', cmd, stdout, stderr),
            },
          ],
        };
      })
    );
  }

  // sec_theharvester
  log('theHarvester');
  if (available.get('theHarvester')) {
    server.registerTool(
      'sec_theharvester',
      {
        description:
          'Run theHarvester OSINT tool to collect emails, subdomains, and hosts for a domain',
        inputSchema: {
          domain: z.string().describe('Target domain for OSINT collection'),
          sources: z
            .string()
            .optional()
            .default('google,bing,dnsdumpster')
            .describe('Comma-separated data sources'),
        },
      },
      wrapToolHandler('sec_theharvester', middleware, async (args) => {
        const thArgs = ['-d', args.domain, '-b', args.sources ?? 'google,bing,dnsdumpster'];
        const { stdout, stderr } = await runTool(config, 'theHarvester', thArgs);
        const cmd = buildCommandString(config, 'theHarvester', thArgs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('theHarvester', args.domain, cmd, stdout, stderr),
            },
          ],
        };
      })
    );
  }

  // sec_dig
  log('dig');
  if (available.get('dig')) {
    server.registerTool(
      'sec_dig',
      {
        description: 'DNS lookup using dig',
        inputSchema: {
          domain: z.string().describe('Domain or hostname to query'),
          type: z
            .string()
            .optional()
            .default('A')
            .describe('DNS record type, e.g. A, AAAA, MX, TXT, NS, CNAME'),
        },
      },
      wrapToolHandler('sec_dig', middleware, async (args) => {
        const digArgs = [args.domain, args.type ?? 'A', '+short'];
        const { stdout, stderr } = await runTool(config, 'dig', digArgs);
        const cmd = buildCommandString(config, 'dig', digArgs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('dig', args.domain, cmd, stdout, stderr),
            },
          ],
        };
      })
    );
  }

  // sec_whois
  log('whois');
  if (available.get('whois')) {
    server.registerTool(
      'sec_whois',
      {
        description: 'WHOIS lookup for a domain or IP',
        inputSchema: {
          domain: z.string().describe('Domain name or IP address to query'),
        },
      },
      wrapToolHandler('sec_whois', middleware, async (args) => {
        const whoisArgs = [args.domain];
        const { stdout, stderr } = await runTool(config, 'whois', whoisArgs);
        const cmd = buildCommandString(config, 'whois', whoisArgs);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('whois', args.domain, cmd, stdout, stderr),
            },
          ],
        };
      })
    );
  }

  // sec_shodan (API-based, no binary required)
  if (config.shodanApiKey) {
    server.registerTool(
      'sec_shodan',
      {
        description: 'Look up a host on Shodan (requires SHODAN_API_KEY)',
        inputSchema: {
          ip: z.string().describe('IP address to look up on Shodan'),
        },
      },
      wrapToolHandler('sec_shodan', middleware, async (args) => {
        const apiKey = config.shodanApiKey;
        if (!apiKey) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Shodan lookup requires SHODAN_API_KEY to be configured.',
              },
            ],
            isError: true,
          };
        }
        const url = `https://api.shodan.io/shodan/host/${encodeURIComponent(args.ip)}?key=${apiKey}`;
        const res = await fetch(url);
        const body = await res.text();
        const text = formatSecResult(
          'shodan',
          args.ip,
          `GET ${url.replace(apiKey, '[REDACTED]')}`,
          body,
          ''
        );
        return { content: [{ type: 'text' as const, text }] };
      })
    );
    // eslint-disable-next-line no-console
    console.info('[security-tools] shodan: available (API key configured)');
  } else {
    // eslint-disable-next-line no-console
    console.info('[security-tools] shodan: skipped (SHODAN_API_KEY not set)');
  }

  // sec_hydra (requires allowBruteForce=true in addition to exposeSecurityTools)
  log('hydra');
  if (available.get('hydra')) {
    server.registerTool(
      'sec_hydra',
      {
        description:
          'Credential brute-force against an authorized target service (requires MCP_ALLOW_BRUTE_FORCE=true)',
        inputSchema: {
          target: z.string().describe('IP address or hostname'),
          port: z.number().int().min(1).max(65535).optional().describe('Service port'),
          service: z
            .enum([
              'ssh',
              'ftp',
              'telnet',
              'http-get',
              'http-post-form',
              'mysql',
              'postgres',
              'rdp',
              'smb',
              'smtp',
            ])
            .describe('Protocol/service to attack'),
          userlist: z.string().describe('Path to username list file'),
          passlist: z.string().describe('Path to password list file'),
          maxThreads: z
            .number()
            .int()
            .min(1)
            .max(16)
            .default(4)
            .describe('Parallel threads (capped at 16)'),
        },
      },
      wrapToolHandler('sec_hydra', middleware, async (args) => {
        if (!config.allowBruteForce) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'sec_hydra requires MCP_ALLOW_BRUTE_FORCE=true. This is a separate opt-in beyond MCP_EXPOSE_SECURITY_TOOLS.',
              },
            ],
            isError: true,
          };
        }
        validateTarget(args.target, config);
        const hydraArgs = [
          '-L',
          args.userlist,
          '-P',
          args.passlist,
          '-t',
          String(args.maxThreads ?? 4),
        ];
        if (args.port) hydraArgs.push('-s', String(args.port));
        hydraArgs.push(`${args.service}://${args.target}`);
        const { stdout, stderr } = await runTool(config, 'hydra', hydraArgs);
        const cmd = buildCommandString(config, 'hydra', hydraArgs);
        const parsed = parseHydraOutput(stdout);
        const envelope = buildEnvelope('hydra', args.target, cmd, parsed, 0);
        return {
          content: [
            {
              type: 'text' as const,
              text: formatSecResult('hydra', args.target, cmd, stdout, stderr, envelope),
            },
          ],
        };
      })
    );
  }
}
