import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

import { detectConfidentialGpu, isGpuConfidential, blockNonConfidentialGpu } from './tee-gpu.js';

describe('Confidential GPU Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectConfidentialGpu', () => {
    it('returns available=false when nvidia-smi is not found', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      const info = detectConfidentialGpu();
      expect(info.available).toBe(false);
      expect(info.confidential).toBe(false);
    });

    it('detects GPU with CC mode On', () => {
      mockExecFileSync.mockReturnValue('NVIDIA H100, 535.129.03, On\n');
      const info = detectConfidentialGpu();
      expect(info.available).toBe(true);
      expect(info.confidential).toBe(true);
      expect(info.gpuName).toBe('NVIDIA H100');
      expect(info.driverVersion).toBe('535.129.03');
      expect(info.ccMode).toBe('On');
    });

    it('detects GPU with CC mode Off', () => {
      mockExecFileSync.mockReturnValue('NVIDIA A100, 535.129.03, Off\n');
      const info = detectConfidentialGpu();
      expect(info.available).toBe(true);
      expect(info.confidential).toBe(false);
      expect(info.ccMode).toBe('Off');
    });

    it('detects GPU with CC mode N/A', () => {
      mockExecFileSync.mockReturnValue('NVIDIA RTX 4090, 535.129.03, N/A\n');
      const info = detectConfidentialGpu();
      expect(info.available).toBe(true);
      expect(info.confidential).toBe(false);
      expect(info.ccMode).toBe('N/A');
    });

    it('handles empty nvidia-smi output', () => {
      mockExecFileSync.mockReturnValue('\n');
      const info = detectConfidentialGpu();
      expect(info.available).toBe(true);
      expect(info.confidential).toBe(false);
    });
  });

  describe('isGpuConfidential', () => {
    it('returns true when CC mode is On', () => {
      mockExecFileSync.mockReturnValue('NVIDIA H100, 535.129.03, On\n');
      expect(isGpuConfidential()).toBe(true);
    });

    it('returns false when no GPU', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(isGpuConfidential()).toBe(false);
    });
  });

  describe('blockNonConfidentialGpu', () => {
    it('throws when GPU is available but CC is Off', () => {
      mockExecFileSync.mockReturnValue('NVIDIA A100, 535.129.03, Off\n');
      expect(() => blockNonConfidentialGpu()).toThrow(
        'GPU detected (NVIDIA A100) but Confidential Computing mode is not enabled (cc_mode=Off)'
      );
    });

    it('does not throw when no GPU is detected', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(() => blockNonConfidentialGpu()).not.toThrow();
    });

    it('does not throw when GPU has CC mode On', () => {
      mockExecFileSync.mockReturnValue('NVIDIA H100, 535.129.03, On\n');
      expect(() => blockNonConfidentialGpu()).not.toThrow();
    });
  });
});
