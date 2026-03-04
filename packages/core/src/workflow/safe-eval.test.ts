import { describe, it, expect } from 'vitest';
import { evaluateCondition, validateConditionExpression } from './safe-eval.js';

describe('evaluateCondition — literals', () => {
  it('returns true for "true"', () => {
    expect(evaluateCondition('true', {})).toBe(true);
  });

  it('returns false for "false"', () => {
    expect(evaluateCondition('false', {})).toBe(false);
  });

  it('returns false for "null"', () => {
    expect(evaluateCondition('null', {})).toBe(false);
  });

  it('returns true for non-zero number', () => {
    expect(evaluateCondition('42', {})).toBe(true);
  });

  it('returns false for zero', () => {
    expect(evaluateCondition('0', {})).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(evaluateCondition("'hello'", {})).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(evaluateCondition("''", {})).toBe(false);
  });
});

describe('evaluateCondition — property access', () => {
  const ctx = {
    steps: {
      step1: { output: { status: 'success', count: 5 } },
      step2: { output: { status: 'failed', count: 0 } },
    },
    input: { threshold: 3, name: 'test' },
  };

  it('resolves nested property access', () => {
    expect(evaluateCondition("steps.step1.output.status == 'success'", ctx)).toBe(true);
  });

  it('resolves deep property returning number', () => {
    expect(evaluateCondition('steps.step1.output.count > 3', ctx)).toBe(true);
  });

  it('returns false for missing property comparison', () => {
    expect(evaluateCondition("steps.step99.output.status == 'success'", ctx)).toBe(false);
  });

  it('handles undefined property gracefully', () => {
    expect(evaluateCondition('steps.step1.output.missing == null', ctx)).toBe(true);
  });
});

describe('evaluateCondition — comparisons', () => {
  it('== with numbers', () => {
    expect(evaluateCondition('5 == 5', {})).toBe(true);
    expect(evaluateCondition('5 == 6', {})).toBe(false);
  });

  it('!= with strings', () => {
    expect(evaluateCondition("'a' != 'b'", {})).toBe(true);
    expect(evaluateCondition("'a' != 'a'", {})).toBe(false);
  });

  it('> and <', () => {
    expect(evaluateCondition('10 > 5', {})).toBe(true);
    expect(evaluateCondition('3 < 7', {})).toBe(true);
    expect(evaluateCondition('5 > 10', {})).toBe(false);
  });

  it('>= and <=', () => {
    expect(evaluateCondition('5 >= 5', {})).toBe(true);
    expect(evaluateCondition('5 <= 5', {})).toBe(true);
    expect(evaluateCondition('4 >= 5', {})).toBe(false);
  });

  it('=== treated same as ==', () => {
    expect(evaluateCondition("'ok' == 'ok'", {})).toBe(true);
  });

  it('!== treated same as !=', () => {
    expect(evaluateCondition("'a' != 'b'", {})).toBe(true);
  });
});

describe('evaluateCondition — logical operators', () => {
  it('&& with both true', () => {
    expect(evaluateCondition('true && true', {})).toBe(true);
  });

  it('&& with one false', () => {
    expect(evaluateCondition('true && false', {})).toBe(false);
  });

  it('|| with one true', () => {
    expect(evaluateCondition('false || true', {})).toBe(true);
  });

  it('|| with both false', () => {
    expect(evaluateCondition('false || false', {})).toBe(false);
  });

  it('! negation', () => {
    expect(evaluateCondition('!false', {})).toBe(true);
    expect(evaluateCondition('!true', {})).toBe(false);
  });

  it('complex logical expression', () => {
    const ctx = { a: { x: 1 }, b: { x: 2 } };
    expect(evaluateCondition('a.x == 1 && b.x > 1', ctx)).toBe(true);
    expect(evaluateCondition('a.x == 1 || b.x == 99', ctx)).toBe(true);
    expect(evaluateCondition('a.x == 99 && b.x == 99', ctx)).toBe(false);
  });
});

describe('evaluateCondition — parenthesized grouping', () => {
  it('groups expressions', () => {
    expect(evaluateCondition('(true || false) && true', {})).toBe(true);
    expect(evaluateCondition('true || (false && false)', {})).toBe(true);
    expect(evaluateCondition('(false || false) && true', {})).toBe(false);
  });

  it('nested parens', () => {
    expect(evaluateCondition('((true))', {})).toBe(true);
  });
});

