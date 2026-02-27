// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  useTheme: () => ({ theme: 'dark', isDark: true, setTheme: vi.fn(), toggle: vi.fn() }),
  THEMES: [],
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
      allowDesktopControl: false,
      allowCamera: false,
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
  allowNetworkTools: false,
  allowNetBoxWrite: false,
  allowWorkflows: false,
  allowCommunityGitFetch: false,
  allowTwingate: false,
  allowOrgIntent: false,
  allowIntentEditor: false,
  allowCodeEditor: true,
  allowAdvancedEditor: false,
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

  it('shows a Mission Control nav link pointing to /metrics', async () => {
    renderSidebar();

    const mcLink = await screen.findByRole('link', { name: /mission control/i });
    expect(mcLink).toBeInTheDocument();
    expect(mcLink).toHaveAttribute('href', '/metrics');
  });

  it('Mission Control link appears before Security in nav order', async () => {
    renderSidebar();

    const mcLink = await screen.findByRole('link', { name: /mission control/i });
    // Use the first /security/ link (top-nav "Security"), not the admin "Security settings" link
    await screen.findAllByRole('link', { name: /security/i });
    const securityLink = screen.getAllByRole('link', { name: /security/i })[0];

    const links = Array.from(document.querySelectorAll('a')) as HTMLElement[];
    expect(links.indexOf(mcLink)).toBeLessThan(links.indexOf(securityLink));
  });

  it('Developers is hidden when no developer features are enabled', async () => {
    renderSidebar();

    await screen.findByRole('link', { name: /mission control/i });
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

  it('shows an Automation nav link pointing to /automation', async () => {
    renderSidebar();
    const link = await screen.findByRole('link', { name: /^automation$/i });
    expect(link).toHaveAttribute('href', '/automation');
  });

  it('Automation link appears before Skills in nav order', async () => {
    renderSidebar();
    const automationLink = await screen.findByRole('link', { name: /^automation$/i });
    const skillsLink = await screen.findByRole('link', { name: /skills/i });
    const links = Array.from(document.querySelectorAll('a')) as HTMLElement[];
    expect(links.indexOf(automationLink)).toBeLessThan(links.indexOf(skillsLink));
  });

  it('shows Editor link when allowCodeEditor is true (default)', async () => {
    renderSidebar();
    const editorLink = await screen.findByRole('link', { name: /^editor$/i });
    expect(editorLink).toBeInTheDocument();
    expect(editorLink).toHaveAttribute('href', '/editor');
  });

  it('hides Editor link when allowCodeEditor is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      ...BASE_POLICY,
      allowCodeEditor: false,
    } as any);

    renderSidebar();

    // Wait for the policy query to resolve and the component to update
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /^editor$/i })).not.toBeInTheDocument();
    });
  });

  it('shows a Theme button in the profile dropdown', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const u = user.setup();
    renderSidebar();

    // Open the profile dropdown
    const profileBtn = await screen.findByRole('button', { name: /user menu/i });
    await u.click(profileBtn);

    expect(await screen.findByRole('menuitem', { name: /theme/i })).toBeInTheDocument();
  });
});
