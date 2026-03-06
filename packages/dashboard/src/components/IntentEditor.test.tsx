// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntentEditor } from './IntentEditor';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchIntents: vi.fn(),
    fetchActiveIntent: vi.fn(),
    activateIntent: vi.fn(),
    deleteIntent: vi.fn(),
    fetchEnforcementLog: vi.fn(),
    fetchSecurityPolicy: vi.fn(),
    createIntent: vi.fn(),
    readSignal: vi.fn(),
    fetchGoalTimeline: vi.fn(),
  };
});

vi.mock('./IntentDocEditor', () => ({
  IntentDocEditor: ({ intentId }: { intentId: string }) => (
    <div data-testid="intent-doc-editor">{intentId}</div>
  ),
}));

import * as api from '../api/client';

const mockFetchIntents = vi.mocked(api.fetchIntents);
const mockFetchActiveIntent = vi.mocked(api.fetchActiveIntent);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockActivateIntent = vi.mocked(api.activateIntent);
const mockDeleteIntent = vi.mocked(api.deleteIntent);
const mockCreateIntent = vi.mocked(api.createIntent);
const mockFetchEnforcementLog = vi.mocked(api.fetchEnforcementLog);

const INTENT_META = {
  id: 'int-1',
  name: 'Ops Intent',
  apiVersion: '1.0',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderEditor() {
  return render(
    <QueryClientProvider client={createQC()}>
      <IntentEditor />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchIntents.mockResolvedValue({ intents: [INTENT_META] as any });
  mockFetchActiveIntent.mockResolvedValue({ intent: INTENT_META } as any);
  mockFetchSecurityPolicy.mockResolvedValue({ allowIntentEditor: false } as any);
  mockFetchEnforcementLog.mockResolvedValue({ entries: [] } as any);
});

describe('IntentEditor', () => {
  it('renders heading', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Organizational Intent')).toBeInTheDocument();
    });
  });

  it('renders description text', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText(/Machine-readable goals/)).toBeInTheDocument();
    });
  });

  it('renders default tabs', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Intent Documents')).toBeInTheDocument();
      expect(screen.getByText('Signals')).toBeInTheDocument();
      expect(screen.getByText('Policies')).toBeInTheDocument();
      expect(screen.getByText('Delegation')).toBeInTheDocument();
      expect(screen.getByText('Enforcement Log')).toBeInTheDocument();
    });
  });

  it('does not show Editor tab when intent editor is not enabled', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Intent Documents')).toBeInTheDocument();
    });
    expect(screen.queryByText('Editor')).not.toBeInTheDocument();
  });

  it('shows Editor tab when intent editor is enabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowIntentEditor: true } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });
  });

  it('shows intent document cards', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Ops Intent')).toBeInTheDocument();
    });
  });

  it('shows Active badge for the active intent', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows Create Intent button', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
  });

  it('shows delete button for intent', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByLabelText('Delete intent document')).toBeInTheDocument();
    });
  });

  it('does not show Activate button for active intent', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Ops Intent')).toBeInTheDocument();
    });
    expect(screen.queryByText('Activate')).not.toBeInTheDocument();
  });

  it('shows Activate button for non-active intents', async () => {
    mockFetchActiveIntent.mockRejectedValue(new Error('none'));
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });
  });

  it('switches to Enforcement Log tab', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Enforcement Log')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Enforcement Log'));
    await waitFor(() => {
      expect(mockFetchEnforcementLog).toHaveBeenCalled();
    });
  });

  it('toggles create modal when Create Intent is clicked', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Intent'));
    // The create form should be visible (Basics tab with Name field)
    await waitFor(() => {
      expect(screen.getByText('Name *')).toBeInTheDocument();
    });
  });

  it('shows Edit button when intent editor is enabled', async () => {
    mockFetchSecurityPolicy.mockResolvedValue({ allowIntentEditor: true } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows api version and date in intent card', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText(/API version: 1.0/)).toBeInTheDocument();
    });
  });

  // ── Signals tab ──────────────────────────────────────────────────

  it('switches to Signals tab and shows empty state when no signals', async () => {
    const user = userEvent.setup();
    mockFetchActiveIntent.mockResolvedValue({
      intent: { ...INTENT_META, signals: [], goals: [] },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Signals')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Signals'));
    await waitFor(() => {
      expect(screen.getByText(/No signals defined/)).toBeInTheDocument();
    });
  });

  it('shows signal cards when signals exist', async () => {
    const user = userEvent.setup();
    const mockReadSignal = vi.mocked(api.readSignal);
    mockReadSignal.mockResolvedValue({
      status: 'healthy',
      value: 42,
      threshold: 100,
      direction: 'above',
      message: 'All good',
    } as any);
    mockFetchActiveIntent.mockResolvedValue({
      intent: {
        ...INTENT_META,
        signals: [{ id: 's-1', name: 'Latency Signal' }],
        goals: [],
      },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Signals')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Signals'));
    await waitFor(() => {
      expect(screen.getByText('Latency Signal')).toBeInTheDocument();
    });
  });

  // ── Policies tab ─────────────────────────────────────────────────

  it('switches to Policies tab and shows empty state when no policies', async () => {
    const user = userEvent.setup();
    mockFetchActiveIntent.mockResolvedValue({
      intent: { ...INTENT_META, policies: [] },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Policies')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Policies'));
    await waitFor(() => {
      expect(screen.getByText(/No policies defined in the active intent/)).toBeInTheDocument();
    });
  });

  it('shows blocking and warning policies when they exist', async () => {
    const user = userEvent.setup();
    mockFetchActiveIntent.mockResolvedValue({
      intent: {
        ...INTENT_META,
        policies: [
          { id: 'pol-1', rule: 'No PII in logs', enforcement: 'block', rationale: 'Privacy' },
          { id: 'pol-2', rule: 'Limit tokens', enforcement: 'warn', rationale: 'Cost' },
        ],
      },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Policies')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Policies'));
    await waitFor(() => {
      expect(screen.getByText('Blocking Policies')).toBeInTheDocument();
      expect(screen.getByText('Warning Policies')).toBeInTheDocument();
      expect(screen.getByText('No PII in logs')).toBeInTheDocument();
      expect(screen.getByText('Limit tokens')).toBeInTheDocument();
    });
  });

  // ── Delegation tab ───────────────────────────────────────────────

  it('switches to Delegation tab and shows empty state', async () => {
    const user = userEvent.setup();
    mockFetchActiveIntent.mockResolvedValue({
      intent: { ...INTENT_META, delegationFramework: { tenants: [] } },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Delegation')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Delegation'));
    await waitFor(() => {
      expect(screen.getByText(/No delegation framework defined/)).toBeInTheDocument();
    });
  });

  it('shows tenants when delegation framework has entries', async () => {
    const user = userEvent.setup();
    mockFetchActiveIntent.mockResolvedValue({
      intent: {
        ...INTENT_META,
        delegationFramework: {
          tenants: [
            {
              id: 't-1',
              principle: 'Engineering Team',
              decisionBoundaries: ['Can approve deployments'],
            },
          ],
        },
      },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Delegation')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Delegation'));
    await waitFor(() => {
      expect(screen.getByText('Engineering Team')).toBeInTheDocument();
    });
  });

  // ── Enforcement log ──────────────────────────────────────────────

  it('shows enforcement log entries', async () => {
    const user = userEvent.setup();
    mockFetchEnforcementLog.mockResolvedValue({
      entries: [
        {
          id: 'e-1',
          eventType: 'policy_block',
          rule: 'No PII in logs',
          rationale: 'Blocked due to policy',
          createdAt: 1700000000000,
        },
      ],
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Enforcement Log')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Enforcement Log'));
    await waitFor(() => {
      expect(screen.getAllByText('policy_block').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('No PII in logs')).toBeInTheDocument();
    });
  });

  it('shows empty enforcement log state', async () => {
    const user = userEvent.setup();
    mockFetchEnforcementLog.mockResolvedValue({ entries: [] } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Enforcement Log')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Enforcement Log'));
    await waitFor(() => {
      expect(mockFetchEnforcementLog).toHaveBeenCalled();
    });
  });

  // ── Create form — inner tabs ─────────────────────────────────────

  it('shows Basics, Boundaries, Policies, Import JSON inner tabs in create modal', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument();
      expect(screen.getByText('Boundaries')).toBeInTheDocument();
      // "Policies" already exists as a main tab — check inner via 'Import JSON'
      expect(screen.getByText('Import JSON')).toBeInTheDocument();
    });
  });

  it('switches to Boundaries inner tab and shows add boundary button', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(screen.getByText('Boundaries')).toBeInTheDocument();
    });
    // There are multiple "Boundaries" buttons (main tab + inner tab). Click the inner one.
    const boundariesButtons = screen.getAllByText('Boundaries');
    await user.click(boundariesButtons[boundariesButtons.length - 1]);
    await waitFor(() => {
      expect(screen.getByText(/No hard boundaries defined/)).toBeInTheDocument();
      expect(screen.getByText('Add Boundary')).toBeInTheDocument();
    });
  });

  it('switches to Import JSON inner tab and shows textarea', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(screen.getByText('Import JSON')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Import JSON'));
    await waitFor(() => {
      expect(screen.getByText(/Paste a full intent JSON document/)).toBeInTheDocument();
    });
  });

  it('can cancel create modal', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(screen.getByText('Name *')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Name *')).not.toBeInTheDocument();
    });
  });

  it('submits create form when valid', async () => {
    const user = userEvent.setup();
    mockCreateIntent.mockResolvedValue({ intent: INTENT_META } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Create Intent')).toBeInTheDocument();
    });
    // Open the create modal
    await user.click(screen.getByText('Create Intent'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Production Safety Intent/)).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Production Safety Intent/), 'My Intent');
    // Click the second "Create Intent" button (the submit one, not the toggle)
    const createButtons = screen.getAllByText('Create Intent');
    await user.click(createButtons[createButtons.length - 1]);
    await waitFor(() => {
      expect(mockCreateIntent).toHaveBeenCalled();
    });
  });

  // ── Empty intents state ──────────────────────────────────────────

  it('shows empty intent documents state when no intents', async () => {
    mockFetchIntents.mockResolvedValue({ intents: [] } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText(/No intent documents yet/)).toBeInTheDocument();
    });
  });

  // ── Editor tab ───────────────────────────────────────────────────

  it('shows "No document selected" in Editor tab when no intent is being edited', async () => {
    const user = userEvent.setup();
    mockFetchSecurityPolicy.mockResolvedValue({ allowIntentEditor: true } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Editor'));
    await waitFor(() => {
      expect(screen.getByText('No document selected.')).toBeInTheDocument();
    });
  });

  it('shows IntentDocEditor when Edit is clicked and intent editor is enabled', async () => {
    const user = userEvent.setup();
    mockFetchSecurityPolicy.mockResolvedValue({ allowIntentEditor: true } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByTestId('intent-doc-editor')).toBeInTheDocument();
    });
  });

  // ── Goal timeline ────────────────────────────────────────────────

  it('shows goal history section when goals exist in active intent', async () => {
    const user = userEvent.setup();
    const mockFetchGoalTimeline = vi.mocked(api.fetchGoalTimeline);
    mockFetchGoalTimeline.mockResolvedValue({ entries: [] } as any);
    mockFetchActiveIntent.mockResolvedValue({
      intent: {
        ...INTENT_META,
        signals: [],
        goals: [{ id: 'g-1', name: 'Reduce latency' }],
      },
    } as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Signals')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Signals'));
    await waitFor(() => {
      expect(screen.getByText('Goal History')).toBeInTheDocument();
      expect(screen.getByText('Reduce latency')).toBeInTheDocument();
    });
  });

  // ── IntentSecurityToggle ─────────────────────────────────────────

  it('renders IntentSecurityToggle and toggles on click', async () => {
    const onChange = vi.fn();
    const { IntentSecurityToggle } = await import('./IntentEditor');
    const { render: r } = await import('@testing-library/react');
    const { container } = r(<IntentSecurityToggle enabled={false} onChange={onChange} />);
    expect(screen.getByText('Organizational Intent')).toBeInTheDocument();
    const toggleBtn = container.querySelector('button[aria-pressed]');
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn!);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // ── Delete intent ────────────────────────────────────────────────

  it('calls deleteIntent when delete button is clicked and confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    mockDeleteIntent.mockResolvedValue(undefined as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByLabelText('Delete intent document')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Delete intent document'));
    await waitFor(() => {
      expect(mockDeleteIntent).toHaveBeenCalled();
      expect(mockDeleteIntent.mock.calls[0][0]).toBe('int-1');
    });
    vi.unstubAllGlobals();
  });

  it('does not call deleteIntent when delete is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    renderEditor();
    await waitFor(() => {
      expect(screen.getByLabelText('Delete intent document')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Delete intent document'));
    expect(mockDeleteIntent).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // ── Activate intent ──────────────────────────────────────────────

  it('calls activateIntent when Activate button is clicked on non-active intent', async () => {
    mockFetchActiveIntent.mockRejectedValue(new Error('none'));
    mockActivateIntent.mockResolvedValue(undefined as any);
    renderEditor();
    await waitFor(() => {
      expect(screen.getByText('Activate')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(mockActivateIntent).toHaveBeenCalled();
      expect(mockActivateIntent.mock.calls[0][0]).toBe('int-1');
    });
  });
});
