/**
 * Auth Middleware — Fastify onRequest hooks for JWT / API-key auth and RBAC.
 */

import type { TLSSocket } from 'node:tls';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService, AuthUser } from '../security/auth.js';
import { AuthError } from '../security/auth.js';
import type { RBAC } from '../security/rbac.js';
import type { AuditChain } from '../logging/audit-chain.js';
import type { SecureLogger } from '../logging/logger.js';

// ── Fastify augmentation ─────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

// ── Route permission map ─────────────────────────────────────────────

interface RoutePermission {
  resource: string;
  action: string;
}

const ROUTE_PERMISSIONS: Record<string, Record<string, RoutePermission>> = {
  '/api/v1/metrics': {
    GET: { resource: 'metrics', action: 'read' },
  },
  '/api/v1/tasks': {
    GET: { resource: 'tasks', action: 'read' },
  },
  '/api/v1/tasks/:id': {
    GET: { resource: 'tasks', action: 'read' },
  },
  '/api/v1/audit': {
    GET: { resource: 'audit', action: 'read' },
  },
  '/api/v1/audit/verify': {
    POST: { resource: 'audit', action: 'verify' },
  },
  '/api/v1/security/events': {
    GET: { resource: 'security_events', action: 'read' },
  },
  '/api/v1/auth/verify': {
    POST: { resource: 'auth', action: 'read' },
  },
  '/api/v1/auth/api-keys': {
    POST: { resource: 'auth', action: 'write' },
    GET:  { resource: 'auth', action: 'read' },
  },
  '/api/v1/auth/api-keys/:id': {
    DELETE: { resource: 'auth', action: 'write' },
  },
  // Soul routes
  '/api/v1/soul/personality': {
    GET: { resource: 'soul', action: 'read' },
  },
  '/api/v1/soul/personalities': {
    GET: { resource: 'soul', action: 'read' },
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/personalities/:id': {
    PUT: { resource: 'soul', action: 'write' },
    DELETE: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/personalities/:id/activate': {
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills': {
    GET: { resource: 'soul', action: 'read' },
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills/:id': {
    PUT: { resource: 'soul', action: 'write' },
    DELETE: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills/:id/enable': {
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills/:id/disable': {
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills/:id/approve': {
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/skills/:id/reject': {
    POST: { resource: 'soul', action: 'write' },
  },
  '/api/v1/soul/prompt/preview': {
    GET: { resource: 'soul', action: 'read' },
  },
  '/api/v1/soul/config': {
    GET: { resource: 'soul', action: 'read' },
  },
  '/api/v1/soul/onboarding/status': {
    GET: { resource: 'soul', action: 'read' },
  },
  '/api/v1/soul/onboarding/complete': {
    POST: { resource: 'soul', action: 'write' },
  },
  // Integration routes
  '/api/v1/integrations': {
    GET: { resource: 'integrations', action: 'read' },
    POST: { resource: 'integrations', action: 'write' },
  },
  '/api/v1/integrations/platforms': {
    GET: { resource: 'integrations', action: 'read' },
  },
  '/api/v1/integrations/:id': {
    GET: { resource: 'integrations', action: 'read' },
    PUT: { resource: 'integrations', action: 'write' },
    DELETE: { resource: 'integrations', action: 'write' },
  },
  '/api/v1/integrations/:id/start': {
    POST: { resource: 'integrations', action: 'write' },
  },
  '/api/v1/integrations/:id/stop': {
    POST: { resource: 'integrations', action: 'write' },
  },
  '/api/v1/integrations/:id/messages': {
    GET: { resource: 'integrations', action: 'read' },
    POST: { resource: 'integrations', action: 'write' },
  },
  // Brain routes
  '/api/v1/brain/memories': {
    GET: { resource: 'brain', action: 'read' },
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/memories/:id': {
    DELETE: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/knowledge': {
    GET: { resource: 'brain', action: 'read' },
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/knowledge/:id': {
    PUT: { resource: 'brain', action: 'write' },
    DELETE: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/stats': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/maintenance': {
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/heartbeat/status': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/heartbeat/tasks': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/heartbeat/tasks/:name': {
    PUT: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/heartbeat/history': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/heartbeat/beat': {
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/logs': {
    GET: { resource: 'audit', action: 'read' },
  },
  '/api/v1/brain/logs/search': {
    GET: { resource: 'audit', action: 'read' },
  },
  '/api/v1/brain/search/similar': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/reindex': {
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/consolidation/run': {
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/consolidation/schedule': {
    GET: { resource: 'brain', action: 'read' },
    PUT: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/consolidation/history': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/sync/status': {
    GET: { resource: 'brain', action: 'read' },
  },
  '/api/v1/brain/sync': {
    POST: { resource: 'brain', action: 'write' },
  },
  '/api/v1/brain/sync/config': {
    GET: { resource: 'brain', action: 'read' },
    PUT: { resource: 'brain', action: 'write' },
  },
  // Comms routes
  '/api/v1/comms/identity': {
    GET: { resource: 'comms', action: 'read' },
  },
  '/api/v1/comms/peers': {
    GET: { resource: 'comms', action: 'read' },
    POST: { resource: 'comms', action: 'write' },
  },
  '/api/v1/comms/peers/:id': {
    DELETE: { resource: 'comms', action: 'write' },
  },
  '/api/v1/comms/message': {
    POST: { resource: 'comms', action: 'write' },
  },
  '/api/v1/comms/send': {
    POST: { resource: 'comms', action: 'write' },
  },
  '/api/v1/comms/log': {
    GET: { resource: 'comms', action: 'read' },
  },
  // Model routes
  '/api/v1/model/info': {
    GET: { resource: 'model', action: 'read' },
  },
  '/api/v1/model/switch': {
    POST: { resource: 'model', action: 'write' },
  },
  '/api/v1/model/cost-recommendations': {
    GET: { resource: 'model', action: 'read' },
  },
  // MCP routes
  '/api/v1/mcp/servers': {
    GET: { resource: 'mcp', action: 'read' },
    POST: { resource: 'mcp', action: 'write' },
  },
  '/api/v1/mcp/servers/:id': {
    DELETE: { resource: 'mcp', action: 'write' },
  },
  '/api/v1/mcp/tools': {
    GET: { resource: 'mcp', action: 'read' },
  },
  '/api/v1/mcp/tools/call': {
    POST: { resource: 'mcp', action: 'execute' },
  },
  '/api/v1/mcp/resources': {
    GET: { resource: 'mcp', action: 'read' },
  },
  // Report routes
  '/api/v1/reports': {
    GET: { resource: 'reports', action: 'read' },
  },
  '/api/v1/reports/generate': {
    POST: { resource: 'reports', action: 'write' },
  },
  '/api/v1/reports/:id': {
    GET: { resource: 'reports', action: 'read' },
  },
  '/api/v1/reports/:id/download': {
    GET: { resource: 'reports', action: 'read' },
  },
  // Dashboard routes
  '/api/v1/dashboards': {
    GET: { resource: 'dashboards', action: 'read' },
    POST: { resource: 'dashboards', action: 'write' },
  },
  '/api/v1/dashboards/:id': {
    GET: { resource: 'dashboards', action: 'read' },
    PUT: { resource: 'dashboards', action: 'write' },
    DELETE: { resource: 'dashboards', action: 'write' },
  },
  // Workspace routes
  '/api/v1/workspaces': {
    GET: { resource: 'workspaces', action: 'read' },
    POST: { resource: 'workspaces', action: 'write' },
  },
  '/api/v1/workspaces/:id': {
    GET: { resource: 'workspaces', action: 'read' },
    DELETE: { resource: 'workspaces', action: 'write' },
  },
  '/api/v1/workspaces/:id/members': {
    POST: { resource: 'workspaces', action: 'write' },
  },
  '/api/v1/workspaces/:id/members/:userId': {
    DELETE: { resource: 'workspaces', action: 'write' },
  },
  // Experiment routes
  '/api/v1/experiments': {
    GET: { resource: 'experiments', action: 'read' },
    POST: { resource: 'experiments', action: 'write' },
  },
  '/api/v1/experiments/:id': {
    GET: { resource: 'experiments', action: 'read' },
    DELETE: { resource: 'experiments', action: 'write' },
  },
  '/api/v1/experiments/:id/start': {
    POST: { resource: 'experiments', action: 'write' },
  },
  '/api/v1/experiments/:id/stop': {
    POST: { resource: 'experiments', action: 'write' },
  },
  // Marketplace routes
  '/api/v1/marketplace': {
    GET: { resource: 'marketplace', action: 'read' },
  },
  '/api/v1/marketplace/publish': {
    POST: { resource: 'marketplace', action: 'write' },
  },
  '/api/v1/marketplace/:id': {
    GET: { resource: 'marketplace', action: 'read' },
    DELETE: { resource: 'marketplace', action: 'write' },
  },
  '/api/v1/marketplace/:id/install': {
    POST: { resource: 'marketplace', action: 'write' },
  },
  '/api/v1/marketplace/:id/uninstall': {
    POST: { resource: 'marketplace', action: 'write' },
  },
  // Multimodal routes
  '/api/v1/multimodal/vision/analyze': {
    POST: { resource: 'multimodal', action: 'write' },
  },
  '/api/v1/multimodal/audio/transcribe': {
    POST: { resource: 'multimodal', action: 'write' },
  },
  '/api/v1/multimodal/audio/speak': {
    POST: { resource: 'multimodal', action: 'write' },
  },
  '/api/v1/multimodal/image/generate': {
    POST: { resource: 'multimodal', action: 'write' },
  },
  '/api/v1/multimodal/jobs': {
    GET: { resource: 'multimodal', action: 'read' },
  },
  '/api/v1/multimodal/config': {
    GET: { resource: 'multimodal', action: 'read' },
  },
  // Soul sub-routes
  '/api/v1/soul/users':       { GET: { resource: 'soul', action: 'read' }, POST: { resource: 'soul', action: 'write' } },
  '/api/v1/soul/users/:id':   { GET: { resource: 'soul', action: 'read' }, PUT: { resource: 'soul', action: 'write' }, DELETE: { resource: 'soul', action: 'write' } },
  '/api/v1/soul/owner':       { GET: { resource: 'soul', action: 'read' } },
  '/api/v1/soul/agent-name':  { GET: { resource: 'soul', action: 'read' }, PUT: { resource: 'soul', action: 'write' } },
  // Spirit routes
  '/api/v1/spirit/passions':         { GET: { resource: 'spirit', action: 'read' }, POST: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/passions/:id':     { GET: { resource: 'spirit', action: 'read' }, PUT: { resource: 'spirit', action: 'write' }, DELETE: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/inspirations':     { GET: { resource: 'spirit', action: 'read' }, POST: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/inspirations/:id': { GET: { resource: 'spirit', action: 'read' }, PUT: { resource: 'spirit', action: 'write' }, DELETE: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/pains':            { GET: { resource: 'spirit', action: 'read' }, POST: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/pains/:id':        { GET: { resource: 'spirit', action: 'read' }, PUT: { resource: 'spirit', action: 'write' }, DELETE: { resource: 'spirit', action: 'write' } },
  '/api/v1/spirit/config':           { GET: { resource: 'spirit', action: 'read' } },
  '/api/v1/spirit/stats':            { GET: { resource: 'spirit', action: 'read' } },
  '/api/v1/spirit/prompt/preview':   { GET: { resource: 'spirit', action: 'read' } },
  // Chat / conversations
  '/api/v1/chat':                            { POST: { resource: 'chat', action: 'execute' } },
  '/api/v1/chat/remember':                   { POST: { resource: 'chat', action: 'write' } },
  '/api/v1/chat/feedback':                   { POST: { resource: 'chat', action: 'write' } },
  '/api/v1/conversations':                   { GET: { resource: 'chat', action: 'read' }, POST: { resource: 'chat', action: 'write' } },
  '/api/v1/conversations/:id':               { GET: { resource: 'chat', action: 'read' }, PUT: { resource: 'chat', action: 'write' }, DELETE: { resource: 'chat', action: 'write' } },
  '/api/v1/conversations/:id/history':       { GET: { resource: 'chat', action: 'read' } },
  '/api/v1/conversations/:id/seal-topic':    { POST: { resource: 'chat', action: 'write' } },
  '/api/v1/conversations/:id/compressed-context': { GET: { resource: 'chat', action: 'read' } },
  // Execution
  '/api/v1/execution/run':              { POST: { resource: 'execution', action: 'execute' } },
  '/api/v1/execution/sessions':         { GET: { resource: 'execution', action: 'read' } },
  '/api/v1/execution/sessions/:id':     { GET: { resource: 'execution', action: 'read' }, DELETE: { resource: 'execution', action: 'write' } },
  '/api/v1/execution/history':          { GET: { resource: 'execution', action: 'read' } },
  '/api/v1/execution/approve/:id':      { POST: { resource: 'execution', action: 'write' }, DELETE: { resource: 'execution', action: 'write' } },
  '/api/v1/execution/config':           { GET: { resource: 'execution', action: 'read' } },
  // Terminal (high-risk — operator+ only)
  '/api/v1/terminal/execute': { POST: { resource: 'execution', action: 'execute' } },
  '/api/v1/terminal/health':  { GET:  { resource: 'execution', action: 'read' } },
  // Agents
  '/api/v1/agents/profiles':                       { GET: { resource: 'agents', action: 'read' }, POST: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/profiles/:id':                   { GET: { resource: 'agents', action: 'read' }, PUT: { resource: 'agents', action: 'write' }, DELETE: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/delegate':                       { POST: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/delegations':                    { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/delegations/active':             { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/delegations/:id':                { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/delegations/:id/cancel':         { POST: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/delegations/:id/messages':       { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/config':                         { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/swarms/templates':               { GET: { resource: 'agents', action: 'read' }, POST: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/swarms/templates/:id':           { GET: { resource: 'agents', action: 'read' }, DELETE: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/swarms':                         { GET: { resource: 'agents', action: 'read' }, POST: { resource: 'agents', action: 'write' } },
  '/api/v1/agents/swarms/:id':                     { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/agents/swarms/:id/cancel':              { POST: { resource: 'agents', action: 'write' } },
  // Proactive
  '/api/v1/proactive/triggers':                       { GET: { resource: 'proactive', action: 'read' }, POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/triggers/builtin':               { GET: { resource: 'proactive', action: 'read' } },
  '/api/v1/proactive/triggers/:id':                   { GET: { resource: 'proactive', action: 'read' }, PATCH: { resource: 'proactive', action: 'write' }, DELETE: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/triggers/:id/enable':            { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/triggers/:id/disable':           { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/triggers/:id/test':              { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/triggers/builtin/:id/enable':    { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/suggestions':                    { GET: { resource: 'proactive', action: 'read' } },
  '/api/v1/proactive/suggestions/:id/approve':        { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/suggestions/:id/dismiss':        { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/suggestions/expired':            { DELETE: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/patterns':                       { GET: { resource: 'proactive', action: 'read' } },
  '/api/v1/proactive/patterns/:id/convert':           { POST: { resource: 'proactive', action: 'write' } },
  '/api/v1/proactive/status':                         { GET: { resource: 'proactive', action: 'read' } },
  // A2A (Agent-to-Agent) — mapped to 'agents' resource
  '/api/v1/a2a/peers':           { GET: { resource: 'agents', action: 'read' }, POST: { resource: 'agents', action: 'write' } },
  '/api/v1/a2a/peers/:id':       { DELETE: { resource: 'agents', action: 'write' } },
  '/api/v1/a2a/peers/:id/trust': { PUT: { resource: 'agents', action: 'write' } },
  '/api/v1/a2a/discover':        { POST: { resource: 'agents', action: 'read' } },
  '/api/v1/a2a/capabilities':    { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/a2a/delegate':        { POST: { resource: 'agents', action: 'write' } },
  '/api/v1/a2a/messages':        { GET: { resource: 'agents', action: 'read' } },
  '/api/v1/a2a/config':          { GET: { resource: 'agents', action: 'read' } },
  // Browser automation
  '/api/v1/browser/sessions':               { GET: { resource: 'browser', action: 'read' } },
  '/api/v1/browser/sessions/:id':           { GET: { resource: 'browser', action: 'read' } },
  '/api/v1/browser/sessions/:id/close':     { POST: { resource: 'browser', action: 'write' } },
  '/api/v1/browser/config':                 { GET: { resource: 'browser', action: 'read' } },
  '/api/v1/browser/sessions/stats':         { GET: { resource: 'browser', action: 'read' } },
  // Extensions
  '/api/v1/extensions':               { GET: { resource: 'extensions', action: 'read' }, POST: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/:id':           { DELETE: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/hooks':         { GET: { resource: 'extensions', action: 'read' }, POST: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/hooks/:id':     { DELETE: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/webhooks':      { GET: { resource: 'extensions', action: 'read' }, POST: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/webhooks/:id':  { PUT: { resource: 'extensions', action: 'write' }, DELETE: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/hooks/log':     { GET: { resource: 'extensions', action: 'read' } },
  '/api/v1/extensions/hooks/test':    { POST: { resource: 'extensions', action: 'write' } },
  '/api/v1/extensions/discover':      { POST: { resource: 'extensions', action: 'read' } },
  '/api/v1/extensions/config':        { GET: { resource: 'extensions', action: 'read' } },
  // Auth management (role/assignment CRUD)
  '/api/v1/auth/roles':               { GET: { resource: 'auth', action: 'read' }, POST: { resource: 'auth', action: 'write' } },
  '/api/v1/auth/roles/:id':           { PUT: { resource: 'auth', action: 'write' }, DELETE: { resource: 'auth', action: 'write' } },
  '/api/v1/auth/assignments':         { GET: { resource: 'auth', action: 'read' }, POST: { resource: 'auth', action: 'write' } },
  '/api/v1/auth/assignments/:userId': { DELETE: { resource: 'auth', action: 'write' } },
  // OAuth management
  '/api/v1/auth/oauth/disconnect': { POST: { resource: 'auth', action: 'write' } },
  '/api/v1/auth/oauth/tokens':     { GET: { resource: 'auth', action: 'read' } },
  '/api/v1/auth/oauth/tokens/:id': { DELETE: { resource: 'auth', action: 'write' } },
  // Integration extras
  '/api/v1/integrations/:id/test':      { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/integrations/:id/reload':    { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/integrations/plugins':       { GET: { resource: 'integrations', action: 'read' } },
  '/api/v1/integrations/plugins/load':  { POST: { resource: 'integrations', action: 'write' } },
  // Webhooks (inbound) — mapped to integrations
  '/api/v1/webhooks/github/:id':  { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhooks/gitlab/:id':  { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhooks/jira/:id':    { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhooks/azure/:id':   { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhooks/custom/:id':  { POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhook-transforms':         { GET: { resource: 'integrations', action: 'read' }, POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/webhook-transforms/:id':     { GET: { resource: 'integrations', action: 'read' }, PUT: { resource: 'integrations', action: 'write' }, DELETE: { resource: 'integrations', action: 'write' } },
  '/api/v1/outbound-webhooks':          { GET: { resource: 'integrations', action: 'read' }, POST: { resource: 'integrations', action: 'write' } },
  '/api/v1/outbound-webhooks/:id':      { GET: { resource: 'integrations', action: 'read' }, PUT: { resource: 'integrations', action: 'write' }, DELETE: { resource: 'integrations', action: 'write' } },
  // Model extras
  '/api/v1/model/default': { GET: { resource: 'model', action: 'read' }, POST: { resource: 'model', action: 'write' }, DELETE: { resource: 'model', action: 'write' } },
};

const PUBLIC_ROUTES = new Set([
  '/health',
  '/api/v1/auth/login',
  '/ws/metrics',
  '/api/v1/auth/oauth/:provider',
  '/api/v1/auth/oauth/:provider/callback',
  '/api/v1/auth/oauth/config',
  '/api/v1/auth/oauth/claim',
]);
const TOKEN_ONLY_ROUTES = new Set(['/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/auth/reset-password']);

// ── Helpers ──────────────────────────────────────────────────────────

function routeKey(request: FastifyRequest): string {
  // Fastify stores the route schema path (with :param placeholders) in routeOptions
  return (request.routeOptions?.url ?? request.url.split('?')[0])!;
}

// ── Auth extraction hook ─────────────────────────────────────────────

export interface AuthHookOptions {
  authService: AuthService;
  logger: SecureLogger;
  rbac?: RBAC;
}

export function createAuthHook(opts: AuthHookOptions) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const path = routeKey(request);

    if (PUBLIC_ROUTES.has(path)) return;

    // Try client certificate (mTLS)
    const socket = request.raw.socket as TLSSocket;
    if (typeof socket.authorized === 'boolean' && socket.authorized) {
      try {
        const cert = socket.getPeerCertificate();
        if (cert?.subject?.CN) {
          const assignedRole = (opts.rbac?.getUserRole(cert.subject.CN) ?? 'operator') as AuthUser['role'];
          request.authUser = {
            userId: cert.subject.CN,
            role: assignedRole,
            permissions: [],
            authMethod: 'certificate',
          };
          return;
        }
      } catch {
        // Fall through to JWT/API-key auth
      }
    }

    // Try Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        request.authUser = await opts.authService.validateToken(token);
        return;
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(401).send({ error: 'Authentication failed' });
      }
    }

    // Try API key
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (apiKey) {
      try {
        request.authUser = await opts.authService.validateApiKey(apiKey);
        return;
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        return reply.code(401).send({ error: 'Authentication failed' });
      }
    }

    return reply.code(401).send({ error: 'Missing authentication credentials' });
  };
}

// ── RBAC enforcement hook ────────────────────────────────────────────

export interface RbacHookOptions {
  rbac: RBAC;
  auditChain: AuditChain;
  logger: SecureLogger;
}

export function createRbacHook(opts: RbacHookOptions) {
  return async function rbacHook(request: FastifyRequest, reply: FastifyReply) {
    const path = routeKey(request);

    // Skip public + token-only routes
    if (PUBLIC_ROUTES.has(path) || TOKEN_ONLY_ROUTES.has(path)) return;

    const user = request.authUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    // Look up required permission
    const methodMap = ROUTE_PERMISSIONS[path];
    const perm = methodMap?.[request.method];

    if (!perm) {
      // Unmapped route — admin only (default-deny)
      if (user.role !== 'admin') {
        await auditDenial(opts, user, path, request.method);
        return reply.code(403).send({ error: 'Forbidden' });
      }
      return;
    }

    const result = opts.rbac.checkPermission(
      user.role,
      {
        resource: perm.resource,
        action: perm.action,
      },
      user.userId
    );

    if (!result.granted) {
      await auditDenial(opts, user, path, request.method);
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

async function auditDenial(
  opts: RbacHookOptions,
  user: AuthUser,
  path: string,
  method: string
): Promise<void> {
  try {
    await opts.auditChain.record({
      event: 'permission_denied',
      level: 'warn',
      message: `RBAC denied ${method} ${path}`,
      userId: user.userId,
      metadata: { role: user.role, path, method },
    });
  } catch {
    opts.logger.error('Failed to audit RBAC denial');
  }
}
