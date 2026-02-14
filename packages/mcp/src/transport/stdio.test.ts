import { describe, it, expect } from 'vitest';
import { createStdioTransport, StdioServerTransport } from './stdio.js';

describe('stdio transport', () => {
  it('should export StdioServerTransport', () => {
    expect(StdioServerTransport).toBeDefined();
  });

  it('should create a stdio transport instance', () => {
    const transport = createStdioTransport();
    expect(transport).toBeInstanceOf(StdioServerTransport);
  });

  it('should create a new instance each time', () => {
    const t1 = createStdioTransport();
    const t2 = createStdioTransport();
    expect(t1).not.toBe(t2);
  });

  it('should have required transport interface methods', () => {
    const transport = createStdioTransport();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(typeof transport.send).toBe('function');
  });

  it('should be usable without HTTP server', () => {
    // stdio transport operates over stdin/stdout, no HTTP needed
    const transport = createStdioTransport();
    expect(transport).toBeDefined();
  });
});
