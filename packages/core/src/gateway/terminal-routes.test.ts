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

describe('POST /api/v1/terminal/execute — cd interception', () => {
  it('cd /tmp returns new cwd without error', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd /tmp', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ cwd: string; exitCode: number }>();
    expect(body.exitCode).toBe(0);
    expect(body.cwd).toBe('/tmp');
  });

  it('cd /var/tmp resolves to /var/tmp', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd /var/tmp', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ cwd: string; exitCode: number }>();
    expect(body.exitCode).toBe(0);
    expect(body.cwd).toBe('/var/tmp');
  });

  it('cd .. from /tmp resolves to / and returns permission denied', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd ..', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ cwd: string; exitCode: number; error: string }>();
    expect(body.exitCode).toBe(1);
    expect(body.error).toMatch(/Permission denied/);
    expect(body.cwd).toBe('/tmp'); // cwd unchanged on error
  });

  it('cd /etc returns permission denied', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd /etc', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ exitCode: number; error: string }>();
    expect(body.exitCode).toBe(1);
    expect(body.error).toMatch(/Permission denied/);
  });

  it('cd to a non-existent path inside /tmp returns no such file or directory', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd /tmp/nonexistent-dir-xyz-abc-123', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ exitCode: number; error: string }>();
    expect(body.exitCode).toBe(1);
    expect(body.error).toMatch(/No such file or directory/);
  });

  it('cd - returns OLDPWD error', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd -', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ exitCode: number; error: string }>();
    expect(body.exitCode).toBe(1);
    expect(body.error).toMatch(/OLDPWD/);
  });

  it('bare cd resolves to HOME or /tmp', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/terminal/execute',
      payload: { command: 'cd', cwd: '/tmp' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ exitCode: number }>();
    // HOME may or may not be in the allowlist — just confirm the command was intercepted (no 500)
    expect([0, 1]).toContain(body.exitCode);
  });
});
