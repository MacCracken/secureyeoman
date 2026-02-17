/**
 * Browser Tools — unit tests for the placeholder browser automation tools.
 *
 * These tools are stubs that return "not yet available" until a browser engine
 * is installed. We verify the module exports the registration function.
 */

import { describe, it, expect } from 'vitest';
import { registerBrowserTools } from './browser-tools.js';

describe('registerBrowserTools', () => {
  it('exports registerBrowserTools as a function', () => {
    expect(typeof registerBrowserTools).toBe('function');
  });

  it('accepts three arguments (server, config, middleware)', () => {
    // The function signature expects (McpServer, McpServiceConfig, ToolMiddleware)
    expect(registerBrowserTools.length).toBe(3);
  });
});
