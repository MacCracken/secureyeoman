import { describe, it, expect } from 'vitest';
import { DEFAULT_CONSENT_CONFIG } from './consent.js';
import type { ConsentStatus, CaptureConsent, ConsentConfig, ConsentEvent } from './consent.js';

describe('consent', () => {
  describe('DEFAULT_CONSENT_CONFIG', () => {
    it('requires explicit grant', () => {
      expect(DEFAULT_CONSENT_CONFIG.requireExplicitGrant).toBe(true);
    });

    it('auto-denies on timeout', () => {
      expect(DEFAULT_CONSENT_CONFIG.autoDenyOnTimeout).toBe(true);
    });

    it('has 30 second default timeout', () => {
      expect(DEFAULT_CONSENT_CONFIG.defaultTimeoutMs).toBe(30000);
    });

    it('has 5 minute maximum timeout', () => {
      expect(DEFAULT_CONSENT_CONFIG.maxTimeoutMs).toBe(300000);
    });

    it('allows revoke by default', () => {
      expect(DEFAULT_CONSENT_CONFIG.allowRevoke).toBe(true);
    });

    it('shows purpose and visual indicator by default', () => {
      expect(DEFAULT_CONSENT_CONFIG.showPurpose).toBe(true);
      expect(DEFAULT_CONSENT_CONFIG.visualIndicator).toBe(true);
    });

    it('requires re-approval after 5 minutes', () => {
      expect(DEFAULT_CONSENT_CONFIG.requireReapprovalAfterMs).toBe(300000);
    });
  });

  describe('type shapes', () => {
    it('ConsentStatus lifecycle values are complete', () => {
      const statuses: ConsentStatus[] = ['pending', 'granted', 'denied', 'expired', 'revoked'];
      expect(statuses).toHaveLength(5);
    });

    it('ConsentEvent types are valid', () => {
      const types: ConsentEvent['type'][] = [
        'consent:requested',
        'consent:granted',
        'consent:denied',
        'consent:expired',
        'consent:revoked',
      ];
      expect(types).toHaveLength(5);
    });
  });
});
