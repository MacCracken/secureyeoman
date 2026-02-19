import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProactivePage } from './ProactivePage';

// Mock the API client
vi.mock('../api/client', () => ({
  fetchSecurityPolicy: vi.fn(),
  fetchProactiveTriggers: vi.fn(),
  fetchProactiveSuggestions: vi.fn(),
  fetchProactivePatterns: vi.fn(),
  fetchProactiveStatus: vi.fn(),
  fetchBuiltinTriggers: vi.fn(),
  createProactiveTrigger: vi.fn(),
  enableProactiveTrigger: vi.fn(),
  disableProactiveTrigger: vi.fn(),
  deleteProactiveTrigger: vi.fn(),
  testProactiveTrigger: vi.fn(),

  approveProactiveSuggestion: vi.fn(),
  dismissProactiveSuggestion: vi.fn(),
  clearExpiredSuggestions: vi.fn(),
  convertPatternToTrigger: vi.fn(),
}));

const mockApi = await vi.importMock<typeof import('../api/client')>('../api/client');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProactivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows disabled state when allowProactive is false', async () => {
    (mockApi.fetchSecurityPolicy as any).mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowMultimodal: false,
    });

    render(<ProactivePage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Proactive Assistance is Disabled')).toBeTruthy();
    });
  });

  it('shows tabs when proactive is enabled', async () => {
    (mockApi.fetchSecurityPolicy as any).mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: true,
    });
    (mockApi.fetchProactiveStatus as any).mockResolvedValue({
      triggers: { total: 5, enabled: 2, byType: { schedule: 2, event: 1 } },
      suggestions: { pending: 3 },
      patterns: { detected: 1 },
    });
    (mockApi.fetchBuiltinTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveTriggers as any).mockResolvedValue({ triggers: [] });

    render(<ProactivePage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeTruthy();
      expect(screen.getByText('Triggers')).toBeTruthy();
      expect(screen.getByText('Suggestions')).toBeTruthy();
      expect(screen.getByText('Patterns')).toBeTruthy();
    });
  });

  it('renders trigger list on triggers tab', async () => {
    (mockApi.fetchSecurityPolicy as any).mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: true,
    });
    (mockApi.fetchProactiveStatus as any).mockResolvedValue({
      triggers: { total: 1, enabled: 1 },
      suggestions: { pending: 0 },
      patterns: { detected: 0 },
    });
    (mockApi.fetchBuiltinTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveTriggers as any).mockResolvedValue({
      triggers: [
        {
          id: 't1',
          name: 'Test Trigger',
          type: 'schedule',
          enabled: true,
          condition: { type: 'schedule', cron: '0 9 * * *' },
          action: { type: 'message', content: 'Hello' },
          approvalMode: 'suggest',
          cooldownMs: 0,
          limitPerDay: 0,
          builtin: false,
        },
      ],
    });

    render(<ProactivePage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Triggers')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Triggers'));

    await waitFor(() => {
      expect(screen.getByText('Test Trigger')).toBeTruthy();
      expect(screen.getByText('schedule')).toBeTruthy();
    });
  });

  it('renders suggestion list with approve/dismiss', async () => {
    (mockApi.fetchSecurityPolicy as any).mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: true,
    });
    (mockApi.fetchProactiveStatus as any).mockResolvedValue({
      triggers: { total: 0, enabled: 0 },
      suggestions: { pending: 1 },
      patterns: { detected: 0 },
    });
    (mockApi.fetchBuiltinTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveSuggestions as any).mockResolvedValue({
      suggestions: [
        {
          id: 's1',
          triggerId: 't1',
          triggerName: 'Daily Standup',
          action: { type: 'message', content: 'Good morning!' },
          context: {},
          confidence: 1,
          suggestedAt: new Date().toISOString(),
          status: 'pending',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
      total: 1,
    });

    render(<ProactivePage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Suggestions')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Suggestions'));

    await waitFor(() => {
      expect(screen.getByText('Daily Standup')).toBeTruthy();
      expect(screen.getByText('pending')).toBeTruthy();
    });
  });

  it('navigates between tabs', async () => {
    (mockApi.fetchSecurityPolicy as any).mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: true,
    });
    (mockApi.fetchProactiveStatus as any).mockResolvedValue({
      triggers: { total: 0, enabled: 0 },
      suggestions: { pending: 0 },
      patterns: { detected: 0 },
    });
    (mockApi.fetchBuiltinTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveTriggers as any).mockResolvedValue({ triggers: [] });
    (mockApi.fetchProactiveSuggestions as any).mockResolvedValue({ suggestions: [], total: 0 });
    (mockApi.fetchProactivePatterns as any).mockResolvedValue({ patterns: [] });

    render(<ProactivePage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Patterns')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Patterns'));

    await waitFor(() => {
      expect(screen.getByText(/Patterns are automatically detected/)).toBeTruthy();
    });
  });
});
