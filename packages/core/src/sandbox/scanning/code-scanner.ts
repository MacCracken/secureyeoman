/**
 * Code Scanner — Static analysis for sandbox artifacts (Phase 116-A)
 *
 * Detects command injection, data exfiltration, privilege escalation,
 * supply chain attacks, and obfuscation patterns. Regex-based, line-by-line.
 * JS/TS/Python/Shell/SQL supported. Anti-ReDoS guards.
 */

import { randomUUID } from 'node:crypto';
import type { ScanFinding } from '@secureyeoman/shared';
import type { ArtifactScanner, SandboxArtifact } from './types.js';

const MAX_FINDINGS = 200;
const MAX_LINE_LENGTH = 10_000;

interface CodePattern {
  id: string;
  category: string;
  severity: ScanFinding['severity'];
  message: string;
  pattern: RegExp;
  cwe?: string;
  recommendation?: string;
}

const CODE_PATTERNS: CodePattern[] = [
  // ── Command Injection ──
  {
    id: 'cmd-exec',
    category: 'command_injection',
    severity: 'critical',
    message: 'Direct command execution with potential user input',
    pattern: /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(/i,
    cwe: 'CWE-78',
    recommendation: 'Use parameterized commands or allowlist-based execution',
  },
  {
    id: 'cmd-shell',
    category: 'command_injection',
    severity: 'critical',
    message: 'Shell command execution via child_process or os.system',
    pattern: /\b(?:child_process|subprocess|os\.system|os\.popen|Popen)\b/,
    cwe: 'CWE-78',
    recommendation: 'Avoid shell=True and use argument arrays',
  },
  {
    id: 'cmd-eval',
    category: 'command_injection',
    severity: 'critical',
    message: 'Dynamic code evaluation (eval/Function constructor)',
    pattern: /\b(?:eval|new\s+Function|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`])\b/,
    cwe: 'CWE-95',
    recommendation: 'Use safe parsers instead of eval',
  },
  {
    id: 'cmd-backtick-shell',
    category: 'command_injection',
    severity: 'high',
    message: 'Shell backtick or $() command substitution',
    pattern: /`[^`]*\$\(|`[^`]*`|\$\([^)]+\)/,
    cwe: 'CWE-78',
  },

  // ── Data Exfiltration ──
  {
    id: 'exfil-fetch',
    category: 'data_exfiltration',
    severity: 'high',
    message: 'Outbound HTTP request that may exfiltrate data',
    pattern: /\b(?:fetch|axios|request|http\.get|https\.get|urllib|requests\.(?:get|post))\s*\(/,
    cwe: 'CWE-200',
    recommendation: 'Ensure outbound requests are authorized and data is sanitized',
  },
  {
    id: 'exfil-dns',
    category: 'data_exfiltration',
    severity: 'high',
    message: 'DNS-based data exfiltration attempt',
    pattern: /\b(?:dns\.resolve|dns\.lookup|nslookup|dig\s+)\b/,
    cwe: 'CWE-200',
  },
  {
    id: 'exfil-webhook',
    category: 'data_exfiltration',
    severity: 'medium',
    message: 'Potential data exfiltration via webhook or external endpoint',
    pattern: /(?:webhook|discord\.com\/api|hooks\.slack\.com|api\.telegram)/i,
    cwe: 'CWE-200',
  },
  {
    id: 'exfil-base64-send',
    category: 'data_exfiltration',
    severity: 'medium',
    message: 'Base64 encoding of data near outbound call',
    pattern: /btoa\s*\(|Buffer\.from\(.*\)\.toString\s*\(\s*['"]base64['"]\)|base64\.b64encode/,
    cwe: 'CWE-200',
  },

  // ── Privilege Escalation ──
  {
    id: 'privesc-sudo',
    category: 'privilege_escalation',
    severity: 'critical',
    message: 'Privilege escalation via sudo/su/doas',
    pattern: /\b(?:sudo|su\s+-|doas)\s+/,
    cwe: 'CWE-269',
    recommendation: 'Sandbox code should never require privilege escalation',
  },
  {
    id: 'privesc-chmod',
    category: 'privilege_escalation',
    severity: 'high',
    message: 'Permission modification (chmod/chown/setuid)',
    pattern: /\b(?:chmod\s+[0-7]{3,4}|chown|setuid|setgid|seteuid)\b/,
    cwe: 'CWE-269',
  },
  {
    id: 'privesc-proc',
    category: 'privilege_escalation',
    severity: 'high',
    message: 'Access to sensitive /proc or /sys filesystem',
    pattern: /(?:\/proc\/|\/sys\/|\/dev\/mem|\/dev\/kmem)/,
    cwe: 'CWE-269',
  },

  // ── Supply Chain ──
  {
    id: 'supply-install',
    category: 'supply_chain',
    severity: 'high',
    message: 'Dynamic package installation at runtime',
    pattern: /\b(?:npm\s+install|pip\s+install|yarn\s+add|gem\s+install|cargo\s+install)\b/,
    cwe: 'CWE-829',
    recommendation: 'Pre-approve all dependencies; do not install at runtime',
  },
  {
    id: 'supply-require-dynamic',
    category: 'supply_chain',
    severity: 'medium',
    message: 'Dynamic module loading with variable path',
    pattern: /\b(?:require|import)\s*\(\s*(?!['"])/,
    cwe: 'CWE-829',
  },
  {
    id: 'supply-curl-pipe',
    category: 'supply_chain',
    severity: 'critical',
    message: 'Curl-pipe-shell pattern (remote code execution)',
    pattern: /curl\s+.*\|\s*(?:sh|bash|zsh|python)/,
    cwe: 'CWE-829',
    recommendation: 'Never pipe remote content directly to a shell',
  },

  // ── Obfuscation ──
  {
    id: 'obfusc-hex-escape',
    category: 'obfuscation',
    severity: 'medium',
    message: 'Excessive hex/unicode escape sequences (possible obfuscation)',
    pattern: /(?:\\x[0-9a-f]{2}){4,}|(?:\\u[0-9a-f]{4}){3,}/i,
    cwe: 'CWE-116',
  },
  {
    id: 'obfusc-char-code',
    category: 'obfuscation',
    severity: 'medium',
    message: 'String construction from char codes (obfuscation technique)',
    pattern: /String\.fromCharCode\s*\(|chr\s*\(\s*\d+/,
    cwe: 'CWE-116',
  },
  {
    id: 'obfusc-atob',
    category: 'obfuscation',
    severity: 'low',
    message: 'Base64 decode that may hide malicious content',
    pattern: /\batob\s*\(|Buffer\.from\(.*,\s*['"]base64['"]\)|base64\.b64decode/,
  },

  // ── SQL Injection ──
  {
    id: 'sql-concat',
    category: 'sql_injection',
    severity: 'high',
    message: 'SQL query built via string concatenation',
    pattern:
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\s+.*\+\s*(?:req\.|params\.|query\.|body\.)/i,
    cwe: 'CWE-89',
    recommendation: 'Use parameterized queries',
  },
  {
    id: 'sql-template',
    category: 'sql_injection',
    severity: 'high',
    message: 'SQL query with template literal interpolation',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*\$\{/i,
    cwe: 'CWE-89',
  },

  // ── File System Access ──
  {
    id: 'fs-sensitive-read',
    category: 'filesystem',
    severity: 'high',
    message: 'Reading sensitive system files',
    pattern: /(?:\/etc\/(?:passwd|shadow|sudoers)|~\/\.ssh\/|\.env|\.git\/config)/,
    cwe: 'CWE-552',
  },
  {
    id: 'fs-write-startup',
    category: 'filesystem',
    severity: 'critical',
    message: 'Writing to startup/cron/systemd locations',
    pattern: /(?:\/etc\/cron|crontab|\.bashrc|\.profile|\.bash_profile|systemd\/system)/,
    cwe: 'CWE-269',
  },

  // ── Network ──
  {
    id: 'net-reverse-shell',
    category: 'reverse_shell',
    severity: 'critical',
    message: 'Reverse shell pattern detected',
    pattern: /\b(?:nc\s+-e|ncat\s+-e|bash\s+-i\s+>&|\/dev\/tcp\/|mkfifo\s+.*\bcat\b)/,
    cwe: 'CWE-78',
  },
  {
    id: 'net-bind-shell',
    category: 'reverse_shell',
    severity: 'critical',
    message: 'Bind shell pattern detected',
    pattern: /\b(?:nc\s+-l|ncat\s+-l|socat\s+TCP-LISTEN)/,
    cwe: 'CWE-78',
  },
];

export class CodeScanner implements ArtifactScanner {
  readonly name = 'code-scanner';
  readonly version = '1.0.0';

  async scan(artifact: SandboxArtifact, signal?: AbortSignal): Promise<ScanFinding[]> {
    const content =
      typeof artifact.content === 'string' ? artifact.content : artifact.content.toString('utf-8');

    // Skip binary-looking content
    if (this.isBinary(content)) return [];

    const findings: ScanFinding[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (signal?.aborted) break;
      if (findings.length >= MAX_FINDINGS) break;

      // Anti-ReDoS: skip extremely long lines
      const rawLine = lines[i] ?? '';
      const line =
        rawLine.length > MAX_LINE_LENGTH ? rawLine.substring(0, MAX_LINE_LENGTH) : rawLine;

      // Skip comment lines
      if (this.isComment(line)) continue;

      for (const pattern of CODE_PATTERNS) {
        if (findings.length >= MAX_FINDINGS) break;
        if (pattern.pattern.test(line)) {
          findings.push({
            id: randomUUID(),
            scanner: this.name,
            severity: pattern.severity,
            category: pattern.category,
            message: pattern.message,
            line: i + 1,
            evidence: line.trim().substring(0, 200),
            cwe: pattern.cwe,
            recommendation: pattern.recommendation,
          });
          break; // One finding per line per pattern category
        }
      }
    }

    return findings;
  }

  private isBinary(content: string): boolean {
    // Check first 1KB for null bytes
    const sample = content.substring(0, 1024);
    return sample.includes('\0');
  }

  private isComment(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('--') ||
      trimmed.startsWith('"""') ||
      trimmed.startsWith("'''")
    );
  }
}
