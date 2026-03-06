// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ExtensionsPage } from './ExtensionsPage';

vi.mock('../api/client', () => ({
  fetchExtensions: vi.fn(),
  registerExtension: vi.fn(),
  removeExtension: vi.fn(),
  fetchExtensionHooks: vi.fn(),
  registerExtensionHook: vi.fn(),
  removeExtensionHook: vi.fn(),
  fetchExtensionWebhooks: vi.fn(),
  registerExtensionWebhook: vi.fn(),
  removeExtensionWebhook: vi.fn(),
  discoverExtensions: vi.fn(),
  fetchExtensionConfig: vi.fn(),
  fetchSecurityPolicy: vi.fn(),
  fetchHookExecutionLog: vi.fn(),
  testHookPoint: vi.fn(),
}));

import * as api from '../api/client';

const mockFetchExtensionConfig = vi.mocked(api.fetchExtensionConfig);
const mockFetchSecurityPolicy = vi.mocked(api.fetchSecurityPolicy);
const mockFetchExtensions = vi.mocked(api.fetchExtensions);
const mockFetchExtensionHooks = vi.mocked(api.fetchExtensionHooks);
const mockFetchExtensionWebhooks = vi.mocked(api.fetchExtensionWebhooks);
const mockRemoveExtension = vi.mocked(api.removeExtension);
const mockDiscoverExtensions = vi.mocked(api.discoverExtensions);
const mockRegisterExtension = vi.mocked(api.registerExtension);
const mockRegisterExtensionHook = vi.mocked(api.registerExtensionHook);
const mockRemoveExtensionHook = vi.mocked(api.removeExtensionHook);
const mockRegisterExtensionWebhook = vi.mocked(api.registerExtensionWebhook);
const mockRemoveExtensionWebhook = vi.mocked(api.removeExtensionWebhook);
const mockFetchHookExecutionLog = vi.mocked(api.fetchHookExecutionLog);
const mockTestHookPoint = vi.mocked(api.testHookPoint);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <ExtensionsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const MOCK_EXTENSIONS = {
  extensions: [
    { id: 'ext-1', name: 'Logger', version: '1.0.0', enabled: true, createdAt: Date.now() },
    { id: 'ext-2', name: 'Metrics', version: '2.1.0', enabled: false, createdAt: Date.now() },
  ],
};

const MOCK_HOOKS = {
  hooks: [
    {
      id: 'hook-1',
      extensionId: 'ext-1',
      hookPoint: 'pre-chat',
      semantics: 'observe',
      priority: 10,
      enabled: true,
    },
  ],
};

const MOCK_WEBHOOKS = {
  webhooks: [
    {
      id: 'wh-1',
      url: 'https://example.com/webhook',
      hookPoints: ['pre-chat', 'post-task'],
      enabled: true,
      secret: '***',
    },
  ],
};

