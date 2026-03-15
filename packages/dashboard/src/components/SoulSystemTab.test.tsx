// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SoulSystemTab } from './SoulSystemTab';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchSoulConfig: vi.fn(),
    updateSoulConfig: vi.fn(),
    fetchPersonalities: vi.fn(),
    enablePersonality: vi.fn(),
    disablePersonality: vi.fn(),
    setDefaultPersonality: vi.fn(),
    clearDefaultPersonality: vi.fn(),
    fetchStrategies: vi.fn(),
    createStrategy: vi.fn(),
    deleteStrategy: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchSoulConfig = vi.mocked(api.fetchSoulConfig);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);
const mockFetchStrategies = vi.mocked(api.fetchStrategies);

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
        <SoulSystemTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const defaultConfig = {
  enabled: true,
  learningMode: ['user_authored'],
  maxSkills: 100,
  maxPromptTokens: 64000,
};

describe('SoulSystemTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSoulConfig.mockResolvedValue(defaultConfig as any);
    mockFetchPersonalities.mockResolvedValue({ personalities: [] } as any);
    mockFetchStrategies.mockResolvedValue({ items: [] } as any);
  });

  it('renders Soul System section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Soul System')).toBeInTheDocument();
    });
  });

  it('renders enabled toggle', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
  });

  it('renders learning mode checkboxes', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Learning Mode')).toBeInTheDocument();
      expect(screen.getByText('User Authored')).toBeInTheDocument();
      expect(screen.getByText('AI Proposed')).toBeInTheDocument();
      expect(screen.getByText('Autonomous')).toBeInTheDocument();
    });
  });

  it('renders numeric limit fields', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Max Skills')).toBeInTheDocument();
      expect(screen.getByText('Default Prompt Budget')).toBeInTheDocument();
    });
  });

  it('renders save button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('renders reasoning strategies section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Reasoning Strategies')).toBeInTheDocument();
    });
  });

  it('shows empty strategies message', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No strategies found.')).toBeInTheDocument();
    });
  });

  it('renders strategy list', async () => {
    mockFetchStrategies.mockResolvedValue({
      items: [
        {
          id: 's1',
          name: 'Chain of Thought',
          slug: 'cot',
          category: 'chain_of_thought',
          isBuiltin: true,
        },
        {
          id: 's2',
          name: 'Custom Strategy',
          slug: 'custom',
          category: 'reflexion',
          isBuiltin: false,
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Chain of Thought')).toBeInTheDocument();
      expect(screen.getByText('Custom Strategy')).toBeInTheDocument();
      expect(screen.getByText('builtin')).toBeInTheDocument();
    });
  });

  it('renders Active Souls section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Active Souls')).toBeInTheDocument();
    });
  });

  it('renders soul personalities', async () => {
    mockFetchPersonalities.mockResolvedValue({
      personalities: [
        {
          id: 'p1',
          name: 'Default Soul',
          isActive: true,
          isDefault: true,
          description: 'Main',
        },
        {
          id: 'p2',
          name: 'Creative Soul',
          isActive: false,
          isDefault: false,
          description: '',
        },
      ],
    } as any);
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Default Soul')).toBeInTheDocument();
      expect(screen.getByText('Creative Soul')).toBeInTheDocument();
    });
  });

  it('shows "No souls configured" when empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No souls configured/)).toBeInTheDocument();
    });
  });

  it('shows Manage Souls link', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Manage Souls')).toBeInTheDocument();
    });
  });
});
