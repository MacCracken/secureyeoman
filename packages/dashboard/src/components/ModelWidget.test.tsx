// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModelWidget } from './ModelWidget';
import { createModelInfoResponse } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchModelInfo: vi.fn(),
  switchModel: vi.fn(),
  patchModelConfig: vi.fn(),
  fetchOllamaPull: vi.fn().mockReturnValue((async function* () {})()),
  deleteOllamaModel: vi.fn(),
  fetchProviderHealth: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchModelInfo = vi.mocked(api.fetchModelInfo);
const mockSwitchModel = vi.mocked(api.switchModel);
const mockFetchProviderHealth = vi.mocked(api.fetchProviderHealth);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent(onClose = vi.fn()) {
  const qc = createQueryClient();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <ModelWidget onClose={onClose} />
      </QueryClientProvider>
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('ModelWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchModelInfo.mockResolvedValue(createModelInfoResponse());
    mockSwitchModel.mockResolvedValue({ success: true, model: 'openai/gpt-4o' });
    mockFetchProviderHealth.mockResolvedValue({});
  });

  it('renders current model info', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Model Selection')).toBeInTheDocument();
    });

    expect(screen.getByText('Current Model')).toBeInTheDocument();
    // The model name appears in both the current section and the list, so use getAllByText
    const modelElements = screen.getAllByText(/claude-sonnet-4-20250514/);
    expect(modelElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows provider sections', async () => {
    renderComponent();

    await waitFor(() => {
      // Use getAllByText since "Anthropic" appears in current model badge too
      const elements = screen.getAllByText(/Anthropic/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/Ollama/)).toBeInTheDocument();
  });

  it('calls switchModel when a different model is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    });

    // Expand OpenAI section
    await user.click(screen.getByText(/OpenAI/));

    // Click gpt-4o
    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
    await user.click(screen.getByText('gpt-4o'));

    expect(mockSwitchModel).toHaveBeenCalled();
    const call = mockSwitchModel.mock.calls[0][0];
    expect(call).toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('shows pricing information for models', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/\$3 \/ \$15 per 1M tokens/)).toBeInTheDocument();
    });
  });

  it('shows free label for ollama', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Ollama/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Ollama/));

    await waitFor(() => {
      expect(screen.getByText('Free')).toBeInTheDocument();
    });
  });

  // ── Collapse / Expand ───────────────────────────────────────────

  it('auto-expands current provider and shows its models', async () => {
    renderComponent();

    // Current provider is anthropic — its models should be visible after load
    // Use claude-opus which only appears in the expandable list (not in the Current Model header)
    await waitFor(() => {
      expect(screen.getByText('claude-opus-4-20250514')).toBeInTheDocument();
    });
  });

  it('collapses the current provider when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Wait for models to appear (provider auto-expanded)
    // Use claude-opus which only appears in the expandable list
    await waitFor(() => {
      expect(screen.getByText('claude-opus-4-20250514')).toBeInTheDocument();
    });

    // Click Anthropic header to collapse
    const anthropicButtons = screen.getAllByText(/Anthropic/);
    const providerButton = anthropicButtons.find((el) =>
      el.closest('button')?.classList.contains('w-full')
    )!;
    await user.click(providerButton);

    // Model list items should no longer be visible
    await waitFor(() => {
      expect(screen.queryByText('claude-opus-4-20250514')).not.toBeInTheDocument();
    });
  });

  it('expands a collapsed provider when clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    });

    // OpenAI should be collapsed initially — no model visible
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText(/OpenAI/));

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });

  it('collapses an expanded non-current provider when clicked again', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    });

    // Expand OpenAI
    await user.click(screen.getByText(/OpenAI/));
    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    // Collapse OpenAI
    await user.click(screen.getByText(/OpenAI/));
    await waitFor(() => {
      expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    });
  });

  it('can re-expand the current provider after collapsing', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Wait for auto-expand — use claude-opus which only appears in the list
    await waitFor(() => {
      expect(screen.getByText('claude-opus-4-20250514')).toBeInTheDocument();
    });

    // Collapse
    const anthropicButtons = screen.getAllByText(/Anthropic/);
    const providerButton = anthropicButtons.find((el) =>
      el.closest('button')?.classList.contains('w-full')
    )!;
    await user.click(providerButton);
    await waitFor(() => {
      expect(screen.queryByText('claude-opus-4-20250514')).not.toBeInTheDocument();
    });

    // Re-expand
    await user.click(providerButton);
    await waitFor(() => {
      expect(screen.getByText('claude-opus-4-20250514')).toBeInTheDocument();
    });
  });

  // ── Provider Health Indicators (Phase 119) ─────────────────────

  it('renders health indicator dots next to providers', async () => {
    mockFetchProviderHealth.mockResolvedValue({
      anthropic: {
        errorRate: 0.02,
        p95LatencyMs: 450,
        status: 'healthy',
        consecutiveFailures: 0,
        totalRequests: 100,
      },
      openai: {
        errorRate: 0.15,
        p95LatencyMs: 1200,
        status: 'degraded',
        consecutiveFailures: 2,
        totalRequests: 80,
      },
    });

    renderComponent();

    await waitFor(() => {
      const elements = screen.getAllByText(/Anthropic/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    // Health dots should be rendered with appropriate tooltip titles
    await waitFor(() => {
      const healthyDot = document.querySelector('.bg-green-500');
      expect(healthyDot).toBeInTheDocument();
      const degradedDot = document.querySelector('.bg-amber-500');
      expect(degradedDot).toBeInTheDocument();
    });
  });
});
