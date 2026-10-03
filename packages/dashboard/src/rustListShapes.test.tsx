// @vitest-environment jsdom
/**
 * Rust gateway list shapes — regression guard.
 *
 * Several Rust list handlers answer with a bare JSON array of DB rows whose
 * fields differ from the TS gateway's wrapped objects. The API client wraps
 * such arrays (`toListResponse`), which makes these pages render rows they
 * previously never saw. This renders every such consumer through the real
 * client with Rust-shaped rows (crates/sy-core/src/db/*.rs, camelCase serde),
 * opens the item views that read the most fields, and fails on any crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LicenseProvider } from './hooks/useLicense';
import { ProactivePage } from './components/ProactivePage';
import { SwarmsPage } from './components/SwarmsPage';
import { GroupChatPage } from './components/GroupChatPage';
import { RoutingRulesPage } from './components/RoutingRulesPage';
import { A2APage } from './components/A2APage';
import { FederationTab } from './components/federation/FederationTab';
import { SandboxTab } from './components/security/SecuritySandboxTab';
import { ATHITab } from './components/security/SecurityATHITab';
import { SessionsPanel, HistoryPanel } from './components/editor/BottomPanels';
import { BrowserAutomationPage } from './components/BrowserAutomationPage';
import { ReplayBatchPanel } from './components/chat/ReplayBatchPanel';
import { ExtensionsPage } from './components/ExtensionsPage';
import { OAuthTab } from './components/connections/OAuthTab';
import { OpenTasks } from './components/TaskHistory';
import { DistillationTab } from './components/training/DistillationTab';
import { FinetuneTab } from './components/training/FinetuneTab';
import { LiveTab } from './components/training/LiveTab';
import { ComputerUseTab } from './components/training/ComputerUseTab';
import { EvaluationTab } from './components/training/EvaluationTab';
import { PreferencesTab } from './components/training/PreferencesTab';
import { ExperimentsTab } from './components/training/ExperimentsTab';
import { DeploymentTab } from './components/training/DeploymentTab';
import { SwarmTemplatesTab } from './components/marketplace/SwarmTemplatesTab';
import { FleetPanel } from './components/fleet/FleetPanel';

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: false,
    reconnecting: false,
    lastMessage: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
  }),
}));

const NOW = 1_760_000_000_000;
const POLICY = Object.fromEntries(
  [
    'allowProactive',
    'allowA2A',
    'allowExecution',
    'allowExtensions',
    'allowSubAgents',
    'allowExperiments',
    'allowMultimodal',
    'allowTrainingExport',
    'allowSwarms',
  ].map((k) => [k, true])
);

// Rust row shapes, one per list endpoint.
const R = {
  trigger: {
    id: 'tr-1',
    name: 'Rust trigger',
    description: null,
    triggerType: 'schedule',
    condition: {},
    action: {},
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  suggestion: {
    id: 'sg-1',
    title: 'Rust suggestion',
    description: null,
    category: null,
    priority: null,
    status: 'pending',
    source: null,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  pattern: {
    id: 'pt-1',
    patternType: 'temporal',
    description: 'Rust pattern',
    confidence: null,
    occurrences: null,
    metadata: {},
    learnedAt: NOW,
  },
  swarmTemplate: {
    id: 'st-1',
    name: 'Rust swarm',
    description: 'desc',
    strategy: 'sequential',
    roles: [{ role: 'r1', profileName: 'p1' }],
    coordinatorProfile: null,
    isBuiltin: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  swarmRun: {
    id: 'sr-1',
    templateId: 'st-1',
    task: 'Rust swarm task',
    context: null,
    status: 'completed',
    result: 'ok',
    error: null,
    tokenBudget: 1,
    tokensUsed: 1,
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: null,
    completedAt: null,
  },
  channel: {
    id: 'ch-1',
    platform: 'slack',
    name: 'Rust channel',
    externalId: null,
    memberCount: 2,
    lastMessageAt: null,
    createdAt: NOW,
  },
  message: {
    id: 'gm-1',
    channelId: 'ch-1',
    platform: 'slack',
    senderName: null,
    content: 'hello',
    externalId: null,
    createdAt: NOW,
  },
  rule: {
    id: 'rr-1',
    name: 'Rust rule',
    description: null,
    condition: {},
    action: {},
    priority: 1,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  a2aPeer: {
    id: 'ap-1',
    name: 'Rust peer',
    endpoint: 'https://peer.example',
    trustLevel: 'trusted',
    capabilities: {},
    status: 'online',
    lastSeenAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  fedPeer: {
    id: 'fp-1',
    name: 'Rust fed peer',
    endpoint: 'https://fed.example',
    status: 'online',
    trustLevel: 'trusted',
    features: null,
    lastHealthAt: null,
    createdAt: NOW,
  },
  scan: {
    id: 'sc-1',
    profileId: null,
    status: 'done',
    target: null,
    findings: [],
    startedAt: null,
    completedAt: null,
    createdAt: NOW,
  },
  quarantine: {
    id: 'q-1',
    scanId: null,
    itemType: 'file',
    itemName: 'x',
    reason: null,
    status: 'quarantined',
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  athi: {
    id: 'at-1',
    tenantId: 'default',
    name: 'Rust scenario',
    description: null,
    category: 'c',
    technique: null,
    status: 'identified',
    score: 3,
    createdAt: NOW,
    updatedAt: NOW,
  },
  execSession: { id: 'es-1234567890abcdef', status: 'active', createdAt: NOW },
  execution: {
    id: 'ex-1234567890abcdef',
    sessionId: null,
    status: 'done',
    language: null,
    createdAt: NOW,
    durationMs: null,
  },
  browserSession: {
    id: 'bs-1234567890',
    url: null,
    status: 'active',
    startedAt: NOW,
    endedAt: null,
    pageTitle: null,
  },
  replayJob: {
    id: 'rj-1',
    name: 'Rust replay',
    sourceConversationId: null,
    status: 'completed',
    report: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  hookLog: { id: 'hl-1', hookId: 'h-1', status: 'ok', executedAt: NOW },
  oauthToken: {
    id: 'ot-1',
    userId: 'u',
    provider: 'google',
    providerUserId: 'pu',
    accessTokenHash: 'h',
    refreshTokenHash: null,
    scopes: [],
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tenantId: 'default',
  },
  task: {
    id: 'task-1234567890',
    correlationId: null,
    parentTaskId: null,
    type: 'execute',
    name: 'Rust task',
    description: null,
    inputHash: 'h',
    status: 'running',
    resultJson: null,
    resourcesJson: null,
    securityContextJson: {},
    timeoutMs: 1,
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    tenantId: 'default',
  },
  distillation: {
    id: 'dj-1',
    status: 'pending',
    teacherModel: null,
    studentModel: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  finetune: {
    id: 'fj-1',
    status: 'pending',
    baseModel: null,
    method: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  quality: { id: 'qs-1', tenantId: 'default', score: 0.5, details: {}, createdAt: NOW },
  episode: {
    id: 'ep-1',
    tenantId: 'default',
    status: 'done',
    data: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  dataset: {
    id: 'ds-1',
    tenantId: 'default',
    name: 'Rust dataset',
    config: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  judgeRun: {
    id: 'jr-1',
    tenantId: 'default',
    status: 'done',
    config: {},
    result: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  preference: { id: 'pp-1', tenantId: 'default', data: {}, createdAt: NOW, updatedAt: NOW },
  experiment: {
    id: 'te-1',
    name: 'Rust experiment',
    status: 'draft',
    variantA: null,
    variantB: null,
    createdAt: NOW,
  },
  modelVersion: {
    id: 'mv-1',
    tenantId: 'default',
    name: 'm',
    version: '1',
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  },
  abTest: {
    id: 'ab-1',
    tenantId: 'default',
    name: 'Rust ab',
    status: 'running',
    variantA: 'a',
    variantB: 'b',
    trafficSplit: 0.5,
    metric: 'q',
    createdAt: NOW,
    updatedAt: NOW,
  },
};

const ROUTES: [RegExp, unknown][] = [
  [/^\/api\/v1\/security\/policy$/, POLICY],
  [
    /^\/api\/v1\/license\/status$/,
    { tier: 'enterprise', valid: true, enforcementEnabled: false, features: [] },
  ],
  [/^\/api\/v1\/proactive\/triggers$/, [R.trigger]],
  [/^\/api\/v1\/proactive\/suggestions$/, [R.suggestion]],
  [/^\/api\/v1\/proactive\/patterns$/, [R.pattern]],
  [/^\/api\/v1\/agents\/swarms\/templates$/, [R.swarmTemplate]],
  [/^\/api\/v1\/agents\/swarms$/, [R.swarmRun]],
  [/^\/api\/v1\/group-chat\/channels$/, [R.channel]],
  [/^\/api\/v1\/group-chat\/channels\/[^/]+\/[^/]+\/messages$/, [R.message]],
  [/^\/api\/v1\/routing-rules$/, [R.rule]],
  [/^\/api\/v1\/a2a\/peers$/, [R.a2aPeer]],
  [/^\/api\/v1\/a2a\/config$/, { config: { enabled: true } }],
  [/^\/api\/v1\/federation\/peers$/, [R.fedPeer]],
  [/^\/api\/v1\/sandbox\/scans$/, [R.scan]],
  [/^\/api\/v1\/sandbox\/quarantine$/, [R.quarantine]],
  [/^\/api\/v1\/security\/athi\/scenarios$/, [R.athi]],
  [/^\/api\/v1\/security\/athi\/summary$/, { totalScenarios: 1, passing: 0, failing: 0, score: 0 }],
  [/^\/api\/v1\/execution\/sessions$/, [R.execSession]],
  [/^\/api\/v1\/execution\/history$/, [R.execution]],
  [/^\/api\/v1\/execution\/config$/, { config: { enabled: true } }],
  [/^\/api\/v1\/browser\/sessions$/, [R.browserSession]],
  [/^\/api\/v1\/replay-jobs$/, [R.replayJob]],
  [/^\/api\/v1\/replay-jobs\/[^/]+\/report$/, { id: 'rj-1', status: 'completed', report: {} }],
  [/^\/api\/v1\/extensions\/config$/, [{ key: 'enabled', value: true }]],
  [/^\/api\/v1\/extensions\/hooks\/log$/, [R.hookLog]],
  [/^\/api\/v1\/auth\/oauth\/tokens$/, [R.oauthToken]],
  [/^\/api\/v1\/tasks$/, [R.task]],
  [/^\/api\/v1\/training\/distillation\/jobs$/, [R.distillation]],
  [/^\/api\/v1\/training\/finetune\/jobs$/, [R.finetune]],
  [/^\/api\/v1\/training\/quality$/, [R.quality]],
  [/^\/api\/v1\/training\/computer-use\/episodes$/, [R.episode]],
  [/^\/api\/v1\/training\/judge\/datasets$/, [R.dataset]],
  [/^\/api\/v1\/training\/judge\/runs$/, [R.judgeRun]],
  [/^\/api\/v1\/training\/preferences$/, [R.preference]],
  [/^\/api\/v1\/training\/experiments$/, [R.experiment]],
  [/^\/api\/v1\/training\/experiments\/te-1$/, R.experiment],
  [/^\/api\/v1\/training\/model-versions$/, [R.modelVersion]],
  [/^\/api\/v1\/training\/ab-tests$/, [R.abTest]],
  [/^\/api\/v1\/training\/stream$/, { status: 'stub' }],
  [/^\/api\/v1\/mcp\/config$/, { exposeBrowser: true }],
];

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://localhost');
  const hit = ROUTES.find(([re]) => re.test(url.pathname));
  const body = hit ? hit[1] : { error: 'not found' };
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: hit ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    })
  );
});

let consoleErrors: string[] = [];
let windowErrors: unknown[] = [];
const onWindowError = (e: ErrorEvent) => {
  windowErrors.push(e.error ?? e.message);
};

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  // jsdom lacks both; recharts and the group-chat thread use them.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = () => {};
  consoleErrors = [];
  windowErrors = [];
  window.addEventListener('error', onWindowError);
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  window.removeEventListener('error', onWindowError);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPage(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LicenseProvider>{ui}</LicenseProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

function expectNoCrash(container: HTMLElement) {
  const crashes = consoleErrors.filter((m) => /above error occurred|Uncaught|TypeError/.test(m));
  expect(windowErrors, String(windowErrors[0])).toEqual([]);
  expect(crashes).toEqual([]);
  expect(container.innerHTML).not.toBe('');
}

async function clickAll(matcher: RegExp) {
  for (const el of screen.queryAllByRole('button', { name: matcher })) {
    fireEvent.click(el);
    await settle();
  }
}

describe('Rust-shaped list rows do not crash consumers', () => {
  it('ProactivePage tabs', async () => {
    const { container } = renderPage(<ProactivePage />);
    await settle();
    for (const tab of [/^Triggers$/, /^Suggestions$/, /^Patterns$/]) {
      const btn = screen.queryAllByRole('button', { name: tab })[0];
      if (btn) fireEvent.click(btn);
      await settle();
    }
    await waitFor(() => {
      expect(screen.getByText('Rust pattern')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Suggestions/ })[0]);
    await settle();
    expectNoCrash(container);
  });

  it('SwarmsPage', async () => {
    const { container } = renderPage(<SwarmsPage allowSubAgents />);
    await waitFor(() => {
      expect(screen.getAllByText(/Rust swarm/).length).toBeGreaterThan(0);
    });
    const task = screen.queryByText('Rust swarm task');
    if (task) fireEvent.click(task);
    await settle();
    expectNoCrash(container);
  });

  it('GroupChatPage', async () => {
    const { container } = renderPage(<GroupChatPage />);
    await settle();
    await settle();
    const ch = screen.getAllByRole('button').find((b) => b.textContent?.includes('🟪'));
    expect(ch).toBeTruthy();
    fireEvent.click(ch!);
    await settle();
    await settle();
    expectNoCrash(container);
  });

  it('RoutingRulesPage expand + edit', async () => {
    const { container } = renderPage(<RoutingRulesPage />);
    await waitFor(() => {
      expect(screen.getByText('Rust rule')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Test'));
    await settle();
    fireEvent.click(screen.getByTitle('Edit'));
    await settle();
    expectNoCrash(container);
  });

  it('A2APage + FleetPanel', async () => {
    const a = renderPage(<A2APage />);
    await waitFor(() => {
      expect(screen.getAllByText('Rust peer').length).toBeGreaterThan(0);
    });
    expectNoCrash(a.container);
    a.unmount();
    const f = renderPage(<FleetPanel />);
    await settle();
    await settle();
    expectNoCrash(f.container);
  });

  it('FederationTab expand', async () => {
    const { container } = renderPage(<FederationTab />);
    await waitFor(() => {
      expect(screen.getByText('Rust fed peer')).toBeInTheDocument();
    });
    await clickAll(/Expand/);
    expectNoCrash(container);
  });

  it('SandboxTab + ATHITab', async () => {
    const s = renderPage(<SandboxTab />);
    await settle();
    await settle();
    expectNoCrash(s.container);
    s.unmount();
    const a = renderPage(<ATHITab />);
    await waitFor(() => {
      expect(screen.getByText('Rust scenario')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    await settle();
    expectNoCrash(a.container);
  });

  it('Execution panels', async () => {
    const s = renderPage(<SessionsPanel />);
    await settle();
    await settle();
    expectNoCrash(s.container);
    s.unmount();
    const h = renderPage(<HistoryPanel />);
    await settle();
    await settle();
    const row = h.container.querySelector('tbody tr');
    if (row) fireEvent.click(row);
    await settle();
    expectNoCrash(h.container);
  });

  it('BrowserAutomationPage expand', async () => {
    const { container } = renderPage(<BrowserAutomationPage />);
    await settle();
    await settle();
    const row = container.querySelector('tbody tr');
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    await settle();
    expectNoCrash(container);
  });

  it('ReplayBatchPanel view report', async () => {
    const { container } = renderPage(
      <ReplayBatchPanel selectedConversationIds={[]} onClearSelection={() => {}} />
    );
    const btn = await screen.findByTestId('view-report-rj-1');
    fireEvent.click(btn);
    await settle();
    await settle();
    expectNoCrash(container);
  });

  it('ExtensionsPage debugger', async () => {
    const { container } = renderPage(<ExtensionsPage />);
    const tab = await screen.findByRole('button', { name: 'Debugger' });
    fireEvent.click(tab);
    await settle();
    await settle();
    expectNoCrash(container);
  });

  it('OAuthTab + OpenTasks', async () => {
    const o = renderPage(<OAuthTab />);
    await settle();
    await settle();
    expectNoCrash(o.container);
    o.unmount();
    const t = renderPage(<OpenTasks />);
    await waitFor(() => {
      expect(screen.getAllByText('Rust task').length).toBeGreaterThan(0);
    });
    expectNoCrash(t.container);
  });

  it('Training tabs', async () => {
    for (const Tab of [
      DistillationTab,
      FinetuneTab,
      LiveTab,
      ComputerUseTab,
      EvaluationTab,
      PreferencesTab,
      DeploymentTab,
      SwarmTemplatesTab,
    ]) {
      const r = renderPage(<Tab />);
      await settle();
      await settle();
      expectNoCrash(r.container);
      r.unmount();
    }
    const e = renderPage(<ExperimentsTab />);
    const exp = await screen.findByText('Rust experiment');
    fireEvent.click(exp);
    await settle();
    await settle();
    expectNoCrash(e.container);
  });
});
