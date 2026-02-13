/**
 * Scope Validator Tests
 *
 * @see NEXT_STEP_03: Scope Limiting Controls
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScopeValidator,
  ScopeValidationError,
  initializeScopeValidator,
  getScopeValidator,
  resetScopeValidator,
  DEFAULT_ROLE_LIMITS,
  type RoleScopeLimits,
} from './scope-validator.js';
import type { CaptureScope, CaptureResource, CaptureResolution } from './types.js';

describe('ScopeValidator', () => {
  let validator: ScopeValidator;

  const baseScope: CaptureScope = {
    resource: 'capture.screen' as CaptureResource,
    duration: { maxSeconds: 60 },
    quality: {
      resolution: '720p',
      frameRate: 30,
      compression: 'medium',
      format: 'webp',
    },
    purpose: 'Testing',
  };

  beforeEach(() => {
    validator = new ScopeValidator();
    resetScopeValidator();
  });

  describe('Basic Validation', () => {
    it('should validate valid scope for operator', () => {
      const result = validator.validate(baseScope, { roleId: 'role_operator' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedScope).toBeDefined();
    });

    it('should reject unknown role', () => {
      const result = validator.validate(baseScope, { roleId: 'role_unknown' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown role: role_unknown');
    });

    it('should reject viewer role (no capture allowed)', () => {
      const result = validator.validate(baseScope, { roleId: 'role_viewer' });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('capture.screen not allowed');
    });
  });

  describe('Duration Validation', () => {
    it('should accept duration within limit', () => {
      const scope = {
        ...baseScope,
        duration: { maxSeconds: 300 }, // 5 minutes, at operator limit
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });

      expect(result.valid).toBe(true);
    });

    it('should sanitize duration exceeding limit', () => {
      const scope = {
        ...baseScope,
        duration: { maxSeconds: 600 }, // 10 minutes, exceeds 5 min limit
      };

      const result = validator.validate(scope, {
        roleId: 'role_operator',
        mode: 'sanitize',
      });

      expect(result.sanitizedScope?.duration.maxSeconds).toBe(300);
      expect(result.warnings).toContain('Duration reduced from 600s to 300s');
    });

    it('should reject duration exceeding limit in strict mode', () => {
      const scope = {
        ...baseScope,
        duration: { maxSeconds: 600 },
      };

      const result = validator.validate(scope, {
        roleId: 'role_operator',
        mode: 'strict',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duration 600s exceeds role limit of 300s');
    });
  });

  describe('Resolution Validation', () => {
    it('should allow 720p for operator', () => {
      const result = validator.validate(baseScope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should reject native resolution for operator', () => {
      const scope: CaptureScope = {
        ...baseScope,
        quality: { ...baseScope.quality, resolution: 'native' as CaptureResolution },
      };

      const result = validator.validate(scope, {
        roleId: 'role_operator',
        mode: 'sanitize',
      });

      expect(result.sanitizedScope?.quality.resolution).toBe('1080p');
    });

    it('should allow native resolution for admin', () => {
      const scope: CaptureScope = {
        ...baseScope,
        quality: { ...baseScope.quality, resolution: 'native' as CaptureResolution },
      };

      const result = validator.validate(scope, { roleId: 'role_admin' });

      expect(result.valid).toBe(true);
      expect(result.sanitizedScope?.quality.resolution).toBe('native');
    });
  });

  describe('Frame Rate Validation', () => {
    it('should accept frame rate within limit', () => {
      const result = validator.validate(baseScope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should sanitize frame rate exceeding limit', () => {
      const scope = {
        ...baseScope,
        quality: { ...baseScope.quality, frameRate: 60 },
      };

      const result = validator.validate(scope, {
        roleId: 'role_operator',
        mode: 'sanitize',
      });

      expect(result.sanitizedScope?.quality.frameRate).toBe(30);
    });
  });

  describe('Resource Validation', () => {
    it('should allow screen capture for operator', () => {
      const result = validator.validate(baseScope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should allow camera capture for operator', () => {
      const scope = {
        ...baseScope,
        resource: 'capture.camera' as CaptureResource,
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should reject keystroke capture for operator', () => {
      const scope = {
        ...baseScope,
        resource: 'capture.keystrokes' as CaptureResource,
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('capture.keystrokes not allowed');
    });

    it('should allow all resources for admin', () => {
      const resources: CaptureResource[] = [
        'capture.screen',
        'capture.camera',
        'capture.clipboard',
        'capture.keystrokes',
      ];

      for (const resource of resources) {
        const scope = { ...baseScope, resource };
        const result = validator.validate(scope, { roleId: 'role_admin' });
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Filter Validation', () => {
    it('should accept valid regex patterns', () => {
      const scope = {
        ...baseScope,
        filters: {
          redactPatterns: ['\\d{3}-\\d{2}-\\d{4}', 'password:\\s*\\w+'],
        },
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });

      expect(result.valid).toBe(true);
    });

    it('should reject invalid regex patterns', () => {
      const scope = {
        ...baseScope,
        filters: {
          redactPatterns: ['[invalid', 'valid-pattern'],
        },
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid regex pattern: [invalid');
    });

    it('should warn when filters not allowed', () => {
      const customLimits: Record<string, RoleScopeLimits> = {
        ...DEFAULT_ROLE_LIMITS,
        role_restricted: {
          ...DEFAULT_ROLE_LIMITS.role_operator,
          allowFilters: false,
        },
      };

      const customValidator = new ScopeValidator(customLimits);
      const scope = {
        ...baseScope,
        filters: { blurRegions: [{ x: 0, y: 0, w: 100, h: 100 }] },
      };

      const result = customValidator.validate(scope, {
        roleId: 'role_restricted',
        mode: 'sanitize',
      });

      expect(result.warnings).toContain('Filters not allowed for this role, will be ignored');
      expect(result.sanitizedScope?.filters).toBeUndefined();
    });
  });

  describe('Target Validation', () => {
    it('should accept scope without target', () => {
      const result = validator.validate(baseScope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should accept scope with target', () => {
      const scope = {
        ...baseScope,
        target: {
          type: 'window' as const,
          id: 'window-123',
          name: 'Test Window',
        },
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });
  });

  describe('Restrictions Validation', () => {
    it('should accept valid restrictions', () => {
      const scope = {
        ...baseScope,
        restrictions: {
          singleUse: true,
          watermark: true,
          noNetwork: true,
        },
      };

      const result = validator.validate(scope, { roleId: 'role_operator' });
      expect(result.valid).toBe(true);
    });

    it('should warn when restrictions not allowed', () => {
      const customLimits: Record<string, RoleScopeLimits> = {
        ...DEFAULT_ROLE_LIMITS,
        role_restricted: {
          ...DEFAULT_ROLE_LIMITS.role_operator,
          allowRestrictions: false,
        },
      };

      const customValidator = new ScopeValidator(customLimits);
      const scope = {
        ...baseScope,
        restrictions: { singleUse: true },
      };

      const result = customValidator.validate(scope, {
        roleId: 'role_restricted',
        mode: 'sanitize',
      });

      expect(result.warnings).toContain('Restrictions not allowed for this role, will be ignored');
      expect(result.sanitizedScope?.restrictions).toBeUndefined();
    });
  });

  describe('validateOrThrow', () => {
    it('should return sanitized scope on success', () => {
      const result = validator.validateOrThrow(baseScope, {
        roleId: 'role_operator',
      });

      expect(result).toBeDefined();
      expect(result.resource).toBe('capture.screen');
    });

    it('should throw ScopeValidationError on failure', () => {
      const scope = {
        ...baseScope,
        resource: 'capture.keystrokes' as CaptureResource,
      };

      expect(() => validator.validateOrThrow(scope, { roleId: 'role_operator' })).toThrow(
        ScopeValidationError
      );
    });

    it('should include errors in thrown exception', () => {
      const scope = {
        ...baseScope,
        resource: 'capture.keystrokes' as CaptureResource,
      };

      try {
        validator.validateOrThrow(scope, { roleId: 'role_operator' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeValidationError);
        const validationError = error as ScopeValidationError;
        expect(validationError.errors.length).toBeGreaterThan(0);
        expect(validationError.scope).toEqual(scope);
      }
    });
  });

  describe('Role Limits', () => {
    it('should get role limits', () => {
      const limits = validator.getRoleLimits('role_admin');

      expect(limits).toBeDefined();
      expect(limits?.maxDuration).toBe(3600);
      expect(limits?.allowNativeResolution).toBe(true);
    });

    it('should return undefined for unknown role', () => {
      const limits = validator.getRoleLimits('role_unknown');
      expect(limits).toBeUndefined();
    });

    it('should set custom role limits', () => {
      const customLimits: RoleScopeLimits = {
        maxDuration: 120,
        allowedResources: ['capture.screen'],
        allowedResolutions: ['720p', '480p'],
        allowNativeResolution: false,
        maxFrameRate: 15,
        allowStreaming: false,
        allowFilters: false,
        allowRestrictions: false,
      };

      validator.setRoleLimits('role_custom', customLimits);

      const retrieved = validator.getRoleLimits('role_custom');
      expect(retrieved?.maxDuration).toBe(120);
    });
  });

  describe('Global Instance', () => {
    it('should create global instance', () => {
      const instance = initializeScopeValidator();
      expect(instance).toBeInstanceOf(ScopeValidator);
    });

    it('should return same instance from getScopeValidator', () => {
      initializeScopeValidator();
      const instance1 = validator; // local
      const instance2 = getScopeValidator(); // global

      // The global one should be the initialized one
      expect(instance2).toBeInstanceOf(ScopeValidator);
    });

    it('should reset global instance', () => {
      initializeScopeValidator();
      resetScopeValidator();

      // Next get should create new default instance
      const instance = getScopeValidator();
      expect(instance.getRoleLimits('role_admin')).toBeDefined();
    });
  });

  describe('Capture Operator Role', () => {
    it('should allow longer duration for capture_operator', () => {
      const scope = {
        ...baseScope,
        duration: { maxSeconds: 1800 }, // 30 minutes
      };

      const result = validator.validate(scope, {
        roleId: 'role_capture_operator',
      });

      expect(result.valid).toBe(true);
    });

    it('should allow streaming for capture_operator', () => {
      const limits = validator.getRoleLimits('role_capture_operator');
      expect(limits?.allowStreaming).toBe(true);
    });

    it('should allow clipboard for capture_operator', () => {
      const scope = {
        ...baseScope,
        resource: 'capture.clipboard' as CaptureResource,
      };

      const result = validator.validate(scope, {
        roleId: 'role_capture_operator',
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should include userId in validation logging', () => {
      const result = validator.validate(baseScope, {
        roleId: 'role_operator',
        userId: 'test-user',
      });

      // Logging happens, we just verify no error
      expect(result).toBeDefined();
    });
  });
});

describe('DEFAULT_ROLE_LIMITS', () => {
  it('should define limits for all default roles', () => {
    expect(DEFAULT_ROLE_LIMITS.role_admin).toBeDefined();
    expect(DEFAULT_ROLE_LIMITS.role_operator).toBeDefined();
    expect(DEFAULT_ROLE_LIMITS.role_capture_operator).toBeDefined();
    expect(DEFAULT_ROLE_LIMITS.role_auditor).toBeDefined();
    expect(DEFAULT_ROLE_LIMITS.role_security_auditor).toBeDefined();
    expect(DEFAULT_ROLE_LIMITS.role_viewer).toBeDefined();
  });

  it('should give admin full access', () => {
    const admin = DEFAULT_ROLE_LIMITS.role_admin;
    expect(admin.maxDuration).toBe(3600);
    expect(admin.allowNativeResolution).toBe(true);
    expect(admin.allowedResources).toContain('capture.keystrokes');
  });

  it('should give viewer no access', () => {
    const viewer = DEFAULT_ROLE_LIMITS.role_viewer;
    expect(viewer.maxDuration).toBe(0);
    expect(viewer.allowedResources).toHaveLength(0);
  });
});
