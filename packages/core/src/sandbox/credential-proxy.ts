/**
 * Credential Proxy — Outbound HTTP/HTTPS proxy that injects Authorization headers
 * for known hosts and enforces an allowlist on all outbound connections.
 *
 * The proxy runs in the **parent** process. Sandboxed child processes receive only
 * `http_proxy=http://127.0.0.1:PORT` — never the raw credential value.
 *
 * See: docs/adr/099-sandbox-credential-proxy.md
 */

import * as http from 'http';
import * as net from 'net';
import type { IncomingMessage, ServerResponse } from 'http';

export interface CredentialRule {
  host: string;
  headerName: string;
  headerValue: string;
}

export interface CredentialProxyConfig {
  allowedHosts: string[];
  credentials: CredentialRule[];
  requestTimeoutMs?: number;
}

export interface CredentialProxyHandle {
  proxyUrl: string;
  port: number;
  stop(): Promise<void>;
}

export class CredentialProxy {
  constructor(private readonly config: CredentialProxyConfig) {}

  /**
   * Start the proxy server on an OS-assigned ephemeral port bound to 127.0.0.1.
   * Returns a handle with the proxy URL and a stop() method.
   */
  async start(): Promise<CredentialProxyHandle> {
    // Build lookup structures once at start time
    const allowedSet = new Set<string>(this.config.allowedHosts);
    const credMap = new Map<string, CredentialRule>();
    for (const cred of this.config.credentials) {
      credMap.set(cred.host, cred);
      // Credential-rule hosts are implicitly allowed (plan spec)
      allowedSet.add(cred.host);
    }

    const timeoutMs = this.config.requestTimeoutMs ?? 10000;

    // ── Plain HTTP handler ─────────────────────────────────────────────
    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      const rawUrl = req.url ?? '';

      // Proxy requests arrive with an absolute URL; anything else is not a valid
      // plain-HTTP proxy request.
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      let targetUrl: URL;
      try {
        targetUrl = new URL(rawUrl);
      } catch {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const host = targetUrl.hostname;

      if (!allowedSet.has(host)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // Build outgoing headers: copy incoming, inject credential if known host
      const outgoing: http.OutgoingHttpHeaders = { ...req.headers };
      const cred = credMap.get(host);
      if (cred) {
        outgoing[cred.headerName.toLowerCase()] = cred.headerValue;
      }
      // Strip hop-by-hop proxy headers
      delete outgoing['proxy-connection'];
      delete outgoing['proxy-authorization'];

      const port = targetUrl.port ? parseInt(targetUrl.port, 10) : 80;
      const path = (targetUrl.pathname || '/') + targetUrl.search;

      const proxyReq = http.request(
        {
          hostname: targetUrl.hostname,
          port,
          path,
          method: req.method,
          headers: outgoing,
          timeout: timeoutMs,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );

      proxyReq.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Bad Gateway');
        }
      });

      req.pipe(proxyReq, { end: true });
    });

    // ── CONNECT (HTTPS tunnel) handler ────────────────────────────────
    server.on(
      'connect',
      (req: IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
        const authority = req.url ?? '';
        const colonIdx = authority.lastIndexOf(':');
        const host = colonIdx !== -1 ? authority.slice(0, colonIdx) : authority;
        const portStr = colonIdx !== -1 ? authority.slice(colonIdx + 1) : '443';
        const port = parseInt(portStr, 10) || 443;

        if (!allowedSet.has(host)) {
          clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          clientSocket.destroy();
          return;
        }

        const serverSocket = net.createConnection({ host, port }, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length > 0) {
            serverSocket.write(head);
          }
          serverSocket.pipe(clientSocket, { end: true });
          clientSocket.pipe(serverSocket, { end: true });
        });

        serverSocket.on('error', () => {
          if (!clientSocket.destroyed) {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
          }
        });

        clientSocket.on('error', () => {
          if (!serverSocket.destroyed) {
            serverSocket.destroy();
          }
        });
      }
    );

    // ── Start listening ────────────────────────────────────────────────
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as net.AddressInfo;
    const port = address.port;
    const proxyUrl = `http://127.0.0.1:${port}`;

    return {
      proxyUrl,
      port,
      stop(): Promise<void> {
        return new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      },
    };
  }
}
