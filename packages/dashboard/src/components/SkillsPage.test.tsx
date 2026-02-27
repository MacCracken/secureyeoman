// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  fetchSecurityPolicy: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

// Stub WebSocket so useCollabEditor doesn't try to open real sockets in tests
vi.stubGlobal(
  'WebSocket',
  class {
    static OPEN = 1;
    static CLOSED = 3;
    binaryType = 'arraybuffer';
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    send() {}
    close() {
      this.onclose?.();
    }
  }
);

import * as api from '../api/client';

const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchMarketplaceSkills = vi.mocked(api.fetchMarketplaceSkills);
const mockFetchCommunityStatus = vi.mocked(api.fetchCommunityStatus);
const mockCreateSkill = vi.mocked(api.createSkill);
const mockSyncCommunitySkills = vi.mocked(api.syncCommunitySkills);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

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

const MOCK_PERSONALITY = {
  id: 'p1',
  name: 'Test Agent',
  description: '',
  systemPrompt: '',
  traits: {},
  sex: 'unspecified' as const,
  voice: '',
  preferredLanguage: '',
  defaultModel: null,
  modelFallbacks: [] as Array<{ provider: string; model: string }>,
  includeArchetypes: false,
  injectDateTime: false,
  empathyResonance: false,
  avatarUrl: null,
  isDefault: true,
  isActive: true,
  isArchetype: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

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
  personalityId: 'p1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ── beforeEach ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockNavigate.mockReset();
  mockFetchSkills.mockResolvedValue({ skills: [] });
  mockFetchPersonalities.mockResolvedValue({ personalities: [MOCK_PERSONALITY] });
  mockFetchMarketplaceSkills.mockResolvedValue({ skills: [], total: 0 });
  mockFetchCommunityStatus.mockResolvedValue({
    communityRepoPath: null,
    skillCount: 0,
    lastSyncedAt: null,
  });
  mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: false } as never);
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

  it('renders community tab when location.state.initialTab is community and policy is enabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: true } as never);
    renderComponent([{ pathname: '/skills', state: { initialTab: 'community' } }]);

    // Community tab content should be visible
    expect(await screen.findByText(/Sync Community Skills/i)).toBeInTheDocument();
  });

  it('Community tab button is hidden by default (allowCommunityGitFetch: false)', async () => {
    renderComponent();
    await screen.findByText('Skills');
    expect(screen.queryByRole('button', { name: /^community$/i })).not.toBeInTheDocument();
  });

  it('Community tab button is visible when allowCommunityGitFetch is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: true } as never);
    renderComponent();
    expect(await screen.findByRole('button', { name: /^community$/i })).toBeInTheDocument();
  });

  it('falls back to Personal tab when navigating to /skills/community with policy disabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: false } as never);
    // Navigate directly to community path — getInitialTab returns 'community', but useEffect redirects
    renderComponent(['/skills/community']);
    // Personal tab content loads (Add Skill button is present)
    expect(await screen.findByRole('button', { name: /add skill/i })).toBeInTheDocument();
    // Community tab button itself is not rendered
    expect(screen.queryByRole('button', { name: /^community$/i })).not.toBeInTheDocument();
  });

  it('renders Import button next to Add Skill button on Personal tab', async () => {
    renderComponent();
    // Personal tab is active by default
    expect(await screen.findByText('Skills')).toBeInTheDocument();
    // Both action buttons should be present
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add skill/i })).toBeInTheDocument();
  });

  it('shows error banner when importing a file with wrong $schema', async () => {
    renderComponent();
    await screen.findByText('Skills');

    // Simulate selecting a file with a wrong schema marker via the hidden fallback input
    const badSkillJson = JSON.stringify({ $schema: 'wrong/1', name: 'Bad Skill', instructions: 'x' });
    const file = new File([badSkillJson], 'bad.skill.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // Component message: 'Invalid file: $schema must be "sy-skill/1"...'
    expect(await screen.findByText(/invalid file.*schema/i)).toBeInTheDocument();
  });

  it('shows error banner when importing a non-JSON file', async () => {
    renderComponent();
    await screen.findByText('Skills');

    const file = new File(['<svg></svg>'], 'image.svg', { type: 'image/svg+xml' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    // Component message: 'Only .json files are accepted...'
    expect(await screen.findByText(/only \.json files/i)).toBeInTheDocument();
  });

  it('shows removed count in sync result when community skills were pruned', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: true } as never);
    mockSyncCommunitySkills.mockResolvedValue({
      added: 0,
      updated: 5,
      skipped: 0,
      removed: 2,
      errors: [],
    });
    renderComponent();

    // Wait for the Community tab to appear (gated by allowCommunityGitFetch policy)
    const communityTab = await screen.findByRole('button', { name: /community/i });
    fireEvent.click(communityTab);

    // Sync button is now visible in the Community tab
    const syncBtn = await screen.findByRole('button', { name: /^sync$/i });
    fireEvent.click(syncBtn);

    expect(await screen.findByText(/removed.*2|2.*removed/i)).toBeInTheDocument();
  });
});
