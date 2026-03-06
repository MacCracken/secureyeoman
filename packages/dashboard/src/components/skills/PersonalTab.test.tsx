// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PersonalTab } from './PersonalTab';

vi.mock('../../api/client', () => ({
  fetchSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  enableSkill: vi.fn(),
  disableSkill: vi.fn(),
  approveSkill: vi.fn(),
  rejectSkill: vi.fn(),
  installMarketplaceSkill: vi.fn(),
  fetchPersonalities: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
}));

// Stub WebSocket so useCollabEditor doesn't open real sockets
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

import * as api from '../../api/client';

const mockFetchSkills = vi.mocked(api.fetchSkills);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PersonalTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const defaultPersonality = { id: 'p1', name: 'Default', isDefault: true, isActive: true };

describe('PersonalTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (api.getAccessToken as any).mockReturnValue(null);
    mockFetchSkills.mockResolvedValue({ skills: [] } as any);
    mockFetchPersonalities.mockResolvedValue({
      personalities: [defaultPersonality],
    } as any);
  });

  it('renders Add Skill button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
  });

  it('renders Import button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Import')).toBeInTheDocument();
    });
  });

  it('renders status filter', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
    });
  });

  it('renders source filter', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Sources')).toBeInTheDocument();
    });
  });

  it('shows "No skills found" when list is empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No skills found')).toBeInTheDocument();
    });
  });

  it('renders skill list', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Code Review',
          description: 'Reviews code',
          instructions: 'Review the code',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/review'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Code Review')).toBeInTheDocument();
      expect(screen.getByText('Reviews code')).toBeInTheDocument();
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  it('shows create form when Add Skill clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Add Skill')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add Skill'));
    expect(screen.getByText('Create New Skill')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Skill name')).toBeInTheDocument();
  });

  it('renders personality selector in the top bar', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Default (Default) (Active)')).toBeInTheDocument();
    });
  });

  it('shows trigger patterns on skills', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Test',
          description: 'Test skill',
          instructions: '',
          status: 'active',
          source: 'user',
          enabled: true,
          personalityId: 'p1',
          triggerPatterns: ['/test', '/run'],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('/test')).toBeInTheDocument();
      expect(screen.getByText('/run')).toBeInTheDocument();
    });
  });

  it('shows pending approval badge count', async () => {
    mockFetchSkills.mockResolvedValue({
      skills: [
        {
          id: 'sk1',
          name: 'Pending Skill',
          description: 'Pending',
          instructions: '',
          status: 'pending_approval',
          source: 'ai_proposed',
          enabled: false,
          personalityId: 'p1',
          triggerPatterns: [],
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('1 pending approval')).toBeInTheDocument();
    });
  });

  it('shows info text about skills for personality', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Skills for/)).toBeInTheDocument();
    });
  });
});
