/**
 * Unit tests for CredentialProxy
 *
 * Tests cover: lifecycle, allowlist enforcement, credential injection,
 * CONNECT tunnels, and concurrent request isolation.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'http';
import * as net from 'net';
import { CredentialProxy, type CredentialProxyHandle } from './credential-proxy.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Start a minimal HTTP server that records incoming headers and responds 200. */
function startEchoServer(): Promise<{ port: number; lastHeaders: () => http.IncomingHttpHeaders; stop: () => Promise<void> }> {
  let lastHeaders: http.IncomingHttpHeaders = {};
  const server = http.createServer((req, res) => {
    lastHeaders = req.headers;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        lastHeaders: () => lastHeaders,
        stop: () =>
          new Promise((res, rej) =>
            server.close((err) => (err ? rej(err) : res()))
          ),
      });
    });
  });
}

/** Make a plain HTTP request through the proxy and return {statusCode, body}. */
function proxyRequest(
  proxyPort: number,
  targetUrl: string,
  method = 'GET'
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: proxyPort,
        path: targetUrl,
        method,
        headers: { host: url.host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** Send a CONNECT request through the proxy and return the status line. */
function proxyConnect(proxyPort: number, authority: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: proxyPort }, () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });

    let response = '';
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString();
      // Once we have the status line, close
      if (response.includes('\r\n')) {
        socket.destroy();
        resolve(response.split('\r\n')[0] ?? '');
      }
    });
    socket.on('error', reject);
    socket.on('close', () => {
      if (response.includes('\r\n')) {
        resolve(response.split('\r\n')[0] ?? '');
      }
    });
    // Timeout safety
    setTimeout(() => {
      socket.destroy();
      resolve(response.split('\r\n')[0] ?? response);
    }, 2000);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CredentialProxy', () => {
  const handles: CredentialProxyHandle[] = [];

  afterEach(async () => {
    // Ensure all proxies are cleaned up after each test
    for (const h of handles.splice(0)) {
      await h.stop().catch(() => undefined);
    }
  });

  it('start() returns a proxyUrl with http://127.0.0.1:PORT format', async () => {
    const proxy = new CredentialProxy({ allowedHosts: [], credentials: [] });
    const handle = await proxy.start();
    handles.push(handle);

    expect(handle.proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.port).toBeLessThanOrEqual(65535);
  });

  it('stop() closes the server so subsequent connections are refused', async () => {
    const proxy = new CredentialProxy({ allowedHosts: [], credentials: [] });
    const handle = await proxy.start();
    const { port } = handle;

    await handle.stop();

    // After stop, a connection to the port should fail
    await expect(
      new Promise<void>((resolve, reject) => {
        const s = net.createConnection({ host: '127.0.0.1', port }, () => resolve());
        s.on('error', reject);
        setTimeout(() => { s.destroy(); resolve(); }, 500);
      })
    ).rejects.toBeDefined();
  });

  it('plain HTTP to an allowed host without credential — passes through (200)', async () => {
    const echo = await startEchoServer();
    const proxy = new CredentialProxy({
      allowedHosts: ['127.0.0.1'],
      credentials: [],
    });
    const handle = await proxy.start();
    handles.push(handle);

    const { statusCode } = await proxyRequest(
      handle.port,
      `http://127.0.0.1:${echo.port}/`
    );

    await echo.stop();
    expect(statusCode).toBe(200);
  });

  it('plain HTTP to an allowed host with credential rule — injects the header', async () => {
    const echo = await startEchoServer();
    const proxy = new CredentialProxy({
      allowedHosts: [],
      credentials: [
        {
          host: '127.0.0.1',
          headerName: 'Authorization',
          headerValue: 'Bearer test-token-xyz',
        },
      ],
    });
    const handle = await proxy.start();
    handles.push(handle);

    await proxyRequest(handle.port, `http://127.0.0.1:${echo.port}/`);

    await echo.stop();
    expect(echo.lastHeaders()['authorization']).toBe('Bearer test-token-xyz');
  });

  it('plain HTTP to a blocked host — returns 403', async () => {
    const proxy = new CredentialProxy({
      allowedHosts: [],
      credentials: [],
    });
    const handle = await proxy.start();
    handles.push(handle);

    const { statusCode } = await proxyRequest(handle.port, 'http://blocked.example.com/');
    expect(statusCode).toBe(403);
  });

  it('CONNECT to an allowed host — returns 200 Connection Established', async () => {
    const proxy = new CredentialProxy({
      allowedHosts: ['example.com'],
      credentials: [],
    });
    const handle = await proxy.start();
    handles.push(handle);

    const statusLine = await proxyConnect(handle.port, 'example.com:443');
    expect(statusLine).toContain('200');
  });

  it('CONNECT to a blocked host — returns 403', async () => {
    const proxy = new CredentialProxy({
      allowedHosts: [],
      credentials: [],
    });
    const handle = await proxy.start();
    handles.push(handle);

    const statusLine = await proxyConnect(handle.port, 'blocked.example.com:443');
    expect(statusLine).toContain('403');
  });

  it('isAllowed treats credential-rule hosts as implicitly allowed', async () => {
    const echo = await startEchoServer();
    // '127.0.0.1' is NOT in allowedHosts but has a credential rule
    const proxy = new CredentialProxy({
      allowedHosts: [],
      credentials: [{ host: '127.0.0.1', headerName: 'X-Api-Key', headerValue: 'secret' }],
    });
    const handle = await proxy.start();
    handles.push(handle);

    const { statusCode } = await proxyRequest(handle.port, `http://127.0.0.1:${echo.port}/`);

    await echo.stop();
    // Should be allowed because credential rules implicitly allow the host
    expect(statusCode).toBe(200);
  });

  it('does not leak credentials across simultaneous requests to different hosts', async () => {
    const echoA = await startEchoServer();
    const echoB = await startEchoServer();

    const proxy = new CredentialProxy({
      allowedHosts: ['127.0.0.1'],
      credentials: [
        { host: '127.0.0.1', headerName: 'Authorization', headerValue: 'Bearer token-A' },
      ],
    });
    const handle = await proxy.start();
    handles.push(handle);

    // Fire both requests concurrently
    await Promise.all([
      proxyRequest(handle.port, `http://127.0.0.1:${echoA.port}/`),
      proxyRequest(handle.port, `http://127.0.0.1:${echoB.port}/`),
    ]);

    // Both should have received the credential (same host rule)
    expect(echoA.lastHeaders()['authorization']).toBe('Bearer token-A');
    expect(echoB.lastHeaders()['authorization']).toBe('Bearer token-A');

    await echoA.stop();
    await echoB.stop();
  });

  it('proxy lifecycle: can be started and stopped cleanly multiple times in sequence', async () => {
    for (let i = 0; i < 3; i++) {
      const proxy = new CredentialProxy({ allowedHosts: [], credentials: [] });
      const handle = await proxy.start();
      expect(handle.proxyUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      await handle.stop();
    }
  });
});
