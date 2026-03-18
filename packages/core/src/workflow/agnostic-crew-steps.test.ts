import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from './workflow-engine.js';
import type { AgnosticEngineConfig, WorkflowEngineDeps } from './workflow-engine.js';
import type { WorkflowDefinition, WorkflowRun } from '@secureyeoman/shared';

const noopLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => noopLogger,
} as any;

const mockStorage = {
  updateRun: vi.fn().mockResolvedValue(undefined),
  updateStepRun: vi.fn().mockResolvedValue(undefined),
  createStepRun: vi.fn().mockResolvedValue({ id: 'sr-1' }),
  getRun: vi.fn().mockResolvedValue(null),
  getDefinition: vi.fn().mockResolvedValue(null),
} as any;

function makeEngine(agnosticConfig?: AgnosticEngineConfig): WorkflowEngine {
  const deps: WorkflowEngineDeps = {
    storage: mockStorage,
    logger: noopLogger,
    agnosticConfig: agnosticConfig ?? null,
  };
  return new WorkflowEngine(deps);
}

function makeDefinition(steps: any[]): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: '',
    steps,
    edges: [],
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: 'test',
  } as WorkflowDefinition;
}

function makeRun(input: Record<string, unknown> = {}): WorkflowRun {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'pending',
    input,
    createdAt: Date.now(),
  } as WorkflowRun;
}

const originalFetch = global.fetch;

describe('agnostic_crew workflow step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails step when agnostic is not configured', async () => {
    const engine = makeEngine(); // no config
    const def = makeDefinition([{
      id: 'crew',
      type: 'agnostic_crew',
      name: 'Run QA Crew',
      config: { preset: 'qa-standard', title: 'QA run' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);
    // Engine catches the error and marks run as failed
    expect(mockStorage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('submits crew and returns crewId', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ crew_id: 'crew-abc', status: 'queued' }),
      });
    global.fetch = fetchMock;

    const engine = makeEngine({
      url: 'http://agnostic:8000',
      apiKey: 'test-key',
    });

    const def = makeDefinition([{
      id: 'crew',
      type: 'agnostic_crew',
      name: 'Run QA Crew',
      config: { preset: 'qa-standard', title: 'QA analysis', description: 'Test run' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://agnostic:8000/api/v1/crews',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses API key auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ crew_id: 'c1', status: 'queued' }),
    });
    global.fetch = fetchMock;

    const engine = makeEngine({ url: 'http://agnostic:8000', apiKey: 'my-api-key' });
    const def = makeDefinition([{
      id: 'crew',
      type: 'agnostic_crew',
      name: 'Crew',
      config: { preset: 'qa-lean', title: 'test' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);

    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['X-API-Key']).toBe('my-api-key');
  });

  it('resolves template variables in config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ crew_id: 'c1', status: 'queued' }),
    });
    global.fetch = fetchMock;

    const engine = makeEngine({ url: 'http://agnostic:8000', apiKey: 'key' });
    const def = makeDefinition([{
      id: 'crew',
      type: 'agnostic_crew',
      name: 'Crew',
      config: {
        preset: 'qa-standard',
        title: 'QA for {{input.project}}',
        targetUrl: '{{input.url}}',
      },
      dependsOn: [],
    }]);

    await engine.execute(makeRun({ project: 'MyApp', url: 'https://myapp.com' }), def);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title).toBe('QA for MyApp');
    expect(body.target_url).toBe('https://myapp.com');
  });

  it('fails step on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const engine = makeEngine({ url: 'http://agnostic:8000', apiKey: 'key' });
    const def = makeDefinition([{
      id: 'crew',
      type: 'agnostic_crew',
      name: 'Crew',
      config: { preset: 'qa', title: 'test' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);
    expect(mockStorage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});

describe('agnostic_crew_wait workflow step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails step when agnostic is not configured', async () => {
    const engine = makeEngine();
    const def = makeDefinition([{
      id: 'wait',
      type: 'agnostic_crew_wait',
      name: 'Wait for crew',
      config: { crewId: 'crew-123' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);
    expect(mockStorage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('fails step when crewId is empty', async () => {
    const engine = makeEngine({ url: 'http://agnostic:8000', apiKey: 'key' });
    const def = makeDefinition([{
      id: 'wait',
      type: 'agnostic_crew_wait',
      name: 'Wait',
      config: { crewId: '' },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);
    expect(mockStorage.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('polls until completion', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const status = callCount >= 3 ? 'completed' : 'running';
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status, results: { score: 95 } }),
      });
    });

    const engine = makeEngine({
      url: 'http://agnostic:8000',
      apiKey: 'key',
      pollIntervalMs: 10,
      timeoutMs: 5000,
    });
    const def = makeDefinition([{
      id: 'wait',
      type: 'agnostic_crew_wait',
      name: 'Wait',
      config: { crewId: 'crew-123', pollIntervalMs: 10, timeoutMs: 5000 },
      dependsOn: [],
    }]);

    await engine.execute(makeRun(), def);
    // Should have polled at least 3 times (2 running + 1 completed) + 1 final fetch
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('resolves crewId from template', async () => {
    let _callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      _callCount++;
      if (url.includes('/api/v1/crews')) {
        if (url.includes('crew-from-input')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'completed', results: {} }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ crew_id: 'crew-from-input', status: 'queued' }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    });

    const engine = makeEngine({
      url: 'http://agnostic:8000',
      apiKey: 'key',
      pollIntervalMs: 10,
      timeoutMs: 5000,
    });
    const def = makeDefinition([{
      id: 'wait',
      type: 'agnostic_crew_wait',
      name: 'Wait',
      config: { crewId: '{{input.crew_id}}', pollIntervalMs: 10, timeoutMs: 5000 },
      dependsOn: [],
    }]);

    await engine.execute(makeRun({ crew_id: 'crew-from-input' }), def);

    // Verify it polled with the resolved crewId
    const pollCalls = (global.fetch as any).mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('crew-from-input')
    );
    expect(pollCalls.length).toBeGreaterThanOrEqual(1);
  });
});
