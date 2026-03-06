import { describe, it, expect, vi } from 'vitest';
import { PromptTemplateEngine } from './prompt-template.js';

describe('PromptTemplateEngine', () => {
  it('expands builtin date variables', () => {
    const engine = new PromptTemplateEngine();
    const { text } = engine.expand('Today is {{date}}');
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('expands builtin time variable', () => {
    const engine = new PromptTemplateEngine();
    const { text } = engine.expand('Time: {{time}}');
    expect(text).toMatch(/\d{2}:\d{2}/);
  });

  it('expands builtin year variable', () => {
    const engine = new PromptTemplateEngine();
    const { text } = engine.expand('Year: {{year}}');
    expect(text).toContain(String(new Date().getFullYear()));
  });

  it('expands registered user variables', () => {
    const engine = new PromptTemplateEngine();
    engine.register({ name: 'company', value: 'Acme Corp', source: 'user' });
    const { text } = engine.expand('Welcome to {{company}}');
    expect(text).toBe('Welcome to Acme Corp');
  });

  it('returns unresolved for undefined variables', () => {
    const logger = { warn: vi.fn() } as any;
    const engine = new PromptTemplateEngine({ warnOnUndefined: true }, logger);
    const { text, unresolved } = engine.expand('Hello {{unknown}}');
    expect(text).toBe('Hello {{unknown}}');
    expect(unresolved).toEqual(['unknown']);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('uses context overrides over registry', () => {
    const engine = new PromptTemplateEngine();
    engine.register({ name: 'name', value: 'Alice', source: 'user' });
    const { text } = engine.expand('Hi {{name}}', { name: 'Bob' });
    expect(text).toBe('Hi Bob');
  });

  it('handles multiple variables in one text', () => {
    const engine = new PromptTemplateEngine();
    engine.register({ name: 'greeting', value: 'Hello', source: 'user' });
    engine.register({ name: 'target', value: 'World', source: 'user' });
    const { text } = engine.expand('{{greeting}}, {{target}}!');
    expect(text).toBe('Hello, World!');
  });

  it('does nothing when disabled', () => {
    const engine = new PromptTemplateEngine({ enabled: false });
    const { text } = engine.expand('{{date}} {{unknown}}');
    expect(text).toBe('{{date}} {{unknown}}');
  });

  it('truncates long values', () => {
    const engine = new PromptTemplateEngine({ maxValueLength: 10 });
    engine.register({ name: 'long', value: 'a'.repeat(100), source: 'user' });
    const { text } = engine.expand('{{long}}');
    expect(text).toBe('a'.repeat(10) + '...');
  });

  it('extractVariables finds all variable names', () => {
    const engine = new PromptTemplateEngine();
    const vars = engine.extractVariables('Hello {{name}}, today is {{date}}. {{name}} again.');
    expect(vars).toEqual(['name', 'date']);
  });

  it('registerBatch adds multiple variables', () => {
    const engine = new PromptTemplateEngine();
    engine.registerBatch([
      { name: 'a', value: '1', source: 'user' },
      { name: 'b', value: '2', source: 'user' },
    ]);
    const { text } = engine.expand('{{a}}+{{b}}');
    expect(text).toBe('1+2');
  });

  it('unregister removes a variable', () => {
    const engine = new PromptTemplateEngine();
    engine.register({ name: 'temp', value: 'x', source: 'user' });
    expect(engine.unregister('temp')).toBe(true);
    const { unresolved } = engine.expand('{{temp}}');
    expect(unresolved).toContain('temp');
  });

  it('getVariables lists all registered', () => {
    const engine = new PromptTemplateEngine();
    engine.register({ name: 'custom', value: 'val', source: 'user' });
    const vars = engine.getVariables();
    expect(vars.some((v) => v.name === 'custom')).toBe(true);
    expect(vars.some((v) => v.name === 'date')).toBe(true); // builtin
  });
});
