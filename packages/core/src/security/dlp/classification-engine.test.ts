import { describe, it, expect, vi } from 'vitest';
import { ClassificationEngine } from './classification-engine.js';
import type { ClassificationEngineConfig } from './classification-engine.js';

function makeEngine(config: Partial<ClassificationEngineConfig> = {}) {
  return new ClassificationEngine(config, {
    logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() } as any,
  });
}

describe('ClassificationEngine', () => {
  it('returns default level for clean text', () => {
    const engine = makeEngine();
    const result = engine.classify('Hello world, this is a normal message.');
    expect(result.level).toBe('internal');
    expect(result.rulesTriggered).toHaveLength(0);
    expect(result.piiFound).toHaveLength(0);
  });

  it('detects email PII and classifies as confidential', () => {
    const engine = makeEngine();
    const result = engine.classify('Contact me at alice@example.com');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toContain('email');
    expect(result.rulesTriggered).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'pii', name: 'email' })])
    );
  });

  it('detects SSN and classifies as confidential', () => {
    const engine = makeEngine();
    const result = engine.classify('SSN: 123-45-6789');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toContain('ssn');
  });

  it('detects credit card numbers', () => {
    const engine = makeEngine();
    const result = engine.classify('Card: 4111-1111-1111-1111');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toContain('credit_card');
  });

  it('detects phone numbers', () => {
    const engine = makeEngine();
    const result = engine.classify('Call me at (555) 123-4567');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toContain('phone');
  });

  it('detects IP addresses', () => {
    const engine = makeEngine();
    const result = engine.classify('Server at 192.168.1.100');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toContain('ip_address');
  });

  it('detects restricted keywords', () => {
    const engine = makeEngine();
    const result = engine.classify('This is a top secret document about project X.');
    expect(result.level).toBe('restricted');
    expect(result.keywordsFound).toContain('top secret');
  });

  it('detects confidential keywords', () => {
    const engine = makeEngine();
    const result = engine.classify('This is proprietary information.');
    expect(result.level).toBe('confidential');
    expect(result.keywordsFound).toContain('proprietary');
  });

  it('restricted keywords override confidential', () => {
    const engine = makeEngine();
    const result = engine.classify('This proprietary doc is top secret.');
    expect(result.level).toBe('restricted');
  });

  it('keyword matching is case-insensitive', () => {
    const engine = makeEngine();
    const result = engine.classify('This is TOP SECRET information.');
    expect(result.level).toBe('restricted');
  });

  it('respects piiAsConfidential=false', () => {
    const engine = makeEngine({ piiAsConfidential: false });
    const result = engine.classify('Contact alice@example.com');
    expect(result.level).toBe('internal');
    expect(result.piiFound).toContain('email');
  });

  it('uses custom default level', () => {
    const engine = makeEngine({ defaultLevel: 'public' });
    const result = engine.classify('Normal text');
    expect(result.level).toBe('public');
  });

  it('supports custom regex patterns', () => {
    const engine = makeEngine({
      customPatterns: [
        { name: 'project_code', pattern: 'PROJECT-\\d{4}', level: 'restricted' },
      ],
    });
    const result = engine.classify('Refer to PROJECT-1234 for details.');
    expect(result.level).toBe('restricted');
    expect(result.rulesTriggered).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'pattern', name: 'project_code' })])
    );
  });

  it('handles invalid custom patterns gracefully', () => {
    const logger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const engine = new ClassificationEngine(
      { customPatterns: [{ name: 'bad', pattern: '(unclosed', level: 'restricted' }] },
      { logger: logger as any }
    );
    const result = engine.classify('Normal text');
    expect(result.level).toBe('internal');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('detects multiple PII types in one text', () => {
    const engine = makeEngine();
    const result = engine.classify('SSN: 123-45-6789, email: bob@test.com, card: 4111-1111-1111-1111');
    expect(result.level).toBe('confidential');
    expect(result.piiFound).toHaveLength(3);
    expect(result.piiFound).toContain('ssn');
    expect(result.piiFound).toContain('email');
    expect(result.piiFound).toContain('credit_card');
  });

  it('returns correct autoLevel', () => {
    const engine = makeEngine();
    const result = engine.classify('This is classified information');
    expect(result.autoLevel).toBe(result.level);
  });

  it('custom keywords override defaults', () => {
    const engine = makeEngine({
      keywords: {
        restricted: ['ultra-secret'],
        confidential: ['semi-private'],
      },
    });
    // Default keywords should NOT trigger
    const r1 = engine.classify('top secret');
    expect(r1.level).toBe('internal'); // 'top secret' not in custom keywords

    const r2 = engine.classify('ultra-secret');
    expect(r2.level).toBe('restricted');
  });

  it('empty text returns default level', () => {
    const engine = makeEngine();
    const result = engine.classify('');
    expect(result.level).toBe('internal');
    expect(result.rulesTriggered).toHaveLength(0);
  });
});
