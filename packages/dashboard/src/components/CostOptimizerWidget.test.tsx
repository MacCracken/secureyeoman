/**
 * CostOptimizerWidget — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CostOptimizerWidget } from './CostOptimizerWidget';

vi.mock('../api/client', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockAnalysis = {
  totalCostUsd: 25,
  dailyAverageCostUsd: 3.5,
  topModels: [
    { model: 'anthropic/claude-opus-4-20250514', costUsd: 15, callCount: 30 },
    { model: 'openai/gpt-4o', costUsd: 10, callCount: 50 },
  ],
  perModelStats: [
    {
      provider: 'anthropic',
      model: 'claude-opus-4-20250514',
      calls: 30,
      totalTokens: 60000,
      totalCostUsd: 15,
      avgCostPerCall: 0.5,
      avgOutputTokens: 200,
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      calls: 50,
      totalTokens: 100000,
      totalCostUsd: 10,
      avgCostPerCall: 0.2,
      avgOutputTokens: 800,
    },
  ],
  workloadBreakdown: { simple: 40, moderate: 45, complex: 15 },
  potentialSavingsUsd: 12,
  routingSuggestions: [
    {
      currentModel: 'claude-opus-4-20250514',
      currentProvider: 'anthropic',
      suggestedModel: 'claude-haiku-3-5-20241022',
      suggestedProvider: 'anthropic',
      affectedCalls: 30,
      currentCostUsd: 15,
      projectedCostUsd: 3,
      savingsUsd: 12,
      savingsPercent: 80,
      reason: '30 calls averaged 200 output tokens',
    },
  ],
  forecast: {
    dailyProjected: 3.5,
    weeklyProjected: 24.5,
    monthlyProjected: 105,
    trend: 'increasing' as const,
    confidence: 0.71,
  },
  recommendations: [],
  analyzedAt: Date.now(),
};

describe('CostOptimizerWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );
    render(<CostOptimizerWidget />, { wrapper });
    expect(screen.getByText(/Loading cost analysis/i)).toBeTruthy();
  });

  it('renders forecast summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysis,
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('$3.50')).toBeTruthy();
      expect(screen.getByText('$24.50')).toBeTruthy();
      expect(screen.getByText('$105.00')).toBeTruthy();
      expect(screen.getByText(/increasing/)).toBeTruthy();
    });
  });

  it('renders top models by cost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysis,
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('claude-opus-4-20250514')).toBeTruthy();
      expect(screen.getByText('gpt-4o')).toBeTruthy();
      expect(screen.getByText('$15.00')).toBeTruthy();
    });
  });

  it('renders routing suggestions with savings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysis,
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      // "Save $12.00" appears in both the header and suggestion — just verify at least one
      const saveEls = screen.getAllByText(/Save \$/);
      expect(saveEls.length).toBeGreaterThan(0);
      // Verify the suggestion details area
      expect(screen.getByText(/30 calls/)).toBeTruthy();
    });
  });

  it('renders workload breakdown percentages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysis,
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Simple 40%')).toBeTruthy();
      expect(screen.getByText('Moderate 45%')).toBeTruthy();
      expect(screen.getByText('Complex 15%')).toBeTruthy();
    });
  });

  it('shows error state when API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeTruthy();
    });
  });

  it('shows optimal message when no routing suggestions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockAnalysis,
          routingSuggestions: [],
          potentialSavingsUsd: 0,
        }),
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('All usage is optimal')).toBeTruthy();
    });
  });

  it('shows no usage data when perModelStats is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockAnalysis,
          perModelStats: [],
        }),
      })
    );
    render(<CostOptimizerWidget />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('No usage data')).toBeTruthy();
    });
  });
});
