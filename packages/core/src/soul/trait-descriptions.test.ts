import { describe, it, expect } from 'vitest';
import { composeTraitDisposition } from './trait-descriptions.js';

describe('composeTraitDisposition', () => {
  it('returns balanced note when all traits are balanced', () => {
    const result = composeTraitDisposition({
      formality: 'balanced',
      humor: 'balanced',
    });
    expect(result).toContain('## Disposition');
    expect(result).toContain('balanced — respond with a neutral');
  });

  it('includes behavioral descriptions for non-balanced traits', () => {
    const result = composeTraitDisposition({
      formality: 'formal',
      humor: 'witty',
      warmth: 'balanced',
    });
    expect(result).toContain('## Disposition');
    expect(result).toContain('**formality** (formal)');
    expect(result).toContain('professional, structured language');
    expect(result).toContain('**humor** (witty)');
    expect(result).toContain('clever wordplay');
    // balanced warmth should not appear
    expect(result).not.toContain('warmth');
  });

  it('handles all 15 standard traits', () => {
    const traits: Record<string, string> = {
      formality: 'casual',
      humor: 'dry',
      verbosity: 'concise',
      directness: 'candid',
      warmth: 'friendly',
      empathy: 'empathetic',
      patience: 'patient',
      confidence: 'assertive',
      creativity: 'imaginative',
      risk_tolerance: 'cautious',
      curiosity: 'curious',
      skepticism: 'skeptical',
      autonomy: 'proactive',
      pedagogy: 'explanatory',
      precision: 'precise',
    };
    const result = composeTraitDisposition(traits);
    // All 15 traits should be present (none are balanced)
    for (const key of Object.keys(traits)) {
      const label = key.replace(/_/g, ' ');
      expect(result).toContain(`**${label}**`);
    }
  });

  it('returns header only + balanced note for empty traits', () => {
    const result = composeTraitDisposition({});
    expect(result).toContain('## Disposition');
    expect(result).toContain('balanced — respond with a neutral');
  });

  it('ignores unknown trait keys gracefully', () => {
    const result = composeTraitDisposition({
      made_up_trait: 'extreme',
      formality: 'formal',
    });
    expect(result).toContain('**formality** (formal)');
    expect(result).not.toContain('made_up_trait');
  });

  it('handles extreme trait values', () => {
    const result = composeTraitDisposition({
      warmth: 'effusive',
      confidence: 'authoritative',
      directness: 'blunt',
    });
    expect(result).toContain('effusive');
    expect(result).toContain('authoritative');
    expect(result).toContain('blunt');
  });

  it('handles case-insensitive trait keys and values', () => {
    const result = composeTraitDisposition({ Warmth: 'Friendly', Humor: 'Witty' });
    expect(result).toContain('**warmth** (Friendly)');
    expect(result).toContain('**humor** (Witty)');
  });
});
