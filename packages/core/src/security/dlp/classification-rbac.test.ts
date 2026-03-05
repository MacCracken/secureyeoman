import { describe, it, expect, beforeEach } from 'vitest';
import { RBAC } from '../rbac.js';

describe('Classification-Aware RBAC', () => {
  let rbac: RBAC;

  beforeEach(() => {
    rbac = new RBAC();
  });

  describe('lte operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_internal_reader',
        name: 'InternalReader',
        description: 'Can read up to confidential documents',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'lte', value: 'confidential' }],
          },
        ],
      });
    });

    it('allows public classification when lte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('internal_reader', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'public' },
      });
      expect(result.granted).toBe(true);
    });

    it('allows internal classification when lte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('internal_reader', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'internal' },
      });
      expect(result.granted).toBe(true);
    });

    it('allows confidential classification when lte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('internal_reader', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'confidential' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks restricted classification when lte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('internal_reader', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'restricted' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('eq operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_confidential_only',
        name: 'ConfidentialOnly',
        description: 'Can only access confidential documents',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'eq', value: 'confidential' }],
          },
        ],
      });
    });

    it('allows exact match on confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('confidential_only', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'confidential' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks public when eq confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('confidential_only', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'public' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('gte operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_high_clearance',
        name: 'HighClearance',
        description: 'Can access confidential and above',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'gte', value: 'confidential' }],
          },
        ],
      });
    });

    it('allows restricted when gte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('high_clearance', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'restricted' },
      });
      expect(result.granted).toBe(true);
    });

    it('allows confidential when gte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('high_clearance', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'confidential' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks internal when gte confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('high_clearance', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'internal' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('lt operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_low_access',
        name: 'LowAccess',
        description: 'Can only access below confidential',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'lt', value: 'confidential' }],
          },
        ],
      });
    });

    it('allows public when lt confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('low_access', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'public' },
      });
      expect(result.granted).toBe(true);
    });

    it('allows internal when lt confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('low_access', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'internal' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks confidential when lt confidential', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('low_access', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'confidential' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('neq operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_not_restricted',
        name: 'NotRestricted',
        description: 'Can access anything except restricted',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'neq', value: 'restricted' }],
          },
        ],
      });
    });

    it('allows public when neq restricted', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('not_restricted', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'public' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks restricted when neq restricted', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('not_restricted', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'restricted' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('gt operator with classification', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_above_internal',
        name: 'AboveInternal',
        description: 'Only above internal',
        permissions: [
          {
            resource: 'documents',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'gt', value: 'internal' }],
          },
        ],
      });
    });

    it('allows confidential when gt internal', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('above_internal', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'confidential' },
      });
      expect(result.granted).toBe(true);
    });

    it('blocks internal when gt internal', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('above_internal', {
        resource: 'documents',
        action: 'read',
        context: { classification: 'internal' },
      });
      expect(result.granted).toBe(false);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await rbac.defineRole({
        id: 'role_cls_test',
        name: 'ClsTest',
        description: 'Classification edge case test',
        permissions: [
          {
            resource: 'docs',
            actions: ['read'],
            conditions: [{ field: 'classification', operator: 'lte', value: 'internal' }],
          },
        ],
      });
    });

    it('returns false for invalid classification level in context', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('cls_test', {
        resource: 'docs',
        action: 'read',
        context: { classification: 'top_secret' },
      });
      expect(result.granted).toBe(false);
    });

    it('returns false for non-string classification in context', () => {
      rbac.clearCache();
      const result = rbac.checkPermission('cls_test', {
        resource: 'docs',
        action: 'read',
        context: { classification: 42 },
      });
      expect(result.granted).toBe(false);
    });

    it('non-classification conditions still work unchanged', () => {
      // Uses the built-in operator roles with numeric conditions
      rbac.clearCache();
      const result = rbac.checkPermission('operator', {
        resource: 'capture.screen',
        action: 'capture',
        context: { duration: 60 },
      });
      expect(result.granted).toBe(true);
    });

    it('grants when classification condition exists but no context.classification', () => {
      // When context doesn't have the classification field, the condition field
      // value is undefined — for classification conditions this returns false.
      rbac.clearCache();
      const result = rbac.checkPermission('cls_test', {
        resource: 'docs',
        action: 'read',
        context: { otherField: 'value' },
      });
      expect(result.granted).toBe(false);
    });
  });
});
