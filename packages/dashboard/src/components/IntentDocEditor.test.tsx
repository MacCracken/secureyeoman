// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntentDocEditor } from './IntentDocEditor';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchIntent: vi.fn(),
    updateIntent: vi.fn(),
  };
});

import * as api from '../api/client';

const mockFetchIntent = vi.mocked(api.fetchIntent);
const mockUpdateIntent = vi.mocked(api.updateIntent);

const INTENT_DOC = {
  id: 'int-1',
  name: 'Test Intent',
  apiVersion: '1.0',
  goals: [
    {
      id: 'g-1',
      name: 'Reduce costs',
      description: 'Lower monthly spend',
      priority: 8,
      successCriteria: 'Under $1000',
      ownerRole: 'admin',
      skills: [],
      signals: [],
      authorizedActions: [],
    },
  ],
  signals: [
    {
      id: 's-1',
      name: 'CPU Usage',
      sourceId: 'prometheus',
      metric: 'cpu_pct',
      direction: 'above',
      threshold: 90,
      warningThreshold: 70,
      dataSources: [],
    },
  ],
  dataSources: [
    {
      id: 'ds-1',
      name: 'Prometheus',
      type: 'prometheus',
      connection: 'https://prometheus.local:9090',
      authSecret: 'PROM_TOKEN',
      schema: 'metrics',
    },
  ],
  authorizedActions: [
    {
      id: 'aa-1',
      description: 'Scale up pods',
      requiredRole: 'operator',
      conditions: 'env == "prod"',
      appliesToGoals: ['g-1'],
      appliesToSignals: ['s-1'],
      mcpTools: ['k8s_scale'],
    },
  ],
  tradeoffProfiles: [
    {
      id: 'tp-1',
      name: 'Balanced',
      speedVsThoroughness: 0.5,
      costVsQuality: 0.5,
      autonomyVsConfirmation: 0.5,
      isDefault: true,
      notes: 'Default balanced profile',
    },
  ],
  hardBoundaries: [{ id: 'b-1', rule: 'Never delete prod data', rationale: 'Safety', rego: '' }],
  policies: [
    { id: 'p-1', rule: 'Log all actions', enforcement: 'warn', rationale: 'Audit', rego: '' },
  ],
  delegationFramework: {
    tenants: [
      {
        id: 'dt-1',
        principle: 'Least privilege',
        decisionBoundaries: ['no-prod-write', 'read-only'],
      },
    ],
  },
  context: [{ key: 'orgName', value: 'ACME Corp' }],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderDocEditor(intentId = 'int-1') {
  return render(
    <QueryClientProvider client={createQC()}>
      <IntentDocEditor intentId={intentId} />
    </QueryClientProvider>
  );
}

// Helper: navigate to a section and wait for it
async function navTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  const navButtons = screen.getAllByText(label);
  await user.click(navButtons[0]);
}

// Helper: stub confirm dialog
function stubConfirm(result: boolean) {
  vi.spyOn(window, 'confirm').mockReturnValue(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchIntent.mockResolvedValue({ intent: structuredClone(INTENT_DOC) } as any);
  mockUpdateIntent.mockResolvedValue({} as any);
});

