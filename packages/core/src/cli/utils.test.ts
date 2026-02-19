import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractFlag, extractBoolFlag, formatUptime, formatTable, colorContext, Spinner } from './utils.js';

describe('extractFlag', () => {
  it('should extract flag with value', () => {
    const { value, rest } = extractFlag(['--port', '3001', '--json'], 'port');
    expect(value).toBe('3001');
    expect(rest).toEqual(['--json']);
  });

  it('should extract flag by alias', () => {
    const { value, rest } = extractFlag(['-p', '3001'], 'port', 'p');
    expect(value).toBe('3001');
    expect(rest).toEqual([]);
  });

  it('should return undefined when flag not present', () => {
    const { value, rest } = extractFlag(['--json'], 'port');
    expect(value).toBeUndefined();
    expect(rest).toEqual(['--json']);
  });
});

describe('extractBoolFlag', () => {
  it('should detect boolean flag', () => {
    const { value, rest } = extractBoolFlag(['--json', '--url', 'http://x'], 'json');
    expect(value).toBe(true);
    expect(rest).toEqual(['--url', 'http://x']);
  });

  it('should detect alias', () => {
    const { value } = extractBoolFlag(['-h'], 'help', 'h');
    expect(value).toBe(true);
  });

  it('should return false when not present', () => {
    const { value } = extractBoolFlag(['--url', 'x'], 'json');
    expect(value).toBe(false);
  });
});

describe('formatUptime', () => {
  it('should format seconds only', () => {
    expect(formatUptime(45_000)).toBe('45s');
  });

  it('should format minutes and seconds', () => {
    expect(formatUptime(135_000)).toBe('2m 15s');
  });

  it('should format hours, minutes, seconds', () => {
    expect(formatUptime(8_103_000)).toBe('2h 15m 3s');
  });

  it('should handle zero', () => {
    expect(formatUptime(0)).toBe('0s');
  });
});

describe('formatTable', () => {
  it('should format rows with aligned columns', () => {
    const result = formatTable([
      { id: '1', name: 'foo' },
      { id: '22', name: 'bar' },
    ]);
    expect(result).toContain('ID');
    expect(result).toContain('NAME');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('should return message for empty rows', () => {
    expect(formatTable([])).toBe('(no results)');
  });

  it('should respect column order', () => {
    const result = formatTable([{ a: '1', b: '2' }], ['b', 'a']);
    const headerLine = result.split('\n')[0];
    expect(headerLine.indexOf('B')).toBeLessThan(headerLine.indexOf('A'));
  });
});

describe('colorContext', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function makeTTYStream(): NodeJS.WritableStream {
    return { write: () => true, isTTY: true } as unknown as NodeJS.WritableStream;
  }

  function makePlainStream(): NodeJS.WritableStream {
    return { write: () => true } as NodeJS.WritableStream;
  }

  it('should return plain text on non-TTY streams', () => {
    const c = colorContext(makePlainStream());
    expect(c.green('hello')).toBe('hello');
    expect(c.red('error')).toBe('error');
    expect(c.yellow('warn')).toBe('warn');
    expect(c.dim('dim')).toBe('dim');
    expect(c.bold('bold')).toBe('bold');
  });

  it('should wrap text with ANSI codes on TTY streams', () => {
    const c = colorContext(makeTTYStream());
    const green = c.green('hello');
    expect(green).toContain('hello');
    expect(green).toContain('\x1b[');    // has ANSI escape
    expect(green).toContain('\x1b[0m'); // reset code
  });

  it('should return plain text when NO_COLOR is set even on TTY', () => {
    process.env['NO_COLOR'] = '1';
    const c = colorContext(makeTTYStream());
    expect(c.green('hello')).toBe('hello');
  });

  it('should support all color variants', () => {
    const c = colorContext(makeTTYStream());
    expect(c.red('x')).toContain('\x1b[31m');
    expect(c.green('x')).toContain('\x1b[32m');
    expect(c.yellow('x')).toContain('\x1b[33m');
    expect(c.cyan('x')).toContain('\x1b[36m');
    expect(c.bold('x')).toContain('\x1b[1m');
    expect(c.dim('x')).toContain('\x1b[2m');
  });
});

describe('Spinner', () => {
  function makeStream() {
    let buf = '';
    const stream = { write: (s: string) => { buf += s; return true; } } as NodeJS.WritableStream;
    return { stream, getOutput: () => buf };
  }

  it('should be silent on start for non-TTY stream', () => {
    const { stream, getOutput } = makeStream();
    const spinner = new Spinner(stream);
    spinner.start('Loading');
    expect(getOutput()).toBe('');
  });

  it('should write success mark on stop for non-TTY', () => {
    const { stream, getOutput } = makeStream();
    const spinner = new Spinner(stream);
    spinner.start('Loading');
    spinner.stop('Done', true);
    expect(getOutput()).toContain('✓');
    expect(getOutput()).toContain('Done');
  });

  it('should write failure mark on stop with success=false', () => {
    const { stream, getOutput } = makeStream();
    const spinner = new Spinner(stream);
    spinner.start('Loading');
    spinner.stop('Failed', false);
    expect(getOutput()).toContain('✗');
    expect(getOutput()).toContain('Failed');
  });

  it('should handle stop called without start', () => {
    const { stream, getOutput } = makeStream();
    const spinner = new Spinner(stream);
    spinner.stop('Never started', true);
    expect(getOutput()).toContain('Never started');
  });
});
