// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenTasks } from './TaskHistory';
import { createTask } from '../test/mocks';

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
        <OpenTasks />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────

describe('OpenTasks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchTasks.mockResolvedValue({ tasks: [], total: 0 });
    vi.mocked(api.fetchPersonalities).mockResolvedValue({ personalities: [] });
  });

  it('renders the Open Tasks heading', async () => {
    renderComponent();
    expect(await screen.findByText('Open Tasks')).toBeInTheDocument();
  });

  it('shows "No active tasks" when no active tasks are returned', async () => {
    renderComponent();
    expect(await screen.findByText('No active tasks')).toBeInTheDocument();
  });

  it('filters out completed/failed tasks — only shows pending and running by default', async () => {
    const tasks = [
      createTask({ status: 'pending', name: 'Pending task' }),
      createTask({ status: 'running', name: 'Running task', durationMs: undefined }),
      createTask({ status: 'completed', name: 'Completed task' }),
      createTask({ status: 'failed', name: 'Failed task' }),
    ];
    mockFetchTasks.mockResolvedValue({ tasks, total: 4 });
    renderComponent();

    expect(await screen.findByText('Pending task')).toBeInTheDocument();
    expect(screen.getByText('Running task')).toBeInTheDocument();
    expect(screen.queryByText('Completed task')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed task')).not.toBeInTheDocument();
  });

  it('displays active task status text', async () => {
    const tasks = [
      createTask({ status: 'pending', name: 'Task A' }),
      createTask({ status: 'running', name: 'Task B', durationMs: undefined }),
    ];
    mockFetchTasks.mockResolvedValue({ tasks, total: 2 });
    renderComponent();

    expect(await screen.findByText('pending')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('shows task type badges', async () => {
    const tasks = [
      createTask({ status: 'pending', type: 'execute', name: 'Task 1' }),
      createTask({ status: 'running', type: 'query', name: 'Task 2', durationMs: undefined }),
      createTask({ status: 'pending', type: 'file', name: 'Task 3' }),
    ];
    mockFetchTasks.mockResolvedValue({ tasks, total: 3 });
    renderComponent();

    expect(await screen.findByText('execute')).toBeInTheDocument();
    expect(screen.getByText('query')).toBeInTheDocument();
    expect(screen.getByText('file')).toBeInTheDocument();
  });

  it('renders status filter dropdown with only active options', async () => {
    renderComponent();
    const statusSelect = await screen.findByLabelText('Filter by status');
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect).toHaveValue('');
    // Active options present
    expect(screen.getByRole('option', { name: 'All Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'In Progress' })).toBeInTheDocument();
    // Historical options NOT present
    expect(screen.queryByRole('option', { name: 'Completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Failed' })).not.toBeInTheDocument();
  });

  it('renders type filter dropdown with expected options', async () => {
    renderComponent();
    const typeSelect = await screen.findByLabelText('Filter by type');
    expect(typeSelect).toBeInTheDocument();
    expect(typeSelect).toHaveValue('');
  });

  it('calls fetchTasks with status filter when changed to pending', async () => {
    const user = userEvent.setup();
    renderComponent();

    const statusSelect = await screen.findByLabelText('Filter by status');
    await user.selectOptions(statusSelect, 'pending');

    expect(mockFetchTasks).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('shows all running tasks when "In Progress" is selected', async () => {
    const user = userEvent.setup();
    const tasks = [
      createTask({ status: 'running', name: 'Active job', durationMs: undefined }),
      createTask({ status: 'pending', name: 'Queued job' }),
    ];
    mockFetchTasks.mockResolvedValue({ tasks, total: 2 });
    renderComponent();

    const statusSelect = await screen.findByLabelText('Filter by status');
    await user.selectOptions(statusSelect, 'running');

    expect(mockFetchTasks).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));
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
    await user.selectOptions(statusSelect, 'pending');

    const clearButton = await screen.findByText('Clear');
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('does not show pagination controls', async () => {
    // OpenTasks uses client-side display, no pagination
    const tasks = Array.from({ length: 15 }, (_, i) =>
      createTask({ status: 'pending', name: `Task ${i + 1}` })
    );
    mockFetchTasks.mockResolvedValue({ tasks, total: 15 });
    renderComponent();

    await screen.findByText('Task 1');
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });

  it('renders date range inputs', async () => {
    renderComponent();
    await screen.findByText('Open Tasks');
    expect(screen.queryByLabelText('From date')).toBeInTheDocument();
    expect(screen.queryByLabelText('To date')).toBeInTheDocument();
  });

  it('does not render export buttons', async () => {
    renderComponent();
    await screen.findByText('Open Tasks');
    expect(screen.queryByLabelText('Export CSV')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Export JSON')).not.toBeInTheDocument();
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
    const tasks = [createTask({ status: 'pending', name: 'Pending deploy' })];
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Pending deploy');
    const editButton = screen.getByTitle('Edit task');
    await user.click(editButton);

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pending deploy')).toBeInTheDocument();
  });

  it('calls updateTask when edit form is saved', async () => {
    const user = userEvent.setup();
    const tasks = [createTask({ status: 'pending', name: 'Pending deploy' })];
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    mockUpdateTask.mockResolvedValue({
      ...tasks[0],
      name: 'Updated Name',
    });
    renderComponent();

    await screen.findByText('Pending deploy');
    await user.click(screen.getByTitle('Edit task'));

    const nameInput = screen.getByDisplayValue('Pending deploy');
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
    const tasks = [createTask({ status: 'pending', name: 'Pending deploy' })];
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Pending deploy');
    const deleteButton = screen.getByTitle('Delete task');
    await user.click(deleteButton);

    expect(screen.getByText('Delete Task')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('calls deleteTask when confirmation is accepted', async () => {
    const user = userEvent.setup();
    const tasks = [createTask({ status: 'pending', name: 'Pending deploy' })];
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    mockDeleteTask.mockResolvedValue(undefined);
    renderComponent();

    await screen.findByText('Pending deploy');
    await user.click(screen.getByTitle('Delete task'));

    const deleteConfirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteConfirmButton);

    expect(mockDeleteTask).toHaveBeenCalledWith(tasks[0].id);
  });

  it('dismisses delete confirmation when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const tasks = [createTask({ status: 'pending', name: 'Pending deploy' })];
    mockFetchTasks.mockResolvedValue({ tasks, total: 1 });
    renderComponent();

    await screen.findByText('Pending deploy');
    await user.click(screen.getByTitle('Delete task'));

    expect(screen.getByText('Delete Task')).toBeInTheDocument();

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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });

      const callsAfterSecondFetch = mockFetchTasks.mock.calls.length;
      expect(callsAfterSecondFetch).toBeGreaterThanOrEqual(2);

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
    await screen.findByText('Open Tasks');

    const callsAfterInit = mockFetchTasks.mock.calls.length;

    await user.click(screen.getByText('New Task'));
    await user.type(screen.getByPlaceholderText('e.g., Run backup'), 'Fresh Task');
    await user.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(screen.queryByText('Create New Task')).not.toBeInTheDocument();
    });

    expect(mockFetchTasks.mock.calls.length).toBeGreaterThan(callsAfterInit);
  });
});