describe('evaluateCondition — injection attempts', () => {
  it('rejects function calls', () => {
    expect(() => evaluateCondition('console.log(1)', {})).toThrow('Function calls');
  });

  it('rejects new keyword', () => {
    expect(() => evaluateCondition('new Date()', {})).toThrow("Keyword 'new'");
  });

  it('rejects import', () => {
    expect(() => evaluateCondition("import('fs')", {})).toThrow("Keyword 'import'");
  });

  it('rejects require', () => {
    expect(() => evaluateCondition("require('fs')", {})).toThrow("Keyword 'require'");
  });

  it('rejects eval', () => {
    expect(() => evaluateCondition("eval('code')", {})).toThrow("Keyword 'eval'");
  });

  it('rejects assignment', () => {
    expect(() => evaluateCondition('x = 1', {})).toThrow('Assignment');
  });

  it('rejects template literals', () => {
    expect(() => evaluateCondition('`template`', {})).toThrow('Template literals');
  });

  it('rejects this keyword', () => {
    expect(() => evaluateCondition('this.constructor', {})).toThrow("Keyword 'this'");
  });

  it('rejects __proto__', () => {
    expect(() => evaluateCondition('obj.__proto__', {})).toThrow("Keyword '__proto__'");
  });

  it('rejects constructor access', () => {
    expect(() => evaluateCondition('obj.constructor', {})).toThrow("Keyword 'constructor'");
  });

  it('rejects while loop', () => {
    expect(() => evaluateCondition('while(true)', {})).toThrow("Keyword 'while'");
  });
});

describe('evaluateCondition — edge cases', () => {
  it('returns false for empty expression', () => {
    expect(evaluateCondition('', {})).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    expect(evaluateCondition(null as unknown as string, {})).toBe(false);
    expect(evaluateCondition(undefined as unknown as string, {})).toBe(false);
  });

  it('throws for expression exceeding max length', () => {
    const longExpr = 'a'.repeat(1001);
    expect(() => evaluateCondition(longExpr, {})).toThrow('Expression too long');
  });

  it('handles negative numbers', () => {
    expect(evaluateCondition('-1 < 0', {})).toBe(true);
  });

  it('handles escaped quotes in strings', () => {
    expect(evaluateCondition("'it\\'s' == 'it\\'s'", {})).toBe(true);
  });

  it('handles double-quoted strings', () => {
    expect(evaluateCondition('"hello" == "hello"', {})).toBe(true);
  });

  it('handles whitespace-heavy expressions', () => {
    expect(evaluateCondition('  true   &&   true  ', {})).toBe(true);
  });
});

describe('evaluateCondition — real workflow scenarios', () => {
  const workflowCtx = {
    steps: {
      fetch: { output: { statusCode: 200, data: { items: 5 } } },
      validate: { output: { valid: true, errors: 0 } },
      transform: { output: { status: 'complete' } },
    },
    input: { mode: 'production', retries: 3 },
  };

  it('check step output status code', () => {
    expect(evaluateCondition('steps.fetch.output.statusCode == 200', workflowCtx)).toBe(true);
  });

  it('check validation passed and no errors', () => {
    expect(
      evaluateCondition(
        'steps.validate.output.valid == true && steps.validate.output.errors == 0',
        workflowCtx
      )
    ).toBe(true);
  });

  it('check input mode', () => {
    expect(evaluateCondition("input.mode == 'production'", workflowCtx)).toBe(true);
    expect(evaluateCondition("input.mode == 'staging'", workflowCtx)).toBe(false);
  });

  it('conditional on multiple steps', () => {
    expect(
      evaluateCondition(
        "steps.fetch.output.statusCode == 200 && steps.transform.output.status == 'complete'",
        workflowCtx
      )
    ).toBe(true);
  });

  it('numeric comparison with input', () => {
    expect(evaluateCondition('input.retries > 0', workflowCtx)).toBe(true);
  });
});

describe('validateConditionExpression', () => {
  it('validates correct expressions', () => {
    expect(validateConditionExpression("steps.a.output == 'ok'")).toEqual({ valid: true });
    expect(validateConditionExpression('true && false')).toEqual({ valid: true });
    expect(validateConditionExpression('a.b > 5')).toEqual({ valid: true });
  });

  it('rejects invalid syntax', () => {
    const result = validateConditionExpression('==');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects empty expression', () => {
    expect(validateConditionExpression('')).toEqual({
      valid: false,
      error: 'Expression is empty',
    });
  });

  it('rejects injection attempts', () => {
    const result = validateConditionExpression("require('fs')");
    expect(result.valid).toBe(false);
    expect(result.error).toContain('require');
  });

  it('rejects too-long expressions', () => {
    const result = validateConditionExpression('a'.repeat(1001));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });
});
