// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createMetricsSnapshot } from '../test/mocks';

// ── Mock lazy-loaded route components ────────────────────────────────

vi.mock('./MetricsPage', () => ({
  MetricsPage: () => <div data-testid="metrics-page">MetricsPage</div>,
}));

vi.mock('./SecurityPage', () => ({
  SecurityPage: () => <div>SecurityPage</div>,
}));

vi.mock('./PersonalityEditor', () => ({
  PersonalityEditor: () => <div>PersonalityEditor</div>,
}));

vi.mock('./EditorPage', () => ({
  EditorPage: () => <div>EditorPage</div>,
}));

vi.mock('./ChatPage', () => ({
  ChatPage: () => <div>ChatPage</div>,
}));

vi.mock('./SettingsPage', () => ({
  SettingsPage: () => <div>SettingsPage</div>,
}));

vi.mock('./SkillsPage', () => ({
  SkillsPage: () => <div>SkillsPage</div>,
}));

vi.mock('./ConnectionsPage', () => ({
  ConnectionsPage: () => <div>ConnectionsPage</div>,
}));

vi.mock('./AgentsPage', () => ({
  AgentsPage: () => <div>AgentsPage</div>,
}));

vi.mock('./ExperimentsPage', () => ({
  ExperimentsPage: () => <div>ExperimentsPage</div>,
}));

// ── Mock hooks and layout components ─────────────────────────────────

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('../hooks/useSidebar', () => ({
  useSidebar: () => ({ collapsed: false, setMobileOpen: vi.fn() }),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connected: true, reconnecting: false }),
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock('./SearchBar', () => ({
  SearchBar: () => <div>SearchBar</div>,
}));

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <div>NotificationBell</div>,
}));

vi.mock('./OnboardingWizard', () => ({
  OnboardingWizard: () => <div>OnboardingWizard</div>,
}));

vi.mock('./common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Mock API client ──────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchOnboardingStatus: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchHealth = vi.mocked(api.fetchHealth);
const mockFetchMetrics = vi.mocked(api.fetchMetrics);
const mockFetchOnboardingStatus = vi.mocked(api.fetchOnboardingStatus);

// ── Import after mocks ───────────────────────────────────────────────
import { DashboardLayout } from './DashboardLayout';

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderAt(path: string) {
  const qc = createQueryClient();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <DashboardLayout />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('DashboardLayout routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockFetchHealth.mockResolvedValue({
      status: 'ok',
      version: '1.0.0',
      uptime: 3_600_000,
      checks: { database: true, auditChain: true },
    });
    mockFetchMetrics.mockResolvedValue(createMetricsSnapshot());
    mockFetchOnboardingStatus.mockResolvedValue({
      needed: false,
      agentName: 'Friday',
      personality: null,
    });
  });

  it('renders MetricsPage at /metrics', async () => {
    renderAt('/metrics');
    expect(await screen.findByTestId('metrics-page')).toBeInTheDocument();
  });

  it('redirects / to /metrics', async () => {
    renderAt('/');
    expect(await screen.findByTestId('metrics-page')).toBeInTheDocument();
  });

  it('redirects unknown paths to /metrics', async () => {
    renderAt('/nonexistent-route');
    expect(await screen.findByTestId('metrics-page')).toBeInTheDocument();
  });

  it('renders the sidebar', async () => {
    renderAt('/metrics');
    expect(await screen.findByTestId('sidebar')).toBeInTheDocument();
  });
});
