// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StorybookPage } from './StorybookPage';

vi.mock('../api/client', () => ({
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <StorybookPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const BASE_POLICY = {
  allowSubAgents: false,
  allowA2A: false,
  allowSwarms: false,
  allowExtensions: false,
  allowExecution: true,
  allowProactive: false,
  allowExperiments: false,
  allowStorybook: false,
  allowMultimodal: false,
  allowDynamicTools: false,
  sandboxDynamicTools: true,
  allowAnomalyDetection: false,
  sandboxGvisor: false,
  sandboxWasm: false,
};

describe('StorybookPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows disabled state when allowStorybook is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: false });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Storybook is Disabled')).toBeInTheDocument();
    });
  });

  it('disabled state mentions security settings', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: false });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('allowStorybook')).toBeInTheDocument();
    });
  });

  it('shows page header when allowStorybook is true', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: true });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Quick Start')).toBeInTheDocument();
    });
  });

  it('shows npm run storybook command in enabled state', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: true });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('npm run storybook')).toBeInTheDocument();
    });
  });

  it('shows open in browser link to localhost:6006', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: true });

    renderComponent();

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /open in browser/i });
      expect(link).toHaveAttribute('href', 'http://localhost:6006');
    });
  });

  it('shows component stories list in enabled state', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: true });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Button')).toBeInTheDocument();
      expect(screen.getByText('Badge')).toBeInTheDocument();
      expect(screen.getByText('Card')).toBeInTheDocument();
      expect(screen.getByText('Toggle')).toBeInTheDocument();
    });
  });

  it('renders iframe pointing to localhost:6006 in enabled state', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ ...BASE_POLICY, allowStorybook: true });

    renderComponent();

    await waitFor(() => {
      const iframe = document.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.src).toBe('http://localhost:6006/');
    });
  });
});
