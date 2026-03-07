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
  // SecuritySettings module-level imports (needed for UserRoleAssignments)
  fetchRoles: vi.fn(),
  fetchAssignments: vi.fn(),
  assignRole: vi.fn(),
  revokeAssignment: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchMetrics: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  updateSecurityPolicy: vi.fn(),
  fetchAgentConfig: vi.fn(),
  updateAgentConfig: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchModelDefault: vi.fn(),
  setModelDefault: vi.fn(),
  clearModelDefault: vi.fn(),
  fetchModelInfo: vi.fn(),
  fetchSecretKeys: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  checkSecret: vi.fn(),
  // IntentEditor imports
  fetchIntents: vi.fn(),
  fetchActiveIntent: vi.fn(),
  activateIntent: vi.fn(),
  deleteIntent: vi.fn(),
  fetchEnforcementLog: vi.fn(),
  createIntent: vi.fn(),
  readSignal: vi.fn(),
  fetchGoalTimeline: vi.fn(),
  // WorkspacesSettings imports
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  fetchWorkspaceMembers: vi.fn(),
  addWorkspaceMember: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
  removeWorkspaceMember: vi.fn(),
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
    // UserRoleAssignments queries
    vi.mocked(api.fetchRoles).mockResolvedValue({ roles: [] });
    vi.mocked(api.fetchAssignments).mockResolvedValue({ assignments: [] });
    vi.mocked(api.fetchSecretKeys).mockResolvedValue({ keys: [] });
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

  it('does not show Admin badge for non-admin users', async () => {
    mockFetchUsers.mockResolvedValue({
      users: [{ ...SAMPLE_USERS[1], isAdmin: false }],
    });
    renderComponent();
    await screen.findByText('Bob');
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows built-in badge for built-in users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText('built-in')).toBeInTheDocument();
  });

  it('does not show built-in badge for non-builtin users', async () => {
    mockFetchUsers.mockResolvedValue({
      users: [SAMPLE_USERS[1]], // Bob is not builtin
    });
    renderComponent();
    await screen.findByText('Bob');
    expect(screen.queryByText('built-in')).not.toBeInTheDocument();
  });

  it('hides delete button for built-in users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    await screen.findByText('Alice');
    const deleteButtons = screen.queryAllByTitle('Delete user');
    // Alice is built-in, Bob is not -- only Bob has a delete button
    expect(deleteButtons.length).toBe(1);
  });

  it('shows edit button for every user', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    expect(editButtons.length).toBe(2);
  });

  it('shows last login date when available', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    expect(await screen.findByText(/Last login/)).toBeInTheDocument();
  });

  it('does not show last login when not available', async () => {
    mockFetchUsers.mockResolvedValue({ users: [SAMPLE_USERS[0]] }); // Alice has no lastLoginAt
    renderComponent();
    await screen.findByText('Alice');
    expect(screen.queryByText(/Last login/)).not.toBeInTheDocument();
  });

  it('shows joined date for users', async () => {
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();
    await screen.findByText('Alice');
    expect(screen.getAllByText(/Joined/).length).toBeGreaterThanOrEqual(1);
  });

  // ── Create form ──────────────────────────────────────────────────

  it('opens the create form when Add User is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));
    expect(screen.getByText('New User')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument();
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

  it('resets form fields when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'test@test.com');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Reopen the form -- fields should be cleared
    await user.click(await screen.findByText('Add User'));
    const emailInput = screen.getByPlaceholderText('user@example.com') as HTMLInputElement;
    expect(emailInput.value).toBe('');
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

  it('sets isAdmin when checkbox is ticked in create form', async () => {
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

  it('closes create form on successful creation', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'new@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'New User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.queryByText('New User')).not.toBeInTheDocument();
    });
  });

  it('shows error message when createUser fails', async () => {
    mockCreateUser.mockRejectedValue(new Error('Email already exists'));
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'dup@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'Dup User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });

  it('shows loading state while create mutation is pending', async () => {
    mockCreateUser.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByText('Add User'));

    await user.type(screen.getByPlaceholderText('user@example.com'), 'new@test.com');
    await user.type(screen.getByPlaceholderText('Jane Doe'), 'New User');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass');

    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      // Create button should be disabled while pending
      const createBtn = screen.getByRole('button', { name: '' }); // text replaced with spinner
      expect(createBtn).toBeDisabled();
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

  it('hides Add User button while editing', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    expect(screen.queryByText('Add User')).not.toBeInTheDocument();
  });

  it('pre-fills edit form with user data', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
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

  it('calls updateUser with toggled admin status', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    const editButtons = screen.getAllByTitle('Edit user');
    // Click edit on Bob (index 1)
    await user.click(editButtons[1]);

    // Bob is not admin, toggle admin checkbox
    const adminCheckbox = screen.getByLabelText('Admin');
    await user.click(adminCheckbox);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({ isAdmin: true })
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

  it('closes edit form on successful update', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument();
    });
  });

  it('shows error message when updateUser fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('Update failed'));
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  it('disables Save button while update mutation is pending', async () => {
    mockUpdateUser.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Alice');
    const editButtons = screen.getAllByTitle('Edit user');
    await user.click(editButtons[0]);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      // The Save button text is replaced with a spinner, button should be disabled
      const buttons = screen.getAllByRole('button');
      const disabledButtons = buttons.filter((b) => b.disabled);
      expect(disabledButtons.length).toBeGreaterThanOrEqual(1);
    });
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

  it('shows the user name in delete confirmation', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    // Bob appears in both the user row and the confirmation <strong> tag
    const allBob = screen.getAllByText('Bob');
    expect(allBob.length).toBe(2); // row display name + confirmation <strong>
    // The <strong> element is in the confirmation
    const strongBob = allBob.find((el) => el.tagName === 'STRONG');
    expect(strongBob).toBeTruthy();
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

  it('closes delete confirmation on successful delete', async () => {
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument();
    });
  });

  it('disables Delete button while delete mutation is pending', async () => {
    mockDeleteUser.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    mockFetchUsers.mockResolvedValue({ users: SAMPLE_USERS });
    renderComponent();

    await screen.findByText('Bob');
    await user.click(screen.getByTitle('Delete user'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      // Button should be disabled while pending
      const deleteBtn = screen
        .getAllByRole('button')
        .find((b) => b.disabled && b.className.includes('destructive'));
      expect(deleteBtn).toBeTruthy();
    });
  });

  // ── Multiple users ───────────────────────────────────────────────

  it('renders delete button only for non-builtin users', async () => {
    const users: UserInfo[] = [
      { ...SAMPLE_USERS[0], isBuiltin: true }, // Alice - builtin
      { ...SAMPLE_USERS[1], isBuiltin: false }, // Bob - not builtin
      {
        id: 'user-3',
        email: 'charlie@example.com',
        displayName: 'Charlie',
        isAdmin: false,
        isBuiltin: false,
        createdAt: Date.now(),
      },
    ];
    mockFetchUsers.mockResolvedValue({ users });
    renderComponent();
    await screen.findByText('Alice');
    const deleteButtons = screen.getAllByTitle('Delete user');
    // Only Bob and Charlie should have delete buttons
    expect(deleteButtons.length).toBe(2);
  });

  it('renders all users with edit buttons', async () => {
    const users: UserInfo[] = [
      SAMPLE_USERS[0],
      SAMPLE_USERS[1],
      {
        id: 'user-3',
        email: 'charlie@example.com',
        displayName: 'Charlie',
        isAdmin: false,
        createdAt: Date.now(),
      },
    ];
    mockFetchUsers.mockResolvedValue({ users });
    renderComponent();
    await screen.findByText('Charlie');
    const editButtons = screen.getAllByTitle('Edit user');
    expect(editButtons.length).toBe(3);
  });
});
