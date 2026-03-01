// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkflowsTab } from './WorkflowsTab';

vi.mock('../../api/client', () => ({
  fetchCommunityWorkflows: vi.fn(),
  exportWorkflow: vi.fn(),
  importWorkflow: vi.fn(),
}));

import * as api from '../../api/client';

const mockFetchCommunityWorkflows = vi.mocked(api.fetchCommunityWorkflows);
const mockExportWorkflow = vi.mocked(api.exportWorkflow);
const mockImportWorkflow = vi.mocked(api.importWorkflow);

const WF = {
  id: 'wf-1',
  name: 'Daily Morning Brief',
  description: 'A morning briefing workflow',
  steps: [{ id: 's1', type: 'agent', config: {} }] as never[],
  edges: [] as never[],
  triggers: [] as never[],
  autonomyLevel: 'L3',
  isEnabled: true,
  version: 1,
  createdBy: 'community',
  createdAt: 1000,
  updatedAt: 1000,
};

const EXPORT_PAYLOAD = {
  exportedAt: Date.now(),
  requires: { integrations: ['gmail'] },
  workflow: WF,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab() {
  return render(
    <QueryClientProvider client={createQC()}>
      <WorkflowsTab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCommunityWorkflows.mockResolvedValue({ definitions: [WF], total: 1 });
  mockExportWorkflow.mockResolvedValue(EXPORT_PAYLOAD);
  mockImportWorkflow.mockResolvedValue({
    definition: WF,
    compatibility: { compatible: true, gaps: {} },
  });
});

describe('WorkflowsTab', () => {
  it('renders workflow cards when data is available', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Daily Morning Brief')).toBeDefined();
    });
  });

  it('shows description', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('A morning briefing workflow')).toBeDefined();
    });
  });

  it('shows autonomy level badge', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('L3')).toBeDefined();
    });
  });

  it('shows empty state when no workflows', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({ definitions: [], total: 0 });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No community workflows available')).toBeDefined();
    });
  });

  it('renders Export and Install buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
      expect(screen.getByTitle('Install workflow')).toBeDefined();
    });
  });
});
