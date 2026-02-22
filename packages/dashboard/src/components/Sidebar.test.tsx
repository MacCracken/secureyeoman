// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── Mock hooks ───────────────────────────────────────────────────────

vi.mock('../hooks/useSidebar', () => ({
  useSidebar: () => ({
    collapsed: false,
    toggleCollapse: vi.fn(),
    mobileOpen: false,
    setMobileOpen: vi.fn(),
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggle: vi.fn() }),
}));

// ── Mock sub-components ──────────────────────────────────────────────

vi.mock('./Logo', () => ({
  Logo: () => <span>Logo</span>,
}));

vi.mock('./NewEntityDialog', () => ({
  NewEntityDialog: () => null,
}));

// ── Mock API client ──────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  getAccessToken: vi.fn().mockReturnValue(null),
  fetchExtensionConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  fetchProactiveConfig: vi.fn(),
  fetchHealth: vi.fn(),
}));

import * as api from '../api/client';
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExtensionConfig = vi.mocked(api.fetchExtensionConfig);
const mockFetchProactiveConfig = vi.mocked(api.fetchProactiveConfig);
const mockFetchHealth = vi.mocked(api.fetchHealth);

// ── Import after mocks ───────────────────────────────────────────────

import { Sidebar } from './Sidebar';

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

const BASE_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowMultimodal: false,
  allowExtensions: false,
  allowExperiments: false,
  allowStorybook: false,
  allowProactive: false,
  allowSubAgentProfiles: false,
  allowDynamicTools: false,
  sandboxDynamicTools: false,
  allowAnomalyDetection: false,
  sandboxGvisor: false,
  sandboxWasm: false,
  sandboxCredentialProxy: false,
};

function renderSidebar() {
  // Stub the agents profiles fetch
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ profiles: [] }) } as Response)
  );

  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <Sidebar
          isConnected
          wsConnected
          reconnecting={false}
          onRefresh={vi.fn()}
          onLogout={vi.fn()}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Sidebar nav order', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSecurityPolicy.mockResolvedValue(BASE_POLICY as any);
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: false } } as any);
    mockFetchProactiveConfig.mockResolvedValue({ config: { enabled: false } } as any);
    mockFetchHealth.mockResolvedValue({ version: '1.0.0' } as any);
  });

  it('Costs appears above Developers when Developers is visible', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowExtensions: true,
    } as any);

    renderSidebar();

    const costsLink = await screen.findByRole('link', { name: /costs/i });
    const devLink = await screen.findByRole('link', { name: /developers/i });

    const links = Array.from(document.querySelectorAll('a'));
    const costsIdx = links.indexOf(costsLink);
    const devIdx = links.indexOf(devLink);

    expect(costsIdx).toBeLessThan(devIdx);
  });

  it('Costs is present even when Developers is hidden', async () => {
    renderSidebar();

    expect(await screen.findByRole('link', { name: /costs/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /developers/i })).not.toBeInTheDocument();
  });

  it('Developers is hidden when no developer features are enabled', async () => {
    renderSidebar();

    await screen.findByRole('link', { name: /costs/i });
    expect(screen.queryByRole('link', { name: /developers/i })).not.toBeInTheDocument();
  });

  it('Developers is shown when allowExtensions is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowExtensions: true,
    } as any);

    renderSidebar();

    expect(await screen.findByRole('link', { name: /developers/i })).toBeInTheDocument();
  });
});
