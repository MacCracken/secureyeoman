import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerModelRoutes } from './model-routes.js';
import { _clearDynamicCache } from './cost-calculator.js';
import type { SecureYeoman } from '../secureyeoman.js';

// Mock OllamaProvider static methods
vi.mock('./providers/ollama.js', () => ({
  OllamaProvider: {
    fetchAvailableModels: vi.fn().mockResolvedValue([{ id: 'llama3:latest', size: 4700000000 }]),
    pull: vi.fn().mockImplementation(async function* () {
      yield { status: 'pulling manifest' };
      yield { status: 'done' };
    }),
    deleteModel: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock global fetch so getAvailableModelsAsync doesn't make real network calls
const mockFetch = vi.fn().mockImplementation((url: string) => {
  // Gemini ListModels
  if (url.includes('generativelanguage.googleapis.com')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            supportedGenerationMethods: ['generateContent'],
            inputTokenLimit: 1048576,
            outputTokenLimit: 8192,
          },
        ],
      }),
    });
  }
  // Anthropic Models
  if (url.includes('api.anthropic.com')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' }],
      }),
    });
  }
  // OpenAI Models
  if (url.includes('api.openai.com')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-4o', owned_by: 'openai' }],
      }),
    });
  }
  // OpenCode Models
  if (url.includes('opencode.ai')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-5.2', owned_by: 'opencode' }],
      }),
    });
  }
  // Ollama Tags
  if (url.includes('/api/tags')) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:latest', size: 4700000000 }],
      }),
    });
  }
  return Promise.resolve({ ok: false });
});
vi.stubGlobal('fetch', mockFetch);

// Set provider env vars so getAvailableModelsAsync(true) includes all providers
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENCODE_API_KEY',
  'OLLAMA_HOST',
];
const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  savedEnv[key] = process.env[key];
  process.env[key] = process.env[key] ?? 'test-value';
}
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

function createMockSecureYeoman(
  overrides: Partial<{
    switchModelError: string | null;
    getConfigError: string | null;
    modelDefault: { provider: string; model: string } | null;
    getModelDefaultError: string | null;
    setModelDefaultError: string | null;
    clearModelDefaultError: string | null;
    costOptimizer: object | null | 'missing';
    costCalculator: object | null | 'missing';
    setLocalFirstError: string | null;
    localFirst: boolean;
    provider: string;
    model: string;
    baseUrl: string | undefined;
  }> = {}
) {
  const mock = {
    getConfig: overrides.getConfigError
      ? vi.fn().mockImplementation(() => {
          throw new Error(overrides.getConfigError!);
        })
      : vi.fn().mockReturnValue({
          model: {
            provider: overrides.provider ?? 'anthropic',
            model: overrides.model ?? 'claude-sonnet-4-20250514',
            maxTokens: 16384,
            temperature: 0.7,
            localFirst: overrides.localFirst ?? false,
            baseUrl: overrides.baseUrl,
            apiKeyEnv: 'ANTHROPIC_API_KEY',
          },
        }),
    switchModel: overrides.switchModelError
      ? vi.fn().mockImplementation(() => {
          throw new Error(overrides.switchModelError!);
        })
      : vi.fn(),
    getModelDefault: overrides.getModelDefaultError
      ? vi.fn().mockImplementation(() => {
          throw new Error(overrides.getModelDefaultError!);
        })
      : vi.fn().mockReturnValue(overrides.modelDefault ?? null),
    setModelDefault: overrides.setModelDefaultError
      ? vi.fn().mockRejectedValue(new Error(overrides.setModelDefaultError!))
      : vi.fn().mockResolvedValue(undefined),
    clearModelDefault: overrides.clearModelDefaultError
      ? vi.fn().mockRejectedValue(new Error(overrides.clearModelDefaultError!))
      : vi.fn().mockResolvedValue(undefined),
    setLocalFirst: overrides.setLocalFirstError
      ? vi.fn().mockRejectedValue(new Error(overrides.setLocalFirstError!))
      : vi.fn().mockResolvedValue(undefined),
    getLocalFirst: vi.fn().mockReturnValue(overrides.localFirst ?? false),
    getCostOptimizer:
      overrides.costOptimizer === 'missing'
        ? vi.fn().mockReturnValue(null)
        : vi.fn().mockReturnValue(
            overrides.costOptimizer ?? {
              analyze: vi.fn().mockReturnValue({ recommendations: [] }),
            }
          ),
    getCostCalculator:
      overrides.costCalculator === 'missing'
        ? vi.fn().mockReturnValue(null)
        : vi.fn().mockReturnValue(
            overrides.costCalculator ?? {
              calculate: vi.fn().mockReturnValue(0.001),
            }
          ),
  } as unknown as SecureYeoman;

  return mock;
}

