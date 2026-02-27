// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsersSettings } from './UsersSettings';
import type { UserInfo } from '../api/client';

vi.mock('../api/client', () => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchUsers = vi.mocked(api.fetchUsers);
const mockCreateUser = vi.mocked(api.createUser);
const mockUpdateUser = vi.mocked(api.updateUser);
const mockDeleteUser = vi.mocked(api.deleteUser);

const SAMPLE_USERS: UserInfo[] = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    isAdmin: true,
    isBuiltin: true,
    createdAt: new Date('2025-01-01').getTime(),
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    displayName: 'Bob',
    isAdmin: false,
    createdAt: new Date('2025-06-01').getTime(),
    lastLoginAt: new Date('2026-01-15').getTime(),
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderComponent() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <UsersSettings />
    </QueryClientProvider>
  );
}

describe('UsersSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchUsers.mockResolvedValue({ users: [] });
    mockCreateUser.mockResolvedValue({ user: SAMPLE_USERS[0] });
    mockUpdateUser.mockResolvedValue({ user: SAMPLE_USERS[0] });
    mockDeleteUser.mockResolvedValue({ message: 'deleted' });
  });

  // ── Renders ──────────────────────────────────────────────────────

  it('renders the Users heading', async () => {
    renderComponent();
    expect(await screen.findByText('Users')).toBeInTheDocument();
  });

  it('renders the Add User button', async () => {
    renderComponent();
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    mockFetchUsers.mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    expect(await screen.findByText('Loading users...')).toBeInTheDocument();
  });

  it('shows empty state when no users', async () => {
    renderComponent();
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
  });

  it('renders user list with display names and emails', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows Admin badge for admin users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });

  it('shows built-in badge for built-in users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText('built-in')).toBeInTheDocument();
  });

  it('hides delete button for built-in users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    await screen.findByText('Alice');
    const deleteButtons = screen.queryAllByTitle('Delete user');
    // Alice is built-in, Bob is not — only Bob has a delete button
    expect(deleteButtons.length).toBe(1);
  });

  it('shows last login date when available', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText(/Last login/)).toBeInTheDocument();
  });

  // ── Create form ──────────────────────────────────────────────────

  it('opens the create form when Add User is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));
    expect(screen.getByText('New User')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
  });

  it('hides Add User button while create form is open', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));
    expect(screen.queryByText('Add User')).not.toBeInTheDocument();
  });

  it('closes the create form when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New User')).not.toBeInTheDocument();
    expect(await screen.findByText('Add User')).toBeInTheDocument();
  });

  it('calls createUser with correct data when Create is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'new@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'New User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@test.com',
          displayName: 'New User',
          password: 'secret123',
          isAdmin: false,
        })
      );
    });
  });

  it('sets isAdmin when checkbox is ticked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'admin@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Admin User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');
    await user.click(screen.getByLabelText('Admin'));

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
    });
  });

  // ── Edit flow ────────────────────────────────────────────────────

  it('opens inline edit form when edit button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls updateUser with new display name', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    const displayNameInput = screen.getByDisplayValue('Alice');
    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Alice Updated');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ displayName: 'Alice Updated' })
      );
    });
  });

  it('closes edit form when Cancel is clicked', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  // ── Delete flow ──────────────────────────────────────────────────

  it('shows delete confirmation when delete button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    expect(screen.getByText(/Delete user/)).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
  });

  it('calls deleteUser when Delete is confirmed', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalledWith('user-2');
    });
  });

  it('cancels delete when Cancel is clicked in confirmation', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();

    // The Cancel button inside the confirmation dialog
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
