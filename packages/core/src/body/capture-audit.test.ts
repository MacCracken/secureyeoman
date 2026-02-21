import { describe, it, expect } from 'vitest';
import { DEFAULT_RISK_RULES } from './capture-audit.js';
import type {
  CaptureEventType,
  CaptureAuditEvent,
  DataProvenance,
  Anomaly,
  AuditFilter,
  RiskDetectionRules,
} from './capture-audit.js';

describe('capture-audit', () => {
  describe('DEFAULT_RISK_RULES', () => {
    it('has sane default values', () => {
      expect(DEFAULT_RISK_RULES.maxRequestsPerHour).toBe(10);
      expect(DEFAULT_RISK_RULES.maxDurationAlert).toBe(300);
      expect(DEFAULT_RISK_RULES.maxFailedAttempts).toBe(5);
    });

    it('has business hours 9-17', () => {
      expect(DEFAULT_RISK_RULES.businessHours.start).toBe(9);
      expect(DEFAULT_RISK_RULES.businessHours.end).toBe(17);
    });
  });

  describe('type shapes (compile-time verification)', () => {
    it('CaptureEventType values are valid', () => {
      const validTypes: CaptureEventType[] = [
        'capture.requested',
        'capture.approved',
        'capture.denied',
        'capture.started',
        'capture.completed',
        'capture.failed',
        'capture.stopped',
        'capture.expired',
        'capture.accessed',
        'capture.deleted',
        'capture.exported',
        'consent.revoked',
      ];
      expect(validTypes.length).toBe(12);
    });

    it('Anomaly severity levels are correct', () => {
      const severity: Anomaly['severity'][] = ['info', 'warning', 'critical'];
      expect(severity).toHaveLength(3);
    });
  });
});
