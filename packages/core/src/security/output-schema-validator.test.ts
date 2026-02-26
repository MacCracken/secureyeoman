import { describe, it, expect } from 'vitest';
import { OutputSchemaValidator } from './output-schema-validator.js';

const validator = new OutputSchemaValidator();

// ─── Basic type checks ─────────────────────────────────────────────────────────

describe('OutputSchemaValidator — type validation', () => {
  it('passes a valid string', () => {
    const result = validator.validate('hello', { type: 'string' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when string is expected but number given', () => {
    const result = validator.validate(42, { type: 'string' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/Expected type "string"/);
  });

  it('passes a valid number', () => {
    expect(validator.validate(3.14, { type: 'number' }).valid).toBe(true);
  });

  it('passes a valid boolean', () => {
    expect(validator.validate(true, { type: 'boolean' }).valid).toBe(true);
  });

  it('passes null when type is null', () => {
    expect(validator.validate(null, { type: 'null' }).valid).toBe(true);
  });

  it('fails when type is null but value is not null', () => {
    const result = validator.validate('hi', { type: 'null' });
    expect(result.valid).toBe(false);
  });
});

// ─── Null output is always valid ──────────────────────────────────────────────

describe('OutputSchemaValidator — null output', () => {
  it('null output passes a null-typed schema', () => {
    expect(validator.validate(null, { type: 'null' }).valid).toBe(true);
  });

  it('null fails object schema', () => {
    const result = validator.validate(null, { type: 'object' });
    expect(result.valid).toBe(false);
  });
});

// ─── Object validation ─────────────────────────────────────────────────────────

describe('OutputSchemaValidator — object validation', () => {
  it('passes a valid object', () => {
    const result = validator.validate({ name: 'Alice' }, { type: 'object' });
    expect(result.valid).toBe(true);
  });

  it('fails when required field is missing', () => {
    const result = validator.validate(
      { age: 30 },
      { type: 'object', required: ['name', 'age'] }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"name" is missing'))).toBe(true);
  });

  it('passes when all required fields are present', () => {
    const result = validator.validate(
      { name: 'Alice', age: 30 },
      { type: 'object', required: ['name', 'age'] }
    );
    expect(result.valid).toBe(true);
  });

  it('validates nested property types', () => {
    const result = validator.validate(
      { user: { age: 'not-a-number' } },
      {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              age: { type: 'number' },
            },
          },
        },
      }
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('user.age');
  });
});

// ─── Array validation ──────────────────────────────────────────────────────────

describe('OutputSchemaValidator — array validation', () => {
  it('passes a valid array', () => {
    expect(validator.validate([1, 2, 3], { type: 'array' }).valid).toBe(true);
  });

  it('validates array items against items schema', () => {
    const result = validator.validate(
      [1, 'two', 3],
      { type: 'array', items: { type: 'number' } }
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].path).toBe('[1]');
    expect(result.errors[0].message).toMatch(/Expected type "number"/);
  });

  it('passes when all array items match items schema', () => {
    const result = validator.validate(
      [1, 2, 3],
      { type: 'array', items: { type: 'number' } }
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Deeply nested errors accumulate ──────────────────────────────────────────

describe('OutputSchemaValidator — deeply nested', () => {
  it('accumulates errors at multiple levels', () => {
    const schema = {
      type: 'object',
      required: ['a', 'b'],
      properties: {
        a: { type: 'string' },
        b: {
          type: 'object',
          required: ['c'],
          properties: {
            c: { type: 'number' },
          },
        },
      },
    };
    const result = validator.validate({ a: 42, b: { c: 'wrong' } }, schema);
    expect(result.valid).toBe(false);
    // a has wrong type, b.c has wrong type
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('a');
    expect(paths).toContain('b.c');
  });
});

// ─── No schema type — structural checks only ───────────────────────────────────

describe('OutputSchemaValidator — no explicit type', () => {
  it('validates required fields even without explicit type', () => {
    const result = validator.validate(
      { age: 30 },
      { required: ['name'] }
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('"name" is missing');
  });
});
