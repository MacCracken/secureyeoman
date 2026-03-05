import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConstitutionalEngine, DEFAULT_PRINCIPLES } from './constitutional.js';
import type { ConstitutionalConfig, ConstitutionalPrinciple } from '@secureyeoman/shared';
import { createNoopLogger } from '../logging/logger.js';

function makeConfig(overrides: Partial<ConstitutionalConfig> = {}): ConstitutionalConfig {
  return {
    enabled: true,
    mode: 'offline',
    principles: [],
    useDefaults: true,
    importIntentBoundaries: false,
    model: null,
    critiqueTemperature: 0.2,
    maxRevisionRounds: 1,
    recordPreferencePairs: true,
    revisionThreshold: 1,
    ...overrides,
  };
}

function makeDeps(chatFn?: (...args: any[]) => Promise<string>) {
  return {
    logger: createNoopLogger(),
    chat: chatFn ?? vi.fn<any>().mockResolvedValue('[]'),
  };
}

describe('ConstitutionalEngine', () => {
  describe('constructor and isEnabled', () => {
    it('should be enabled with default config', () => {
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps());
      expect(engine.isEnabled).toBe(true);
    });

    it('should be disabled when config.enabled is false', () => {
      const engine = new ConstitutionalEngine(makeConfig({ enabled: false }), makeDeps());
      expect(engine.isEnabled).toBe(false);
    });

    it('should be disabled when no principles exist', () => {
      const engine = new ConstitutionalEngine(
        makeConfig({ useDefaults: false, principles: [] }),
        makeDeps(),
      );
      expect(engine.isEnabled).toBe(false);
    });
  });

  describe('getPrinciples', () => {
    it('should return default principles when useDefaults is true', () => {
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps());
      const principles = engine.getPrinciples();
      expect(principles).toHaveLength(3);
      expect(principles.map((p) => p.id)).toEqual(['helpfulness', 'harmlessness', 'honesty']);
    });

    it('should return only custom principles when useDefaults is false', () => {
      const custom: ConstitutionalPrinciple = {
        id: 'custom1',
        name: 'Custom',
        description: 'Custom principle',
        critiquePrompt: 'Is this custom enough?',
        weight: 0.8,
        enabled: true,
      };
      const engine = new ConstitutionalEngine(
        makeConfig({ useDefaults: false, principles: [custom] }),
        makeDeps(),
      );
      const principles = engine.getPrinciples();
      expect(principles).toHaveLength(1);
      expect(principles[0].id).toBe('custom1');
    });

    it('should override defaults with same-id custom principles', () => {
      const override: ConstitutionalPrinciple = {
        id: 'helpfulness',
        name: 'Custom Helpfulness',
        description: 'My custom helpfulness',
        critiquePrompt: 'Is it really helpful?',
        weight: 0.5,
        enabled: true,
      };
      const engine = new ConstitutionalEngine(
        makeConfig({ principles: [override] }),
        makeDeps(),
      );
      const principles = engine.getPrinciples();
      const helpfulness = principles.find((p) => p.id === 'helpfulness');
      expect(helpfulness?.name).toBe('Custom Helpfulness');
      expect(helpfulness?.weight).toBe(0.5);
    });

    it('should exclude disabled custom principles', () => {
      const disabled: ConstitutionalPrinciple = {
        id: 'disabled1',
        name: 'Disabled',
        description: 'Disabled principle',
        critiquePrompt: 'Should never fire',
        weight: 1,
        enabled: false,
      };
      const engine = new ConstitutionalEngine(
        makeConfig({ useDefaults: false, principles: [disabled] }),
        makeDeps(),
      );
      expect(engine.getPrinciples()).toHaveLength(0);
    });

    it('should import intent hard boundaries as principles', () => {
      const deps = makeDeps();
      (deps as any).getIntentBoundaries = () => [
        { id: 'boundary1', rule: 'Never access /etc/shadow', rationale: 'Security policy' },
      ];
      const engine = new ConstitutionalEngine(
        makeConfig({ importIntentBoundaries: true }),
        deps,
      );
      const principles = engine.getPrinciples();
      const intentP = principles.find((p) => p.id === 'intent_boundary1');
      expect(intentP).toBeDefined();
      expect(intentP?.description).toBe('Security policy');
    });
  });

  describe('critique', () => {
    it('should return empty array when disabled', async () => {
      const engine = new ConstitutionalEngine(makeConfig({ enabled: false }), makeDeps());
      const result = await engine.critique('test prompt', 'test response');
      expect(result).toEqual([]);
    });

    it('should parse valid critique JSON', async () => {
      const mockResponse = JSON.stringify([
        { principleId: 'helpfulness', violated: false, explanation: 'Looks good', severity: 'low' },
        { principleId: 'harmlessness', violated: true, explanation: 'Contains harmful advice', severity: 'high' },
        { principleId: 'honesty', violated: false, explanation: 'Accurate', severity: 'low' },
      ]);
      const chat = vi.fn<any>().mockResolvedValue(mockResponse);
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critique('How do I hack?', 'Here is how to hack...');
      expect(result).toHaveLength(3);
      expect(result[1].violated).toBe(true);
      expect(result[1].severity).toBe('high');
      expect(result[1].principleName).toBe('Harmlessness');
    });

    it('should handle markdown-fenced JSON in critique response', async () => {
      const mockResponse = '```json\n[{"principleId":"helpfulness","violated":false,"explanation":"OK","severity":"low"}]\n```';
      const chat = vi.fn<any>().mockResolvedValue(mockResponse);
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critique('test', 'test');
      expect(result).toHaveLength(1);
      expect(result[0].principleId).toBe('helpfulness');
    });

    it('should return empty array on unparseable response', async () => {
      const chat = vi.fn<any>().mockResolvedValue('This is not JSON at all');
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critique('test', 'test');
      expect(result).toEqual([]);
    });

    it('should return empty array on chat failure', async () => {
      const chat = vi.fn<any>().mockRejectedValue(new Error('Provider unavailable'));
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critique('test', 'test');
      expect(result).toEqual([]);
    });

    it('should default severity to medium for unknown values', async () => {
      const mockResponse = JSON.stringify([
        { principleId: 'helpfulness', violated: true, explanation: 'Bad', severity: 'unknown_level' },
      ]);
      const chat = vi.fn<any>().mockResolvedValue(mockResponse);
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critique('test', 'test');
      expect(result[0].severity).toBe('medium');
    });
  });

  describe('critiqueAndRevise', () => {
    it('should pass through when disabled', async () => {
      const engine = new ConstitutionalEngine(makeConfig({ enabled: false }), makeDeps());
      const result = await engine.critiqueAndRevise('prompt', 'original response');
      expect(result.revised).toBe(false);
      expect(result.revisedResponse).toBe('original response');
      expect(result.totalRounds).toBe(0);
    });

    it('should not revise when no violations found', async () => {
      const mockCritique = JSON.stringify([
        { principleId: 'helpfulness', violated: false, explanation: 'Fine', severity: 'low' },
        { principleId: 'harmlessness', violated: false, explanation: 'Fine', severity: 'low' },
        { principleId: 'honesty', violated: false, explanation: 'Fine', severity: 'low' },
      ]);
      const chat = vi.fn<any>().mockResolvedValue(mockCritique);
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critiqueAndRevise('test', 'good response');
      expect(result.revised).toBe(false);
      expect(result.revisedResponse).toBe('good response');
      expect(chat).toHaveBeenCalledTimes(1); // Only critique, no revision
    });

    it('should revise when violations exceed threshold', async () => {
      const critique = JSON.stringify([
        { principleId: 'harmlessness', violated: true, explanation: 'Harmful', severity: 'high' },
        { principleId: 'helpfulness', violated: false, explanation: 'OK', severity: 'low' },
        { principleId: 'honesty', violated: false, explanation: 'OK', severity: 'low' },
      ]);
      const chat = vi.fn<any>()
        .mockResolvedValueOnce(critique) // critique
        .mockResolvedValueOnce('A safer, revised response'); // revision
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critiqueAndRevise('test', 'harmful response');
      expect(result.revised).toBe(true);
      expect(result.revisedResponse).toBe('A safer, revised response');
      expect(chat).toHaveBeenCalledTimes(2);
    });

    it('should respect maxRevisionRounds', async () => {
      const violation = JSON.stringify([
        { principleId: 'harmlessness', violated: true, explanation: 'Still harmful', severity: 'high' },
      ]);
      const chat = vi.fn<any>()
        .mockResolvedValueOnce(violation) // round 1 critique
        .mockResolvedValueOnce('revision 1') // round 1 revise
        .mockResolvedValueOnce(violation) // round 2 critique
        .mockResolvedValueOnce('revision 2'); // round 2 revise
      const engine = new ConstitutionalEngine(
        makeConfig({ maxRevisionRounds: 2 }),
        makeDeps(chat),
      );

      const result = await engine.critiqueAndRevise('test', 'bad');
      expect(result.revised).toBe(true);
      expect(result.revisedResponse).toBe('revision 2');
      expect(chat).toHaveBeenCalledTimes(4);
    });

    it('should not revise when violations below threshold', async () => {
      const critique = JSON.stringify([
        { principleId: 'harmlessness', violated: true, explanation: 'Minor', severity: 'low' },
      ]);
      const chat = vi.fn<any>().mockResolvedValue(critique);
      const engine = new ConstitutionalEngine(
        makeConfig({ revisionThreshold: 2 }),
        makeDeps(chat),
      );

      const result = await engine.critiqueAndRevise('test', 'response');
      expect(result.revised).toBe(false);
      expect(chat).toHaveBeenCalledTimes(1); // Only critique
    });

    it('should handle revision failure gracefully', async () => {
      const critique = JSON.stringify([
        { principleId: 'harmlessness', violated: true, explanation: 'Bad', severity: 'high' },
      ]);
      const chat = vi.fn<any>()
        .mockResolvedValueOnce(critique)
        .mockRejectedValueOnce(new Error('Revision LLM failed'));
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critiqueAndRevise('test', 'response');
      expect(result.revised).toBe(false);
      expect(result.revisedResponse).toBe('response');
    });

    it('should stop revision when response does not change', async () => {
      const critique = JSON.stringify([
        { principleId: 'harmlessness', violated: true, explanation: 'Bad', severity: 'high' },
      ]);
      const chat = vi.fn<any>()
        .mockResolvedValueOnce(critique)
        .mockResolvedValueOnce('original'); // same as input
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      const result = await engine.critiqueAndRevise('test', 'original');
      expect(result.revised).toBe(false);
    });
  });

  describe('DEFAULT_PRINCIPLES', () => {
    it('should have 3 built-in principles', () => {
      expect(DEFAULT_PRINCIPLES).toHaveLength(3);
    });

    it('should have helpfulness, harmlessness, and honesty', () => {
      const ids = DEFAULT_PRINCIPLES.map((p) => p.id);
      expect(ids).toContain('helpfulness');
      expect(ids).toContain('harmlessness');
      expect(ids).toContain('honesty');
    });

    it('should all be enabled by default', () => {
      expect(DEFAULT_PRINCIPLES.every((p) => p.enabled)).toBe(true);
    });

    it('should all have weight 1', () => {
      expect(DEFAULT_PRINCIPLES.every((p) => p.weight === 1)).toBe(true);
    });
  });

  describe('critique prompt construction', () => {
    it('should include all principles in the system prompt', async () => {
      const chat = vi.fn<any>().mockResolvedValue('[]');
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      await engine.critique('user prompt', 'response');

      const systemMsg = chat.mock.calls[0][0][0].content;
      expect(systemMsg).toContain('Helpfulness');
      expect(systemMsg).toContain('Harmlessness');
      expect(systemMsg).toContain('Honesty');
      expect(systemMsg).toContain('JSON array');
    });

    it('should include user prompt and response in user message', async () => {
      const chat = vi.fn<any>().mockResolvedValue('[]');
      const engine = new ConstitutionalEngine(makeConfig(), makeDeps(chat));

      await engine.critique('What is 2+2?', 'The answer is 4.');

      const userMsg = chat.mock.calls[0][0][1].content;
      expect(userMsg).toContain('What is 2+2?');
      expect(userMsg).toContain('The answer is 4.');
    });

    it('should use configured temperature and model', async () => {
      const chat = vi.fn<any>().mockResolvedValue('[]');
      const engine = new ConstitutionalEngine(
        makeConfig({ critiqueTemperature: 0.1, model: 'critique-model' }),
        makeDeps(chat),
      );

      await engine.critique('test', 'test');
      expect(chat.mock.calls[0][1]).toEqual({ model: 'critique-model', temperature: 0.1 });
    });
  });
});
