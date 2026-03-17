import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetGpuCache, estimateVramRequirement } from './gpu-probe.js';

// Mock execFile — GPU probing calls nvidia-smi/rocm-smi which aren't available in CI
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

import { execFile } from 'node:child_process';
const mockExecFile = vi.mocked(execFile);

describe('gpu-probe', () => {
  beforeEach(() => {
    _resetGpuCache();
    vi.resetAllMocks();
  });

  describe('estimateVramRequirement', () => {
    it('estimates VRAM for common model sizes', () => {
      expect(estimateVramRequirement('llama-3.1-70b-instruct')).toBe(40_000);
      expect(estimateVramRequirement('llama-3.1-8b-instruct')).toBe(6_000);
      expect(estimateVramRequirement('phi-3-mini-3b')).toBe(3_000);
      expect(estimateVramRequirement('mistral-7b')).toBe(5_000);
      expect(estimateVramRequirement('qwen2-1.5b')).toBe(2_000);
    });

    it('returns default for unknown model names', () => {
      expect(estimateVramRequirement('custom-model')).toBe(6_000);
    });

    it('detects tiny models', () => {
      expect(estimateVramRequirement('phi-tiny')).toBe(1_000);
    });

    it('detects small models', () => {
      expect(estimateVramRequirement('llama-small')).toBe(2_000);
    });

    it('detects 13b models', () => {
      expect(estimateVramRequirement('llama-13b')).toBe(10_000);
    });

    it('detects 34b models', () => {
      expect(estimateVramRequirement('codellama-34b')).toBe(20_000);
    });
  });

  describe('probeGpu', () => {
    it('returns no GPUs when nvidia-smi is not available', async () => {
      mockExecFile.mockImplementation((() => {
        throw new Error('Command not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();
      const result = await probeGpu(true);

      expect(result.available).toBe(false);
      expect(result.devices).toEqual([]);
      expect(result.localInferenceViable).toBe(false);
    });

    it('caches results within TTL', async () => {
      mockExecFile.mockImplementation((() => {
        throw new Error('not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();

      const first = await probeGpu(true);
      const second = await probeGpu(false);

      // Same reference = cached
      expect(first).toBe(second);
    });

    it('includes probedAt timestamp', async () => {
      mockExecFile.mockImplementation((() => {
        throw new Error('not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();
      const result = await probeGpu(true);

      expect(result.probedAt).toBeDefined();
      expect(new Date(result.probedAt).getTime()).toBeGreaterThan(0);
    });

    it('parses nvidia-smi CSV output correctly', async () => {
      mockExecFile.mockImplementation(((cmd: string) => {
        if (cmd === 'nvidia-smi') {
          return Promise.resolve({
            stdout: '0, NVIDIA GeForce RTX 4090, 24564, 1200, 23364, 15, 42, 550.127, 8.9\n',
          });
        }
        throw new Error('not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();
      const result = await probeGpu(true);

      expect(result.available).toBe(true);
      expect(result.devices).toHaveLength(1);
      expect(result.devices[0]!.name).toBe('NVIDIA GeForce RTX 4090');
      expect(result.devices[0]!.vendor).toBe('nvidia');
      expect(result.devices[0]!.vramTotalMb).toBe(24564);
      expect(result.devices[0]!.vramFreeMb).toBe(23364);
      expect(result.devices[0]!.cudaAvailable).toBe(true);
      expect(result.devices[0]!.computeCapability).toBe('8.9');
      expect(result.localInferenceViable).toBe(true);
      expect(result.totalVramMb).toBe(24564);
      expect(result.totalFreeVramMb).toBe(23364);
    });

    it('reports localInferenceViable=false when VRAM < 4GB', async () => {
      mockExecFile.mockImplementation(((cmd: string) => {
        if (cmd === 'nvidia-smi') {
          return Promise.resolve({
            stdout: '0, NVIDIA GT 710, 2048, 1800, 248, 5, 35, 470.42, 3.5\n',
          });
        }
        throw new Error('not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();
      const result = await probeGpu(true);

      expect(result.available).toBe(true);
      expect(result.localInferenceViable).toBe(false);
    });

    it('selects best device by free VRAM', async () => {
      mockExecFile.mockImplementation(((cmd: string) => {
        if (cmd === 'nvidia-smi') {
          return Promise.resolve({
            stdout: [
              '0, GPU A, 8192, 6000, 2192, 80, 70, 550.0, 8.0',
              '1, GPU B, 16384, 2000, 14384, 20, 45, 550.0, 8.0',
            ].join('\n'),
          });
        }
        throw new Error('not found');
      }) as any);

      const { probeGpu } = await import('./gpu-probe.js');
      _resetGpuCache();
      const result = await probeGpu(true);

      expect(result.devices).toHaveLength(2);
      expect(result.bestDevice!.name).toBe('GPU B');
      expect(result.bestDevice!.vramFreeMb).toBe(14384);
    });
  });
});