describe('Model Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    app = Fastify();
    _clearDynamicCache();
    vi.clearAllMocks();
  });

  it('GET /api/v1/model/info returns current config and available models', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/model/info',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.current).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 16384,
      temperature: 0.7,
      localFirst: false,
    });
    expect(body.available).toBeDefined();
    expect(body.available.anthropic).toBeDefined();
    expect(body.available.openai).toBeDefined();
    expect(body.available.gemini).toBeDefined();
    expect(body.available.ollama).toBeDefined();
    expect(body.available.opencode).toBeDefined();
  });

  it('GET /api/v1/model/info has correct model structure', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/model/info',
    });

    const body = JSON.parse(res.payload);
    const anthropicModels = body.available.anthropic;
    expect(anthropicModels.length).toBeGreaterThanOrEqual(1);
    expect(anthropicModels[0]).toHaveProperty('provider');
    expect(anthropicModels[0]).toHaveProperty('model');
    expect(anthropicModels[0]).toHaveProperty('inputPer1M');
    expect(anthropicModels[0]).toHaveProperty('outputPer1M');
  });

  it('POST /api/v1/model/switch succeeds with valid provider/model', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/switch',
      payload: { provider: 'openai', model: 'gpt-4o' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.model).toBe('openai/gpt-4o');
    expect(mock.switchModel).toHaveBeenCalledWith('openai', 'gpt-4o');
  });

  it('POST /api/v1/model/switch returns 400 for invalid provider', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/switch',
      payload: { provider: 'invalid', model: 'gpt-4o' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('Invalid provider');
  });

  it('POST /api/v1/model/switch returns 400 for missing fields', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/switch',
      payload: { provider: 'openai' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/model/switch returns 500 on switchModel error', async () => {
    const mock = createMockSecureYeoman({ switchModelError: 'API key missing' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/switch',
      payload: { provider: 'openai', model: 'gpt-4o' },
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload).message).toContain('API key missing');
  });

  // ── GET /api/v1/model/info error path ──────────────────────────────────────

  it('GET /api/v1/model/info returns 500 on getConfig error', async () => {
    const mock = createMockSecureYeoman({ getConfigError: 'config failed' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/info' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload).message).toContain('config failed');
  });

  // ── GET /api/v1/model/default ──────────────────────────────────────────────

  it('GET /api/v1/model/default returns null when no default set', async () => {
    const mock = createMockSecureYeoman({ modelDefault: null });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/default' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.provider).toBeNull();
    expect(body.model).toBeNull();
  });

  it('GET /api/v1/model/default returns stored default', async () => {
    const mock = createMockSecureYeoman({
      modelDefault: { provider: 'openai', model: 'gpt-4o' },
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/default' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.provider).toBe('openai');
    expect(body.model).toBe('gpt-4o');
  });

  it('GET /api/v1/model/default returns 500 on error', async () => {
    const mock = createMockSecureYeoman({ getModelDefaultError: 'DB error' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/default' });
    expect(res.statusCode).toBe(500);
  });

  // ── POST /api/v1/model/default ─────────────────────────────────────────────

  it('POST /api/v1/model/default sets default and returns success', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/default',
      payload: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.provider).toBe('openai');
  });

  it('POST /api/v1/model/default returns 400 when fields missing', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/default',
      payload: { provider: 'openai' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/model/default returns 400 on Invalid provider error', async () => {
    const mock = createMockSecureYeoman({
      setModelDefaultError: 'Invalid provider: xyz',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/default',
      payload: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('Invalid provider');
  });

  it('POST /api/v1/model/default returns 500 on other error', async () => {
    const mock = createMockSecureYeoman({ setModelDefaultError: 'DB failure' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/default',
      payload: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(res.statusCode).toBe(500);
  });

  // ── DELETE /api/v1/model/default ───────────────────────────────────────────

  it('DELETE /api/v1/model/default clears default and returns 204', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'DELETE', url: '/api/v1/model/default' });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/model/default returns 500 on error', async () => {
    const mock = createMockSecureYeoman({ clearModelDefaultError: 'DB error' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'DELETE', url: '/api/v1/model/default' });
    expect(res.statusCode).toBe(500);
  });

  // ── GET /api/v1/model/cost-recommendations ─────────────────────────────────

  it('GET /api/v1/model/cost-recommendations returns optimizer analysis', async () => {
    const mock = createMockSecureYeoman({
      costOptimizer: {
        analyze: vi.fn().mockReturnValue({ recommendations: ['use cheaper model'] }),
      },
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/cost-recommendations' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).recommendations).toBeDefined();
  });

  it('GET /api/v1/model/cost-recommendations returns 503 when optimizer missing', async () => {
    const mock = createMockSecureYeoman({ costOptimizer: 'missing' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/cost-recommendations' });
    expect(res.statusCode).toBe(503);
  });

  it('GET /api/v1/model/cost-recommendations returns 500 on error', async () => {
    const mock = createMockSecureYeoman({
      costOptimizer: {
        analyze: vi.fn().mockImplementation(() => {
          throw new Error('analysis failed');
        }),
      },
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/cost-recommendations' });
    expect(res.statusCode).toBe(500);
  });

  // ── POST /api/v1/model/estimate-cost ───────────────────────────────────────

  it('POST /api/v1/model/estimate-cost returns cost estimate', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: { task: 'summarize a document' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.task).toBeDefined();
    expect(body.selectedModel).toBeDefined();
    expect(body.estimatedCostUsd).toBeDefined();
  });

  it('POST /api/v1/model/estimate-cost returns 400 when task missing', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: { context: 'some context' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('task');
  });

  it('POST /api/v1/model/estimate-cost returns 503 when costOptimizer missing', async () => {
    const mock = createMockSecureYeoman({ costOptimizer: 'missing' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: { task: 'do something' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('POST /api/v1/model/estimate-cost returns 503 when costCalculator missing', async () => {
    const mock = createMockSecureYeoman({ costCalculator: 'missing' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: { task: 'do something' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('POST /api/v1/model/estimate-cost accepts optional params', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: {
        task: 'analyze data',
        context: 'large dataset',
        tokenBudget: 100000,
        roleCount: 3,
        allowedModels: ['claude-sonnet-4-20250514'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.roleCount).toBe(3);
  });

  // ── GET /api/v1/model/info includes localFirst ─────────────────────────────

  it('GET /api/v1/model/info includes localFirst in current', async () => {
    const mock = createMockSecureYeoman({ localFirst: true });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/info' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.current.localFirst).toBe(true);
  });

  it('GET /api/v1/model/info includes localFirst=false by default', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/model/info' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.current.localFirst).toBe(false);
  });

  // ── PATCH /api/v1/model/config ─────────────────────────────────────────────

  it('PATCH /api/v1/model/config succeeds with localFirst: true', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/model/config',
      payload: { localFirst: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.localFirst).toBe(true);
    expect(mock.setLocalFirst).toHaveBeenCalledWith(true);
  });

  it('PATCH /api/v1/model/config succeeds with localFirst: false', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/model/config',
      payload: { localFirst: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.localFirst).toBe(false);
  });

  it('PATCH /api/v1/model/config returns 400 if localFirst is missing', async () => {
    const mock = createMockSecureYeoman();
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/model/config',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('localFirst');
  });

  it('PATCH /api/v1/model/config returns 500 on setLocalFirst error', async () => {
    const mock = createMockSecureYeoman({ setLocalFirstError: 'storage error' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/model/config',
      payload: { localFirst: true },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload).message).toContain('storage error');
  });

  // ── POST /api/v1/model/ollama/pull ─────────────────────────────────────────

  it('POST /api/v1/model/ollama/pull streams progress events for ollama provider', async () => {
    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/ollama/pull',
      payload: { model: 'phi3:mini' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('data:');
  });

  it('POST /api/v1/model/ollama/pull returns 400 for non-ollama provider', async () => {
    const mock = createMockSecureYeoman({ provider: 'anthropic' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/ollama/pull',
      payload: { model: 'llama3:latest' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).message).toContain('Ollama');
  });

  it('POST /api/v1/model/ollama/pull returns 400 when model is missing', async () => {
    const mock = createMockSecureYeoman({ provider: 'ollama' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/ollama/pull',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  // ── DELETE /api/v1/model/ollama/:name ──────────────────────────────────────

  it('DELETE /api/v1/model/ollama/:name returns 204 on success', async () => {
    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/model/ollama/llama3%3Alatest',
    });

    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/model/ollama/:name returns 400 for non-ollama provider', async () => {
    const mock = createMockSecureYeoman({ provider: 'anthropic' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/model/ollama/llama3%3Alatest',
    });

    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/model/ollama/:name returns 404 for unknown model', async () => {
    // Override deleteModel to throw "Model not found"
    const { OllamaProvider } = await import('./providers/ollama.js');
    vi.mocked(OllamaProvider.deleteModel).mockRejectedValueOnce(new Error('Model not found'));

    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/model/ollama/nonexistent',
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.payload).message).toBe('Model not found');
  });

  it('DELETE /api/v1/model/ollama/:name returns 500 for generic error', async () => {
    const { OllamaProvider } = await import('./providers/ollama.js');
    vi.mocked(OllamaProvider.deleteModel).mockRejectedValueOnce(new Error('Connection refused'));

    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/model/ollama/llama3%3Alatest',
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload).message).toContain('Connection refused');
  });

  // ── AI Health — local providers ──────────────────────────────────────────

  it('GET /api/v1/ai/health returns reachable for local ollama provider', async () => {
    const mock = createMockSecureYeoman({
      provider: 'ollama',
      model: 'llama3:latest',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    // fetch for health check returns ok, then fetchAvailableModels returns model info
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [{ name: 'llama3:latest', size: 4700000000 }],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('reachable');
    expect(body.provider).toBe('ollama');
    expect(body.local).toBe(true);
    expect(body.baseUrl).toBe('http://localhost:11434');
    expect(body.latencyMs).toBeDefined();
  });

  it('GET /api/v1/ai/health returns unreachable for local provider when fetch fails', async () => {
    const mock = createMockSecureYeoman({
      provider: 'ollama',
      model: 'llama3:latest',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('unreachable');
    expect(body.local).toBe(true);
  });

  it('GET /api/v1/ai/health uses lmstudio default URL', async () => {
    const mock = createMockSecureYeoman({
      provider: 'lmstudio',
      model: 'my-model',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/v1/models')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.baseUrl).toBe('http://localhost:1234');
    expect(body.local).toBe(true);
  });

  it('GET /api/v1/ai/health uses localai default URL', async () => {
    const mock = createMockSecureYeoman({
      provider: 'localai',
      model: 'my-model',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/v1/models')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.baseUrl).toBe('http://localhost:8080');
    expect(body.local).toBe(true);
  });

  it('GET /api/v1/ai/health uses custom baseUrl when provided', async () => {
    const mock = createMockSecureYeoman({
      provider: 'ollama',
      model: 'llama3:latest',
      baseUrl: 'http://gpu-server:11434',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('gpu-server')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [{ name: 'llama3:latest', size: 4700000000 }],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.baseUrl).toBe('http://gpu-server:11434');
  });

  it('GET /api/v1/ai/health returns configured for cloud provider with key', async () => {
    const mock = createMockSecureYeoman({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('configured');
    expect(body.local).toBe(false);
    expect(body.provider).toBe('anthropic');
  });

  it('GET /api/v1/ai/health returns missing_key for cloud provider without key', async () => {
    // Temporarily remove key
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const mock = createMockSecureYeoman({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('missing_key');

    if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('GET /api/v1/ai/health returns 500 on error', async () => {
    const mock = createMockSecureYeoman({ getConfigError: 'config broken' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(500);
  });

  // ── Ollama pull error streaming ──────────────────────────────────────────

  it('POST /api/v1/model/ollama/pull streams error when pull throws', async () => {
    const { OllamaProvider } = await import('./providers/ollama.js');
    vi.mocked(OllamaProvider.pull).mockImplementation(async function* () {
      throw new Error('Network timeout');
    });

    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest' });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/ollama/pull',
      payload: { model: 'phi3:mini' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('error');
    expect(res.payload).toContain('Network timeout');
  });

  it('POST /api/v1/model/ollama/pull uses default baseUrl when baseUrl is unset', async () => {
    const { OllamaProvider } = await import('./providers/ollama.js');
    vi.mocked(OllamaProvider.pull).mockImplementation(async function* () {
      yield { status: 'done' };
    });

    // baseUrl is undefined in config
    const mock = createMockSecureYeoman({ provider: 'ollama', model: 'llama3:latest', baseUrl: undefined });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/ollama/pull',
      payload: { model: 'phi3:mini' },
    });

    expect(res.statusCode).toBe(200);
    // OllamaProvider.pull should have been called with default URL
    expect(OllamaProvider.pull).toHaveBeenCalledWith('http://localhost:11434', 'phi3:mini');
  });

  // ── POST /api/v1/model/estimate-cost error path ──────────────────────────

  it('POST /api/v1/model/estimate-cost returns 500 on internal error', async () => {
    const mock = createMockSecureYeoman({
      costCalculator: {
        calculate: vi.fn().mockImplementation(() => {
          throw new Error('calculator exploded');
        }),
        getModelCosts: vi.fn().mockReturnValue([]),
      },
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/model/estimate-cost',
      payload: { task: 'analyze data' },
    });
    expect(res.statusCode).toBe(500);
  });

  // ── Ollama memory warning branch ─────────────────────────────────────────

  it('GET /api/v1/ai/health returns modelSize when model found', async () => {
    const mock = createMockSecureYeoman({
      provider: 'ollama',
      model: 'llama3',
    });
    registerModelRoutes(app, { secureYeoman: mock });

    const { OllamaProvider } = await import('./providers/ollama.js');
    vi.mocked(OllamaProvider.fetchAvailableModels).mockResolvedValueOnce([
      { id: 'llama3:latest', name: 'llama3:latest', size: 4700000000, provider: 'ollama', inputPer1M: 0, outputPer1M: 0 },
    ]);

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/tags')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/ai/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.modelSize).toBe(4700000000);
  });
});
