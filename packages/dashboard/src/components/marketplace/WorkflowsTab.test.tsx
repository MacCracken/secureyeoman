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

function renderTab(source?: string) {
  return render(
    <QueryClientProvider client={createQC()}>
      <WorkflowsTab source={source} />
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

  it('shows empty state when no workflows (community)', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({ definitions: [], total: 0 });
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('No community workflows found')).toBeDefined();
    });
  });

  it('renders Export and Install buttons', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
      expect(screen.getByTitle('Install workflow')).toBeDefined();
    });
  });

  it('shows search input when not externally controlled', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search workflows…')).toBeDefined();
    });
  });

  it('shows community search placeholder when source is community', async () => {
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search community workflows…')).toBeDefined();
    });
  });

  it('hides search when query is externally controlled', async () => {
    render(
      <QueryClientProvider client={createQC()}>
        <WorkflowsTab source="community" query="test" />
      </QueryClientProvider>
    );
    await waitFor(() => {
      // The search input should not be rendered
      expect(screen.queryByPlaceholderText('Search community workflows…')).toBeNull();
    });
  });

  it('filters workflows by search query', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Daily Morning Brief')).toBeDefined();
    });
    const searchInput = screen.getByPlaceholderText('Search workflows…');
    await user.type(searchInput, 'nonexistent');
    await waitFor(() => {
      expect(screen.queryByText('Daily Morning Brief')).toBeNull();
    });
  });

  it('shows no-match message when search yields no results', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Daily Morning Brief')).toBeDefined();
    });
    const searchInput = screen.getByPlaceholderText('Search workflows…');
    await user.type(searchInput, 'zzzznotfound');
    await waitFor(() => {
      expect(screen.getByText(/No workflows match/)).toBeDefined();
    });
  });

  it('shows step count in workflow card', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('1 steps')).toBeDefined();
    });
  });

  it('shows "YEOMAN Workflows" heading for builtin source', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({
      definitions: [{ ...WF, createdBy: 'system' }],
      total: 1,
    });
    renderTab('builtin');
    await waitFor(() => {
      expect(screen.getByText('YEOMAN Workflows')).toBeDefined();
    });
  });

  it('shows "Community Workflows" heading for community source', async () => {
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('Community Workflows')).toBeDefined();
    });
  });

  it('shows empty state with community message for community source', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({ definitions: [], total: 0 });
    renderTab('community');
    await waitFor(() => {
      expect(screen.getByText('No community workflows found')).toBeDefined();
    });
  });

  it('shows generic empty state for non-community source', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({ definitions: [], total: 0 });
    renderTab('builtin');
    await waitFor(() => {
      expect(screen.getByText('No workflows available')).toBeDefined();
    });
  });

  it('handles export button click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    // Mock URL and createElement for blob download
    const mockCreateElement = vi.spyOn(document, 'createElement');
    const mockCreateObjectURL = vi.fn(() => 'blob:test');
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Export as JSON')).toBeDefined();
    });
    await user.click(screen.getByTitle('Export as JSON'));
    await waitFor(() => {
      expect(mockExportWorkflow).toHaveBeenCalledWith('wf-1');
    });
    mockCreateElement.mockRestore();
  });

  it('handles import button click with compatible result', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Install workflow')).toBeDefined();
    });
    await user.click(screen.getByTitle('Install workflow'));
    await waitFor(() => {
      expect(mockExportWorkflow).toHaveBeenCalledWith('wf-1');
      expect(mockImportWorkflow).toHaveBeenCalled();
    });
    // Should show success toast
    await waitFor(() => {
      expect(screen.getByText('Workflow imported successfully')).toBeDefined();
    });
  });

  it('shows warning toast when import has compatibility gaps', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockImportWorkflow.mockResolvedValue({
      definition: WF,
      compatibility: { compatible: false, gaps: { integrations: ['slack'], tools: ['search'] } },
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Install workflow')).toBeDefined();
    });
    await user.click(screen.getByTitle('Install workflow'));
    await waitFor(() => {
      expect(screen.getByText(/Imported with warnings/)).toBeDefined();
    });
  });

  it('shows error toast when import fails', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockImportWorkflow.mockRejectedValue(new Error('Import failed'));
    renderTab();
    await waitFor(() => {
      expect(screen.getByTitle('Install workflow')).toBeDefined();
    });
    await user.click(screen.getByTitle('Install workflow'));
    await waitFor(() => {
      expect(screen.getByText('Import failed')).toBeDefined();
    });
  });

  it('shows workflow count in parentheses', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('(1)')).toBeDefined();
    });
  });

  it('shows "No description" when workflow has no description', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({
      definitions: [{ ...WF, description: undefined }],
      total: 1,
    });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('No description')).toBeDefined();
    });
  });

  it('filters system workflows for builtin source', async () => {
    mockFetchCommunityWorkflows.mockResolvedValue({
      definitions: [
        { ...WF, id: 'wf-sys', createdBy: 'system', name: 'System WF' },
        { ...WF, id: 'wf-comm', createdBy: 'community', name: 'Community WF' },
      ],
      total: 2,
    });
    renderTab('builtin');
    await waitFor(() => {
      expect(screen.getByText('System WF')).toBeDefined();
      expect(screen.queryByText('Community WF')).toBeNull();
    });
  });
});