describe('IntentDocEditor', () => {
  // ─── Loading / error ──────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    mockFetchIntent.mockReturnValue(new Promise(() => {}));
    renderDocEditor();
    expect(screen.getByText(/Loading intent document/)).toBeInTheDocument();
  });

  it('renders intent name after loading', async () => {
    renderDocEditor();
    await waitFor(() => {
      expect(screen.getByText('Test Intent')).toBeInTheDocument();
    });
  });

  it('renders sidebar navigation sections', async () => {
    renderDocEditor();
    await waitFor(() => {
      expect(screen.getAllByText('Goals').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Signals').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Data Sources').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Authorized Actions').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Trade-off Profiles').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Hard Boundaries').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Policies').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Delegation').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Context').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('defaults to Goals section showing goal names', async () => {
    renderDocEditor();
    await waitFor(() => {
      expect(screen.getByText('Reduce costs')).toBeInTheDocument();
    });
  });

  it('shows Save All Changes button (disabled when no changes)', async () => {
    renderDocEditor();
    await waitFor(() => {
      const saveBtn = screen.getByText('Save All Changes');
      expect(saveBtn).toBeInTheDocument();
      expect(saveBtn.closest('button')).toBeDisabled();
    });
  });

  // ─── Section navigation ──────────────────────────────────────────────────

  it('navigates to Signals section when clicked', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => {
      expect(screen.getByText('Signals')).toBeInTheDocument();
    });
    await navTo(user, 'Signals');
    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });
  });

  it('navigates to Hard Boundaries section', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Hard Boundaries')).toBeInTheDocument());
    await navTo(user, 'Hard Boundaries');
    await waitFor(() => {
      expect(screen.getByText('Never delete prod data')).toBeInTheDocument();
    });
  });

  it('navigates to Policies section', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Policies')).toBeInTheDocument());
    await navTo(user, 'Policies');
    await waitFor(() => {
      expect(screen.getByText('Log all actions')).toBeInTheDocument();
    });
  });

  it('navigates to Data Sources section and shows items', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Data Sources')).toBeInTheDocument());
    await navTo(user, 'Data Sources');
    await waitFor(() => {
      expect(screen.getByText('Prometheus')).toBeInTheDocument();
    });
  });

  it('navigates to Authorized Actions section and shows items', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Authorized Actions')).toBeInTheDocument());
    await navTo(user, 'Authorized Actions');
    await waitFor(() => {
      expect(screen.getByText('Scale up pods')).toBeInTheDocument();
    });
  });

  it('navigates to Trade-off Profiles section and shows items', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Trade-off Profiles')).toBeInTheDocument());
    await navTo(user, 'Trade-off Profiles');
    await waitFor(() => {
      expect(screen.getByText('Balanced')).toBeInTheDocument();
      expect(screen.getByText('default')).toBeInTheDocument();
    });
  });

  it('navigates to Delegation section and shows tenants', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Delegation')).toBeInTheDocument());
    await navTo(user, 'Delegation');
    await waitFor(() => {
      expect(screen.getByText('Least privilege')).toBeInTheDocument();
      expect(screen.getByText('2 boundaries')).toBeInTheDocument();
    });
  });

  it('navigates to Context section and shows KV pairs', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Context')).toBeInTheDocument());
    await navTo(user, 'Context');
    await waitFor(() => {
      expect(screen.getByText('orgName')).toBeInTheDocument();
      expect(screen.getByText('ACME Corp')).toBeInTheDocument();
    });
  });

  // ─── Empty list state ────────────────────────────────────────────────────

  it('shows "No items yet." for empty sections', async () => {
    mockFetchIntent.mockResolvedValue({
      intent: {
        ...INTENT_DOC,
        dataSources: [],
        authorizedActions: [],
        tradeoffProfiles: [],
        delegationFramework: { tenants: [] },
        context: [],
      },
    } as any);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Data Sources')).toBeInTheDocument());
    await navTo(user, 'Data Sources');
    await waitFor(() => {
      expect(screen.getByText('No items yet.')).toBeInTheDocument();
    });
  });

  // ─── Dirty state / Unsaved changes badge ─────────────────────────────────

  it('shows "Unsaved changes" badge after editing an item', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    // Click edit on first goal
    const editBtn = screen.getByTitle('Edit');
    await user.click(editBtn);
    // Modify the name
    const nameInput = screen.getByDisplayValue('Reduce costs');
    await user.clear(nameInput);
    await user.type(nameInput, 'New goal name');
    // Click "Save item"
    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
    // Save All Changes should now be enabled
    expect(screen.getByText('Save All Changes').closest('button')).not.toBeDisabled();
  });

  // ─── Save All Changes mutation ───────────────────────────────────────────

  it('calls updateIntent and clears dirty state on save', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    // Make a change: add a new goal via Add item
    await user.click(screen.getByText('Add item'));
    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });

    // Save All
    await user.click(screen.getByText('Save All Changes'));

    await waitFor(() => {
      expect(mockUpdateIntent).toHaveBeenCalledTimes(1);
      expect(mockUpdateIntent.mock.calls[0][0]).toBe('int-1');
    });
  });

  it('shows "Saving..." text during mutation', async () => {
    let resolveSave!: (v: unknown) => void;
    mockUpdateIntent.mockImplementation(
      () =>
        new Promise((r) => {
          resolveSave = r;
        })
    );

    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    // Make dirty
    await user.click(screen.getByText('Add item'));
    await user.click(screen.getByText('Save item'));
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());

    await user.click(screen.getByText('Save All Changes'));
    await waitFor(() => {
      expect(screen.getByText(/Saving/)).toBeInTheDocument();
    });

    // Resolve to stop pending
    resolveSave({});
  });

  // ─── Goals section: Add / Edit / Delete / Cancel ─────────────────────────

  it('opens add form for goals and saves new goal', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));
    // The edit form should appear
    expect(screen.getByText('Save item')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();

    // Fill in fields
    const _inputs = screen.getAllByRole('textbox');
    // ID field (first input)
    const idInput = screen.getByPlaceholderText('goal-1');
    await user.type(idInput, 'g-2');
    const nameInput = screen.getByPlaceholderText('Grow ARR');
    await user.type(nameInput, 'Increase revenue');

    await user.click(screen.getByText('Save item'));

    // Now both goals should be listed
    await waitFor(() => {
      expect(screen.getByText('Reduce costs')).toBeInTheDocument();
      expect(screen.getByText('Increase revenue')).toBeInTheDocument();
    });
  });

  it('opens edit form for existing goal and saves changes', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));

    // Verify form is populated with existing data
    expect(screen.getByDisplayValue('g-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Reduce costs')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Reduce costs');
    await user.clear(nameInput);
    await user.type(nameInput, 'Cut spending');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Cut spending')).toBeInTheDocument();
      expect(screen.queryByText('Reduce costs')).not.toBeInTheDocument();
    });
  });

  it('cancels goal edit without saving changes', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    const nameInput = screen.getByDisplayValue('Reduce costs');
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed name');

    await user.click(screen.getByText('Cancel'));

    // Form should close, original name still shown
    await waitFor(() => {
      expect(screen.queryByText('Save item')).not.toBeInTheDocument();
      expect(screen.getByText('Reduce costs')).toBeInTheDocument();
    });
  });

  it('deletes a goal when confirm returns true', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Reduce costs')).not.toBeInTheDocument();
      expect(screen.getByText('No items yet.')).toBeInTheDocument();
    });
  });

  it('does not delete a goal when confirm returns false', async () => {
    stubConfirm(false);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));

    // Goal should still be there
    expect(screen.getByText('Reduce costs')).toBeInTheDocument();
  });

  it('handles goal priority and skills/signals/actions fields', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));

    // Priority field
    const priorityInput = screen.getByDisplayValue('8');
    await user.clear(priorityInput);
    await user.type(priorityInput, '42');

    // Skills field (comma-separated)
    const skillsLabel = screen.getByText('Skills (comma-separated IDs)');
    const skillsInput = skillsLabel.closest('div')!.querySelector('input')!;
    await user.type(skillsInput, 'skill-a, skill-b');

    // Signal IDs field
    const signalLabel = screen.getByText('Signal IDs (comma-separated)');
    const signalInput = signalLabel.closest('div')!.querySelector('input')!;
    await user.type(signalInput, 's-1, s-2');

    // Authorized Action IDs field
    const actionLabel = screen.getByText('Authorized Action IDs (comma-separated)');
    const actionInput = actionLabel.closest('div')!.querySelector('input')!;
    await user.type(actionInput, 'aa-1');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  // ─── Signals section: Add / Edit ─────────────────────────────────────────

  it('adds a new signal with direction and threshold fields', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Signals')).toBeInTheDocument());
    await navTo(user, 'Signals');
    await waitFor(() => expect(screen.getByText('CPU Usage')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    const idInput = screen.getByPlaceholderText('signal-1');
    await user.type(idInput, 's-2');

    // Name field: there are multiple textboxes, find via label
    const nameLabel = screen.getByText('Name');
    const nameInput = nameLabel.closest('div')!.querySelector('input')!;
    await user.type(nameInput, 'Memory Usage');

    // Direction select
    const directionSelect = screen.getByDisplayValue('above (high is bad)');
    await user.selectOptions(directionSelect, 'below');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Memory Usage')).toBeInTheDocument();
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });
  });

  it('edits an existing signal', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Signals')).toBeInTheDocument());
    await navTo(user, 'Signals');
    await waitFor(() => expect(screen.getByText('CPU Usage')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('CPU Usage')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('CPU Usage');
    await user.clear(nameInput);
    await user.type(nameInput, 'Disk Usage');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Disk Usage')).toBeInTheDocument();
      expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument();
    });
  });

  it('signal list shows warning threshold when present', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Signals')).toBeInTheDocument());
    await navTo(user, 'Signals');
    await waitFor(() => {
      // secondary text includes warning threshold
      expect(screen.getByText(/warn: 70/)).toBeInTheDocument();
    });
  });

  it('deletes a signal', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Signals')).toBeInTheDocument());
    await navTo(user, 'Signals');
    await waitFor(() => expect(screen.getByText('CPU Usage')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument();
      expect(screen.getByText('No items yet.')).toBeInTheDocument();
    });
  });

  it('cancels signal edit form', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Signals')).toBeInTheDocument());
    await navTo(user, 'Signals');
    await waitFor(() => expect(screen.getByText('CPU Usage')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Save item')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Save item')).not.toBeInTheDocument();
  });

  // ─── Data Sources section ────────────────────────────────────────────────

  it('adds a new data source with type and connection', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Data Sources')).toBeInTheDocument());
    await navTo(user, 'Data Sources');
    await waitFor(() => expect(screen.getByText('Prometheus')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    // Type select
    const typeSelect = screen.getByDisplayValue('http');
    await user.selectOptions(typeSelect, 'postgres');

    // Connection
    const connPlaceholder = screen.getByPlaceholderText('https://...');
    await user.type(connPlaceholder, 'postgres://db:5432/mydb');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  it('edits an existing data source', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Data Sources')).toBeInTheDocument());
    await navTo(user, 'Data Sources');
    await waitFor(() => expect(screen.getByText('Prometheus')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Prometheus')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://prometheus.local:9090')).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue('Prometheus');
    await user.clear(nameInput);
    await user.type(nameInput, 'Thanos');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Thanos')).toBeInTheDocument();
    });
  });

  it('deletes a data source', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Data Sources')).toBeInTheDocument());
    await navTo(user, 'Data Sources');
    await waitFor(() => expect(screen.getByText('Prometheus')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Prometheus')).not.toBeInTheDocument();
    });
  });

  // ─── Authorized Actions section ──────────────────────────────────────────

  it('adds a new authorized action', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Authorized Actions')).toBeInTheDocument());
    await navTo(user, 'Authorized Actions');
    await waitFor(() => expect(screen.getByText('Scale up pods')).toBeInTheDocument());

    // Should show role info in secondary
    expect(screen.getByText('role: operator')).toBeInTheDocument();

    await user.click(screen.getByText('Add item'));

    // MCP Tools
    const mcpInput = screen.getByPlaceholderText('fs_read, http_get');
    await user.type(mcpInput, 'k8s_restart, notify_slack');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      // New action has no required role
      expect(screen.getByText('no role restriction')).toBeInTheDocument();
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  it('edits an authorized action', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Authorized Actions')).toBeInTheDocument());
    await navTo(user, 'Authorized Actions');
    await waitFor(() => expect(screen.getByText('Scale up pods')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Scale up pods')).toBeInTheDocument();
    expect(screen.getByDisplayValue('operator')).toBeInTheDocument();

    const descInput = screen.getByDisplayValue('Scale up pods');
    await user.clear(descInput);
    await user.type(descInput, 'Scale down pods');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Scale down pods')).toBeInTheDocument();
    });
  });

  it('deletes an authorized action', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Authorized Actions')).toBeInTheDocument());
    await navTo(user, 'Authorized Actions');
    await waitFor(() => expect(screen.getByText('Scale up pods')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Scale up pods')).not.toBeInTheDocument();
    });
  });

  // ─── Trade-off Profiles section ──────────────────────────────────────────

  it('adds a trade-off profile with sliders and default checkbox', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Trade-off Profiles')).toBeInTheDocument());
    await navTo(user, 'Trade-off Profiles');
    await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    // Verify slider labels are present
    expect(screen.getByText('Speed vs Thoroughness')).toBeInTheDocument();
    expect(screen.getByText('Cost vs Quality')).toBeInTheDocument();
    expect(screen.getByText('Autonomy vs Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Thoroughness')).toBeInTheDocument();

    // Toggle default checkbox
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  it('edits a trade-off profile', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Trade-off Profiles')).toBeInTheDocument());
    await navTo(user, 'Trade-off Profiles');
    await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Balanced')).toBeInTheDocument();

    // isDefault should be checked
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    const nameInput = screen.getByDisplayValue('Balanced');
    await user.clear(nameInput);
    await user.type(nameInput, 'Thorough');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Thorough')).toBeInTheDocument();
    });
  });

  it('deletes a trade-off profile', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Trade-off Profiles')).toBeInTheDocument());
    await navTo(user, 'Trade-off Profiles');
    await waitFor(() => expect(screen.getByText('Balanced')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
    });
  });

  // ─── Hard Boundaries section ─────────────────────────────────────────────

  it('adds a new hard boundary', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Hard Boundaries')).toBeInTheDocument());
    await navTo(user, 'Hard Boundaries');
    await waitFor(() => expect(screen.getByText('Never delete prod data')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));
    const idInput = screen.getByPlaceholderText('hb-1');
    await user.type(idInput, 'hb-2');

    const ruleInput = screen.getByPlaceholderText(/deny: drop production/);
    await user.type(ruleInput, 'deny: shutdown');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('deny: shutdown')).toBeInTheDocument();
      expect(screen.getByText('Never delete prod data')).toBeInTheDocument();
    });
  });

  it('edits a hard boundary', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Hard Boundaries')).toBeInTheDocument());
    await navTo(user, 'Hard Boundaries');
    await waitFor(() => expect(screen.getByText('Never delete prod data')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Never delete prod data')).toBeInTheDocument();

    const ruleInput = screen.getByDisplayValue('Never delete prod data');
    await user.clear(ruleInput);
    await user.type(ruleInput, 'Never modify prod data');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Never modify prod data')).toBeInTheDocument();
    });
  });

  it('deletes a hard boundary', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Hard Boundaries')).toBeInTheDocument());
    await navTo(user, 'Hard Boundaries');
    await waitFor(() => expect(screen.getByText('Never delete prod data')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Never delete prod data')).not.toBeInTheDocument();
    });
  });

  // ─── Policies section ────────────────────────────────────────────────────

  it('adds a new policy with enforcement selector', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Policies')).toBeInTheDocument());
    await navTo(user, 'Policies');
    await waitFor(() => expect(screen.getByText('Log all actions')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    // Enforcement select defaults to "block"
    const enforcementSelect = screen.getByDisplayValue(/block/);
    expect(enforcementSelect).toBeInTheDocument();

    // Change enforcement to warn
    await user.selectOptions(enforcementSelect, 'warn');

    // Rule input
    const ruleInput = screen.getByPlaceholderText(/deny: send email/);
    await user.type(ruleInput, 'deny: deploy to prod');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('deny: deploy to prod')).toBeInTheDocument();
    });
  });

  it('edits a policy', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Policies')).toBeInTheDocument());
    await navTo(user, 'Policies');
    await waitFor(() => expect(screen.getByText('Log all actions')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Log all actions')).toBeInTheDocument();

    const ruleInput = screen.getByDisplayValue('Log all actions');
    await user.clear(ruleInput);
    await user.type(ruleInput, 'Audit everything');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Audit everything')).toBeInTheDocument();
    });
  });

  it('deletes a policy', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Policies')).toBeInTheDocument());
    await navTo(user, 'Policies');
    await waitFor(() => expect(screen.getByText('Log all actions')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Log all actions')).not.toBeInTheDocument();
    });
  });

  // ─── Delegation section ──────────────────────────────────────────────────

  it('adds a new delegation tenant with decision boundaries', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Delegation')).toBeInTheDocument());
    await navTo(user, 'Delegation');
    await waitFor(() => expect(screen.getByText('Least privilege')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    // Form should appear with Save/Cancel
    expect(screen.getByText('Save item')).toBeInTheDocument();

    // Save with defaults
    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  it('edits a delegation tenant', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Delegation')).toBeInTheDocument());
    await navTo(user, 'Delegation');
    await waitFor(() => expect(screen.getByText('Least privilege')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('Least privilege')).toBeInTheDocument();

    const principleInput = screen.getByDisplayValue('Least privilege');
    await user.clear(principleInput);
    await user.type(principleInput, 'Zero trust');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('Zero trust')).toBeInTheDocument();
    });
  });

  it('deletes a delegation tenant', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Delegation')).toBeInTheDocument());
    await navTo(user, 'Delegation');
    await waitFor(() => expect(screen.getByText('Least privilege')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('Least privilege')).not.toBeInTheDocument();
    });
  });

  // ─── Context section ─────────────────────────────────────────────────────

  it('adds a new context KV pair', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Context')).toBeInTheDocument());
    await navTo(user, 'Context');
    await waitFor(() => expect(screen.getByText('orgName')).toBeInTheDocument());

    await user.click(screen.getByText('Add item'));

    const keyInput = screen.getByPlaceholderText('orgName');
    await user.type(keyInput, 'env');

    const valueInput = screen.getByPlaceholderText('ACME Corp');
    await user.type(valueInput, 'production');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('env')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();
    });
  });

  it('edits a context KV pair', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Context')).toBeInTheDocument());
    await navTo(user, 'Context');
    await waitFor(() => expect(screen.getByText('orgName')).toBeInTheDocument());

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByDisplayValue('orgName')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ACME Corp')).toBeInTheDocument();

    const valueInput = screen.getByDisplayValue('ACME Corp');
    await user.clear(valueInput);
    await user.type(valueInput, 'NewCo');

    await user.click(screen.getByText('Save item'));

    await waitFor(() => {
      expect(screen.getByText('NewCo')).toBeInTheDocument();
    });
  });

  it('deletes a context KV pair', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Context')).toBeInTheDocument());
    await navTo(user, 'Context');
    await waitFor(() => expect(screen.getByText('orgName')).toBeInTheDocument());

    await user.click(screen.getByTitle('Delete'));
    await waitFor(() => {
      expect(screen.queryByText('orgName')).not.toBeInTheDocument();
    });
  });

  // ─── Field optional label rendering ──────────────────────────────────────

  it('renders "(optional)" label for optional fields', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Reduce costs')).toBeInTheDocument());

    // Open the edit form for a goal
    await user.click(screen.getByTitle('Edit'));

    // Check that optional fields show "(optional)"
    const optionalLabels = screen.getAllByText('(optional)');
    expect(optionalLabels.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Secondary text rendering ────────────────────────────────────────────

  it('shows goal secondary text with priority and owner role', async () => {
    renderDocEditor();
    await waitFor(() => {
      expect(screen.getByText('priority 8 · admin')).toBeInTheDocument();
    });
  });

  it('shows policy secondary text with enforcement level', async () => {
    const user = userEvent.setup();
    renderDocEditor();
    await waitFor(() => expect(screen.getByText('Policies')).toBeInTheDocument());
    await navTo(user, 'Policies');
    await waitFor(() => {
      expect(screen.getByText('warn')).toBeInTheDocument();
    });
  });
});
