import { describe, it, expect } from 'vitest';
import { PromptLinter } from './prompt-linter.js';

describe('PromptLinter', () => {
  const linter = new PromptLinter();

  it('detects empty prompt', () => {
    const results = linter.lint('');
    expect(results).toHaveLength(1);
    expect(results[0]!.rule).toBe('empty-prompt');
    expect(results[0]!.severity).toBe('error');
  });

  it('warns on overly long prompt', () => {
    const long = 'x'.repeat(9000);
    const results = linter.lint(long);
    expect(results.some((r) => r.rule === 'max-length')).toBe(true);
  });

  it('warns on too many lines', () => {
    const lines = Array(250).fill('instruction line here').join('\n');
    const results = linter.lint(lines);
    expect(results.some((r) => r.rule === 'max-lines')).toBe(true);
  });

  it('warns on missing safety boundary', () => {
    const prompt = 'You are a helpful assistant. Answer questions accurately.';
    const results = linter.lint(prompt);
    expect(results.some((r) => r.rule === 'missing-safety')).toBe(true);
  });

  it('passes when safety keywords present', () => {
    const prompt = 'You are a helpful assistant. Never produce harmful content. Decline inappropriate requests.';
    const results = linter.lint(prompt);
    expect(results.some((r) => r.rule === 'missing-safety')).toBe(false);
  });

  it('detects conflicting brief vs detailed instructions', () => {
    const prompt = 'Always be brief and concise. Always be detailed and thorough.';
    const results = linter.lint(prompt);
    expect(results.some((r) => r.rule === 'conflicting-instructions')).toBe(true);
  });

  it('detects conflicting formal vs casual tone', () => {
    const prompt = 'Use a formal tone. Use a casual tone.';
    const results = linter.lint(prompt);
    expect(results.some((r) => r.rule === 'conflicting-instructions')).toBe(true);
  });

  it('detects duplicate instructions', () => {
    const prompt = 'Always respond in English format.\nSome other text here.\nAlways respond in English format.';
    const results = linter.lint(prompt);
    expect(results.some((r) => r.rule === 'duplicate-line')).toBe(true);
  });

  it('reports template variables', () => {
    const prompt = 'Hello {{name}}, today is {{date}}. Never be harmful.';
    const results = linter.lint(prompt);
    const templateResults = results.filter((r) => r.rule === 'template-variable');
    expect(templateResults).toHaveLength(2);
  });

  it('does not report template vars when disabled', () => {
    const customLinter = new PromptLinter({ checkTemplateVars: false });
    const prompt = 'Hello {{name}}. Never be harmful.';
    const results = customLinter.lint(prompt);
    expect(results.some((r) => r.rule === 'template-variable')).toBe(false);
  });

  it('handles clean prompt with no issues', () => {
    const prompt = 'You are a helpful assistant. Do not produce harmful content.';
    const results = linter.lint(prompt);
    // Should only potentially have info-level items, no errors/warnings
    const errors = results.filter((r) => r.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
