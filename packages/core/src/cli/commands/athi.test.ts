/**
 * ATHI CLI command tests — Phase 107-F
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { athiCommand } from './athi.js';

function createStreams() {
  let stdoutBuf = '';
  let stderrBuf = '';
  const stdout = {
    write: (s: string) => {
      stdoutBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  const stderr = {
    write: (s: string) => {
      stderrBuf += s;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stdout, stderr, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

function mockFetch(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => data,
    })
  );
}

describe('athi command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── help ──────────────────────────────────────────────────────

  it('prints help with --help', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['--help'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman athi');
    expect(getStdout()).toContain('list');
    expect(getStdout()).toContain('matrix');
    expect(getStdout()).toContain('summary');
  });

  it('prints help with -h', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['-h'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('secureyeoman athi');
  });

  it('prints help for unknown subcommand', async () => {
    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['unknown'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStdout()).toContain('secureyeoman athi');
  });

  // ── list ──────────────────────────────────────────────────────

  it('lists scenarios in table format', async () => {
    mockFetch({
      items: [
        {
          id: 'athi-001',
          title: 'Prompt Injection',
          actor: 'cybercriminal',
          riskScore: 20,
          status: 'identified',
        },
      ],
      total: 1,
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['list'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('ATHI Threat Scenarios');
    expect(getStdout()).toContain('Prompt Injection');
  });

  it('lists scenarios as JSON with --json', async () => {
    mockFetch({ items: [], total: 0 });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['list', '--json'], stdout, stderr });
    expect(code).toBe(0);
    const parsed = JSON.parse(getStdout());
    expect(parsed.total).toBe(0);
  });

  it('passes --actor filter', async () => {
    mockFetch({ items: [], total: 0 });

    const { stdout, stderr } = createStreams();
    await athiCommand.run({ argv: ['list', '--actor', 'insider'], stdout, stderr });

    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('actor=insider');
  });

  it('passes --status filter', async () => {
    mockFetch({ items: [], total: 0 });

    const { stdout, stderr } = createStreams();
    await athiCommand.run({ argv: ['list', '--status', 'mitigated'], stdout, stderr });

    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('status=mitigated');
  });

  // ── show ──────────────────────────────────────────────────────

  it('shows scenario details', async () => {
    mockFetch({
      scenario: {
        id: 'athi-1',
        title: 'Model Theft',
        actor: 'nation_state',
        techniques: ['model_theft'],
        harms: ['data_breach'],
        impacts: ['ip_theft'],
        likelihood: 5,
        severity: 5,
        riskScore: 25,
        status: 'identified',
        mitigations: [{ description: 'Encrypt weights', status: 'implemented' }],
      },
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['show', 'athi-1'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Model Theft');
    expect(getStdout()).toContain('nation_state');
    expect(getStdout()).toContain('Encrypt weights');
  });

  it('shows error when id missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await athiCommand.run({ argv: ['show'], stdout, stderr });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Usage');
  });

  // ── create ────────────────────────────────────────────────────

  it('creates a scenario', async () => {
    mockFetch({ scenario: { id: 'new-1', riskScore: 9 } });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({
      argv: ['create', '--title', 'Test Threat', '--actor', 'insider'],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(getStdout()).toContain('Created scenario');
  });

  it('returns error when title missing', async () => {
    const { stdout, stderr, getStderr } = createStreams();
    const code = await athiCommand.run({
      argv: ['create', '--actor', 'insider'],
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(getStderr()).toContain('Required');
  });

  it('creates with custom techniques/harms/impacts', async () => {
    mockFetch({ scenario: { id: 'new-2', riskScore: 15 } });

    const { stdout, stderr } = createStreams();
    await athiCommand.run({
      argv: [
        'create',
        '--title',
        'Complex',
        '--actor',
        'nation_state',
        '--techniques',
        'model_theft,supply_chain',
        '--harms',
        'data_breach,financial_loss',
        '--impacts',
        'ip_theft,legal_liability',
        '--likelihood',
        '4',
        '--severity',
        '5',
      ],
      stdout,
      stderr,
    });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.techniques).toEqual(['model_theft', 'supply_chain']);
    expect(body.harms).toEqual(['data_breach', 'financial_loss']);
    expect(body.impacts).toEqual(['ip_theft', 'legal_liability']);
    expect(body.likelihood).toBe(4);
    expect(body.severity).toBe(5);
  });

  // ── matrix ────────────────────────────────────────────────────

  it('displays risk matrix', async () => {
    mockFetch({
      matrix: [
        {
          actor: 'cybercriminal',
          technique: 'prompt_injection',
          avgRiskScore: 15,
          maxRiskScore: 20,
          count: 3,
        },
      ],
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['matrix'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('ATHI Risk Matrix');
    expect(getStdout()).toContain('cybercriminal');
    expect(getStdout()).toContain('prompt_injection');
  });

  it('displays matrix as JSON', async () => {
    mockFetch({ matrix: [] });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['matrix', '--json'], stdout, stderr });
    expect(code).toBe(0);
    expect(JSON.parse(getStdout()).matrix).toEqual([]);
  });

  // ── summary ───────────────────────────────────────────────────

  it('displays executive summary', async () => {
    mockFetch({
      summary: {
        totalScenarios: 10,
        averageRiskScore: 12.5,
        mitigationCoverage: 60,
        byStatus: { identified: 5, mitigated: 3, accepted: 2 },
        byActor: { cybercriminal: 4, insider: 3, nation_state: 3 },
        topRisks: [{ riskScore: 25, title: 'Critical Threat' }],
      },
    });

    const { stdout, stderr, getStdout } = createStreams();
    const code = await athiCommand.run({ argv: ['summary'], stdout, stderr });
    expect(code).toBe(0);
    expect(getStdout()).toContain('ATHI Executive Summary');
    expect(getStdout()).toContain('10');
    expect(getStdout()).toContain('60%');
    expect(getStdout()).toContain('Critical Threat');
  });
});
