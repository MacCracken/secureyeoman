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
import { type SecureClaw } from '../secureclaw.js';
import type { GatewayConfig } from '@friday/shared';
export interface GatewayServerOptions {
    config: GatewayConfig;
    secureClaw: SecureClaw;
}
export declare class GatewayServer {
    private readonly config;
    private readonly secureClaw;
    private readonly app;
    private readonly clients;
    private logger;
    private metricsInterval;
    private clientIdCounter;
    constructor(options: GatewayServerOptions);
    /**
     * Initialize the server (register plugins, set up middleware)
     */
    private init;
    private getLogger;
    private setupMiddleware;
    private setupRoutes;
    /**
     * Broadcast a message to all clients subscribed to a channel
     */
    broadcast(channel: string, payload: unknown): void;
    /**
     * Start periodic metrics broadcast
     */
    private startMetricsBroadcast;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Stop the server
     */
    stop(): Promise<void>;
    /**
     * Get the number of connected clients
     */
    getConnectedClients(): number;
}
/**
 * Create and start a gateway server
 */
export declare function createGatewayServer(options: GatewayServerOptions): GatewayServer;
//# sourceMappingURL=server.d.ts.map