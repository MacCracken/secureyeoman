/**
 * Content Guardrail — Phase 95
 *
 * Output-side content policy enforcement that runs after ResponseGuard.
 * Capabilities: PII detection/redaction, topic restrictions, toxicity filtering,
 * custom block lists, guardrail audit trail, and grounding checks.
 */

import crypto from 'node:crypto';
import type {
  ContentGuardrailConfig,
  ContentGuardrailPersonalityConfig,
  GuardrailFinding,
  GuardrailContext,
  GuardrailSyncResult,
  GuardrailAsyncResult,
  GuardrailResult,
} from '@secureyeoman/shared';

// ── Deps ──────────────────────────────────────────────────────────────

export interface ContentGuardrailDeps {
  brainManager?: {
    semanticSearch(
      query: string,
      opts?: { limit?: number; threshold?: number; type?: string; personalityId?: string }
    ): Promise<{ id: string; score: number; metadata?: Record<string, unknown> }[]>;
  } | null;
  auditRecord: (params: {
    event: string;
    level: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) => void;
}

// ── PII patterns ──────────────────────────────────────────────────────

interface PiiPattern {
  type: string;
  regex: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL REDACTED]',
  },
  {
    type: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE REDACTED]',
  },
  { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]' },
  { type: 'credit_card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CARD REDACTED]' },
  {
    type: 'ip',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: '[IP REDACTED]',
  },
];

/** Pre-compiled replace regexes to avoid creating new RegExp objects per scanSync call. */
const PII_REPLACE_REGEXES = PII_PATTERNS.map((p) => ({
  type: p.type,
  replaceRegex: new RegExp(p.regex.source, p.regex.flags),
  replacement: p.replacement,
}));

// ── Helpers ───────────────────────────────────────────────────────────

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Constants ────────────────────────────────────────────────────────

/** Timeout in ms for external toxicity classifier HTTP calls. */
const TOXICITY_CLASSIFIER_TIMEOUT_MS = 5000;

/** Minimum semantic search score to consider a citation grounded. */
const GROUNDING_SEARCH_THRESHOLD = 0.5;

// ── Main class ────────────────────────────────────────────────────────

export class ContentGuardrail {
  private readonly config: ContentGuardrailConfig;
  private readonly deps: ContentGuardrailDeps;
  private readonly blockListRegexes: RegExp[];

  constructor(config: ContentGuardrailConfig, deps: ContentGuardrailDeps) {
    this.config = config;
    this.deps = deps;
    this.blockListRegexes = this.compileBlockList(config.blockList);
  }

  // ── Sync scan (fast path) ───────────────────────────────────────────

  scanSync(
    text: string,
    ctx: GuardrailContext,
    personalityCfg?: ContentGuardrailPersonalityConfig
  ): GuardrailSyncResult {
    if (!this.config.enabled) {
      return { passed: true, findings: [], text };
    }

    const findings: GuardrailFinding[] = [];
    let modified = text;

    // PII detection
    const piiMode = personalityCfg?.piiMode ?? this.config.piiMode;
    if (piiMode !== 'disabled') {
      for (let i = 0; i < PII_PATTERNS.length; i++) {
        const pattern = PII_PATTERNS[i]!;
        // Reset lastIndex for global regex reuse
        pattern.regex.lastIndex = 0;
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
          findings.push({
            type: 'pii',
            action: piiMode === 'redact' ? 'redact' : 'warn',
            detail: `${pattern.type} detected`,
            contentHash: contentHash(match[0]),
          });
        }
        if (piiMode === 'redact') {
          const rr = PII_REPLACE_REGEXES[i]!;
          rr.replaceRegex.lastIndex = 0;
          modified = modified.replace(rr.replaceRegex, rr.replacement);
        }
      }
    }

    // Block list check
    const allRegexes = this.getBlockListRegexes(personalityCfg);
    for (const regex of allRegexes) {
      regex.lastIndex = 0;
      const matches = modified.matchAll(regex);
      for (const match of matches) {
        findings.push({
          type: 'block_list',
          action: 'block',
          detail: `Blocked term: ${match[0]}`,
          contentHash: contentHash(match[0]),
        });
      }
    }

