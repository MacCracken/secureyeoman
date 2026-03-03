/**
 * Threat Patterns — Built-in threat pattern database (Phase 116-C)
 *
 * Categories: reverse shells, web shells, cryptominers, ransomware,
 * credential harvesters, supply chain. Each with kill chain stage,
 * indicators, co-occurrence amplification, intent weight.
 */

import type { ThreatPattern } from './types.js';

export const BUILTIN_THREAT_PATTERNS: ThreatPattern[] = [
  // ── Reverse Shells ──
  {
    id: 'threat-revshell-bash',
    name: 'Bash reverse shell',
    category: 'reverse_shell',
    description: 'Bash-based reverse shell connecting back to attacker',
    killChainStage: 'command_and_control',
    indicators: [
      /bash\s+-i\s+>&\s*\/dev\/tcp\//,
      /\bnc\s+.*-e\s+\/bin\/(?:ba)?sh\b/,
      /\bmkfifo\b.*\bnc\b.*\bcat\b/,
    ],
    coOccurrenceWith: ['threat-exfil-dns', 'threat-privesc-sudo'],
    intentWeight: 0.9,
    version: '1.0.0',
  },
  {
    id: 'threat-revshell-python',
    name: 'Python reverse shell',
    category: 'reverse_shell',
    description: 'Python-based reverse shell using socket module',
    killChainStage: 'command_and_control',
    indicators: [
      /import\s+socket.*subprocess/,
      /socket\.socket\(.*SOCK_STREAM\).*connect/,
      /os\.dup2\(s\.fileno\(\)/,
    ],
    coOccurrenceWith: ['threat-revshell-bash'],
    intentWeight: 0.9,
    version: '1.0.0',
  },
  {
    id: 'threat-revshell-node',
    name: 'Node.js reverse shell',
    category: 'reverse_shell',
    description: 'Node.js reverse shell via child_process and net',
    killChainStage: 'command_and_control',
    indicators: [
      /require\(['"](?:child_process|net)['"]\).*connect/,
      /new\s+net\.Socket\(\).*connect/,
      /child_process.*exec.*\/bin\/(?:ba)?sh/,
    ],
    intentWeight: 0.9,
    version: '1.0.0',
  },

  // ── Web Shells ──
  {
    id: 'threat-webshell-php',
    name: 'PHP web shell',
    category: 'web_shell',
    description: 'PHP web shell accepting arbitrary command execution',
    killChainStage: 'installation',
    indicators: [
      /\$_(?:GET|POST|REQUEST)\s*\[.*\]\s*.*(?:system|exec|passthru|shell_exec)/,
      /eval\s*\(\s*\$_(?:GET|POST|REQUEST)/,
      /base64_decode\s*\(\s*\$_/,
    ],
    intentWeight: 0.85,
    version: '1.0.0',
  },
  {
    id: 'threat-webshell-jsp',
    name: 'JSP web shell',
    category: 'web_shell',
    description: 'Java/JSP web shell with runtime exec',
    killChainStage: 'installation',
    indicators: [
      /Runtime\.getRuntime\(\)\.exec\(request\.getParameter/,
      /ProcessBuilder.*request\.getParameter/,
    ],
    intentWeight: 0.85,
    version: '1.0.0',
  },

  // ── Cryptominers ──
  {
    id: 'threat-miner-stratum',
    name: 'Stratum mining protocol',
    category: 'cryptominer',
    description: 'Cryptocurrency mining pool connection via Stratum protocol',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /stratum\+tcp:\/\//,
      /stratum\+ssl:\/\//,
      /mining\.subscribe/,
      /mining\.authorize/,
    ],
    coOccurrenceWith: ['threat-privesc-sudo'],
    intentWeight: 0.8,
    version: '1.0.0',
  },
  {
    id: 'threat-miner-coinhive',
    name: 'Browser-based miner',
    category: 'cryptominer',
    description: 'In-browser cryptocurrency mining (CoinHive-style)',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /coinhive|cryptonight|mineralt|webminepool/i,
      /CryptoNight/,
      /monero.*(?:wallet|pool)/i,
    ],
    intentWeight: 0.7,
    version: '1.0.0',
  },

  // ── Ransomware ──
  {
    id: 'threat-ransom-encrypt',
    name: 'File encryption loop',
    category: 'ransomware',
    description: 'Recursive file encryption pattern (ransomware behavior)',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /(?:walkSync|readdirSync|glob\.sync).*(?:createCipheriv|AES|encrypt)/,
      /for.*(?:readdir|scandir|os\.walk).*(?:encrypt|cipher)/i,
      /\.encrypted|\.locked|\.ransom/,
    ],
    coOccurrenceWith: ['threat-ransom-note'],
    intentWeight: 0.95,
    version: '1.0.0',
  },
  {
    id: 'threat-ransom-note',
    name: 'Ransom note creation',
    category: 'ransomware',
    description: 'Creation of ransom demand note files',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /README_RECOVERY|HOW_TO_DECRYPT|RANSOM_NOTE/i,
      /bitcoin.*(?:wallet|address|payment)/i,
      /your\s+files\s+(?:have\s+been|are)\s+encrypted/i,
    ],
    coOccurrenceWith: ['threat-ransom-encrypt'],
    intentWeight: 0.95,
    version: '1.0.0',
  },

  // ── Credential Harvesters ──
  {
    id: 'threat-cred-keylogger',
    name: 'Keylogger',
    category: 'credential_harvester',
    description: 'Keyboard event interception for credential theft',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /addEventListener\(['"]key(?:down|press|up)['"]/,
      /document\.onkey(?:down|press|up)/,
      /SetWindowsHookEx.*WH_KEYBOARD/,
    ],
    coOccurrenceWith: ['threat-exfil-dns'],
    intentWeight: 0.7,
    version: '1.0.0',
  },
  {
    id: 'threat-cred-phishing',
    name: 'Credential phishing form',
    category: 'credential_harvester',
    description: 'Fake login form to harvest credentials',
    killChainStage: 'delivery',
    indicators: [
      /type=['"]password['"].*action=['"]\s*https?:\/\/(?!(?:localhost|127\.0\.0\.1))/,
      /login.*form.*submit.*fetch|XMLHttpRequest/i,
    ],
    intentWeight: 0.6,
    version: '1.0.0',
  },

  // ── Supply Chain ──
  {
    id: 'threat-supply-typosquat',
    name: 'Typosquatting package',
    category: 'supply_chain',
    description: 'Installation of potentially typosquatted packages',
    killChainStage: 'delivery',
    indicators: [
      /npm\s+install\s+(?:lodahs|reqeusts|bable|colrs|chak)/i,
      /pip\s+install\s+(?:requets|flassk|djang|numppy)/i,
    ],
    intentWeight: 0.6,
    version: '1.0.0',
  },
  {
    id: 'threat-supply-postinstall',
    name: 'Malicious postinstall script',
    category: 'supply_chain',
    description: 'Package postinstall hook executing suspicious commands',
    killChainStage: 'installation',
    indicators: [
      /"postinstall"\s*:\s*".*(?:curl|wget|nc|bash|node\s+-e)/,
      /"preinstall"\s*:\s*".*(?:curl|wget|nc|bash|node\s+-e)/,
    ],
    coOccurrenceWith: ['threat-revshell-node'],
    intentWeight: 0.8,
    version: '1.0.0',
  },

  // ── Data Exfiltration ──
  {
    id: 'threat-exfil-dns',
    name: 'DNS exfiltration',
    category: 'data_exfiltration',
    description: 'Data exfiltration via DNS queries',
    killChainStage: 'actions_on_objectives',
    indicators: [
      /dns\.resolve.*\+.*\.(?:evil|exfil|leak)/i,
      /nslookup.*\$\(/,
      /dig\s+.*\$\{/,
    ],
    intentWeight: 0.7,
    version: '1.0.0',
  },

  // ── Privilege Escalation ──
  {
    id: 'threat-privesc-sudo',
    name: 'Privilege escalation',
    category: 'privilege_escalation',
    description: 'Attempt to escalate privileges via sudo/SUID',
    killChainStage: 'exploitation',
    indicators: [
      /sudo\s+-S\s+/,
      /find\s+\/\s+-perm\s+-4000/,
      /SUID.*bash|chmod\s+[47][0-7]{2}/,
    ],
    intentWeight: 0.75,
    version: '1.0.0',
  },
];
