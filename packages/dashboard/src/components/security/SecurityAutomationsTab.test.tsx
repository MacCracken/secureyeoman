// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutomationsSecurityTab } from './SecurityAutomationsTab';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    fetchTasks: vi.fn(),
    fetchWorkflows: vi.fn(),
    fetchWorkflowRuns: vi.fn(),
    fetchPersonalities: vi.fn(),
  };
});

vi.mock('../HeartbeatsView', () => ({
  HeartbeatsView: () => <div data-testid="heartbeats-view">HeartbeatsView</div>,
}));

import * as api from '../../api/client';

const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockFetchWorkflows = vi.mocked(api.fetchWorkflows);
const mockFetchWorkflowRuns = vi.mocked(api.fetchWorkflowRuns);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderTab(props: { allowWorkflows?: boolean } = {}) {
  return render(
    <QueryClientProvider client={createQC()}>
      <AutomationsSecurityTab {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 } as any);
  mockFetchWorkflows.mockResolvedValue({ workflows: [] } as any);
  mockFetchWorkflowRuns.mockResolvedValue({ runs: [] } as any);
  mockFetchPersonalities.mockResolvedValue({ personalities: [] } as any);
});

describe('AutomationsSecurityTab', () => {
  it('renders Automations heading', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Automations')).toBeInTheDocument();
    });
  });

  it('shows Heartbeats subview by default', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Heartbeats')).toBeInTheDocument();
    });
  });

  it('shows heartbeats view content', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByTestId('heartbeats-view')).toBeInTheDocument();
    });
  });

  it('shows Tasks subview button', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
  });

  it('switches to Tasks subview', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      // Tasks view should show filter controls
      expect(screen.getByText('All Status')).toBeInTheDocument();
    });
  });

  it('does not show Workflows button when not allowed', async () => {
    renderTab({ allowWorkflows: false });
    await waitFor(() => {
      expect(screen.getByText('Heartbeats')).toBeInTheDocument();
    });
    expect(screen.queryByText('Workflows')).not.toBeInTheDocument();
  });

  it('shows Workflows button when allowed', async () => {
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
  });

  it('shows task type filter options in Tasks view', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('All Types')).toBeInTheDocument();
    });
  });

  it('shows tasks when data is available', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'Test Task',
          type: 'execute',
          status: 'completed',
          createdAt: Date.now() - 60000,
          durationMs: 500,
          securityContext: { personalityName: 'Default' },
        },
        {
          id: 't2',
          name: 'Failed Task',
          type: 'query',
          status: 'failed',
          createdAt: Date.now() - 120000,
          durationMs: 1500,
        },
      ],
      total: 2,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed Task')).toBeInTheDocument();
  });

  it('shows task count in Tasks view', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 42 } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('42 tasks')).toBeInTheDocument();
    });
  });

  it('filters tasks by status', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    });
    // Change status filter
    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'completed' },
    });
    await waitFor(() => {
      expect(mockFetchTasks).toHaveBeenCalled();
    });
  });

  it('filters tasks by type', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Filter by type'), {
      target: { value: 'execute' },
    });
    await waitFor(() => {
      expect(mockFetchTasks).toHaveBeenCalled();
    });
  });

  it('switches to Workflows subview when allowed', async () => {
    mockFetchWorkflows.mockResolvedValue({ workflows: [] } as any);
    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(mockFetchWorkflows).toHaveBeenCalled();
    });
  });

  it('shows workflows view when clicked', async () => {
    mockFetchWorkflows.mockResolvedValue({ workflows: [] } as any);
    mockFetchWorkflowRuns.mockResolvedValue({ runs: [] } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(mockFetchWorkflows).toHaveBeenCalled();
    });
  });

  it('shows no tasks message when empty', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 } as any);
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('0 tasks')).toBeInTheDocument();
    });
  });
});
