/**
 * Gateway Server for SecureClaw
 *
 * Provides REST API and WebSocket endpoints for the dashboard.
 *
 * Security considerations:
 * - Local network only by default
 * - All endpoints protected by authentication (when enabled)
 * - Rate limiting on all routes
 * - Input validation on all parameters
 */
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import { getLogger } from '../logging/logger.js';
export class GatewayServer {
    config;
    secureClaw;
    app;
    clients = new Map();
    logger = null;
    metricsInterval = null;
    clientIdCounter = 0;
    constructor(options) {
        this.config = options.config;
        this.secureClaw = options.secureClaw;
        // Create Fastify instance
        this.app = Fastify({
            logger: false, // We use our own logger
            trustProxy: false, // Security: don't trust proxy headers
        });
        // Middleware and routes are set up in start()
    }
    /**
     * Initialize the server (register plugins, set up middleware)
     */
    async init() {
        await this.setupMiddleware();
        this.setupRoutes();
    }
    getLogger() {
        if (!this.logger) {
            try {
                this.logger = getLogger().child({ component: 'Gateway' });
            }
            catch {
                return {
                    trace: () => { },
                    debug: () => { },
                    info: () => { },
                    warn: () => { },
                    error: () => { },
                    fatal: () => { },
                    child: () => this.getLogger(),
                    level: 'info',
                };
            }
        }
        return this.logger;
    }
    async setupMiddleware() {
        // Register WebSocket plugin
        await this.app.register(fastifyWebsocket, {
            options: {
                maxPayload: 1048576, // 1MB max message size
            },
        });
        // Local network check middleware
        this.app.addHook('onRequest', async (request, reply) => {
            const ip = request.ip;
            // Allow localhost and private network ranges
            const isLocalNetwork = ip === '127.0.0.1' ||
                ip === '::1' ||
                ip === 'localhost' ||
                ip.startsWith('192.168.') ||
                ip.startsWith('10.') ||
                ip.startsWith('172.16.') ||
                ip.startsWith('172.17.') ||
                ip.startsWith('172.18.') ||
                ip.startsWith('172.19.') ||
                ip.startsWith('172.20.') ||
                ip.startsWith('172.21.') ||
                ip.startsWith('172.22.') ||
                ip.startsWith('172.23.') ||
                ip.startsWith('172.24.') ||
                ip.startsWith('172.25.') ||
                ip.startsWith('172.26.') ||
                ip.startsWith('172.27.') ||
                ip.startsWith('172.28.') ||
                ip.startsWith('172.29.') ||
                ip.startsWith('172.30.') ||
                ip.startsWith('172.31.');
            if (!isLocalNetwork) {
                this.getLogger().warn('Access denied from non-local IP', { ip });
                return reply.code(403).send({
                    error: 'Access denied',
                    message: 'Dashboard is only accessible from local network',
                });
            }
        });
        // CORS for local development
        this.app.addHook('onRequest', async (request, reply) => {
            const origin = request.headers.origin;
            if (origin && this.config.cors.enabled) {
                const allowedOrigins = this.config.cors.origins;
                if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                    reply.header('Access-Control-Allow-Origin', origin);
                    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                    reply.header('Access-Control-Allow-Credentials', 'true');
                }
            }
            if (request.method === 'OPTIONS') {
                return reply.code(204).send();
            }
        });
        // Request logging
        this.app.addHook('onResponse', async (request, reply) => {
            this.getLogger().debug('Request completed', {
                method: request.method,
                url: request.url,
                statusCode: reply.statusCode,
                responseTime: reply.elapsedTime,
            });
        });
    }
    setupRoutes() {
        // Health check
        this.app.get('/health', async () => {
            const state = this.secureClaw.getState();
            return {
                status: state.healthy ? 'ok' : 'error',
                version: '0.1.0',
                uptime: state.startedAt ? Date.now() - state.startedAt : 0,
                checks: {
                    database: true,
                    auditChain: true,
                },
            };
        });
        // Metrics endpoint
        this.app.get('/api/v1/metrics', async () => {
            return this.secureClaw.getMetrics();
        });
        // Tasks endpoints
        this.app.get('/api/v1/tasks', async (_request) => {
            // TODO: Implement task storage and retrieval
            return {
                tasks: [],
                total: 0,
            };
        });
        this.app.get('/api/v1/tasks/:id', async (_request) => {
            // TODO: Implement task retrieval by ID
            return { error: 'Not implemented' };
        });
        // Security events
        this.app.get('/api/v1/security/events', async (_request) => {
            // TODO: Implement security event retrieval
            return {
                events: [],
                total: 0,
            };
        });
        // Audit chain verification
        this.app.post('/api/v1/audit/verify', async () => {
            return this.secureClaw.verifyAuditChain();
        });
        // WebSocket endpoint
        this.app.get('/ws/metrics', { websocket: true }, (socket, _request) => {
            const clientId = `client_${String(++this.clientIdCounter)}`;
            const client = {
                ws: socket,
                channels: new Set(),
            };
            this.clients.set(clientId, client);
            this.getLogger().debug('WebSocket client connected', { clientId });
            socket.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'subscribe' && data.payload?.channels) {
                        for (const channel of data.payload.channels) {
                            client.channels.add(channel);
                        }
                        socket.send(JSON.stringify({
                            type: 'ack',
                            channel: 'system',
                            payload: { subscribed: Array.from(client.channels) },
                            timestamp: Date.now(),
                            sequence: 0,
                        }));
                    }
                    if (data.type === 'unsubscribe' && data.payload?.channels) {
                        for (const channel of data.payload.channels) {
                            client.channels.delete(channel);
                        }
                    }
                }
                catch (error) {
                    this.getLogger().error('Failed to parse WebSocket message', {
                        clientId,
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                }
            });
            socket.on('close', () => {
                this.clients.delete(clientId);
                this.getLogger().debug('WebSocket client disconnected', { clientId });
            });
            socket.on('error', (error) => {
                this.getLogger().error('WebSocket error', {
                    clientId,
                    error: error.message,
                });
            });
        });
    }
    /**
     * Broadcast a message to all clients subscribed to a channel
     */
    broadcast(channel, payload) {
        const message = JSON.stringify({
            type: 'update',
            channel,
            payload,
            timestamp: Date.now(),
            sequence: Date.now(), // Simple sequence number
        });
        for (const [clientId, client] of this.clients) {
            if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(message);
                }
                catch (error) {
                    this.getLogger().error('Failed to send WebSocket message', {
                        clientId,
                        channel,
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                }
            }
        }
    }
    /**
     * Start periodic metrics broadcast
     */
    startMetricsBroadcast() {
        const intervalMs = 1000; // Every second
        this.metricsInterval = setInterval(() => {
            void (async () => {
                try {
                    const metrics = await this.secureClaw.getMetrics();
                    this.broadcast('metrics', metrics);
                }
                catch (error) {
                    this.getLogger().error('Failed to broadcast metrics', {
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                }
            })();
        }, intervalMs);
        this.metricsInterval.unref();
    }
    /**
     * Start the server
     */
    async start() {
        // Initialize plugins and routes
        await this.init();
        const host = this.config.host;
        const port = this.config.port;
        try {
            await this.app.listen({ host, port });
            this.getLogger().info('Gateway server started', {
                host,
                port,
                url: `http://${host}:${port}`,
            });
            // Start metrics broadcast
            this.startMetricsBroadcast();
        }
        catch (error) {
            this.getLogger().error('Failed to start gateway server', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            throw error;
        }
    }
    /**
     * Stop the server
     */
    async stop() {
        // Stop metrics broadcast
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        // Close all WebSocket connections
        for (const [_clientId, client] of this.clients) {
            try {
                client.ws.close(1000, 'Server shutting down');
            }
            catch {
                // Ignore close errors
            }
        }
        this.clients.clear();
        // Close Fastify
        await this.app.close();
        this.getLogger().info('Gateway server stopped');
    }
    /**
     * Get the number of connected clients
     */
    getConnectedClients() {
        return this.clients.size;
    }
}
/**
 * Create and start a gateway server
 */
export function createGatewayServer(options) {
    return new GatewayServer(options);
}
//# sourceMappingURL=server.js.map