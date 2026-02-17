import { describe, it, expect } from 'vitest';
import { createInputValidator } from './input-validator.js';

describe('input-validator', () => {
  const validator = createInputValidator();

  describe('clean inputs', () => {
    it('should pass clean string args', () => {
      const result = validator.validate({ query: 'hello world' });
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass empty args', () => {
      const result = validator.validate({});
      expect(result.valid).toBe(true);
    });

    it('should pass numeric args', () => {
      const result = validator.validate({ limit: 10, offset: 0 });
      expect(result.valid).toBe(true);
    });
  });

  describe('SQL injection', () => {
    it('should block UNION SELECT', () => {
      const result = validator.validate({ query: '1 UNION SELECT * FROM users' });
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toContain('sql_union');
    });

    it('should block DROP TABLE', () => {
      const result = validator.validate({ query: 'DROP TABLE users' });
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toContain('sql_drop');
    });

    it('should block chained SQL statements', () => {
      const result = validator.validate({ input: '; DELETE FROM users WHERE 1=1' });
      expect(result.blocked).toBe(true);
    });
  });

  describe('command injection', () => {
    it('should block backtick execution', () => {
      const result = validator.validate({ path: '`rm -rf /`' });
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toContain('cmd_backtick');
    });

    it('should block subshell execution', () => {
      const result = validator.validate({ path: '$(cat /etc/passwd)' });
      expect(result.blocked).toBe(true);
    });

    it('should block pipe to shell commands', () => {
      const result = validator.validate({ input: 'data | sh' });
      expect(result.blocked).toBe(true);
    });

    it('should block semicolon-separated commands', () => {
      const result = validator.validate({ input: '; rm -rf /' });
      expect(result.blocked).toBe(true);
    });
  });

  describe('XSS', () => {
    it('should block script tags', () => {
      const result = validator.validate({ content: '<script>alert(1)</script>' });
      expect(result.blocked).toBe(true);
    });

    it('should block javascript: URIs', () => {
      const result = validator.validate({ url: 'javascript:alert(1)' });
      expect(result.blocked).toBe(true);
    });

    it('should warn on event handlers', () => {
      const result = validator.validate({ html: '<div onload=alert(1)>' });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('template injection', () => {
    it('should warn on double braces', () => {
      const result = validator.validate({ input: '{{constructor.constructor("return this")()}}' });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn on template expressions', () => {
      const result = validator.validate({ input: '${process.env.SECRET}' });
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('nested objects', () => {
    it('should validate nested object values', () => {
      const result = validator.validate({ data: { nested: "'; DROP TABLE users; --" } });
      expect(result.blocked).toBe(true);
    });

    it('should validate array values', () => {
      const result = validator.validate({ items: ['safe', "'; DROP TABLE users; --"] });
      expect(result.blocked).toBe(true);
    });
  });
});
