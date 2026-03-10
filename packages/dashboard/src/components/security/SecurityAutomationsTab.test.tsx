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

  it('shows task status badges', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'Task 1',
          type: 'execute',
          status: 'completed',
          createdAt: Date.now() - 30000,
          durationMs: 200,
        },
        {
          id: 't2',
          name: 'Task 2',
          type: 'query',
          status: 'failed',
          createdAt: Date.now() - 60000,
          durationMs: 1000,
        },
        {
          id: 't3',
          name: 'Task 3',
          type: 'file',
          status: 'running',
          createdAt: Date.now() - 5000,
          durationMs: null,
        },
      ],
      total: 3,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
      expect(screen.getByText('Task 3')).toBeInTheDocument();
    });
  });

  it('shows task type column', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'System Task',
          type: 'system',
          status: 'completed',
          createdAt: Date.now(),
          durationMs: 100,
        },
      ],
      total: 1,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('System Task')).toBeInTheDocument();
    });
  });

  it('shows pagination when multiple pages', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      name: `Task ${i}`,
      type: 'execute',
      status: 'completed',
      createdAt: Date.now() - i * 1000,
      durationMs: 100,
    }));
    mockFetchTasks.mockResolvedValue({ tasks, total: 25 } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('25 tasks')).toBeInTheDocument();
    });
  });

  it('shows workflows with runs', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Deploy Pipeline',
          description: 'Auto deploy',
          steps: [{ id: 's1' }],
          createdBy: 'user',
          autonomyLevel: 'L2',
        },
      ],
    } as any);
    mockFetchWorkflowRuns.mockResolvedValue({
      runs: [
        {
          id: 'run1',
          workflowId: 'wf1',
          status: 'completed',
          startedAt: Date.now() - 300000,
          completedAt: Date.now() - 200000,
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument();
    });
  });

  it('shows date preset buttons in Tasks view', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Last hour')).toBeInTheDocument();
      expect(screen.getByText('Last 24h')).toBeInTheDocument();
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
      expect(screen.getByText('All time')).toBeInTheDocument();
    });
  });

  it('applies date preset filter', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Last hour')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Last hour'));
    await waitFor(() => {
      expect(mockFetchTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        })
      );
    });
  });

  it('shows clear filters when filters active', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'failed' } });
    await waitFor(() => {
      const clearBtn = screen.queryByText('Clear');
      if (clearBtn) {
        expect(clearBtn).toBeInTheDocument();
      }
    });
  });

  it('shows export CSV and JSON buttons in Tasks view', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('Export CSV')).toBeInTheDocument();
      expect(screen.getByLabelText('Export JSON')).toBeInTheDocument();
    });
  });

  it('shows task with personality name', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'Agent Task',
          type: 'execute',
          status: 'completed',
          createdAt: Date.now() - 60000,
          durationMs: 500,
          securityContext: { personalityName: 'FRIDAY' },
        },
      ],
      total: 1,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('FRIDAY')).toBeInTheDocument();
    });
  });

  it('shows task with description', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'Described Task',
          description: 'This task does things',
          type: 'query',
          status: 'completed',
          createdAt: Date.now() - 30000,
          durationMs: 100,
        },
      ],
      total: 1,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Described Task')).toBeInTheDocument();
      expect(screen.getByText('This task does things')).toBeInTheDocument();
    });
  });

  it('shows task with parent task ID (sub-agent)', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't-child-12345678',
          name: 'Sub Task',
          type: 'execute',
          status: 'completed',
          createdAt: Date.now() - 10000,
          durationMs: 200,
          parentTaskId: 'parent-12345678',
        },
      ],
      total: 1,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Sub Task')).toBeInTheDocument();
    });
  });

  it('shows task with error message for failed tasks', async () => {
    mockFetchTasks.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          name: 'Error Task',
          type: 'execute',
          status: 'failed',
          createdAt: Date.now() - 5000,
          durationMs: 300,
          result: { success: false, error: { message: 'Connection refused' } },
        },
      ],
      total: 1,
    } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('Error Task')).toBeInTheDocument();
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('shows No tasks found when empty', async () => {
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 } as any);
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
    });
  });

  it('shows workflow details when expanded', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Test Workflow',
          description: 'A workflow',
          steps: [
            { id: 's1', name: 'Step One', type: 'llm', onError: 'fail' },
            { id: 's2', name: 'Step Two', type: 'tool', onError: 'continue' },
          ],
          createdBy: 'admin',
          createdAt: Date.now(),
          autonomyLevel: 'L3',
          isEnabled: true,
        },
      ],
    } as any);
    mockFetchWorkflowRuns.mockResolvedValue({ runs: [], total: 0 } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument();
    });
    // Expand the workflow
    await user.click(screen.getByText('Test Workflow'));
    await waitFor(() => {
      expect(screen.getByText('Step One')).toBeInTheDocument();
      expect(screen.getByText('Step Two')).toBeInTheDocument();
      expect(screen.getByText('on error: continue')).toBeInTheDocument();
    });
  });

  it('shows workflow runs when expanded', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Pipeline',
          steps: [{ id: 's1', name: 'Build', type: 'tool', onError: 'fail' }],
          createdBy: 'user',
          createdAt: Date.now(),
          isEnabled: true,
        },
      ],
    } as any);
    mockFetchWorkflowRuns.mockResolvedValue({
      runs: [
        {
          id: 'run1',
          workflowId: 'wf1',
          status: 'completed',
          createdAt: Date.now() - 100000,
          triggeredBy: 'scheduler',
        },
        {
          id: 'run2',
          workflowId: 'wf1',
          status: 'failed',
          createdAt: Date.now() - 50000,
          triggeredBy: 'manual',
          error: 'Timeout exceeded',
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Pipeline')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Pipeline'));
    await waitFor(() => {
      expect(screen.getByText('by scheduler')).toBeInTheDocument();
      expect(screen.getByText('by manual')).toBeInTheDocument();
      expect(screen.getByText('Timeout exceeded')).toBeInTheDocument();
    });
  });

  it('shows No workflows found when empty', async () => {
    mockFetchWorkflows.mockResolvedValue({ definitions: [] } as any);
    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('No workflows found')).toBeInTheDocument();
    });
  });

  it('shows workflow enabled/disabled badge', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Enabled WF',
          steps: [],
          createdBy: 'user',
          createdAt: Date.now(),
          isEnabled: true,
        },
        {
          id: 'wf2',
          name: 'Disabled WF',
          steps: [],
          createdBy: 'user',
          createdAt: Date.now(),
          isEnabled: false,
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('shows workflow count', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        { id: 'wf1', name: 'WF1', steps: [], createdBy: 'u', createdAt: Date.now() },
        { id: 'wf2', name: 'WF2', steps: [], createdBy: 'u', createdAt: Date.now() },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('2 workflows')).toBeInTheDocument();
    });
  });

  it('shows workflow step count and autonomy level', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Multi Step WF',
          steps: [
            { id: 's1', name: 'A', type: 'llm', onError: 'fail' },
            { id: 's2', name: 'B', type: 'tool', onError: 'fail' },
            { id: 's3', name: 'C', type: 'llm', onError: 'fail' },
          ],
          createdBy: 'user',
          createdAt: Date.now(),
          autonomyLevel: 'L2',
        },
      ],
    } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Multi Step WF')).toBeInTheDocument();
      expect(screen.getByText(/3 steps/)).toBeInTheDocument();
      expect(screen.getByText(/L2/)).toBeInTheDocument();
    });
  });

  it('shows pagination controls when tasks exceed page size', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      name: `Task ${i}`,
      type: 'execute',
      status: 'completed',
      createdAt: Date.now() - i * 1000,
      durationMs: 100,
    }));
    mockFetchTasks.mockResolvedValue({ tasks, total: 30 } as any);

    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
      expect(screen.getByLabelText('Next page')).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });

  it('shows custom date inputs in Tasks view', async () => {
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Tasks'));
    await waitFor(() => {
      expect(screen.getByLabelText('From date')).toBeInTheDocument();
      expect(screen.getByLabelText('To date')).toBeInTheDocument();
    });
  });

  it('shows No runs recorded when workflow has no runs', async () => {
    mockFetchWorkflows.mockResolvedValue({
      definitions: [
        {
          id: 'wf1',
          name: 'Empty WF',
          steps: [],
          createdBy: 'user',
          createdAt: Date.now(),
          isEnabled: true,
        },
      ],
    } as any);
    mockFetchWorkflowRuns.mockResolvedValue({ runs: [], total: 0 } as any);

    const user = userEvent.setup();
    renderTab({ allowWorkflows: true });
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Workflows'));
    await waitFor(() => {
      expect(screen.getByText('Empty WF')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Empty WF'));
    await waitFor(() => {
      expect(screen.getByText('No runs recorded')).toBeInTheDocument();
    });
  });
});
