// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeveloperPage } from './DeveloperPage';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchSecurityPolicy: vi.fn(),
    fetchExtensionConfig: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExtensionConfig = vi.mocked(api.fetchExtensionConfig);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <DeveloperPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const FULL_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: true,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: true,
  allowStorybook: true,
  allowMultimodal: false,
  allowDynamicTools: false,
  sandboxDynamicTools: true,
};

describe('DeveloperPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSecurityPolicy.mockResolvedValue(FULL_POLICY);
    mockFetchExtensionConfig.mockResolvedValue({ config: {} });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('renders the Developers heading', () => {
    renderComponent();
    expect(screen.getByText('Developers')).toBeInTheDocument();
  });

  it('renders all three tab buttons', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /extensions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /experiments/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /storybook/i })).toBeInTheDocument();
  });

  it('shows Extensions content by default, not Storybook', () => {
    renderComponent();
    expect(screen.queryByText('Storybook is Disabled')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Start')).not.toBeInTheDocument();
  });

  it('switches to StorybookPage when Storybook tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /storybook/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('Storybook is Disabled') ?? screen.queryByText('Quick Start')
      ).toBeTruthy();
    });
  });

  it('switches to ExperimentsPage when Experiments tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByRole('button', { name: /experiments/i }));

    await waitFor(() => {
      expect(
        screen.queryByText('Experiments are Disabled') ?? screen.queryByText('New Experiment')
      ).toBeTruthy();
    });
  });
});
