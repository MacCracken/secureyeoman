// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskHistory } from './TaskHistory';
import { createTask, createTaskList } from '../test/mocks';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchTasks = vi.mocked(api.fetchTasks);
const mockCreateTask = vi.mocked(api.createTask);
const mockUpdateTask = vi.mocked(api.updateTask);
const mockDeleteTask = vi.mocked(api.deleteTask);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TaskHistory />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('TaskHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });
  });

  it('renders the Task History heading', async () => {
    renderComponent();
    expect(await screen.findByText('Task History')).toBeInTheDocument();
  });

  it('shows "No tasks found" when no tasks are returned', async () => {
    renderComponent();
    expect(await screen.findByText('No tasks found')).toBeInTheDocument();
  });

  it('renders task rows when tasks are returned', async () => {
    const tasks = createTaskList(3);
    mockFetchTasks.mockResolvedValue({ tasks, total: 3 });
    renderComponent();

    expect(await screen.findByText('Run deployment script')).toBeInTheDocument();
    expect(screen.getByText('Query user database')).toBeInTheDocument();
    expect(screen.getByText('Read config file')).toBeInTheDocument();
  });

  it('displays task status text', async () => {
    const tasks = createTaskList(3);
    mockFetchTasks.mockResolvedValue({ tasks, total: 3 });
    renderComponent();

    expect(await screen.findByText('completed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('displays error message for failed tasks', async () => {
    const tasks = createTaskList(2);
    mockFetchTasks.mockResolvedValue({ tasks, total: 2 });
    renderComponent();

    expect(await screen.findByText('Process exited with code 1')).toBeInTheDocument();
  });

  it('shows task type badges', async () => {
    const tasks = createTaskList(3);
    mockFetchTasks.mockResolvedValue({ tasks, total: 3 });
    renderComponent();

    expect(await screen.findByText('execute')).toBeInTheDocument();
    expect(screen.getByText('query')).toBeInTheDocument();
    expect(screen.getByText('file')).toBeInTheDocument();
  });

  it('renders status filter dropdown with expected options', async () => {
    renderComponent();
    const statusSelect = await screen.findByLabelText('Filter by status');
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect).toHaveValue('');
  });

  it('renders type filter dropdown with expected options', async () => {
    renderComponent();
    const typeSelect = await screen.findByLabelText('Filter by type');
    expect(typeSelect).toBeInTheDocument();
    expect(typeSelect).toHaveValue('');
  });

  it('calls fetchTasks with status filter when changed', async () => {
    const user = userEvent.setup();
    renderComponent();

    const statusSelect = await screen.findByLabelText('Filter by status');
    await user.selectOptions(statusSelect, 'failed');

    expect(mockFetchTasks).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('calls fetchTasks with type filter when changed', async () => {
    const user = userEvent.setup();
    renderComponent();

    const typeSelect = await screen.findByLabelText('Filter by type');
    await user.selectOptions(typeSelect, 'query');

    expect(mockFetchTasks).toHaveBeenCalledWith(expect.objectContaining({ type: 'query' }));
  });

  it('shows Clear button when a filter is active and resets on click', async () => {
    const user = userEvent.setup();
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    renderComponent();

    // Initially no Clear button
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();

    const statusSelect = await screen.findByLabelText('Filter by status');
    await user.selectOptions(statusSelect, 'completed');

    const clearButton = await screen.findByText('Clear');
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('shows pagination when total exceeds page size', async () => {
    const tasks = createTaskList(10);
    mockFetchTasks.mockResolvedValue({ tasks, total: 25 });
    renderComponent();

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 10 of 25/)).toBeInTheDocument();
  });

  it('does not show pagination when total fits in one page', async () => {
    const tasks = createTaskList(5);
    mockFetchTasks.mockResolvedValue({ tasks, total: 5 });
    renderComponent();

    await screen.findByText('Run deployment script');
    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
  });

  // ── Date Range Tests ────────────────────────────────────────────

  it('renders date range preset buttons', async () => {
    renderComponent();
    expect(await screen.findByText('Last hour')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('All time')).toBeInTheDocument();
  });

  it('renders from and to date inputs', async () => {
    renderComponent();
    expect(await screen.findByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
  });

  // ── Export Tests ─────────────────────────────────────────────────

  it('renders export CSV and JSON buttons', async () => {
    renderComponent();
    expect(await screen.findByLabelText('Export CSV')).toBeInTheDocument();
    expect(screen.getByLabelText('Export JSON')).toBeInTheDocument();
  });

  // ── Create Task Tests ─────────────────────────────────────────────

  it('renders New Task button', async () => {
    renderComponent();
    expect(await screen.findByText('New Task')).toBeInTheDocument();
  });

  it('opens create dialog when New Task button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();

    const newTaskButton = await screen.findByText('New Task');
    await user.click(newTaskButton);

    expect(screen.getByText('Create New Task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Run backup')).toBeInTheDocument();
  });

  it('can fill in the create task form', async () => {
    const user = userEvent.setup();
    renderComponent();

    await user.click(screen.getByText('New Task'));

    const nameInput = screen.getByPlaceholderText('e.g., Run backup');
    await user.type(nameInput, 'My New Task');

    expect(nameInput).toHaveValue('My New Task');
  });

  it('calls createTask when form is submitted', async () => {
    const user = userEvent.setup();
    mockCreateTask.mockResolvedValue({
      id: 'new-task-id',
      name: 'My New Task',
      type: 'execute',
      status: 'pending',
      createdAt: Date.now(),
    });
    renderComponent();

    await user.click(screen.getByText('New Task'));

    const nameInput = screen.getByPlaceholderText('e.g., Run backup');
    await user.type(nameInput, 'My New Task');

    await user.click(screen.getByText('Create Task'));

    expect(mockCreateTask).toHaveBeenCalled();
  });

  it('closes dialog after successful task creation', async () => {
    const user = userEvent.setup();
    mockCreateTask.mockResolvedValue({
      id: 'new-task-id',
      name: 'My New Task',
      type: 'execute',
      status: 'pending',
      createdAt: Date.now(),
    });
    renderComponent();

    await user.click(screen.getByText('New Task'));

    const nameInput = screen.getByPlaceholderText('e.g., Run backup');
    await user.type(nameInput, 'My New Task');

    await user.click(screen.getByText('Create Task'));

    expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
  });

  it('disables create button when name is empty', async () => {
    renderComponent();

    await userEvent.setup().click(screen.getByText('New Task'));

    const createButton = screen.getByText('Create Task');
    expect(createButton).toBeDisabled();
  });
  // ── Edit Task Tests ────────────────────────────────────────────────

  it('opens edit dialog when edit button is clicked', async () => {
    const user = userEvent.setup();
    const tasks = createTaskList(1);
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Run deployment script');
    const editButton = screen.getByTitle('Edit task');
    await user.click(editButton);

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Run deployment script')).toBeInTheDocument();
  });

  it('calls updateTask when edit form is saved', async () => {
    const user = userEvent.setup();
    const tasks = createTaskList(1);
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    mockUpdateTask.mockResolvedValue({
      ...tasks[0],
      name: 'Updated Name',
    });
    renderComponent();

    await screen.findByText('Run deployment script');
    await user.click(screen.getByTitle('Edit task'));

    const nameInput = screen.getByDisplayValue('Run deployment script');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    await user.click(screen.getByText('Save'));

    expect(mockUpdateTask).toHaveBeenCalledWith(
      tasks[0].id,
      expect.objectContaining({ name: 'Updated Name' })
    );
  });

  // ── Delete Task Tests ──────────────────────────────────────────────

  it('shows confirmation dialog when delete is clicked', async () => {
    const user = userEvent.setup();
    const tasks = createTaskList(1);
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Run deployment script');
    const deleteButton = screen.getByTitle('Delete task');
    await user.click(deleteButton);

    expect(screen.getByText('Delete Task')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('calls deleteTask when confirmation is accepted', async () => {
    const user = userEvent.setup();
    const tasks = createTaskList(1);
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    mockDeleteTask.mockResolvedValue(undefined);
    renderComponent();

    await screen.findByText('Run deployment script');
    await user.click(screen.getByTitle('Delete task'));

    // Click the Delete button in the confirmation dialog
    const deleteConfirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteConfirmButton);

    expect(mockDeleteTask).toHaveBeenCalledWith(tasks[0].id);
  });

  it('dismisses delete confirmation when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const tasks = createTaskList(1);
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Run deployment script');
    await user.click(screen.getByTitle('Delete task'));

    expect(screen.getByText('Delete Task')).toBeInTheDocument();

    // Click Cancel
    const cancelButtons = screen.getAllByText('Cancel');
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
  });

  // ── Polling / refetchInterval behaviour ───────────────────────────

  describe('refetch polling behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('re-polls every 2s while a task has running status', async () => {
      mockFetchTasks.mockResolvedValue({
        tasks: [createTask({ status: 'running', completedAt: undefined, durationMs: undefined })],
        total: 1,
      });

      renderComponent();

      // Flush the initial fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const callsAfterInit = mockFetchTasks.mock.calls.length;
      expect(callsAfterInit).toBeGreaterThan(0);

      // Advance past the 2s refetch interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });

      expect(mockFetchTasks.mock.calls.length).toBeGreaterThan(callsAfterInit);
    });

    it('re-polls every 2s while a task has pending status', async () => {
      mockFetchTasks.mockResolvedValue({
        tasks: [
          createTask({
            status: 'pending',
            startedAt: undefined,
            completedAt: undefined,
            durationMs: undefined,
          }),
        ],
        total: 1,
      });

      renderComponent();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const callsAfterInit = mockFetchTasks.mock.calls.length;
      expect(callsAfterInit).toBeGreaterThan(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });

      expect(mockFetchTasks.mock.calls.length).toBeGreaterThan(callsAfterInit);
    });

    it('does not re-poll when all tasks are completed', async () => {
      mockFetchTasks.mockResolvedValue({
        tasks: [createTask({ status: 'completed' })],
        total: 1,
      });

      renderComponent();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const callsAfterInit = mockFetchTasks.mock.calls.length;
      expect(callsAfterInit).toBeGreaterThan(0);

      // Advance well beyond any poll interval — no additional fetches expected
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(mockFetchTasks.mock.calls.length).toBe(callsAfterInit);
    });

    it('does not re-poll for other terminal statuses (failed, timeout, cancelled)', async () => {
      for (const status of ['failed', 'timeout', 'cancelled'] as const) {
        vi.clearAllMocks();
        mockFetchTasks.mockResolvedValue({ tasks: [createTask({ status })], total: 1 });
        vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });

        const { unmount } = renderComponent();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });

        const callsAfterInit = mockFetchTasks.mock.calls.length;

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        expect(mockFetchTasks.mock.calls.length).toBe(callsAfterInit);
        unmount();
      }
    });

    it('does not re-poll when the task list is empty', async () => {
      // mockFetchTasks already returns { tasks: [], total: 0 } from global beforeEach

      renderComponent();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const callsAfterInit = mockFetchTasks.mock.calls.length;
      expect(callsAfterInit).toBeGreaterThan(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(mockFetchTasks.mock.calls.length).toBe(callsAfterInit);
    });

    it('stops polling once all tasks transition to a terminal state', async () => {
      // First call returns a running task; subsequent calls return it as completed
      mockFetchTasks
        .mockResolvedValueOnce({
          tasks: [createTask({ status: 'running', completedAt: undefined, durationMs: undefined })],
          total: 1,
        })
        .mockResolvedValue({
          tasks: [createTask({ status: 'completed', durationMs: 1500 })],
          total: 1,
        });

      renderComponent();

      // Initial fetch — returns running task, polling starts
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Trigger one poll — second call returns completed task, polling should stop
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });

      const callsAfterSecondFetch = mockFetchTasks.mock.calls.length;
      expect(callsAfterSecondFetch).toBeGreaterThanOrEqual(2);

      // Advance further — no more fetches expected
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(mockFetchTasks.mock.calls.length).toBe(callsAfterSecondFetch);
    });
  });

  // ── staleTime: 0 — immediate refetch after mutation ────────────────

  it('immediately re-fetches after a task is created', async () => {
    const user = userEvent.setup();
    mockCreateTask.mockResolvedValue(
      createTask({ id: 'new-id', name: 'Fresh Task', status: 'pending', durationMs: undefined })
    );

    renderComponent();
    await screen.findByText('Task History');

    const callsAfterInit = mockFetchTasks.mock.calls.length;

    await user.click(screen.getByText('New Task'));
    await user.type(screen.getByPlaceholderText('e.g., Run backup'), 'Fresh Task');
    await user.click(screen.getByText('Create Task'));

    // Dialog closes on success, confirming mutation + invalidation ran
    await waitFor(() => {
      expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
    });

    expect(mockFetchTasks.mock.calls.length).toBeGreaterThan(callsAfterInit);
  });
});
