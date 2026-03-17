import { describe, it, expect } from 'vitest';
import { routeWithPrivacy } from './privacy-router.js';
import type { GpuProbeResult } from './gpu-probe.js';
import type { LocalModelRegistryState, LocalModel } from './local-model-registry.js';

function makeGpu(overrides: Partial<GpuProbeResult> = {}): GpuProbeResult {
  return {
    available: true,
    devices: [{
      index: 0,
      name: 'Test GPU',
      vendor: 'nvidia',
      vramTotalMb: 24000,
      vramUsedMb: 2000,
      vramFreeMb: 22000,
      utilizationPercent: 10,
      temperatureCelsius: 40,
      driverVersion: '550.0',
      computeCapability: '8.9',
      cudaAvailable: true,
      rocmAvailable: false,
    }],
    totalVramMb: 24000,
    totalFreeVramMb: 22000,
    bestDevice: null,
    localInferenceViable: true,
    probedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLocalModels(models: Partial<LocalModel>[] = [{ name: 'llama-3.1-8b' }]): LocalModelRegistryState {
  return {
    models: models.map((m) => ({
      name: m.name ?? 'test-model',
      provider: m.provider ?? 'ollama',
      sizeBytes: 0,
      estimatedVramMb: m.estimatedVramMb ?? 6000,
      lastSeen: new Date().toISOString(),
      capabilities: m.capabilities ?? ['chat', 'streaming'],
      tier: m.tier ?? 'fast',
      family: 'llama',
      parameterCount: '8b',
    })),
    lastRefreshed: new Date().toISOString(),
    ollamaAvailable: true,
    lmstudioAvailable: false,
    localaiAvailable: false,
  };
}

const noGpu = makeGpu({ available: false, devices: [], totalFreeVramMb: 0, localInferenceViable: false });
const noModels: LocalModelRegistryState = {
  models: [],
  lastRefreshed: new Date().toISOString(),
  ollamaAvailable: false,
  lmstudioAvailable: false,
  localaiAvailable: false,
};

describe('privacy-router', () => {
  describe('routeWithPrivacy', () => {
    it('routes sensitive content to local when GPU available', () => {
      const result = routeWithPrivacy('confidential', ['email'], makeGpu(), makeLocalModels());
      expect(result.target).toBe('local');
      expect(result.reason).toBe('privacy-enforced');
      expect(result.localModel).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('routes PII content to local when piiForcesLocal is true', () => {
      const result = routeWithPrivacy('public', ['ssn'], makeGpu(), makeLocalModels());
      expect(result.target).toBe('local');
      expect(result.reason).toBe('privacy-enforced');
    });

    it('falls back to cloud when sensitive but no GPU', () => {
      const result = routeWithPrivacy('restricted', ['credit_card'], noGpu, noModels);
      expect(result.target).toBe('cloud');
      expect(result.reason).toBe('local-insufficient');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('respects cloud-only policy', () => {
      const result = routeWithPrivacy('public', [], makeGpu(), makeLocalModels(), [], { policy: 'cloud-only' });
      expect(result.target).toBe('cloud');
      expect(result.reason).toBe('policy-cloud-only');
      expect(result.confidence).toBe(1.0);
    });

    it('respects local-only policy', () => {
      const result = routeWithPrivacy('public', [], makeGpu(), makeLocalModels(), [], { policy: 'local-only' });
      expect(result.target).toBe('local');
      expect(result.reason).toBe('policy-local-only');
    });

    it('returns local-only with low confidence when GPU unavailable', () => {
      const result = routeWithPrivacy('public', [], noGpu, noModels, [], { policy: 'local-only' });
      expect(result.target).toBe('local');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('prefers local when policy is local-preferred and GPU available', () => {
      const result = routeWithPrivacy('public', [], makeGpu(), makeLocalModels(), [], { policy: 'local-preferred' });
      expect(result.target).toBe('local');
      expect(result.reason).toBe('local-preferred');
    });

    it('routes to cloud when auto and no local models', () => {
      const result = routeWithPrivacy('public', [], makeGpu(), noModels);
      expect(result.target).toBe('cloud');
      expect(result.reason).toBe('no-local-models');
    });

    it('routes to local when auto and GPU + models available', () => {
      const result = routeWithPrivacy('public', [], makeGpu(), makeLocalModels());
      expect(result.target).toBe('local');
      expect(result.reason).toBe('local-capable');
    });

    it('includes classification metadata in decision', () => {
      const result = routeWithPrivacy('internal', ['phone'], makeGpu(), makeLocalModels());
      expect(result.classificationLevel).toBe('internal');
      expect(result.containsPii).toBe(true);
      expect(result.localViable).toBe(true);
    });

    it('filters local models by VRAM budget', () => {
      const bigModel = makeLocalModels([{ name: 'llama-70b', estimatedVramMb: 40000 }]);
      const smallGpu = makeGpu({ totalFreeVramMb: 8000 });
      const result = routeWithPrivacy('public', [], smallGpu, bigModel);
      expect(result.target).toBe('cloud');
      expect(result.reason).toBe('local-insufficient');
    });

    it('selects a model that fits in VRAM', () => {
      const models = makeLocalModels([
        { name: 'llama-70b', estimatedVramMb: 40000 },
        { name: 'llama-8b', estimatedVramMb: 6000 },
      ]);
      const gpu = makeGpu({ totalFreeVramMb: 10000 });
      const result = routeWithPrivacy('public', [], gpu, models);
      expect(result.target).toBe('local');
      expect(result.localModel!.name).toBe('llama-8b');
    });
  });
});
