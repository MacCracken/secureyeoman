// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';
import { createSoulConfig } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchSoulConfig: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchAuditStats: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSoulConfig = vi.mocked(api.fetchSoulConfig);
const mockFetchMcpServers = vi.mocked(api.fetchMcpServers);
const mockFetchAuditStats = vi.mocked(api.fetchAuditStats);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SettingsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSoulConfig.mockResolvedValue(createSoulConfig());
    mockFetchMcpServers.mockResolvedValue({ servers: [], total: 0 });
    mockFetchAuditStats.mockResolvedValue({
      totalEntries: 1000,
      chainValid: true,
      lastVerification: Date.now(),
    });
  });

  it('renders the Settings heading', async () => {
    renderComponent();
    expect(await screen.findByText('General Settings')).toBeInTheDocument();
    expect(screen.getByText('System configuration and preferences')).toBeInTheDocument();
  });

  it('renders soul config section when config is loaded', async () => {
    renderComponent();

    expect(await screen.findByText('Soul System')).toBeInTheDocument();
    const enabledElements = screen.getAllByText('Enabled');
    expect(enabledElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('observe, suggest')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('4,096')).toBeInTheDocument();
  });

  it('renders MCP servers section', async () => {
    renderComponent();

    expect(await screen.findByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getAllByText('0 servers').length).toBe(2);
  });
});
