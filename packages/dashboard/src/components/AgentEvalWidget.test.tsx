/**
 * Tests for AgentEvalWidget — Phase 135
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentEvalWidget } from './AgentEvalWidget';

// Mock auth
vi.mock('../api/client', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('AgentEvalWidget', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 0 }),
    });
  });

  it('renders heading', () => {
    render(<AgentEvalWidget />, { wrapper });
    expect(screen.getByText('Agent Evaluation')).toBeInTheDocument();
  });

  it('renders suite selector', () => {
    render(<AgentEvalWidget />, { wrapper });
    expect(screen.getByLabelText('Suite:')).toBeInTheDocument();
  });

  it('renders run history table headers', () => {
    render(<AgentEvalWidget />, { wrapper });
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('shows "All suites" as default option', () => {
    render(<AgentEvalWidget />, { wrapper });
    const select = screen.getByLabelText('Suite:') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('does not show Run Suite button when no suite selected', () => {
    render(<AgentEvalWidget />, { wrapper });
    expect(screen.queryByText('Run Suite')).not.toBeInTheDocument();
  });

  it('shows Run Suite button when a suite is selected', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/eval/suites')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [{ id: 'suite-1', name: 'Test Suite', scenarioIds: [], concurrency: 1 }],
              total: 1,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });
    });

    render(<AgentEvalWidget />, { wrapper });

    // Wait for suites to load
    await screen.findByText('Test Suite');

    const user = userEvent.setup();
    const select = screen.getByLabelText('Suite:');
    await user.selectOptions(select, 'suite-1');

    expect(screen.getByText('Run Suite')).toBeInTheDocument();
  });

  it('renders run rows when data is available', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // suites + runs
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items:
                callCount === 2
                  ? [
                      {
                        id: 'run-1',
                        suiteId: 'suite-1',
                        suiteName: 'Basic Suite',
                        passed: true,
                        totalScenarios: 3,
                        passedCount: 3,
                        failedCount: 0,
                        errorCount: 0,
                        totalDurationMs: 5000,
                        totalTokens: 100,
                        totalCostUsd: 0.01,
                        startedAt: Date.now(),
                        completedAt: Date.now(),
                        results: [],
                      },
                    ]
                  : [],
              total: callCount === 2 ? 1 : 0,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });
    });

    render(<AgentEvalWidget />, { wrapper });
    await screen.findByText('Basic Suite');
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });
});
