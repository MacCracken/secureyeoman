import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { initializeLogger } from '../logging/logger.js';
import { registerTerminalRoutes } from './terminal-routes.js';

// Initialize logger before registering routes (required by getLogger())
beforeAll(() => {
  try {
    initializeLogger({ level: 'error', format: 'json', output: [] });
  } catch {
    // Already initialized
  }
});

function buildApp() {
  const app = Fastify();
  registerTerminalRoutes(app);
  return app;
}

describe('GET /api/v1/terminal/health', () => {
  it('returns ok status', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/terminal/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});

describe('POST /api/v1/terminal/execute — blocked commands', () => {
  it('blocks rm -rf /', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'rm -rf /' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks mkfs commands', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'mkfs.ext4 /dev/sda1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks dd zero-fill commands', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'dd if=/dev/zero of=/dev/sda' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks fork bomb', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: ':() { :|:& }; :' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks shutdown command', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'shutdown -h now' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/terminal/execute — sensitive working directory', () => {
  it('blocks /etc as cwd', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'ls', cwd: '/etc' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks /root as cwd', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'ls', cwd: '/root' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks /sys as cwd', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'ls', cwd: '/sys/kernel' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks disallowed working directory', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'ls', cwd: '/usr/local/bin' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/terminal/execute — validation', () => {
  it('returns 400 when command is missing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
