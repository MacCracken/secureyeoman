// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SkillsPage } from './SkillsPage';

// ── Capture navigate calls ──────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock API client ─────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  fetchSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  enableSkill: vi.fn(),
  disableSkill: vi.fn(),
  approveSkill: vi.fn(),
  rejectSkill: vi.fn(),
  fetchMarketplaceSkills: vi.fn(),
  installMarketplaceSkill: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
  syncCommunitySkills: vi.fn(),
  fetchCommunityStatus: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchMarketplaceSkills = vi.mocked(api.fetchMarketplaceSkills);
const mockFetchCommunityStatus = vi.mocked(api.fetchCommunityStatus);

// ── Helpers ─────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent(
  initialEntries: Array<string | { pathname: string; state: unknown }> = ['/skills']
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={createQueryClient()}>
        <SkillsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_SKILL = {
  id: 's1',
  name: 'MyTestSkill',
  description: 'A test skill',
  instructions: 'Do something',
  tools: [],
  triggerPatterns: [],
  enabled: true,
  source: 'user' as const,
  status: 'active' as const,
  usageCount: 0,
  lastUsedAt: null,
  personalityId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ── beforeEach ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockNavigate.mockReset();
  mockFetchSkills.mockResolvedValue({ skills: [] });
  mockFetchPersonalities.mockResolvedValue({ personalities: [] });
  mockFetchMarketplaceSkills.mockResolvedValue({ skills: [], total: 0 });
  mockFetchCommunityStatus.mockResolvedValue({
    communityRepoPath: null,
    skillCount: 0,
    lastSyncedAt: null,
  });
});

// ── Tests ───────────────────────────────────────────────────────────

describe('SkillsPage', () => {
  it('renders My Skills tab without crashing', async () => {
    renderComponent();
    expect(await screen.findByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('opens edit form for skill when location.state.openSkillId is set and skills are loaded', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [MOCK_SKILL] });
    renderComponent([{ pathname: '/skills', state: { openSkillId: 's1' } }]);

    await waitFor(() => {
      expect(screen.getByText('Edit Skill')).toBeInTheDocument();
    });
  });

  it('clears location state after opening edit form via openSkillId', async () => {
    mockFetchSkills.mockResolvedValue({ skills: [MOCK_SKILL] });
    renderComponent([{ pathname: '/skills', state: { openSkillId: 's1' } }]);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/skills', { replace: true, state: null });
    });
  });

  it('renders community tab when location.state.initialTab is community', async () => {
    renderComponent([{ pathname: '/skills', state: { initialTab: 'community' } }]);

    // Community tab content should be visible
    expect(await screen.findByText(/Sync Community Skills/i)).toBeInTheDocument();
  });
});
