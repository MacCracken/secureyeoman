import { describe, it, expect } from 'vitest';
import { resolvePermission, permit, getPrefixResourceMap } from './route-permissions.js';

describe('route-permissions', () => {
  describe('convention-based resolution', () => {
    it('should resolve GET to read action', () => {
      expect(resolvePermission('/api/v1/brain/memories', 'GET')).toEqual({
        resource: 'brain',
        action: 'read',
      });
    });

    it('should resolve POST to write action', () => {
      expect(resolvePermission('/api/v1/brain/memories', 'POST')).toEqual({
        resource: 'brain',
        action: 'write',
      });
    });

    it('should resolve PUT to write action', () => {
      expect(resolvePermission('/api/v1/soul/personalities/:id', 'PUT')).toEqual({
        resource: 'soul',
        action: 'write',
      });
    });

    it('should resolve DELETE to write action', () => {
      expect(resolvePermission('/api/v1/workspaces/:id', 'DELETE')).toEqual({
        resource: 'workspaces',
        action: 'write',
      });
    });

    it('should resolve PATCH to write action', () => {
      expect(resolvePermission('/api/v1/risk/register/:id/close', 'PATCH')).toEqual({
        resource: 'risk',
        action: 'write',
      });
    });

    it('should return null for unmapped paths', () => {
      expect(resolvePermission('/api/v1/admin/danger', 'GET')).toBeNull();
    });

    it('should return null for unknown HTTP methods', () => {
      expect(resolvePermission('/api/v1/brain/memories', 'OPTIONS')).toBeNull();
    });
  });

  describe('prefix → resource mapping', () => {
    it('should map sub-domain prefixes before parents', () => {
      expect(resolvePermission('/api/v1/security/athi/scenarios', 'GET')).toEqual({
        resource: 'security_athi',
        action: 'read',
      });
      expect(resolvePermission('/api/v1/security/sra/blueprints', 'GET')).toEqual({
        resource: 'security_sra',
        action: 'read',
      });
      expect(resolvePermission('/api/v1/security/events', 'GET')).toEqual({
        resource: 'security_events',
        action: 'read',
      });
    });

    it('should map brain/logs to audit resource', () => {
      expect(resolvePermission('/api/v1/brain/logs', 'GET')).toEqual({
        resource: 'audit',
        action: 'read',
      });
      expect(resolvePermission('/api/v1/brain/logs/search', 'GET')).toEqual({
        resource: 'audit',
        action: 'read',
      });
    });

    it('should map brain/* (non-logs) to brain resource', () => {
      expect(resolvePermission('/api/v1/brain/memories', 'GET')).toEqual({
        resource: 'brain',
        action: 'read',
      });
    });

    it('should map cross-domain prefixes correctly', () => {
      const cases: [string, string][] = [
        ['/api/v1/conversations/:id', 'chat'],
        ['/api/v1/replay-jobs/:id', 'chat'],
        ['/api/v1/terminal/execute', 'execution'],
        ['/api/v1/users', 'auth'],
        ['/api/v1/gmail/profile', 'integrations'],
        ['/api/v1/twitter/profile', 'integrations'],
        ['/api/v1/github/repos', 'integrations'],
        ['/api/v1/webhooks/github/:id', 'integrations'],
        ['/api/v1/webhook-transforms/:id', 'integrations'],
        ['/api/v1/outbound-webhooks/:id', 'integrations'],
        ['/api/v1/a2a/peers', 'agents'],
        ['/api/v1/desktop/screenshot', 'capture.screen'],
        ['/api/v1/capture/consent/pending', 'capture.screen'],
        ['/api/v1/gateway', 'chat'],
        ['/api/v1/alerts/rules', 'notifications'],
        ['/api/v1/provider-accounts/:id', 'ai'],
      ];
      for (const [path, expectedResource] of cases) {
        const result = resolvePermission(path, 'GET');
        expect(result?.resource, `${path} should map to ${expectedResource}`).toBe(
          expectedResource
        );
      }
    });
  });

  describe('explicit overrides', () => {
    it('should resolve POST /api/v1/chat to chat.execute', () => {
      expect(resolvePermission('/api/v1/chat', 'POST')).toEqual({
        resource: 'chat',
        action: 'execute',
      });
    });

    it('should resolve POST /api/v1/gateway to chat.execute', () => {
      expect(resolvePermission('/api/v1/gateway', 'POST')).toEqual({
        resource: 'chat',
        action: 'execute',
      });
    });

    it('should resolve POST /api/v1/execution/run to execution.execute', () => {
      expect(resolvePermission('/api/v1/execution/run', 'POST')).toEqual({
        resource: 'execution',
        action: 'execute',
      });
    });

    it('should resolve POST /api/v1/mcp/tools/call to mcp.execute', () => {
      expect(resolvePermission('/api/v1/mcp/tools/call', 'POST')).toEqual({
        resource: 'mcp',
        action: 'execute',
      });
    });

    it('should resolve POST /api/v1/auth/verify to auth.read', () => {
      expect(resolvePermission('/api/v1/auth/verify', 'POST')).toEqual({
        resource: 'auth',
        action: 'read',
      });
    });

    it('should resolve POST /api/v1/audit/verify to audit.verify', () => {
      expect(resolvePermission('/api/v1/audit/verify', 'POST')).toEqual({
        resource: 'audit',
        action: 'verify',
      });
    });

    it('should resolve POST /api/v1/auth/oauth/reload to secrets.write', () => {
      expect(resolvePermission('/api/v1/auth/oauth/reload', 'POST')).toEqual({
        resource: 'secrets',
        action: 'write',
      });
    });

    it('should resolve desktop capture routes with non-standard actions', () => {
      expect(resolvePermission('/api/v1/desktop/screenshot', 'POST')).toEqual({
        resource: 'capture.screen',
        action: 'capture',
      });
      expect(resolvePermission('/api/v1/desktop/mouse/move', 'POST')).toEqual({
        resource: 'capture.screen',
        action: 'configure',
      });
      expect(resolvePermission('/api/v1/desktop/recording/start', 'POST')).toEqual({
        resource: 'capture.screen',
        action: 'stream',
      });
      expect(resolvePermission('/api/v1/desktop/camera', 'POST')).toEqual({
        resource: 'capture.camera',
        action: 'capture',
      });
      expect(resolvePermission('/api/v1/desktop/clipboard', 'GET')).toEqual({
        resource: 'capture.clipboard',
        action: 'capture',
      });
    });
  });

  describe('permit() for custom overrides', () => {
    it('should allow route files to register custom permissions', () => {
      permit('/api/v1/custom/route', 'POST', 'custom', 'execute');
      expect(resolvePermission('/api/v1/custom/route', 'POST')).toEqual({
        resource: 'custom',
        action: 'execute',
      });
    });

    it('should override convention when explicit permit is registered', () => {
      permit('/api/v1/brain/special', 'GET', 'brain', 'execute');
      expect(resolvePermission('/api/v1/brain/special', 'GET')).toEqual({
        resource: 'brain',
        action: 'execute',
      });
    });
  });

  describe('prefix map coverage', () => {
    it('should have entries for all major domains', () => {
      const prefixes = getPrefixResourceMap().map(([p]) => p);
      const expectedDomains = [
        'brain',
        'soul',
        'spirit',
        'auth',
        'chat',
        'execution',
        'agents',
        'integrations',
        'mcp',
        'workspaces',
        'marketplace',
        'training',
        'analytics',
        'risk',
        'sandbox',
        'federation',
        'workflows',
      ];
      for (const domain of expectedDomains) {
        expect(
          prefixes.some((p) => p.includes(domain)),
          `prefix map should include ${domain}`
        ).toBe(true);
      }
    });
  });
});
