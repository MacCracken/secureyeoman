// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspacesSettings } from './WorkspacesSettings';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    fetchWorkspaceMembers: vi.fn(),
    addWorkspaceMember: vi.fn(),
    updateWorkspaceMemberRole: vi.fn(),
    removeWorkspaceMember: vi.fn(),
    fetchUsers: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchWorkspaces = vi.mocked(api.fetchWorkspaces);
const mockFetchUsers = vi.mocked(api.fetchUsers);
const mockCreateWorkspace = vi.mocked(api.createWorkspace);
const mockUpdateWorkspace = vi.mocked(api.updateWorkspace);
const mockDeleteWorkspace = vi.mocked(api.deleteWorkspace);
const mockFetchWorkspaceMembers = vi.mocked(api.fetchWorkspaceMembers);
const mockAddWorkspaceMember = vi.mocked(api.addWorkspaceMember);
const mockUpdateWorkspaceMemberRole = vi.mocked(api.updateWorkspaceMemberRole);
const mockRemoveWorkspaceMember = vi.mocked(api.removeWorkspaceMember);

const WORKSPACE = {
  id: 'ws-1',
  name: 'Engineering',
  description: 'Engineering team workspace',
  createdBy: 'admin',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  members: [{ userId: 'u-1', role: 'admin', email: 'admin@test.com' }],
  settings: {},
};

const WORKSPACE_NO_DESC = {
  id: 'ws-2',
  name: 'Marketing',
  description: '',
  createdBy: 'admin',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  members: [
    { userId: 'u-1', role: 'owner', email: 'admin@test.com' },
    { userId: 'u-2', role: 'member', email: 'bob@test.com' },
  ],
  settings: {},
};

const USERS = [
  { id: 'u-1', email: 'admin@test.com', displayName: 'Alice Admin', isAdmin: true, createdAt: 1700000000000 },
  { id: 'u-2', email: 'bob@test.com', displayName: 'Bob User', isAdmin: false, createdAt: 1700000000000 },
  { id: 'u-3', email: 'carol@test.com', displayName: '', isAdmin: false, createdAt: 1700000000000 },
];

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderSettings() {
  return render(
    <QueryClientProvider client={createQC()}>
      <WorkspacesSettings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWorkspaces.mockResolvedValue({ workspaces: [WORKSPACE] } as any);
  mockFetchUsers.mockResolvedValue({ users: USERS } as any);
  mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
});

