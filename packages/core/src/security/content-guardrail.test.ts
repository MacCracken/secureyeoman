/**
 * Content Guardrail — Phase 95 Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  ContentGuardrail,
  createContentGuardrail,
  type ContentGuardrailDeps,
} from './content-guardrail.js';
import type {
  ContentGuardrailConfig,
  ContentGuardrailPersonalityConfig,
} from '@secureyeoman/shared';

// ── Helpers ───────────────────────────────────────────────────────────

function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function makeConfig(overrides: Partial<ContentGuardrailConfig> = {}): ContentGuardrailConfig {
  return {
    enabled: true,
    piiMode: 'disabled',
    toxicityEnabled: false,
    toxicityMode: 'warn',
    toxicityThreshold: 0.7,
    blockList: [],
    blockedTopics: [],
    topicThreshold: 0.75,
    groundingEnabled: false,
    groundingMode: 'flag',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ContentGuardrailDeps> = {}): ContentGuardrailDeps {
  return {
    brainManager: null,
    auditRecord: vi.fn(),
    ...overrides,
  };
}

function makeGuardrail(
  configOverrides: Partial<ContentGuardrailConfig> = {},
  depsOverrides: Partial<ContentGuardrailDeps> = {}
): { guardrail: ContentGuardrail; deps: ContentGuardrailDeps } {
  const deps = makeDeps(depsOverrides);
  const guardrail = new ContentGuardrail(makeConfig(configOverrides), deps);
  return { guardrail, deps };
}

const ctx = { source: 'test' };

// ── Tests ─────────────────────────────────────────────────────────────

describe('ContentGuardrail', () => {
  describe('disabled', () => {
    it('always passes when disabled', async () => {
      const { guardrail } = makeGuardrail({ enabled: false });
      const result = await guardrail.scan('anything goes here with user@email.com', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.text).toBe('anything goes here with user@email.com');
    });

    it('scanSync passes when disabled', () => {
      const { guardrail } = makeGuardrail({ enabled: false });
      const result = guardrail.scanSync('blocked-term here', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('scanAsync passes when disabled', async () => {
      const { guardrail } = makeGuardrail({ enabled: false });
      const result = await guardrail.scanAsync('toxic content', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('PII detect_only', () => {
    it('detects email addresses', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('Contact john@example.com for info', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].type).toBe('pii');
      expect(result.findings[0].action).toBe('warn');
      expect(result.findings[0].detail).toBe('email detected');
      expect(result.findings[0].contentHash).toBe(hash('john@example.com'));
      // Text should not be modified
      expect(result.text).toBe('Contact john@example.com for info');
    });

    it('detects phone numbers', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('Call me at 555-123-4567', ctx);
      expect(result.findings.some((f) => f.detail === 'phone detected')).toBe(true);
      expect(result.text).toContain('555-123-4567');
    });

    it('detects SSN', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('SSN is 123-45-6789', ctx);
      expect(result.findings.some((f) => f.detail === 'ssn detected')).toBe(true);
    });

    it('detects credit card numbers', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('Card: 4111 1111 1111 1111', ctx);
      expect(result.findings.some((f) => f.detail === 'credit_card detected')).toBe(true);
    });

    it('detects IP addresses', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('Server at 192.168.1.100', ctx);
      expect(result.findings.some((f) => f.detail === 'ip detected')).toBe(true);
    });

    it('generates correct contentHash for each finding', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const result = guardrail.scanSync('Email: test@test.com', ctx);
      expect(result.findings[0].contentHash).toBe(hash('test@test.com'));
    });

    it('does not modify text in detect_only mode', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'detect_only' });
      const input = 'SSN: 123-45-6789, Email: user@test.com';
      const result = guardrail.scanSync(input, ctx);
      expect(result.text).toBe(input);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PII redact', () => {
    it('replaces email with [EMAIL REDACTED]', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('Contact john@example.com please', ctx);
      expect(result.text).toBe('Contact [EMAIL REDACTED] please');
      expect(result.findings[0].action).toBe('redact');
    });

    it('replaces SSN with [SSN REDACTED]', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('SSN: 123-45-6789', ctx);
      expect(result.text).toBe('SSN: [SSN REDACTED]');
    });

    it('replaces credit card with [CARD REDACTED]', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('Card: 4111-1111-1111-1111', ctx);
      expect(result.text).toBe('Card: [CARD REDACTED]');
    });

    it('replaces IP with [IP REDACTED]', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('Server at 10.0.0.1', ctx);
      expect(result.text).toBe('Server at [IP REDACTED]');
    });

    it('handles multiple PII types in one text', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('Email: a@b.com, IP: 192.168.1.1', ctx);
      expect(result.text).toContain('[EMAIL REDACTED]');
      expect(result.text).toContain('[IP REDACTED]');
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
    });

    it('replaces phone with [PHONE REDACTED]', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = guardrail.scanSync('Call 555-123-4567 now', ctx);
      expect(result.text).toBe('Call [PHONE REDACTED] now');
    });
  });

  describe('block list sync', () => {
    it('blocks exact match (word boundary)', () => {
      const { guardrail } = makeGuardrail({ blockList: ['forbidden'] });
      const result = guardrail.scanSync('This is forbidden content', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings[0].type).toBe('block_list');
      expect(result.findings[0].action).toBe('block');
    });

    it('does not match partial word', () => {
      const { guardrail } = makeGuardrail({ blockList: ['bid'] });
      const result = guardrail.scanSync('This is forbidden content', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('supports regex patterns', () => {
      const { guardrail } = makeGuardrail({ blockList: ['regex:secret\\d+'] });
      const result = guardrail.scanSync('The password is secret123', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings[0].type).toBe('block_list');
    });

    it('skips regex patterns over 200 characters', () => {
      const longPattern = 'regex:' + 'a'.repeat(201);
      const { guardrail } = makeGuardrail({ blockList: [longPattern] });
      const result = guardrail.scanSync('aaa', ctx);
      expect(result.passed).toBe(true);
    });

    it('skips invalid regex patterns', () => {
      const { guardrail } = makeGuardrail({ blockList: ['regex:[invalid'] });
      const result = guardrail.scanSync('test', ctx);
      expect(result.passed).toBe(true);
    });

    it('applies per-personality block list additions', () => {
      const { guardrail } = makeGuardrail({ blockList: ['global'] });
      const personalityCfg: ContentGuardrailPersonalityConfig = {
        blockListAdditions: ['extra'],
        blockedTopicAdditions: [],
      };
      const result = guardrail.scanSync('This has extra data', ctx, personalityCfg);
      expect(result.passed).toBe(false);
      expect(result.findings[0].detail).toContain('extra');
    });

    it('is case-insensitive', () => {
      const { guardrail } = makeGuardrail({ blockList: ['BLOCKED'] });
      const result = guardrail.scanSync('this is blocked text', ctx);
      expect(result.passed).toBe(false);
    });

    it('escapes special regex characters in plain strings', () => {
      const { guardrail } = makeGuardrail({ blockList: ['price$100'] });
      const result = guardrail.scanSync('The price$100 is final', ctx);
      expect(result.passed).toBe(false);
    });
  });

  describe('topic restriction async', () => {
    it('blocks response touching blocked topic via keyword overlap', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['nuclear weapons'],
        topicThreshold: 0.2,
      });
      const result = await guardrail.scanAsync('nuclear weapons are dangerous weapons', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings[0].type).toBe('topic');
      expect(result.findings[0].detail).toContain('nuclear weapons');
    });

    it('allows response not matching blocked topic', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['nuclear weapons'],
        topicThreshold: 0.5,
      });
      const result = await guardrail.scanAsync('The weather today is sunny and warm', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('merges per-personality blocked topics', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['gambling'],
        topicThreshold: 0.3,
      });
      const personalityCfg: ContentGuardrailPersonalityConfig = {
        blockListAdditions: [],
        blockedTopicAdditions: ['drugs'],
      };
      // Text containing exact topic word with high overlap
      const result = await guardrail.scanAsync(
        'drugs drugs drugs information',
        ctx,
        personalityCfg
      );
      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.detail.includes('drugs'))).toBe(true);
    });

    it('uses keyword fallback when no brain manager', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['financial fraud'],
        topicThreshold: 0.3,
      });
      // Text containing the exact topic words should trigger with low threshold
      const result = await guardrail.scanAsync('Details about financial fraud schemes', ctx);
      expect(result.passed).toBe(false);
    });
  });

  describe('toxicity filter async', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
    });

    it('calls classifier and blocks on high toxicity (block mode)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.9, categories: ['hate'] }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'block',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('toxic content', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings[0].type).toBe('toxicity');
      expect(result.findings[0].action).toBe('block');
      expect(result.findings[0].detail).toContain('0.90');
      expect(result.findings[0].detail).toContain('hate');
    });

    it('warns on high toxicity (warn mode)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.8 }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'warn',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('mild toxicity', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings[0].action).toBe('warn');
    });

    it('flags on high toxicity (audit_only mode)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.9 }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'audit_only',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('content', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings[0].action).toBe('flag');
    });

    it('passes when score below threshold', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.3 }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'block',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('clean content', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('fail-open on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'block',
        toxicityClassifierUrl: 'http://classifier.test/classify',
      });
      const result = await guardrail.scanAsync('content', ctx);
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('fail-open on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'block',
        toxicityClassifierUrl: 'http://classifier.test/classify',
      });
      const result = await guardrail.scanAsync('content', ctx);
      expect(result.passed).toBe(true);
    });

    it('does not call classifier when disabled', async () => {
      const { guardrail } = makeGuardrail({
        toxicityEnabled: false,
      });
      await guardrail.scanAsync('content', ctx);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call classifier when no URL configured', async () => {
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityClassifierUrl: undefined,
      });
      await guardrail.scanAsync('content', ctx);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('grounding check async', () => {
    it('extracts and verifies quoted citations', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'flag' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'The report states "this is a very important long quoted statement" as a key finding.',
        ctx
      );
      expect(mockSearch).toHaveBeenCalled();
      expect(result.findings.some((f) => f.type === 'grounding')).toBe(true);
      expect(result.findings[0].action).toBe('flag');
    });

    it('tags unverified citations with [unverified] in flag mode', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'flag' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const input = 'The report says "this is an important quoted claim here" from the study.';
      const result = await guardrail.scanAsync(input, ctx);
      expect(result.text).toContain('[unverified]');
    });

    it('blocks on unverified citations in block mode', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'block' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'According to the official documentation sources, this is true.',
        ctx
      );
      expect(result.passed).toBe(false);
      expect(result.findings[0].action).toBe('block');
    });

    it('passes when citations are verified', async () => {
      const mockSearch = vi.fn().mockResolvedValue([{ id: '1', score: 0.9 }]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'block' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'The report states "this is a verified important quoted statement" in paragraph 2.',
        ctx
      );
      expect(result.passed).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('does not check grounding when disabled', async () => {
      const mockSearch = vi.fn();
      const { guardrail } = makeGuardrail(
        { groundingEnabled: false },
        { brainManager: { semanticSearch: mockSearch } }
      );
      await guardrail.scanAsync('Text with "a long quoted citation string" here.', ctx);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('does not check grounding when no brain manager', async () => {
      const { guardrail } = makeGuardrail({ groundingEnabled: true }, { brainManager: null });
      const result = await guardrail.scanAsync(
        'Text with "a long quoted citation string" here.',
        ctx
      );
      expect(result.passed).toBe(true);
    });

    it('extracts "according to" citations', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'flag' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'According to the quarterly financial report of 2025, revenue increased.',
        ctx
      );
      expect(result.findings.some((f) => f.type === 'grounding')).toBe(true);
    });
  });

  describe('scan() combined', () => {
    it('sync failure short-circuits async', async () => {
      const mockSearch = vi.fn();
      const { guardrail } = makeGuardrail(
        { blockList: ['banned'], blockedTopics: ['weapons'], topicThreshold: 0.5 },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scan('This contains banned content', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type === 'block_list')).toBe(true);
      // Async should not have been called (topic search)
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('combines sync and async findings', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        {
          piiMode: 'detect_only',
          groundingEnabled: true,
          groundingMode: 'flag',
        },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scan(
        'Contact john@example.com about "this very important long quoted citation" for details.',
        ctx
      );
      expect(result.passed).toBe(true);
      // Should have both PII and grounding findings
      expect(result.findings.some((f) => f.type === 'pii')).toBe(true);
      expect(result.findings.some((f) => f.type === 'grounding')).toBe(true);
    });

    it('redacts PII and then runs async on redacted text', async () => {
      const { guardrail } = makeGuardrail({ piiMode: 'redact' });
      const result = await guardrail.scan('Email: user@test.com and more text', ctx);
      expect(result.passed).toBe(true);
      expect(result.text).toBe('Email: [EMAIL REDACTED] and more text');
    });
  });

  describe('audit trail', () => {
    it('records audit event on sync findings', () => {
      const { guardrail, deps } = makeGuardrail({ piiMode: 'detect_only' });
      guardrail.scanSync('Email: user@test.com', { source: 'test', personalityId: 'p1' });
      expect(deps.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'content_guardrail_sync',
          level: 'info',
          metadata: expect.objectContaining({ source: 'test', personalityId: 'p1' }),
        })
      );
    });

    it('records audit event at warn level for block list hits', () => {
      const { guardrail, deps } = makeGuardrail({ blockList: ['secret'] });
      guardrail.scanSync('This is a secret message', ctx);
      expect(deps.auditRecord).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
    });

    it('records audit event on async findings', async () => {
      const { guardrail, deps } = makeGuardrail({
        blockedTopics: ['violence'],
        topicThreshold: 0.3,
      });
      await guardrail.scanAsync('violence violence violence', ctx);
      expect(deps.auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'content_guardrail_async',
          level: 'warn',
        })
      );
    });

    it('does not audit when no findings', () => {
      const { guardrail, deps } = makeGuardrail({ piiMode: 'detect_only' });
      guardrail.scanSync('Clean text with no PII', ctx);
      expect(deps.auditRecord).not.toHaveBeenCalled();
    });
  });

  describe('per-personality PII mode override', () => {
    it('overrides global disabled with personality redact', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'disabled' });
      const personalityCfg: ContentGuardrailPersonalityConfig = {
        piiMode: 'redact',
        blockListAdditions: [],
        blockedTopicAdditions: [],
      };
      const result = guardrail.scanSync('Email: user@test.com', ctx, personalityCfg);
      expect(result.text).toBe('Email: [EMAIL REDACTED]');
    });
  });

  describe('factory', () => {
    it('createContentGuardrail returns instance', () => {
      const guardrail = createContentGuardrail(makeConfig(), makeDeps());
      expect(guardrail).toBeInstanceOf(ContentGuardrail);
    });

    it('createContentGuardrail works with scan', async () => {
      const guardrail = createContentGuardrail(makeConfig({ enabled: false }), makeDeps());
      const result = await guardrail.scan('test', ctx);
      expect(result.passed).toBe(true);
    });
  });

  // ── Additional branch coverage tests ─────────────────────────────────

  describe('topic restriction — brain manager semantic search fallback', () => {
    it('falls through to keyword fallback when semantic search throws', async () => {
      const mockSearch = vi.fn().mockRejectedValue(new Error('search failed'));
      const { guardrail } = makeGuardrail(
        { blockedTopics: ['nuclear weapons'], topicThreshold: 0.2 },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync('nuclear weapons are very dangerous weapons', ctx);
      // Should still detect via keyword fallback
      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type === 'topic')).toBe(true);
    });

    it('uses keyword overlap even when brain manager is available but returns empty', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { blockedTopics: ['financial fraud'], topicThreshold: 0.3 },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync('Details about financial fraud schemes', ctx);
      expect(result.passed).toBe(false);
    });
  });

  describe('grounding — citation extraction edge cases', () => {
    it('extracts "as stated by" citation patterns', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'flag' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'As stated by the World Health Organization, vaccines save lives.',
        ctx
      );
      expect(result.findings.some((f) => f.type === 'grounding')).toBe(true);
    });

    it('extracts "as reported by" citation patterns', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'flag' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'As reported by Reuters and the Associated Press, the event occurred.',
        ctx
      );
      expect(result.findings.some((f) => f.type === 'grounding')).toBe(true);
    });

    it('skips individual citation check failures', async () => {
      const mockSearch = vi.fn().mockRejectedValue(new Error('search failed'));
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'block' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'The report states "this is a very important long quoted statement" as a key finding.',
        ctx
      );
      // Should pass because the search failed and we skip (not block)
      expect(result.passed).toBe(true);
    });

    it('does not extract quotes shorter than 10 characters', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      const { guardrail } = makeGuardrail(
        { groundingEnabled: true, groundingMode: 'block' },
        { brainManager: { semanticSearch: mockSearch } }
      );
      const result = await guardrail.scanAsync(
        'He said "short" and moved on.',
        ctx
      );
      // "short" is only 5 chars — should not be extracted as citation
      expect(mockSearch).not.toHaveBeenCalled();
      expect(result.passed).toBe(true);
    });
  });

  describe('scanAsync — no findings branch', () => {
    it('does not audit when there are no findings', async () => {
      const { guardrail, deps } = makeGuardrail({});
      await guardrail.scanAsync('clean text without issues', ctx);
      expect(deps.auditRecord).not.toHaveBeenCalled();
    });
  });

  describe('block list — personality additions without global block list', () => {
    it('returns global block list when no personality additions', () => {
      const { guardrail } = makeGuardrail({ blockList: ['forbidden'] });
      const result = guardrail.scanSync('This is forbidden content', ctx);
      expect(result.passed).toBe(false);
    });

    it('returns global block list when personality additions are empty', () => {
      const { guardrail } = makeGuardrail({ blockList: ['forbidden'] });
      const personalityCfg: ContentGuardrailPersonalityConfig = {
        blockListAdditions: [],
        blockedTopicAdditions: [],
      };
      const result = guardrail.scanSync('This is forbidden content', ctx, personalityCfg);
      expect(result.passed).toBe(false);
    });
  });

  describe('scan() combined — async failure path', () => {
    it('returns false when async blocks after sync passes', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['violence'],
        topicThreshold: 0.3,
      });
      const result = await guardrail.scan('violence violence violence violence', ctx);
      expect(result.passed).toBe(false);
      expect(result.findings.some((f) => f.type === 'topic')).toBe(true);
    });
  });

  describe('toxicity — detail with and without categories', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
    });

    it('includes categories in detail when present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.9, categories: ['hate', 'violence'] }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'warn',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('toxic content', ctx);
      expect(result.findings[0].detail).toContain('hate, violence');
    });

    it('omits categories in detail when absent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ score: 0.8 }),
      });
      const { guardrail } = makeGuardrail({
        toxicityEnabled: true,
        toxicityMode: 'warn',
        toxicityClassifierUrl: 'http://classifier.test/classify',
        toxicityThreshold: 0.7,
      });
      const result = await guardrail.scanAsync('toxic content', ctx);
      expect(result.findings[0].detail).not.toContain('(');
    });
  });

  describe('PII disabled mode', () => {
    it('produces no PII findings when piiMode is disabled', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'disabled' });
      const result = guardrail.scanSync('Email: user@test.com, SSN: 123-45-6789', ctx);
      expect(result.findings.filter((f) => f.type === 'pii')).toHaveLength(0);
    });
  });

  describe('personality piiMode override', () => {
    it('personality detect_only overrides global disabled', () => {
      const { guardrail } = makeGuardrail({ piiMode: 'disabled' });
      const personalityCfg: ContentGuardrailPersonalityConfig = {
        piiMode: 'detect_only',
        blockListAdditions: [],
        blockedTopicAdditions: [],
      };
      const result = guardrail.scanSync('Email: user@test.com', ctx, personalityCfg);
      expect(result.findings.some((f) => f.type === 'pii')).toBe(true);
      expect(result.text).toContain('user@test.com'); // detect_only, no redaction
    });
  });

  describe('jaccardOverlap edge cases', () => {
    it('passes when topic has low overlap with response', async () => {
      const { guardrail } = makeGuardrail({
        blockedTopics: ['nuclear weapons manufacturing'],
        topicThreshold: 0.75,
      });
      const result = await guardrail.scanAsync('The weather is great today', ctx);
      expect(result.passed).toBe(true);
    });
  });
});
