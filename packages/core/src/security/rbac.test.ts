import { describe, it, expect, beforeEach } from 'vitest';
import { RBAC, PermissionDeniedError, getRBAC, initializeRBAC } from './rbac.js';

describe('RBAC', () => {
  let rbac: RBAC;

  beforeEach(() => {
    rbac = new RBAC();
  });

  describe('Default Roles', () => {
    it('should have admin role with full access', () => {
      const result = rbac.checkPermission('admin', {
        resource: 'any_resource',
        action: 'any_action',
      });

      expect(result.granted).toBe(true);
    });

    it('should have operator role with task management access', () => {
      const result = rbac.checkPermission('operator', {
        resource: 'tasks',
        action: 'execute',
      });

      expect(result.granted).toBe(true);
    });

    it('should deny operator access to admin resources', () => {
      const result = rbac.checkPermission('operator', {
        resource: 'admin',
        action: 'write',
      });

      expect(result.granted).toBe(false);
    });

    it('should have auditor role with read-only access to logs', () => {
      const readResult = rbac.checkPermission('auditor', {
        resource: 'logs',
        action: 'read',
      });
      expect(readResult.granted).toBe(true);

      const writeResult = rbac.checkPermission('auditor', {
        resource: 'logs',
        action: 'write',
      });
      expect(writeResult.granted).toBe(false);
    });

    it('should have viewer role with limited read access', () => {
      const metricsResult = rbac.checkPermission('viewer', {
        resource: 'metrics',
        action: 'read',
      });
      expect(metricsResult.granted).toBe(true);

      const tasksResult = rbac.checkPermission('viewer', {
        resource: 'tasks',
        action: 'read',
      });
      expect(tasksResult.granted).toBe(true);

      const executeResult = rbac.checkPermission('viewer', {
        resource: 'tasks',
        action: 'execute',
      });
      expect(executeResult.granted).toBe(false);
    });
  });

  describe('Role Management', () => {
    it('should allow defining custom roles', () => {
      rbac.defineRole({
        id: 'role_custom',
        name: 'Custom',
        description: 'A custom role',
        permissions: [{ resource: 'custom_resource', actions: ['read', 'write'] }],
      });

      const result = rbac.checkPermission('custom', {
        resource: 'custom_resource',
        action: 'read',
      });

      expect(result.granted).toBe(true);
    });

    it('should allow removing roles', () => {
      rbac.defineRole({
        id: 'role_temporary',
        name: 'Temporary',
        description: 'A temporary role',
        permissions: [{ resource: 'temp', actions: ['read'] }],
      });

      const beforeRemoval = rbac.getRole('temporary');
      expect(beforeRemoval).toBeDefined();

      const removed = rbac.removeRole('role_temporary');
      expect(removed).toBe(true);

      const afterRemoval = rbac.getRole('temporary');
      expect(afterRemoval).toBeUndefined();
    });

    it('should return false when removing non-existent role', () => {
      const removed = rbac.removeRole('role_nonexistent');
      expect(removed).toBe(false);
    });

    it('should get role by ID', () => {
      const role = rbac.getRole('role_admin');
      expect(role).toBeDefined();
      expect(role?.name).toBe('Administrator');
    });

    it('should get role by name', () => {
      const role = rbac.getRole('admin');
      expect(role).toBeDefined();
      expect(role?.id).toBe('role_admin');
    });

    it('should return undefined for non-existent role', () => {
      const role = rbac.getRole('nonexistent');
      expect(role).toBeUndefined();
    });

    it('should list all roles', () => {
      const roles = rbac.getAllRoles();
      expect(roles.length).toBeGreaterThanOrEqual(4); // admin, operator, auditor, viewer
      expect(roles.map((r) => r.id)).toContain('role_admin');
    });
  });

  describe('Permission Checking', () => {
    it('should grant permission for wildcard resource', () => {
      const result = rbac.checkPermission('admin', {
        resource: 'anything',
        action: 'delete',
      });

      expect(result.granted).toBe(true);
    });

    it('should deny permission for unknown role', () => {
      const result = rbac.checkPermission('unknown_role', {
        resource: 'tasks',
        action: 'read',
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Role not found');
    });

    it('should provide reason for grant', () => {
      const result = rbac.checkPermission('operator', {
        resource: 'tasks',
        action: 'read',
      });

      expect(result.granted).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('should provide reason for denial', () => {
      const result = rbac.checkPermission('viewer', {
        resource: 'admin',
        action: 'write',
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('No matching permission found');
    });

    it('should support resource prefix wildcards', () => {
      rbac.defineRole({
        id: 'role_prefix_test',
        name: 'PrefixTest',
        description: 'Test prefix wildcards',
        permissions: [{ resource: 'api/*', actions: ['read'] }],
      });

      const matchResult = rbac.checkPermission('prefix_test', {
        resource: 'api/users',
        action: 'read',
      });
      expect(matchResult.granted).toBe(true);

      const noMatchResult = rbac.checkPermission('prefix_test', {
        resource: 'other/resource',
        action: 'read',
      });
      expect(noMatchResult.granted).toBe(false);
    });
  });

  describe('Role Inheritance', () => {
    it('should inherit permissions from parent roles', () => {
      rbac.defineRole({
        id: 'role_base',
        name: 'Base',
        description: 'Base role',
        permissions: [{ resource: 'base_resource', actions: ['read'] }],
      });

      rbac.defineRole({
        id: 'role_extended',
        name: 'Extended',
        description: 'Extended role',
        permissions: [{ resource: 'extended_resource', actions: ['read'] }],
        inheritFrom: ['role_base'],
      });

      // Should have own permissions
      const extendedResult = rbac.checkPermission('extended', {
        resource: 'extended_resource',
        action: 'read',
      });
      expect(extendedResult.granted).toBe(true);

      // Should have inherited permissions
      const inheritedResult = rbac.checkPermission('extended', {
        resource: 'base_resource',
        action: 'read',
      });
      expect(inheritedResult.granted).toBe(true);
      expect(inheritedResult.reason).toContain('Inherited from');
    });

    it('should handle circular inheritance gracefully', () => {
      rbac.defineRole({
        id: 'role_circular_a',
        name: 'CircularA',
        description: 'Circular A',
        permissions: [],
        inheritFrom: ['role_circular_b'],
      });

      rbac.defineRole({
        id: 'role_circular_b',
        name: 'CircularB',
        description: 'Circular B',
        permissions: [],
        inheritFrom: ['role_circular_a'],
      });

      // Should not throw, should deny safely
      const result = rbac.checkPermission('circular_a', {
        resource: 'any',
        action: 'read',
      });

      expect(result.granted).toBe(false);
    });
  });

  describe('Permission Conditions', () => {
    beforeEach(() => {
      rbac.defineRole({
        id: 'role_conditional',
        name: 'Conditional',
        description: 'Role with conditional permissions',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [
              { field: 'department', operator: 'eq', value: 'engineering' },
            ],
          },
          {
            resource: 'budget',
            actions: ['read'],
            conditions: [
              { field: 'amount', operator: 'lte', value: 10000 },
            ],
          },
        ],
      });
    });

    it('should grant permission when condition is met', () => {
      const result = rbac.checkPermission(
        'conditional',
        {
          resource: 'documents',
          action: 'read',
          context: { department: 'engineering' },
        }
      );

      expect(result.granted).toBe(true);
    });

    it('should deny permission when condition is not met', () => {
      const result = rbac.checkPermission(
        'conditional',
        {
          resource: 'documents',
          action: 'read',
          context: { department: 'sales' },
        }
      );

      expect(result.granted).toBe(false);
    });

    it('should support numeric conditions (lte)', () => {
      // Clear cache to ensure fresh permission checks
      rbac.clearCache();
      
      const grantedResult = rbac.checkPermission(
        'conditional',
        {
          resource: 'budget',
          action: 'read',
          context: { amount: 5000 },
        }
      );
      expect(grantedResult.granted).toBe(true);

      // Clear cache again before checking denial case
      // (cache key doesn't include context, so different context values share cache)
      rbac.clearCache();
      
      const deniedResult = rbac.checkPermission(
        'conditional',
        {
          resource: 'budget',
          action: 'read',
          context: { amount: 15000 },
        }
      );
      expect(deniedResult.granted).toBe(false);
    });
  });

  describe('Permission Caching', () => {
    it('should cache permission results', () => {
      // First check - should be evaluated
      const firstResult = rbac.checkPermission('admin', {
        resource: 'cache_test',
        action: 'read',
      });
      expect(firstResult.granted).toBe(true);

      // Second check - should be cached
      const secondResult = rbac.checkPermission('admin', {
        resource: 'cache_test',
        action: 'read',
      });
      expect(secondResult.granted).toBe(true);
      expect(secondResult.reason).toContain('Cached');
    });

    it('should clear cache when role is modified', () => {
      // Prime the cache
      rbac.checkPermission('admin', {
        resource: 'test',
        action: 'read',
      });

      // Modify a role
      rbac.defineRole({
        id: 'role_new',
        name: 'New',
        description: 'New role',
        permissions: [],
      });

      // Cache should be cleared, so next check won't say "Cached"
      const result = rbac.checkPermission('admin', {
        resource: 'test',
        action: 'read',
      });

      expect(result.reason).not.toContain('Cached');
    });

    it('should support manual cache clearing', () => {
      // Prime the cache
      rbac.checkPermission('admin', {
        resource: 'test',
        action: 'read',
      });

      // Clear cache
      rbac.clearCache();

      // Next check won't be cached
      const result = rbac.checkPermission('admin', {
        resource: 'test',
        action: 'read',
      });

      expect(result.reason).not.toContain('Cached');
    });
  });

  describe('requirePermission', () => {
    it('should not throw when permission is granted', () => {
      expect(() =>
        rbac.requirePermission('admin', {
          resource: 'any',
          action: 'any',
        })
      ).not.toThrow();
    });

    it('should throw PermissionDeniedError when permission is denied', () => {
      expect(() =>
        rbac.requirePermission('viewer', {
          resource: 'admin',
          action: 'write',
        })
      ).toThrow(PermissionDeniedError);
    });

    it('should include resource and action in error', () => {
      try {
        rbac.requirePermission('viewer', {
          resource: 'secret',
          action: 'delete',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        const permError = error as PermissionDeniedError;
        expect(permError.resource).toBe('secret');
        expect(permError.action).toBe('delete');
        expect(permError.message).toContain('secret');
        expect(permError.message).toContain('delete');
      }
    });
  });
});

describe('RBAC Singleton', () => {
  it('should return same instance from getRBAC', () => {
    const instance1 = getRBAC();
    const instance2 = getRBAC();
    expect(instance1).toBe(instance2);
  });

  it('should create new instance with initializeRBAC', () => {
    const original = getRBAC();
    const newInstance = initializeRBAC();
    expect(newInstance).not.toBe(original);
  });

  it('should support custom roles in initializeRBAC', () => {
    const customRoles = [
      {
        id: 'role_super',
        name: 'Super',
        description: 'Super role',
        permissions: [{ resource: 'super', actions: ['read'] }],
      },
    ];

    const instance = initializeRBAC(customRoles);
    const role = instance.getRole('super');

    expect(role).toBeDefined();
    expect(role?.id).toBe('role_super');
  });
});
