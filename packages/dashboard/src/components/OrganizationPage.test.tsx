// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrganizationPage } from './OrganizationPage';

// ── Mock API client ──────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchSecurityPolicy: vi.fn(),
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  fetchDepartments: vi.fn(),
  fetchDepartmentScorecard: vi.fn(),
  fetchHeatmap: vi.fn(),
  fetchRiskSummary: vi.fn(),
  fetchRegisterEntries: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  createRegisterEntry: vi.fn(),
  updateRegisterEntry: vi.fn(),
  deleteRegisterEntry: vi.fn(),
  snapshotDepartment: vi.fn(),
  fetchRoles: vi.fn(),
  fetchAssignments: vi.fn(),
  // IntentEditor imports
  fetchIntents: vi.fn(),
  fetchActiveIntent: vi.fn(),
  activateIntent: vi.fn(),
  deleteIntent: vi.fn(),
  fetchEnforcementLog: vi.fn(),
  createIntent: vi.fn(),
  readSignal: vi.fn(),
  fetchGoalTimeline: vi.fn(),
  // WorkspacesSettings imports
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  fetchWorkspaceMembers: vi.fn(),
  addWorkspaceMember: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  removeWorkspaceMember: vi.fn(),
}));

import * as api from '../api/client';

// ── Helpers ──────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithRoute(route = '/organization') {
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
  vi.mocked(api.fetchDepartments).mockResolvedValue({ items: [], total: 0 } as any);
  vi.mocked(api.fetchHeatmap).mockResolvedValue({ cells: [] } as any);
  vi.mocked(api.fetchRiskSummary).mockResolvedValue({ summary: null } as any);
  vi.mocked(api.fetchUsers).mockResolvedValue({ users: [] });
  vi.mocked(api.fetchSecurityPolicy).mockResolvedValue({} as any);
  vi.mocked(api.fetchRoles).mockResolvedValue({ roles: [] });
  vi.mocked(api.fetchAssignments).mockResolvedValue({ assignments: [] });
  vi.mocked(api.fetchIntents).mockResolvedValue({ intents: [] } as any);
  vi.mocked(api.fetchActiveIntent).mockResolvedValue(null as any);
  vi.mocked(api.fetchEnforcementLog).mockResolvedValue({ entries: [] } as any);
  vi.mocked(api.fetchGoalTimeline).mockResolvedValue({ entries: [] } as any);
  vi.mocked(api.fetchWorkspaces).mockResolvedValue({ workspaces: [], total: 0 } as any);
});

// ── Tests ────────────────────────────────────────────────────────────

describe('OrganizationPage', () => {
  it('renders the Organization heading', () => {
    renderWithRoute();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('renders all 4 tab buttons', () => {
    renderWithRoute();
    expect(screen.getByText('Intent')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('defaults to Intent tab', async () => {
    renderWithRoute();
    expect(await screen.findByText('Organizational Intent')).toBeInTheDocument();
  });

  it('supports ?tab=users query param', async () => {
    renderWithRoute('/organization?tab=users');
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });

  it('supports ?tab=risk query param', async () => {
    renderWithRoute('/organization?tab=risk');
    expect(await screen.findByText('No departments configured.')).toBeInTheDocument();
  });

  it('switches to Users tab on click', async () => {
    renderWithRoute();
    fireEvent.click(screen.getByText('Users'));
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });
});
