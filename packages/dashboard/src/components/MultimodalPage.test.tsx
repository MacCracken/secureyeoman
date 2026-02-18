// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MultimodalPage } from './MultimodalPage';

vi.mock('../api/client', () => ({
  fetchMultimodalJobs: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchMultimodalJobs = vi.mocked(api.fetchMultimodalJobs);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent(props?: { embedded?: boolean }) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <MultimodalPage {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_JOBS = {
  jobs: [
    {
      id: 'job-abc12345',
      type: 'vision',
      status: 'completed',
      platform: 'discord',
      durationMs: 1200,
      input: { imageBase64: '...', mimeType: 'image/png' },
      output: { description: 'A cat sitting on a desk' },
      error: null,
      createdAt: Date.now() - 60000,
    },
    {
      id: 'job-def67890',
      type: 'tts',
      status: 'failed',
      platform: 'telegram',
      durationMs: 500,
      input: { text: 'Hello world' },
      output: null,
      error: 'Provider timeout',
      createdAt: Date.now() - 30000,
    },
    {
      id: 'job-ghi11111',
      type: 'stt',
      status: 'pending',
      platform: null,
      durationMs: null,
      input: null,
      output: null,
      error: null,
      createdAt: Date.now() - 10000,
    },
  ],
  total: 3,
};

describe('MultimodalPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: true,
    });
    mockFetchMultimodalJobs.mockResolvedValue(MOCK_JOBS);
  });

  // ── Disabled State ──────────────────────────────────────────

  it('shows disabled banner when allowMultimodal is false', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    renderComponent();
    expect(
      await screen.findByText(/Multimodal processing is currently disabled/)
    ).toBeInTheDocument();
  });

  it('does not show jobs table when disabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    renderComponent();
    await screen.findByText(/Multimodal processing is currently disabled/);
    expect(screen.queryByText('Jobs')).not.toBeInTheDocument();
  });

  // ── Header Visibility ───────────────────────────────────────

  it('shows header when not embedded', async () => {
    renderComponent();
    expect(await screen.findByText('Multimodal')).toBeInTheDocument();
  });

  it('hides header when embedded', async () => {
    renderComponent({ embedded: true });
    await screen.findByText('Jobs');
    expect(screen.queryByText('Multimodal')).not.toBeInTheDocument();
  });

  it('hides header in disabled state when embedded', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
    });
    renderComponent({ embedded: true });
    await screen.findByText(/Multimodal processing is currently disabled/);
    expect(screen.queryByRole('heading', { name: 'Multimodal' })).not.toBeInTheDocument();
  });

  // ── Enabled State — Stats & Jobs ────────────────────────────

  it('shows stats cards when enabled', async () => {
    renderComponent();
    expect(await screen.findByText('Total Jobs')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    // "Completed" and "Failed" appear in both stats cards and status filter options,
    // so verify there are at least 2 matches (stat label + filter option)
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);
  });

  it('renders job rows with truncated IDs', async () => {
    renderComponent();
    expect(await screen.findByText('job-abc1...')).toBeInTheDocument();
    expect(screen.getByText('job-def6...')).toBeInTheDocument();
  });

  it('shows job type labels in table rows', async () => {
    renderComponent();
    // "Vision" and "Speech-to-Text" appear in both the table rows and the type filter dropdown,
    // so check for at least 2 matches (table cell + filter option)
    await screen.findByText('job-abc1...');
    expect(screen.getAllByText('Vision').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Text-to-Speech').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Speech-to-Text').length).toBeGreaterThanOrEqual(2);
  });

  it('shows job statuses', async () => {
    renderComponent();
    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows duration for completed jobs and dash for pending', async () => {
    renderComponent();
    expect(await screen.findByText('1200ms')).toBeInTheDocument();
    // pending job has no duration — shows '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no jobs', async () => {
    mockFetchMultimodalJobs.mockResolvedValue({ jobs: [], total: 0 });
    renderComponent();
    expect(await screen.findByText('No multimodal jobs found.')).toBeInTheDocument();
  });

  // ── Expandable Rows ─────────────────────────────────────────

  it('expands a row to show error on click', async () => {
    renderComponent();
    const row = await screen.findByText('job-def6...');
    fireEvent.click(row.closest('tr')!);
    expect(await screen.findByText('Provider timeout')).toBeInTheDocument();
  });

  it('expands a row to show input/output JSON', async () => {
    renderComponent();
    const row = await screen.findByText('job-abc1...');
    fireEvent.click(row.closest('tr')!);
    expect(await screen.findByText(/A cat sitting on a desk/)).toBeInTheDocument();
  });

  // ── Filters ─────────────────────────────────────────────────

  it('renders type and status filter dropdowns', async () => {
    renderComponent();
    await screen.findByText('Jobs');
    expect(screen.getByDisplayValue('All Types')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
  });

  it('calls fetchMultimodalJobs with type filter', async () => {
    const user = userEvent.setup();
    renderComponent();
    const typeSelect = await screen.findByDisplayValue('All Types');
    await user.selectOptions(typeSelect, 'vision');
    expect(mockFetchMultimodalJobs).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'vision' })
    );
  });

  it('calls fetchMultimodalJobs with status filter', async () => {
    const user = userEvent.setup();
    renderComponent();
    const statusSelect = await screen.findByDisplayValue('All Statuses');
    await user.selectOptions(statusSelect, 'failed');
    expect(mockFetchMultimodalJobs).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });
});
