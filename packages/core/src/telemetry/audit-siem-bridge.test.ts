import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditSiemBridge } from './audit-siem-bridge.js';
import type { SiemForwarder } from './siem/siem-forwarder.js';

vi.mock('./otel.js', () => ({ getCurrentTraceId: () => 'trace-abc' }));
vi.mock('./instrument.js', () => ({ getCurrentSpanId: () => 'span-def' }));
vi.mock('../utils/correlation-context.js', () => ({ getCorrelationId: () => 'corr-123' }));

const mockForwarder = {
  forward: vi.fn(),
} as unknown as SiemForwarder;

const mockLogger = {
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info' as const,
};

describe('AuditSiemBridge', () => {
  let bridge: AuditSiemBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new AuditSiemBridge(mockForwarder as any, mockLogger);
  });

  describe('forwardAuditEvent', () => {
    it('should forward auth_failure as high severity', () => {
      bridge.forwardAuditEvent({
        event: 'auth_failure',
        message: 'Bad password',
        metadata: { ip: '1.2.3.4' },
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      expect(mockForwarder.forward).toHaveBeenCalledTimes(1);
      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.severity).toBe('high');
      expect(evt.source).toBe('audit-chain');
      expect(evt.event).toBe('auth_failure');
      expect(evt.traceId).toBe('trace-abc');
      expect(evt.spanId).toBe('span-def');
      expect(evt.correlationId).toBe('corr-123');
      expect(evt.userId).toBe('user-1');
      expect(evt.tenantId).toBe('tenant-1');
    });

    it('should forward injection_attempt as critical', () => {
      bridge.forwardAuditEvent({ event: 'injection_attempt' });
      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.severity).toBe('critical');
    });

    it('should use low as default severity for unknown events', () => {
      bridge.forwardAuditEvent({ event: 'some_unknown_event' });
      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.severity).toBe('low');
    });

    it('should handle errors gracefully', () => {
      (mockForwarder.forward as any).mockImplementationOnce(() => {
        throw new Error('fail');
      });
      bridge.forwardAuditEvent({ event: 'test' });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('forwardDlpEvent', () => {
    it('should forward DLP blocked event', () => {
      bridge.forwardDlpEvent({
        action: 'blocked',
        destination: 'external-api',
        classificationLevel: 'restricted',
        findings: ['SSN detected'],
        userId: 'user-1',
      });

      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.event).toBe('dlp_blocked');
      expect(evt.severity).toBe('high');
      expect(evt.source).toBe('dlp');
      expect(evt.metadata.destination).toBe('external-api');
      expect(evt.metadata.classificationLevel).toBe('restricted');
    });

    it('should forward DLP warned event as medium severity', () => {
      bridge.forwardDlpEvent({
        action: 'warned',
        destination: 'slack',
        classificationLevel: 'confidential',
      });

      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.event).toBe('dlp_warned');
      expect(evt.severity).toBe('medium');
    });

    it('should forward DLP logged event as low severity', () => {
      bridge.forwardDlpEvent({
        action: 'logged',
        destination: 'email',
        classificationLevel: 'internal',
      });

      const evt = (mockForwarder.forward as any).mock.calls[0][0];
      expect(evt.event).toBe('dlp_logged');
      expect(evt.severity).toBe('low');
    });
  });
});
