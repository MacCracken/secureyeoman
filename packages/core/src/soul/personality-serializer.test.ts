import { describe, it, expect } from 'vitest';
import { PersonalityMarkdownSerializer } from './personality-serializer.js';
import { BodyConfigSchema } from '@secureyeoman/shared';

const serializer = new PersonalityMarkdownSerializer();

function makePersonality(overrides: Record<string, unknown> = {}) {
  return {
    name: 'TestBot',
    description: 'A test personality',
    systemPrompt: 'You are TestBot, a helpful assistant.',
    traits: { formality: 'balanced', humor: 'subtle', verbosity: 'concise' },
    sex: 'unspecified' as const,
    voice: '',
    preferredLanguage: '',
    defaultModel: null,
    modelFallbacks: [],
    includeArchetypes: true,
    injectDateTime: false,
    empathyResonance: false,
    avatarUrl: null,
    body: BodyConfigSchema.parse({}),
    ...overrides,
  };
}

describe('PersonalityMarkdownSerializer', () => {
  describe('toMarkdown()', () => {
    it('serializes a basic personality', () => {
      const md = serializer.toMarkdown(makePersonality());
      expect(md).toContain('---');
      expect(md).toContain('name: "TestBot"');
      expect(md).toContain('# Identity & Purpose');
      expect(md).toContain('You are TestBot, a helpful assistant.');
      expect(md).toContain('# Traits');
      expect(md).toContain('- **formality**: balanced');
      expect(md).toContain('- **humor**: subtle');
    });

    it('includes defaultModel in frontmatter', () => {
      const md = serializer.toMarkdown(
        makePersonality({ defaultModel: { provider: 'anthropic', model: 'claude-3.5-sonnet' } })
      );
      expect(md).toContain('defaultModel: { provider: "anthropic", model: "claude-3.5-sonnet" }');
    });

    it('includes model fallbacks section', () => {
      const md = serializer.toMarkdown(
        makePersonality({
          modelFallbacks: [
            { provider: 'openai', model: 'gpt-4o' },
            { provider: 'anthropic', model: 'claude-3-haiku' },
          ],
        })
      );
      expect(md).toContain('# Model Fallbacks');
      expect(md).toContain('- openai/gpt-4o');
      expect(md).toContain('- anthropic/claude-3-haiku');
    });

    it('includes configuration section for non-default body', () => {
      const body = BodyConfigSchema.parse({ enabled: true, omnipresentMind: true });
      const md = serializer.toMarkdown(makePersonality({ body }));
      expect(md).toContain('# Configuration');
      expect(md).toContain('enabled: true');
      expect(md).toContain('omnipresentMind: true');
    });

    it('includes extra flags when non-default', () => {
      const md = serializer.toMarkdown(
        makePersonality({ injectDateTime: true, empathyResonance: true })
      );
      expect(md).toContain('# Configuration');
      expect(md).toContain('injectDateTime: true');
      expect(md).toContain('empathyResonance: true');
    });

    it('omits configuration section when all defaults', () => {
      const md = serializer.toMarkdown(makePersonality());
      expect(md).not.toContain('# Configuration');
    });

    it('omits model fallbacks when empty', () => {
      const md = serializer.toMarkdown(makePersonality());
      expect(md).not.toContain('# Model Fallbacks');
    });

    it('includes sex in frontmatter when non-default', () => {
      const md = serializer.toMarkdown(makePersonality({ sex: 'female' }));
      expect(md).toContain('sex: "female"');
    });

    it('omits sex in frontmatter when unspecified', () => {
      const md = serializer.toMarkdown(makePersonality({ sex: 'unspecified' }));
      expect(md).not.toContain('sex:');
    });
  });

  describe('fromMarkdown()', () => {
    it('parses a basic personality markdown', () => {
      const md = [
        '---',
        'name: "TestBot"',
        'description: "A test personality"',
        'traits: [formality, humor]',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'You are TestBot.',
        '',
        '# Traits',
        '',
        '- **formality**: balanced',
        '- **humor**: dry',
        '',
      ].join('\n');

      const { data, warnings } = serializer.fromMarkdown(md);
      expect(data.name).toBe('TestBot');
      expect(data.description).toBe('A test personality');
      expect(data.systemPrompt).toBe('You are TestBot.');
      expect(data.traits).toEqual({ formality: 'balanced', humor: 'dry' });
      expect(warnings).toHaveLength(0);
    });

    it('parses defaultModel from frontmatter', () => {
      const md = [
        '---',
        'name: "TestBot"',
        'defaultModel: { provider: "anthropic", model: "claude-3.5-sonnet" }',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'You are TestBot.',
        '',
      ].join('\n');

      const { data } = serializer.fromMarkdown(md);
      expect(data.defaultModel).toEqual({ provider: 'anthropic', model: 'claude-3.5-sonnet' });
    });

    it('parses model fallbacks section', () => {
      const md = [
        '---',
        'name: "TestBot"',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'You are TestBot.',
        '',
        '# Model Fallbacks',
        '',
        '- openai/gpt-4o',
        '- anthropic/claude-3-haiku',
        '',
      ].join('\n');

      const { data } = serializer.fromMarkdown(md);
      expect(data.modelFallbacks).toEqual([
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'anthropic', model: 'claude-3-haiku' },
      ]);
    });

    it('handles missing optional sections gracefully', () => {
      const md = [
        '---',
        'name: "MinimalBot"',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'Minimal personality.',
        '',
      ].join('\n');

      const { data, warnings } = serializer.fromMarkdown(md);
      expect(data.name).toBe('MinimalBot');
      expect(data.systemPrompt).toBe('Minimal personality.');
      expect(data.traits).toEqual({});
      expect(data.modelFallbacks).toEqual([]);
      expect(warnings).toHaveLength(0);
    });

    it('warns on unknown sections', () => {
      const md = [
        '---',
        'name: "TestBot"',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'Hello.',
        '',
        '# Random Section',
        '',
        'Some content.',
        '',
      ].join('\n');

      const { warnings } = serializer.fromMarkdown(md);
      expect(warnings).toContainEqual(expect.stringContaining('Unknown section'));
    });

    it('throws on missing frontmatter', () => {
      expect(() => serializer.fromMarkdown('# No frontmatter here')).toThrow(
        'missing YAML frontmatter'
      );
    });

    it('throws on missing name', () => {
      const md = '---\ndescription: "no name"\n---\n\n# Identity & Purpose\n\nHello.\n';
      expect(() => serializer.fromMarkdown(md)).toThrow('missing required "name"');
    });

    it('parses frontmatter trait keys even without Traits section', () => {
      const md = [
        '---',
        'name: "TestBot"',
        'traits: [alpha, beta]',
        '---',
        '',
        '# Identity & Purpose',
        '',
        'Hello.',
        '',
      ].join('\n');

      const { data } = serializer.fromMarkdown(md);
      // Traits section missing → keys fill in with key as value
      expect(data.traits).toEqual({ alpha: 'alpha', beta: 'beta' });
    });

    it('parses sex field', () => {
      const md = '---\nname: "TestBot"\nsex: "non-binary"\n---\n\n# Identity & Purpose\n\nHi.\n';
      const { data } = serializer.fromMarkdown(md);
      expect(data.sex).toBe('non-binary');
    });

    it('defaults sex to unspecified for invalid values', () => {
      const md = '---\nname: "TestBot"\nsex: "robot"\n---\n\n# Identity & Purpose\n\nHi.\n';
      const { data } = serializer.fromMarkdown(md);
      expect(data.sex).toBe('unspecified');
    });
  });

  describe('round-trip', () => {
    it('fromMarkdown(toMarkdown(p)) produces equivalent personality', () => {
      const original = makePersonality({
        defaultModel: { provider: 'anthropic', model: 'claude-3.5-sonnet' },
        modelFallbacks: [{ provider: 'openai', model: 'gpt-4o' }],
        sex: 'male',
        voice: 'warm and friendly',
        preferredLanguage: 'en',
      });

      const md = serializer.toMarkdown(original);
      const { data } = serializer.fromMarkdown(md);

      expect(data.name).toBe(original.name);
      expect(data.description).toBe(original.description);
      expect(data.systemPrompt).toBe(original.systemPrompt);
      expect(data.traits).toEqual(original.traits);
      expect(data.defaultModel).toEqual(original.defaultModel);
      expect(data.modelFallbacks).toEqual(original.modelFallbacks);
      expect(data.sex).toBe(original.sex);
      expect(data.voice).toBe(original.voice);
      expect(data.preferredLanguage).toBe(original.preferredLanguage);
    });

    it('round-trips non-default body config', () => {
      const body = BodyConfigSchema.parse({ enabled: true, omnipresentMind: true });
      const original = makePersonality({ body, injectDateTime: true });

      const md = serializer.toMarkdown(original);
      const { data } = serializer.fromMarkdown(md);

      expect(data.injectDateTime).toBe(true);
    });

    it('toMarkdown is stable across two passes', () => {
      const original = makePersonality();
      const md1 = serializer.toMarkdown(original);
      const { data } = serializer.fromMarkdown(md1);
      const md2 = serializer.toMarkdown(data);

      // Dates may differ by day but structure should be identical minus version date
      const stripVersion = (s: string) => s.replace(/version: "[^"]*"/, 'version: "X"');
      expect(stripVersion(md2)).toBe(stripVersion(md1));
    });
  });

  describe('edge cases', () => {
    it('handles description with special characters', () => {
      const original = makePersonality({
        description: 'A "cool" personality: with special chars & stuff',
      });
      const md = serializer.toMarkdown(original);
      const { data } = serializer.fromMarkdown(md);
      expect(data.description).toBe(original.description);
    });

    it('handles empty traits', () => {
      const original = makePersonality({ traits: {} });
      const md = serializer.toMarkdown(original);
      expect(md).not.toContain('# Traits');
      const { data } = serializer.fromMarkdown(md);
      expect(data.traits).toEqual({});
    });

    it('handles empty system prompt', () => {
      const original = makePersonality({ systemPrompt: '' });
      const md = serializer.toMarkdown(original);
      const { data } = serializer.fromMarkdown(md);
      expect(data.systemPrompt).toBe('');
    });
  });
});