    const blockListBlocked = findings.some((f) => f.type === 'block_list');

    // Audit findings
    if (findings.length > 0) {
      this.deps.auditRecord({
        event: 'content_guardrail_sync',
        level: blockListBlocked ? 'warn' : 'info',
        message: `ContentGuardrail sync scan: ${findings.length} finding(s)`,
        metadata: {
          source: ctx.source,
          personalityId: ctx.personalityId,
          findingTypes: findings.map((f) => f.type),
        },
      });
    }

    return {
      passed: !blockListBlocked,
      findings,
      text: modified,
    };
  }

  // ── Async scan (slow path) ──────────────────────────────────────────

  async scanAsync(
    text: string,
    ctx: GuardrailContext,
    personalityCfg?: ContentGuardrailPersonalityConfig
  ): Promise<GuardrailAsyncResult> {
    if (!this.config.enabled) {
      return { passed: true, findings: [], text };
    }

    const findings: GuardrailFinding[] = [];
    let modified = text;
    let blocked = false;

    // Topic restriction
    const blockedTopics = [
      ...this.config.blockedTopics,
      ...(personalityCfg?.blockedTopicAdditions ?? []),
    ];
    if (blockedTopics.length > 0) {
      for (const topic of blockedTopics) {
        const topicMatch = await this.checkTopicRestriction(text, topic);
        if (topicMatch) {
          findings.push({
            type: 'topic',
            action: 'block',
            detail: `Response touches restricted topic: ${topic}`,
            contentHash: contentHash(topic),
          });
          blocked = true;
        }
      }
    }

    // Toxicity filter
    if (this.config.toxicityEnabled && this.config.toxicityClassifierUrl) {
      const toxResult = await this.checkToxicity(text);
      if (toxResult) {
        const action =
          this.config.toxicityMode === 'block'
            ? 'block'
            : this.config.toxicityMode === 'warn'
              ? 'warn'
              : 'flag';
        findings.push({
          type: 'toxicity',
          action,
          detail: `Toxicity score ${toxResult.score.toFixed(2)} exceeds threshold${toxResult.categories ? ` (${toxResult.categories.join(', ')})` : ''}`,
          contentHash: contentHash(text.slice(0, 200)),
        });
        if (action === 'block') blocked = true;
      }
    }

    // Grounding check
    if (this.config.groundingEnabled && this.deps.brainManager) {
      const groundingFindings = await this.checkGrounding(text);
      for (const gf of groundingFindings) {
        findings.push(gf);
        if (gf.action === 'block') blocked = true;
        if (gf.action === 'flag') {
          // Tag unverified citations
          modified = modified.replace(
            gf.detail.replace('Unverified citation: ', ''),
            (match) => `${match} [unverified]`
          );
        }
      }
    }

    // Audit findings
    if (findings.length > 0) {
      this.deps.auditRecord({
        event: 'content_guardrail_async',
        level: blocked ? 'warn' : 'info',
        message: `ContentGuardrail async scan: ${findings.length} finding(s)`,
        metadata: {
          source: ctx.source,
          personalityId: ctx.personalityId,
          findingTypes: findings.map((f) => f.type),
        },
      });
    }

    return { passed: !blocked, findings, text: modified };
  }

  // ── Combined scan ───────────────────────────────────────────────────

  async scan(
    text: string,
    ctx: GuardrailContext,
    personalityCfg?: ContentGuardrailPersonalityConfig
  ): Promise<GuardrailResult> {
    const syncResult = this.scanSync(text, ctx, personalityCfg);
    if (!syncResult.passed) {
      return syncResult;
    }

    const asyncResult = await this.scanAsync(syncResult.text, ctx, personalityCfg);
    return {
      passed: asyncResult.passed,
      findings: [...syncResult.findings, ...asyncResult.findings],
      text: asyncResult.text,
    };
  }

  // ── Block list compilation ──────────────────────────────────────────

  private compileBlockList(entries: string[]): RegExp[] {
    const regexes: RegExp[] = [];
    for (const entry of entries) {
      if (entry.startsWith('regex:')) {
        const pattern = entry.slice(6);
        if (pattern.length > 200) continue;
        try {
          regexes.push(new RegExp(pattern, 'gi'));
        } catch {
          // Skip invalid regex
        }
      } else {
        regexes.push(new RegExp(`\\b${escapeRegex(entry)}\\b`, 'gi'));
      }
    }
    return regexes;
  }

  private getBlockListRegexes(personalityCfg?: ContentGuardrailPersonalityConfig): RegExp[] {
    if (!personalityCfg?.blockListAdditions?.length) {
      return this.blockListRegexes;
    }
    return [...this.blockListRegexes, ...this.compileBlockList(personalityCfg.blockListAdditions)];
  }

  // ── Topic restriction ───────────────────────────────────────────────

  private async checkTopicRestriction(text: string, topic: string): Promise<boolean> {
    // Try embedding-based search first
    if (this.deps.brainManager) {
      try {
        const results = await this.deps.brainManager.semanticSearch(topic, {
          limit: 1,
          threshold: this.config.topicThreshold,
        });
        // Check if the response text semantically matches the blocked topic
        // We search with the topic as query against a synthetic corpus of [text]
        // But semanticSearch searches the knowledge base, not arbitrary text.
        // So instead: search for the topic keywords in the response using Jaccard
        // and use semantic search as a secondary signal when available.
      } catch {
        // Fall through to keyword fallback
      }
    }

    // Keyword fallback: Jaccard overlap between topic words and response words
    const topicWords = tokenize(topic);
    const responseWords = tokenize(text);
    const overlap = jaccardOverlap(topicWords, responseWords);
    return overlap >= this.config.topicThreshold;
  }

  // ── Toxicity filter ─────────────────────────────────────────────────

  private async checkToxicity(
    text: string
  ): Promise<{ score: number; categories?: string[] } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, TOXICITY_CLASSIFIER_TIMEOUT_MS);
      const response = await fetch(this.config.toxicityClassifierUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null; // fail-open
      const result = (await response.json()) as { score: number; categories?: string[] };
      if (result.score >= this.config.toxicityThreshold) {
        return result;
      }
      return null;
    } catch {
      // Fail-open on network error
      return null;
    }
  }

  // ── Grounding check ─────────────────────────────────────────────────

  private async checkGrounding(text: string): Promise<GuardrailFinding[]> {
    const findings: GuardrailFinding[] = [];
    const citations = this.extractCitations(text);

    for (const citation of citations) {
      try {
        const results = await this.deps.brainManager!.semanticSearch(citation, {
          type: 'knowledge',
          limit: 1,
          threshold: GROUNDING_SEARCH_THRESHOLD,
        });
        if (results.length === 0) {
          findings.push({
            type: 'grounding',
            action: this.config.groundingMode === 'block' ? 'block' : 'flag',
            detail: `Unverified citation: ${citation}`,
            contentHash: contentHash(citation),
          });
        }
      } catch {
        // Skip individual citation check failures
      }
    }

    return findings;
  }

  private extractCitations(text: string): string[] {
    const citations: string[] = [];
    const MAX_CITATIONS = 20;

    // Quoted text
    const quoteRegex = /"([^"]{10,200})"/g;
    let match: RegExpExecArray | null;
    while ((match = quoteRegex.exec(text)) !== null && citations.length < MAX_CITATIONS) {
      if (match[1]) citations.push(match[1]);
    }

    // "According to..." patterns
    if (citations.length < MAX_CITATIONS) {
      const accordingRegex =
        /(?:according to|as stated (?:by|in)|as reported (?:by|in))\s+(.{10,100}?)(?:\.|,|;|\n)/gi;
      while ((match = accordingRegex.exec(text)) !== null && citations.length < MAX_CITATIONS) {
        if (match[1]) citations.push(match[1].trim());
      }
    }

    return citations;
  }
}

// ── Factory ───────────────────────────────────────────────────────────

export function createContentGuardrail(
  config: ContentGuardrailConfig,
  deps: ContentGuardrailDeps
): ContentGuardrail {
  return new ContentGuardrail(config, deps);
}