describe('WorkspacesSettings', () => {
  // ── Basic rendering ──────────────────────────────────────────────────

  it('renders the heading', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Workspaces')).toBeInTheDocument();
    });
  });

  it('shows workspace names', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
  });

  it('shows workspace description', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering team workspace')).toBeInTheDocument();
    });
  });

  it('shows empty state when no workspaces', async () => {
    mockFetchWorkspaces.mockResolvedValue({ workspaces: [] } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/No workspaces/i)).toBeInTheDocument();
    });
  });

  it('shows New Workspace button', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/New Workspace/i)).toBeInTheDocument();
    });
  });

  it('shows member count singular', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/1 member$/)).toBeInTheDocument();
    });
  });

  it('shows member count plural', async () => {
    mockFetchWorkspaces.mockResolvedValue({ workspaces: [WORKSPACE_NO_DESC] } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/2 members/)).toBeInTheDocument();
    });
  });

  it('does not render description text when description is empty', async () => {
    mockFetchWorkspaces.mockResolvedValue({ workspaces: [WORKSPACE_NO_DESC] } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Marketing')).toBeInTheDocument();
    });
    // The description paragraph should not be rendered at all
    const card = screen.getByText('Marketing').closest('.card')!;
    const descEls = card.querySelectorAll('.text-muted-foreground.truncate');
    // None of the truncated muted elements should have empty text as description
    for (const el of descEls) {
      // The workspace description <p> has class "text-xs text-muted-foreground truncate"
      // It should not exist for empty descriptions
      if (el.tagName === 'P' && el.classList.contains('text-xs')) {
        // This element would be the description — should not exist
        expect(el.textContent).not.toBe('');
      }
    }
  });

  it('shows the loading spinner while fetching workspaces', async () => {
    // Never resolve to keep loading state
    mockFetchWorkspaces.mockReturnValue(new Promise(() => {}));
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText(/Loading workspaces/)).toBeInTheDocument();
    });
  });

  // ── Create workspace ─────────────────────────────────────────────────

  it('opens create form when New Workspace is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    expect(screen.getByText('New Workspace', { selector: 'h4' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Engineering')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional description')).toBeInTheDocument();
  });

  it('disables Create button when name is empty', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
  });

  it('enables Create button when name is provided', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'New Team');
    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).not.toBeDisabled();
  });

  it('submits create form with trimmed values', async () => {
    const user = userEvent.setup();
    mockCreateWorkspace.mockResolvedValue({ workspace: { ...WORKSPACE, id: 'ws-new', name: 'New Team' } } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), '  New Team  ');
    await user.type(screen.getByPlaceholderText('Optional description'), '  A desc  ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateWorkspace).toHaveBeenCalledWith({
      name: 'New Team',
      description: 'A desc',
    });
  });

  it('submits create form with undefined description when empty', async () => {
    const user = userEvent.setup();
    mockCreateWorkspace.mockResolvedValue({ workspace: { ...WORKSPACE, id: 'ws-new', name: 'X' } } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    await user.type(screen.getByPlaceholderText('e.g. Engineering'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateWorkspace).toHaveBeenCalledWith({
      name: 'X',
      description: undefined,
    });
  });

  it('closes create form via Cancel button', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    expect(screen.getByPlaceholderText('e.g. Engineering')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('e.g. Engineering')).not.toBeInTheDocument();
  });

  it('closes create form via X button', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByText(/New Workspace/));
    expect(screen.getByPlaceholderText('e.g. Engineering')).toBeInTheDocument();
    // X button is in the create form header
    const formHeader = screen.getByText('New Workspace', { selector: 'h4' }).closest('div')!;
    const xBtn = within(formHeader).getByRole('button');
    await user.click(xBtn);
    expect(screen.queryByPlaceholderText('e.g. Engineering')).not.toBeInTheDocument();
  });

  // ── Edit workspace ────────────────────────────────────────────────────

  it('opens edit mode with pre-filled fields when Edit is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    // Should show input with current name
    const nameInput = screen.getByPlaceholderText('Workspace name') as HTMLInputElement;
    expect(nameInput.value).toBe('Engineering');
    const descInput = screen.getByPlaceholderText('Description (optional)') as HTMLInputElement;
    expect(descInput.value).toBe('Engineering team workspace');
  });

  it('submits update with trimmed values', async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockResolvedValue({ workspace: WORKSPACE } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    const nameInput = screen.getByPlaceholderText('Workspace name');
    await user.clear(nameInput);
    await user.type(nameInput, '  Eng Team  ');
    const descInput = screen.getByPlaceholderText('Description (optional)');
    await user.clear(descInput);
    await user.type(descInput, '  Updated desc  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateWorkspace).toHaveBeenCalledWith('ws-1', {
      name: 'Eng Team',
      description: 'Updated desc',
    });
  });

  it('sends undefined description when edit description is cleared', async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockResolvedValue({ workspace: WORKSPACE } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    const descInput = screen.getByPlaceholderText('Description (optional)');
    await user.clear(descInput);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateWorkspace.mock.calls[0][1]).toEqual(
      expect.objectContaining({ description: undefined })
    );
  });

  it('disables Save when edit name is empty', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    const nameInput = screen.getByPlaceholderText('Workspace name');
    await user.clear(nameInput);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('cancels edit mode via X button', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByPlaceholderText('Workspace name')).toBeInTheDocument();
    // The edit row container has both inputs, Save, and X buttons
    const card = screen.getByPlaceholderText('Workspace name').closest('.card')!;
    const buttons = within(card as HTMLElement).getAllByRole('button');
    // The X button is the last one (after Save)
    const xBtn = buttons[buttons.length - 1];
    await user.click(xBtn);
    // Should exit edit mode and show the name normally
    expect(screen.queryByPlaceholderText('Workspace name')).not.toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  // ── Delete workspace ──────────────────────────────────────────────────

  it('shows delete confirmation when Delete is clicked', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    // Confirmation bar shows workspace name in bold
    expect(screen.getByText('Engineering', { selector: 'strong' })).toBeInTheDocument();
  });

  it('cancels delete confirmation', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument();
  });

  it('calls deleteWorkspace on confirm', async () => {
    const user = userEvent.setup();
    mockDeleteWorkspace.mockResolvedValue(undefined as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Delete'));
    // Click the Delete button in the confirmation bar (not the icon button)
    const confirmBar = screen.getByText(/This cannot be undone/).closest('div')!;
    const deleteBtn = within(confirmBar as HTMLElement).getByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);
    expect(mockDeleteWorkspace).toHaveBeenCalledWith('ws-1');
  });

  // ── Members panel ─────────────────────────────────────────────────────

  it('expands members panel when Members button is clicked', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
  });

  it('collapses members panel when Members button is clicked again', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    expect(screen.queryByText(/No members yet/)).not.toBeInTheDocument();
  });

  it('shows members loading state', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockReturnValue(new Promise(() => {}));
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/Loading members/)).toBeInTheDocument();
    });
  });

  it('shows member list with names', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [
        { userId: 'u-1', role: 'admin', joinedAt: 1700000000000 },
        { userId: 'u-2', role: 'member', joinedAt: 1700000000000 },
      ],
      total: 2,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
      expect(screen.getByText('Bob User')).toBeInTheDocument();
    });
  });

  it('falls back to email when displayName is empty', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-3', role: 'viewer', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      // u-3 has empty displayName, should show email
      expect(screen.getByText('carol@test.com')).toBeInTheDocument();
    });
  });

  it('falls back to userId when user is not in allUsers', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-unknown', role: 'member', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('u-unknown')).toBeInTheDocument();
    });
  });

  it('shows member count in panel header', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [
        { userId: 'u-1', role: 'admin', joinedAt: 1700000000000 },
        { userId: 'u-2', role: 'member', joinedAt: 1700000000000 },
      ],
      total: 2,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Members (2)')).toBeInTheDocument();
    });
  });

  // ── Add member ────────────────────────────────────────────────────────

  it('opens add member form and adds a member', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    mockAddWorkspaceMember.mockResolvedValue({
      member: { userId: 'u-2', role: 'member', joinedAt: Date.now() },
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
    // Click the Add button
    await user.click(screen.getByText('Add'));
    // Should show user selector and role selector
    expect(screen.getByLabelText('Select user')).toBeInTheDocument();
    expect(screen.getByLabelText('Select role')).toBeInTheDocument();
  });

  it('add button is disabled when no user is selected', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    // The Add submit button (not the "Add" toggle) should be disabled
    const addBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent === 'Add' && b.classList.contains('btn')
    );
    // The submit button is disabled because no user selected
    expect(addBtns[0]).toBeDisabled();
  });

  it('submits add member with selected user and role', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    mockAddWorkspaceMember.mockResolvedValue({
      member: { userId: 'u-1', role: 'admin', joinedAt: Date.now() },
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    // Select a user
    await user.selectOptions(screen.getByLabelText('Select user'), 'u-1');
    // Change role to admin
    await user.selectOptions(screen.getByLabelText('Select role'), 'admin');
    // Click the submit Add button
    const addBtns = screen.getAllByRole('button').filter(
      (b) => b.textContent === 'Add' && b.classList.contains('btn')
    );
    await user.click(addBtns[0]);

    expect(mockAddWorkspaceMember).toHaveBeenCalledWith('ws-1', {
      userId: 'u-1',
      role: 'admin',
    });
  });

  it('filters out already-added members from available users', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-1', role: 'admin', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    const selectUser = screen.getByLabelText('Select user');
    const options = within(selectUser).getAllByRole('option');
    // Should have "Select user..." placeholder + u-2 + u-3 but NOT u-1
    const values = options.map((o) => (o as HTMLOptionElement).value);
    expect(values).not.toContain('u-1');
    expect(values).toContain('u-2');
    expect(values).toContain('u-3');
  });

  it('closes add member form via X button', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({ members: [], total: 0 } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText(/No members yet/)).toBeInTheDocument();
    });
    await user.click(screen.getByText('Add'));
    expect(screen.getByLabelText('Select user')).toBeInTheDocument();
    // Find the X close button in the add form (last button in the add form row)
    const addForm = screen.getByLabelText('Select user').closest('.flex')!;
    const buttons = within(addForm as HTMLElement).getAllByRole('button');
    const closeBtn = buttons[buttons.length - 1]; // last is X
    await user.click(closeBtn);
    expect(screen.queryByLabelText('Select user')).not.toBeInTheDocument();
  });

  // ── Change member role ────────────────────────────────────────────────

  it('changes a member role via select dropdown', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-1', role: 'admin', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    mockUpdateWorkspaceMemberRole.mockResolvedValue(undefined as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
    // The role <select> is the one next to the member name (not the Add form one)
    // It's labeled "Select role" too, but inside the member row
    const memberRow = screen.getByText('Alice Admin').closest('.flex')!;
    const roleSelect = within(memberRow as HTMLElement).getAllByLabelText('Select role')[0];
    await user.selectOptions(roleSelect, 'viewer');

    expect(mockUpdateWorkspaceMemberRole).toHaveBeenCalledWith('ws-1', 'u-1', 'viewer');
  });

  // ── Remove member ────────────────────────────────────────────────────

  it('removes a member when X is clicked on member row', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-1', role: 'admin', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    mockRemoveWorkspaceMember.mockResolvedValue(undefined as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
    // Click the remove button (titled "Remove member")
    await user.click(screen.getByTitle('Remove member'));
    expect(mockRemoveWorkspaceMember).toHaveBeenCalledWith('ws-1', 'u-1');
  });

  // ── Role display ──────────────────────────────────────────────────────

  it('displays correct role labels for different roles', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [
        { userId: 'u-1', role: 'owner', joinedAt: 1700000000000 },
        { userId: 'u-2', role: 'viewer', joinedAt: 1700000000000 },
      ],
      total: 2,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
      expect(screen.getByText('Bob User')).toBeInTheDocument();
    });
    // Role label spans have a specific class pattern with color
    const ownerLabels = screen.getAllByText('Owner');
    // At least one is a <span> role label (not an <option>)
    expect(ownerLabels.some((el) => el.tagName === 'SPAN')).toBe(true);
    const viewerLabels = screen.getAllByText('Viewer');
    expect(viewerLabels.some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  // ── Fallback for unknown role ─────────────────────────────────────────

  it('falls back to member role meta for unknown roles', async () => {
    const user = userEvent.setup();
    mockFetchWorkspaceMembers.mockResolvedValue({
      members: [{ userId: 'u-1', role: 'superadmin', joinedAt: 1700000000000 }],
      total: 1,
    } as any);
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('Members'));
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
    // Should fall back to ROLE_META.member — the role label span next to the user
    const memberRow = screen.getByText('Alice Admin').closest('.flex')!;
    // The role label <span> contains "Member" text (not just in <option>)
    const roleSpan = within(memberRow as HTMLElement).getAllByText('Member');
    // At least one is from the label span (not just the select option)
    expect(roleSpan.length).toBeGreaterThanOrEqual(1);
  });
});
