// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoutingRulesPage } from './RoutingRulesPage';

// ── Mock API client ──────────────────────────────────────────────
vi.mock('../api/client', () => ({
  fetchRoutingRules: vi.fn(),
  createRoutingRule: vi.fn(),
  updateRoutingRule: vi.fn(),
  deleteRoutingRule: vi.fn(),
  testRoutingRule: vi.fn(),
  fetchIntegrations: vi.fn(),
  fetchPersonalities: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchRules = vi.mocked(api.fetchRoutingRules);
const mockCreateRule = vi.mocked(api.createRoutingRule);
const mockUpdateRule = vi.mocked(api.updateRoutingRule);
const mockDeleteRule = vi.mocked(api.deleteRoutingRule);
const mockTestRule = vi.mocked(api.testRoutingRule);
const mockFetchIntegrations = vi.mocked(api.fetchIntegrations);
const mockFetchPersonalities = vi.mocked(api.fetchPersonalities);

// ── Helpers ──────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderPage() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RoutingRulesPage />
    </QueryClientProvider>
  );
}

const MOCK_RULE: api.RoutingRule = {
  id: 'rule-1',
  name: 'Forward Slack to Telegram',
  description: 'Test rule',
  enabled: true,
  priority: 100,
  triggerPlatforms: ['slack'],
  triggerIntegrationIds: [],
  triggerChatIdPattern: null,
  triggerSenderIdPattern: null,
  triggerKeywordPattern: 'urgent',
  triggerDirection: 'inbound',
  actionType: 'forward',
  actionTargetIntegrationId: 'int-2',
  actionTargetChatId: null,
  actionPersonalityId: null,
  actionWebhookUrl: null,
  actionMessageTemplate: null,
  matchCount: 5,
  lastMatchedAt: Date.now() - 3600_000,
  createdAt: Date.now() - 86400_000,
  updatedAt: Date.now() - 3600_000,
};

// ── Tests ─────────────────────────────────────────────────────────

describe('RoutingRulesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchIntegrations.mockResolvedValue({ integrations: [], total: 0, running: 0 });
    mockFetchPersonalities.mockResolvedValue({ personalities: [] } as never);
  });

  it('shows empty state when no rules', async () => {
    mockFetchRules.mockResolvedValue({ rules: [], total: 0 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No routing rules yet/i)).toBeTruthy();
    });
  });

  it('renders rule list', async () => {
    mockFetchRules.mockResolvedValue({ rules: [MOCK_RULE], total: 1 });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Forward Slack to Telegram')).toBeTruthy();
    });

    expect(screen.getByText(/5 matches/i)).toBeTruthy();
  });

  it('opens new rule form on button click', async () => {
    mockFetchRules.mockResolvedValue({ rules: [], total: 0 });
    renderPage();

    await waitFor(() => screen.getByText('New Rule'));
    await userEvent.click(screen.getByText('New Rule'));

    expect(screen.getByText('New Routing Rule')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Forward Slack/i)).toBeTruthy();
  });

  it('creates a new rule', async () => {
    mockFetchRules.mockResolvedValue({ rules: [], total: 0 });
    mockCreateRule.mockResolvedValue(MOCK_RULE);

    renderPage();

    await waitFor(() => screen.getByText('New Rule'));
    await userEvent.click(screen.getByText('New Rule'));

    // Fill in name
    await userEvent.type(screen.getByPlaceholderText(/Forward Slack/i), 'My New Rule');
    await userEvent.click(screen.getByText('Create Rule'));

    await waitFor(() => {
      expect(mockCreateRule).toHaveBeenCalled();
    });
  });

  it('toggles rule enabled/disabled', async () => {
    mockFetchRules.mockResolvedValue({ rules: [MOCK_RULE], total: 1 });
    mockUpdateRule.mockResolvedValue({ ...MOCK_RULE, enabled: false });

    renderPage();

    await waitFor(() => screen.getByTitle('Disable'));
    await userEvent.click(screen.getByTitle('Disable'));

    await waitFor(() => {
      expect(mockUpdateRule).toHaveBeenCalledWith('rule-1', { enabled: false });
    });
  });

  it('shows dry-run test panel', async () => {
    mockFetchRules.mockResolvedValue({ rules: [MOCK_RULE], total: 1 });

    renderPage();

    await waitFor(() => screen.getByTitle('Test'));
    await userEvent.click(screen.getByTitle('Test'));

    expect(screen.getByPlaceholderText('Platform (e.g. slack)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Message text')).toBeTruthy();
  });

  it('runs a dry-run test', async () => {
    mockFetchRules.mockResolvedValue({ rules: [MOCK_RULE], total: 1 });
    mockTestRule.mockResolvedValue({ rule: MOCK_RULE, matched: true });

    renderPage();

    await waitFor(() => screen.getByTitle('Test'));
    await userEvent.click(screen.getByTitle('Test'));

    await userEvent.type(screen.getByPlaceholderText('Platform (e.g. slack)'), 'slack');
    await userEvent.type(screen.getByPlaceholderText('Message text'), 'this is urgent');

    const testBtn = screen.getAllByText('Test').find((el) => el.tagName === 'BUTTON');
    if (testBtn) await userEvent.click(testBtn);

    await waitFor(() => {
      expect(mockTestRule).toHaveBeenCalledWith('rule-1', {
        platform: 'slack',
        text: 'this is urgent',
        direction: 'inbound',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Rule would match/i)).toBeTruthy();
    });
  });
});
