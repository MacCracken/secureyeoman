import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GPU_TOOL_DEFINITIONS, handleGpuToolCall } from './gpu-tools.js';
import type { SecureLogger } from '../logging/logger.js';

// Mock the GPU modules
vi.mock('./accelerator/probe.js', () => ({
  probeAccelerators: vi.fn().mockResolvedValue({
    available: true,
    devices: [
      {
        index: 0,
        name: 'Test GPU',
        vendor: 'nvidia',
        family: 'gpu',
        vramTotalMb: 24000,
        vramUsedMb: 2000,
        vramFreeMb: 22000,
        utilizationPercent: 10,
        temperatureCelsius: 40,
        driverVersion: '550.0',
        computeCapability: '8.9',
        cudaAvailable: true,
        rocmAvailable: false,
        tpuAvailable: false,
      },
    ],
    totalVramMb: 24000,
    totalFreeVramMb: 22000,
    bestDevice: null,
    localInferenceViable: true,
    tpuCount: 0,
    tpuAvailable: false,
    source: 'builtin',
    probedAt: new Date().toISOString(),
  }),
}));

vi.mock('./local-model-registry.js', () => ({
  refreshLocalModels: vi.fn().mockResolvedValue({
    models: [
      {
        name: 'llama3.1:8b',
        provider: 'ollama',
        sizeBytes: 0,
        estimatedVramMb: 6000,
        lastSeen: new Date().toISOString(),
        capabilities: ['chat', 'streaming', 'code'],
        tier: 'fast',
        family: 'llama',
        parameterCount: '8b',
      },
    ],
    lastRefreshed: new Date().toISOString(),
    ollamaAvailable: true,
    lmstudioAvailable: false,
    localaiAvailable: false,
  }),
  findLocalModelsWithCapabilities: vi
    .fn()
    .mockImplementation((models: any[], caps: string[]) =>
      models.filter((m: any) => caps.every((c: string) => m.capabilities.includes(c)))
    ),
}));

vi.mock('./privacy-router.js', () => ({
  routeWithPrivacy: vi.fn().mockReturnValue({
    target: 'local',
    reason: 'privacy-enforced',
    localModel: { name: 'llama3.1:8b', provider: 'ollama' },
    classificationLevel: 'confidential',
    containsPii: true,
    localViable: true,
    confidence: 0.95,
  }),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as SecureLogger;

describe('gpu-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GPU_TOOL_DEFINITIONS', () => {
    it('defines 7 tools', () => {
      expect(GPU_TOOL_DEFINITIONS).toHaveLength(7);
    });

    it('has accelerator_status tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'accelerator_status')).toBeTruthy();
    });

    it('has gpu_status tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'gpu_status')).toBeTruthy();
    });

    it('has tpu_status tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'tpu_status')).toBeTruthy();
    });

    it('has npu_status tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'npu_status')).toBeTruthy();
    });

    it('has asic_status tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'asic_status')).toBeTruthy();
    });

    it('has local_models_list tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'local_models_list')).toBeTruthy();
    });

    it('has privacy_route_check tool', () => {
      expect(GPU_TOOL_DEFINITIONS.find((t) => t.name === 'privacy_route_check')).toBeTruthy();
    });

    it('all tools have serverId and serverName', () => {
      for (const tool of GPU_TOOL_DEFINITIONS) {
        expect(tool.serverId).toBe('secureyeoman-builtin');
        expect(tool.serverName).toBe('SecureYeoman');
      }
    });
  });

  describe('handleGpuToolCall', () => {
    it('handles accelerator_status', async () => {
      const result = await handleGpuToolCall('accelerator_status', {}, { logger: mockLogger });
      expect(result).toHaveProperty('available', true);
      expect(result).toHaveProperty('devices');
    });

    it('handles accelerator_status with refresh', async () => {
      const { probeAccelerators } = await import('./accelerator/probe.js');
      await handleGpuToolCall('accelerator_status', { refresh: true }, { logger: mockLogger });
      expect(probeAccelerators).toHaveBeenCalledWith(true);
    });

    it('handles gpu_status and filters to GPU family', async () => {
      const result = (await handleGpuToolCall('gpu_status', {}, { logger: mockLogger })) as any;
      expect(result).toHaveProperty('devices');
      // All returned devices should be GPU family
      for (const d of result.devices) {
        expect(d.family).toBe('gpu');
      }
    });

    it('handles local_models_list', async () => {
      const result = (await handleGpuToolCall(
        'local_models_list',
        {},
        { logger: mockLogger }
      )) as any;
      expect(result.models).toHaveLength(1);
      expect(result.ollamaAvailable).toBe(true);
    });

    it('handles local_models_list with capability filter', async () => {
      const result = (await handleGpuToolCall(
        'local_models_list',
        { capability: 'code' },
        { logger: mockLogger }
      )) as any;
      expect(result.models).toHaveLength(1);
    });

    it('handles privacy_route_check', async () => {
      const mockClassifier = {
        classify: vi.fn().mockReturnValue({
          level: 'confidential',
          piiFound: ['email'],
          keywordsFound: [],
          autoLevel: 'confidential',
          rulesTriggered: [],
        }),
      };
      const result = (await handleGpuToolCall(
        'privacy_route_check',
        { content: 'My SSN is 123-45-6789' },
        { logger: mockLogger, classificationEngine: mockClassifier as any }
      )) as any;
      expect(result.target).toBe('local');
      expect(result.reason).toBe('privacy-enforced');
    });

    it('returns error for privacy_route_check without content', async () => {
      const result = (await handleGpuToolCall(
        'privacy_route_check',
        {},
        { logger: mockLogger }
      )) as any;
      expect(result.error).toBeDefined();
    });

    it('returns error for unknown tool', async () => {
      const result = (await handleGpuToolCall('unknown_tool', {}, { logger: mockLogger })) as any;
      expect(result.error).toContain('Unknown tool');
    });
  });
});