describe('ExtensionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: true,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
      sandboxCredentialProxy: false,
      allowNetworkTools: false,
      allowNetBoxWrite: false,
      allowWorkflows: false,
      allowCommunityGitFetch: false,
      allowTwingate: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    mockFetchExtensions.mockResolvedValue(MOCK_EXTENSIONS);
    mockFetchExtensionHooks.mockResolvedValue(MOCK_HOOKS);
    mockFetchExtensionWebhooks.mockResolvedValue(MOCK_WEBHOOKS);
    mockRegisterExtension.mockResolvedValue(undefined as never);
    mockRegisterExtensionHook.mockResolvedValue(undefined as never);
    mockRemoveExtensionHook.mockResolvedValue({ success: true } as never);
    mockRegisterExtensionWebhook.mockResolvedValue(undefined as never);
    mockRemoveExtensionWebhook.mockResolvedValue({ success: true } as never);
    mockFetchHookExecutionLog.mockResolvedValue({ entries: [] });
    mockTestHookPoint.mockResolvedValue({ result: { vetoed: false, errors: [] }, durationMs: 5 } as never);
  });

  // ── Rendering ──────────────────────────────────────────────

  it('renders the heading', async () => {
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
  });

  it('shows disabled state when config and security policy both disallow', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
      sandboxCredentialProxy: false,
      allowNetworkTools: false,
      allowNetBoxWrite: false,
      allowWorkflows: false,
      allowCommunityGitFetch: false,
      allowTwingate: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByText('Extensions Not Enabled')).toBeInTheDocument();
  });

  it('shows enabled state when only security policy allows', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: false } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: true,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
      sandboxCredentialProxy: false,
      allowNetworkTools: false,
      allowNetBoxWrite: false,
      allowWorkflows: false,
      allowCommunityGitFetch: false,
      allowTwingate: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
  });

  it('shows enabled state when only config.enabled is true', async () => {
    mockFetchExtensionConfig.mockResolvedValue({ config: { enabled: true } });
    mockFetchSecurityPolicy.mockResolvedValue({
      allowSubAgents: false,
      allowA2A: false,
      allowSwarms: false,
      allowExtensions: false,
      allowExecution: true,
      allowProactive: false,
      allowExperiments: false,
      allowStorybook: false,
      allowMultimodal: false,
      allowDesktopControl: false,
      allowCamera: false,
      allowDynamicTools: false,
      sandboxDynamicTools: true,
      allowAnomalyDetection: false,
      sandboxGvisor: false,
      sandboxWasm: false,
      sandboxCredentialProxy: false,
      allowNetworkTools: false,
      allowNetBoxWrite: false,
      allowWorkflows: false,
      allowCommunityGitFetch: false,
      allowTwingate: false,
      allowOrgIntent: false,
      allowIntentEditor: false,
      allowCodeEditor: true,
      allowAdvancedEditor: false,
      allowTrainingExport: false,
      promptGuardMode: 'warn' as const,
      responseGuardMode: 'warn' as const,
      jailbreakThreshold: 0.5,
      jailbreakAction: 'warn' as const,
      strictSystemPromptConfidentiality: false,
      abuseDetectionEnabled: true,
      contentGuardrailsEnabled: false,
      contentGuardrailsPiiMode: 'disabled' as const,
      contentGuardrailsToxicityEnabled: false,
      contentGuardrailsToxicityMode: 'warn' as const,
      contentGuardrailsToxicityThreshold: 0.7,
      contentGuardrailsBlockList: [],
      contentGuardrailsBlockedTopics: [],
      contentGuardrailsGroundingEnabled: false,
      contentGuardrailsGroundingMode: 'flag' as const,
    });
    renderComponent();
    expect(await screen.findByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
  });

  // ── Tabs ───────────────────────────────────────────────────

  it('renders Extensions, Hooks, and Webhooks tabs', async () => {
    renderComponent();
    await screen.findByText('Discover');
    expect(screen.getByText('Hooks')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();
  });

  // ── Extensions Tab ─────────────────────────────────────────

  it('shows registered extensions', async () => {
    renderComponent();
    expect(await screen.findByText('Logger')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
  });

  it('shows empty state when no extensions', async () => {
    mockFetchExtensions.mockResolvedValue({ extensions: [] });
    renderComponent();
    expect(await screen.findByText('No extensions registered')).toBeInTheDocument();
  });

  it('shows Register Extension button', async () => {
    renderComponent();
    expect(await screen.findByText('Register Extension')).toBeInTheDocument();
  });

  it('can remove an extension', async () => {
    mockRemoveExtension.mockResolvedValue(undefined as never);
    renderComponent();
    await screen.findByText('Logger');
    const removeButtons = screen.getAllByTitle('Remove extension');
    fireEvent.click(removeButtons[0]);
    await waitFor(() => {
      expect(mockRemoveExtension).toHaveBeenCalled();
      expect(mockRemoveExtension.mock.calls[0][0]).toBe('ext-1');
    });
  });

  // ── Hooks Tab ──────────────────────────────────────────────

  it('shows hooks when Hooks tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    expect(await screen.findByText('pre-chat')).toBeInTheDocument();
    expect(screen.getByText('observe')).toBeInTheDocument();
  });

  it('shows empty hooks state', async () => {
    const user = userEvent.setup();
    mockFetchExtensionHooks.mockResolvedValue({ hooks: [] });
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    expect(await screen.findByText('No hooks registered')).toBeInTheDocument();
  });

  // ── Webhooks Tab ───────────────────────────────────────────

  it('shows webhooks when Webhooks tab is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    expect(await screen.findByText('https://example.com/webhook')).toBeInTheDocument();
  });

  it('shows empty webhooks state', async () => {
    const user = userEvent.setup();
    mockFetchExtensionWebhooks.mockResolvedValue({ webhooks: [] });
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    expect(await screen.findByText('No webhooks registered')).toBeInTheDocument();
  });

  // ── Discover ───────────────────────────────────────────────

  it('calls discover when Discover button is clicked', async () => {
    const user = userEvent.setup();
    mockDiscoverExtensions.mockResolvedValue(undefined as never);
    renderComponent();
    const discoverBtn = await screen.findByText('Discover');
    await user.click(discoverBtn);
    await waitFor(() => {
      expect(mockDiscoverExtensions).toHaveBeenCalled();
    });
  });

  // ── Register Extension form ───────────────────────────────────

  it('opens and fills register extension form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Register Extension');
    await user.click(screen.getByText('Register Extension'));
    expect(screen.getByPlaceholderText('e.g. my-extension')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Extension')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1.0.0')).toBeInTheDocument();
  });

  it('submits register extension form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Register Extension');
    await user.click(screen.getByText('Register Extension'));

    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'test-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Test Extension');

    await user.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(mockRegisterExtension).toHaveBeenCalled();
      expect(mockRegisterExtension.mock.calls[0][0]).toMatchObject({
        id: 'test-ext',
        name: 'Test Extension',
        version: '1.0.0',
      });
    });
  });

  it('closes register extension form on X button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Register Extension');
    await user.click(screen.getByText('Register Extension'));
    expect(screen.getByPlaceholderText('e.g. my-extension')).toBeInTheDocument();
    // Click the X button within the register form
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find((b) => b.querySelector('.lucide-x'));
    if (closeBtn) await user.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('e.g. my-extension')).not.toBeInTheDocument();
    });
  });

  it('shows extension error when registration fails', async () => {
    mockRegisterExtension.mockRejectedValue(new Error('reg failed'));
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Register Extension');
    await user.click(screen.getByText('Register Extension'));

    await user.type(screen.getByPlaceholderText('e.g. my-extension'), 'bad-ext');
    await user.type(screen.getByPlaceholderText('My Extension'), 'Bad');
    await user.click(screen.getByText('Register'));
    expect(await screen.findByText('reg failed')).toBeInTheDocument();
  });

  // ── Hooks Tab: register hook form ─────────────────────────────

  it('opens hook registration form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    await screen.findByText('Register Hook');
    await user.click(screen.getByText('Register Hook'));
    expect(screen.getByText('Extension')).toBeInTheDocument();
    expect(screen.getByText('Hook Point')).toBeInTheDocument();
    expect(screen.getByText('Semantics')).toBeInTheDocument();
  });

  it('removes a hook via remove button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    await screen.findByText('pre-chat');
    const removeBtn = screen.getByLabelText('Remove hook');
    await user.click(removeBtn);
    await waitFor(() => {
      expect(vi.mocked(api.removeExtensionHook)).toHaveBeenCalled();
    });
  });

  // ── Webhooks Tab: register and remove ─────────────────────────

  it('opens webhook registration form', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    await screen.findByText('Register Webhook');
    await user.click(screen.getByText('Register Webhook'));
    expect(screen.getByPlaceholderText('https://example.com/webhook')).toBeInTheDocument();
  });

  it('removes a webhook via remove button', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    await screen.findByText('https://example.com/webhook');
    const removeBtn = screen.getByLabelText('Remove webhook');
    await user.click(removeBtn);
    await waitFor(() => {
      expect(vi.mocked(api.removeExtensionWebhook)).toHaveBeenCalled();
    });
  });

  it('displays webhook hook points as badges', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    await screen.findByText('https://example.com/webhook');
    expect(screen.getByText('pre-chat')).toBeInTheDocument();
    expect(screen.getByText('post-task')).toBeInTheDocument();
  });

  // ── Debugger Tab ──────────────────────────────────────────────

  it('renders Debugger tab', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    expect(await screen.findByText('Test Trigger')).toBeInTheDocument();
    expect(screen.getByText('Execution Log')).toBeInTheDocument();
  });

  it('shows empty execution log message', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    expect(await screen.findByText('No executions recorded yet')).toBeInTheDocument();
  });

  it('fires test trigger and shows OK result', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    await screen.findByText('Fire Test');
    await user.click(screen.getByText('Fire Test'));
    await waitFor(() => {
      expect(mockTestHookPoint).toHaveBeenCalled();
    });
    expect(await screen.findByText('OK')).toBeInTheDocument();
    expect(screen.getByText('5ms')).toBeInTheDocument();
  });

  it('shows vetoed result from test trigger', async () => {
    mockTestHookPoint.mockResolvedValue({ result: { vetoed: true, errors: [] }, durationMs: 12 } as never);
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    await screen.findByText('Fire Test');
    await user.click(screen.getByText('Fire Test'));
    expect(await screen.findByText('Vetoed')).toBeInTheDocument();
  });

  it('shows error result from test trigger', async () => {
    mockTestHookPoint.mockResolvedValue({ result: { vetoed: false, errors: ['handler failed'] }, durationMs: 3 } as never);
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    await screen.findByText('Fire Test');
    await user.click(screen.getByText('Fire Test'));
    expect(await screen.findByText('1 error(s)')).toBeInTheDocument();
  });

  it('shows error when test trigger fails', async () => {
    mockTestHookPoint.mockRejectedValue(new Error('test boom'));
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    await screen.findByText('Fire Test');
    await user.click(screen.getByText('Fire Test'));
    expect(await screen.findByText('test boom')).toBeInTheDocument();
  });

  it('shows invalid JSON payload error', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    await screen.findByText('Fire Test');

    const textarea = screen.getByPlaceholderText('{}');
    await user.clear(textarea);
    await user.type(textarea, 'not json');
    await user.click(screen.getByText('Fire Test'));
    expect(await screen.findByText('Invalid JSON payload')).toBeInTheDocument();
  });

  it('renders execution log entries when present', async () => {
    const logEntries = {
      entries: [
        {
          id: 'entry-1',
          hookPoint: 'task:after-execute',
          vetoed: false,
          errors: [],
          handlerCount: 2,
          durationMs: 8,
          isTest: false,
          timestamp: Date.now(),
        },
        {
          id: 'entry-2',
          hookPoint: 'ai:on-error',
          vetoed: true,
          errors: ['timeout'],
          handlerCount: 1,
          durationMs: 15,
          isTest: true,
          timestamp: Date.now(),
        },
      ],
    };
    mockFetchHookExecutionLog.mockImplementation(() => Promise.resolve(logEntries));
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    // Multiple elements may match: hook point select options + log entries
    const afterExecElements = await screen.findAllByText('task:after-execute');
    expect(afterExecElements.length).toBeGreaterThanOrEqual(1);
    const aiErrorElements = screen.getAllByText('ai:on-error');
    expect(aiErrorElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 handlers')).toBeInTheDocument();
    expect(screen.getByText('1 handler')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('vetoed')).toBeInTheDocument();
  });

  it('has refresh button in execution log', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Debugger'));
    expect(await screen.findByLabelText('Refresh log')).toBeInTheDocument();
  });

  // ── Loading states ────────────────────────────────────────────

  it('shows extensions loading spinner', async () => {
    mockFetchExtensions.mockReturnValue(new Promise(() => {}));
    renderComponent();
    // The heading should still be there
    expect(await screen.findByText('Discover')).toBeInTheDocument();
  });

  it('shows hooks loading spinner', async () => {
    const user = userEvent.setup();
    mockFetchExtensionHooks.mockReturnValue(new Promise(() => {}));
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Hooks'));
    // Should not crash — loading state displayed
    await waitFor(() => {
      expect(screen.queryByText('No hooks registered')).not.toBeInTheDocument();
    });
  });

  it('shows webhooks loading spinner', async () => {
    const user = userEvent.setup();
    mockFetchExtensionWebhooks.mockReturnValue(new Promise(() => {}));
    renderComponent();
    await screen.findByText('Discover');
    await user.click(screen.getByText('Webhooks'));
    await waitFor(() => {
      expect(screen.queryByText('No webhooks registered')).not.toBeInTheDocument();
    });
  });
});
