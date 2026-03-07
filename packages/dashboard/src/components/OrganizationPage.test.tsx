// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrganizationPage } from './OrganizationPage';

// ── Mock API client ──────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

// ── Mock lazy-loaded tab components ─────────────────────────────────
vi.mock('./IntentEditor', () => ({
  IntentEditor: () => <div>Organizational Intent</div>,
}));
vi.mock('./DepartmentalRiskTab', () => ({
  DepartmentalRiskTab: () => <div>Business Risks</div>,
}));
vi.mock('./knowledge/OrgKnowledgeBaseTab', () => ({
  OrgKnowledgeBaseTab: () => <div>Knowledge Base Content</div>,
}));
vi.mock('./WorkspacesSettings', () => ({
  WorkspacesSettings: () => <div>Workspaces Content</div>,
}));
vi.mock('./UsersSettings', () => ({
  UsersSettings: () => <div>Add User</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const ALL_ENABLED_POLICY = {
  allowIntent: true,
} as any;

function renderWithRoute(route = '/organization', policy = ALL_ENABLED_POLICY) {
  vi.mocked(api.fetchSecurityPolicy).mockResolvedValue(policy);
  const qc = createQueryClient();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={qc}>
        <OrganizationPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('OrganizationPage', () => {
  it('renders the Organization heading', () => {
    renderWithRoute();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('renders all tabs when all policies enabled', async () => {
    renderWithRoute();
    expect(await screen.findByText('Intent')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('hides Intent tab when allowIntent is false', async () => {
    renderWithRoute('/organization', { allowIntent: false } as any);
    expect(await screen.findByText('Knowledge Base')).toBeInTheDocument();
    expect(screen.queryByText('Intent')).not.toBeInTheDocument();
  });

  it('always shows Knowledge Base tab', async () => {
    renderWithRoute('/organization', { allowIntent: false } as any);
    expect(await screen.findByText('Knowledge Base')).toBeInTheDocument();
  });

  it('shows Intent tab button when enabled', async () => {
    renderWithRoute();
    expect(await screen.findByText('Intent')).toBeInTheDocument();
  });

  it('defaults to Knowledge Base tab when Intent is disabled', async () => {
    renderWithRoute('/organization', { allowIntent: false } as any);
    expect(await screen.findByText('Knowledge Base Content')).toBeInTheDocument();
  });

  it('supports ?tab=users query param', async () => {
    renderWithRoute('/organization?tab=users');
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });

  it('supports ?tab=risk query param', async () => {
    renderWithRoute('/organization?tab=risk');
    expect(await screen.findByText('Business Risks')).toBeInTheDocument();
  });

  it('switches to Users tab on click', async () => {
    renderWithRoute();
    fireEvent.click(await screen.findByText('Users'));
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });
});
