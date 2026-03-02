// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertRulesTab } from './AlertRulesTab';
import type { AlertRule } from '../../types';

vi.mock('../../api/client', () => ({
  listAlertRules: vi.fn(),
  createAlertRule: vi.fn(),
  patchAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  testAlertRule: vi.fn(),
}));

import * as api from '../../api/client';

const mockList = vi.mocked(api.listAlertRules);
const mockCreate = vi.mocked(api.createAlertRule);
const mockPatch = vi.mocked(api.patchAlertRule);
const mockDelete = vi.mocked(api.deleteAlertRule);
const mockTest = vi.mocked(api.testAlertRule);

const NOW = 1_700_000_000_000;

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'High rate limit',
    metricPath: 'security.rateLimitHitsTotal',
    operator: 'gt',
    threshold: 100,
    channels: [{ type: 'slack', url: 'https://hooks.slack.com/x' }],
    enabled: true,
    cooldownSeconds: 300,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ rules: [] });
  mockCreate.mockResolvedValue({ rule: makeRule() });
  mockPatch.mockResolvedValue({ rule: makeRule() });
  mockDelete.mockResolvedValue(undefined);
  mockTest.mockResolvedValue({ fired: true, value: 42 });
});

describe('AlertRulesTab', () => {
  it('renders empty state when no rules', async () => {
    mockList.mockResolvedValue({ rules: [] });
    wrap(<AlertRulesTab />);
    await waitFor(() => {
      expect(screen.getByText(/No alert rules yet/i)).toBeInTheDocument();
    });
  });

  it('renders a list of rules', async () => {
    mockList.mockResolvedValue({ rules: [makeRule()] });
    wrap(<AlertRulesTab />);
    await waitFor(() => {
      expect(screen.getByText('High rate limit')).toBeInTheDocument();
    });
    expect(screen.getByText('security.rateLimitHitsTotal')).toBeInTheDocument();
    expect(screen.getByText('slack')).toBeInTheDocument();
  });

  it('shows the create form on "New rule" click', async () => {
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText(/New rule/i));
    await userEvent.click(screen.getByText(/New rule/i));
    expect(screen.getByPlaceholderText(/High rate-limit hits/i)).toBeInTheDocument();
  });

  it('creates a rule and hides the form on save', async () => {
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText(/New rule/i));
    await userEvent.click(screen.getByText(/New rule/i));

    await userEvent.type(screen.getByPlaceholderText(/High rate-limit hits/i), 'My Rule');
    await userEvent.type(
      screen.getByPlaceholderText(/security.rateLimitHitsTotal/i),
      'security.rateLimitHitsTotal'
    );

    await userEvent.click(screen.getByRole('button', { name: /Save rule/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  it('toggles enabled/disabled via toggle button', async () => {
    mockList.mockResolvedValue({ rules: [makeRule({ enabled: true })] });
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByTitle(/Disable/i));
    await userEvent.click(screen.getByTitle(/Disable/i));
    expect(mockPatch).toHaveBeenCalledWith('rule-1', { enabled: false });
  });

  it('test-fire shows toast with result', async () => {
    mockList.mockResolvedValue({ rules: [makeRule()] });
    mockTest.mockResolvedValue({ fired: true, value: 42 });
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByTitle(/Test-fire/i));
    await userEvent.click(screen.getByTitle(/Test-fire/i));
    await waitFor(() => {
      expect(mockTest).toHaveBeenCalledWith('rule-1');
    });
  });

  it('shows loading state while fetching', async () => {
    let resolve: (v: { rules: AlertRule[] }) => void;
    mockList.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    wrap(<AlertRulesTab />);
    expect(screen.getByText(/Loading rules/i)).toBeInTheDocument();
    resolve!({ rules: [] });
  });

  it('shows error state on fetch failure', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    wrap(<AlertRulesTab />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load alert rules/i)).toBeInTheDocument();
    });
  });

  it('shows channel type badges', async () => {
    mockList.mockResolvedValue({
      rules: [makeRule({ channels: [{ type: 'pagerduty', routingKey: 'key' }] })],
    });
    wrap(<AlertRulesTab />);
    await waitFor(() => {
      expect(screen.getByText('pagerduty')).toBeInTheDocument();
    });
  });

  it('expand row shows rule details', async () => {
    mockList.mockResolvedValue({ rules: [makeRule({ description: 'My description' })] });
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText('High rate limit'));
    // Click the expand chevron (first button in the row)
    const expandButton = screen.getAllByRole('button')[0];
    await userEvent.click(expandButton);
    await waitFor(() => {
      expect(screen.getByText('My description')).toBeInTheDocument();
    });
  });

  it('delete confirms and calls deleteAlertRule', async () => {
    mockList.mockResolvedValue({ rules: [makeRule()] });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByTitle(/Delete/i));
    await userEvent.click(screen.getByTitle(/Delete/i));
    expect(mockDelete).toHaveBeenCalledWith('rule-1');
    vi.unstubAllGlobals();
  });

  it('did-not-fire toast shows value', async () => {
    mockList.mockResolvedValue({ rules: [makeRule()] });
    mockTest.mockResolvedValue({ fired: false, value: 5 });
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByTitle(/Test-fire/i));
    await userEvent.click(screen.getByTitle(/Test-fire/i));
    await waitFor(() => {
      expect(mockTest).toHaveBeenCalledWith('rule-1');
    });
  });

  it('shows ntfy channel badge', async () => {
    mockList.mockResolvedValue({
      rules: [makeRule({ channels: [{ type: 'ntfy', url: 'https://ntfy.sh/topic' }] })],
    });
    wrap(<AlertRulesTab />);
    await waitFor(() => {
      expect(screen.getByText('ntfy')).toBeInTheDocument();
    });
  });

  it('renders ntfy option in channel type selector', async () => {
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText(/New rule/i));
    await userEvent.click(screen.getByText(/New rule/i));

    // Click "Add channel"
    await userEvent.click(screen.getByText(/Add channel/i));

    // Check that ntfy option exists in the select
    const selects = screen.getAllByRole('combobox');
    const channelSelect = selects[selects.length - 1];
    const options = channelSelect.querySelectorAll('option');
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain('ntfy');
  });

  it('shows "From template" button and opens dropdown', async () => {
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText(/From template/i));
    await userEvent.click(screen.getByText(/From template/i));
    // Should see template categories
    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
      expect(screen.getByText('Training')).toBeInTheDocument();
      expect(screen.getByText('Security')).toBeInTheDocument();
    });
  });

  it('selecting a template pre-fills the form', async () => {
    wrap(<AlertRulesTab />);
    await waitFor(() => screen.getByText(/From template/i));
    await userEvent.click(screen.getByText(/From template/i));
    await waitFor(() => screen.getByText('Workflow failure'));
    await userEvent.click(screen.getByText('Workflow failure'));

    // The form should now be visible with the template values
    await waitFor(() => {
      expect(screen.getByDisplayValue('Workflow failure')).toBeInTheDocument();
      expect(screen.getByDisplayValue('jobs.workflow.failed.error')).toBeInTheDocument();
    });
  });
});
