import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Menu, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSidebar } from '../hooks/useSidebar';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchMetrics, fetchHealth, fetchOnboardingStatus, fetchAiHealth } from '../api/client';
import { Sidebar } from './Sidebar';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Logo } from './Logo';
import { ErrorBoundary } from './common/ErrorBoundary';
import { OnboardingWizard } from './OnboardingWizard';

// Lazy-loaded route components — each becomes its own JS chunk
const MetricsPage = lazy(() => import('./MetricsPage').then((m) => ({ default: m.MetricsPage })));
const _PersonalityEditor = lazy(() =>
  import('./PersonalitiesPage').then((m) => ({ default: m.PersonalityEditor }))
);
const PersonalityView = lazy(() =>
  import('./PersonalitiesPage').then((m) => ({ default: m.PersonalityView }))
);
const PersonalityEditPage = lazy(() =>
  import('./PersonalitiesPage').then((m) => ({ default: m.PersonalityEditPage }))
);
const EditorPage = lazy(() => import('./EditorPage').then((m) => ({ default: m.EditorPage })));
const ChatPage = lazy(() => import('./ChatPage').then((m) => ({ default: m.ChatPage })));
const SettingsPage = lazy(() =>
  import('./SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const SecurityPage = lazy(() =>
  import('./SecurityPage').then((m) => ({ default: m.SecurityPage }))
);
const SkillsPage = lazy(() => import('./SkillsPage').then((m) => ({ default: m.SkillsPage })));
const ConnectionsPage = lazy(() =>
  import('./ConnectionsPage').then((m) => ({ default: m.ConnectionsPage }))
);
const AgentsPage = lazy(() => import('./AgentsPage').then((m) => ({ default: m.AgentsPage })));
const DeveloperPage = lazy(() =>
  import('./DeveloperPage').then((m) => ({ default: m.DeveloperPage }))
);
const ProactivePage = lazy(() =>
  import('./ProactivePage').then((m) => ({ default: m.ProactivePage }))
);
const AutomationPage = lazy(() =>
  import('../pages/AutomationPage').then((m) => ({ default: m.AutomationPage }))
);
const WorkflowBuilder = lazy(() =>
  import('../pages/WorkflowBuilder').then((m) => ({ default: m.WorkflowBuilder }))
);
const WorkflowRunDetail = lazy(() =>
  import('../pages/WorkflowRunDetail').then((m) => ({ default: m.WorkflowRunDetail }))
);
const _IntentPage = lazy(() => import('./IntentEditor').then((m) => ({ default: m.IntentEditor })));
const OrganizationPage = lazy(() =>
  import('./OrganizationPage').then((m) => ({ default: m.OrganizationPage }))
);
const AdvancedEditorPage = lazy(() =>
  import('./AdvancedEditor/AdvancedEditorPage').then((m) => ({ default: m.AdvancedEditorPage }))
);
const SimulationPage = lazy(() =>
  import('./simulation/SimulationPanel').then((m) => ({ default: m.SimulationPanel }))
);

export function DashboardLayout() {
  const { logout } = useAuth();
  const { collapsed, setMobileOpen } = useSidebar();

  // Network access is enforced server-side by the gateway (allowRemoteAccess config).
  // No client-side hostname check — it can't know about gateway config or custom hostnames.

  // Data queries
  const { data: health, error: healthError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 5000,
  });

  const { connected, reconnecting } = useWebSocket('/ws/metrics');

  const { data: aiHealth } = useQuery({
    queryKey: ['ai-health'],
    queryFn: fetchAiHealth,
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: onboarding, refetch: refetchOnboarding } = useQuery({
    queryKey: ['onboarding'],
    queryFn: fetchOnboardingStatus,
    retry: false,
  });

  if (onboarding?.needed) {
    return (
      <OnboardingWizard
        onComplete={() => {
          void refetchOnboarding();
        }}
      />
    );
  }

  const isConnected = !healthError && health?.status === 'ok';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <Sidebar
        isConnected={isConnected}
        wsConnected={connected}
        reconnecting={reconnecting}
        onRefresh={() => void refetchMetrics()}
        onLogout={() => void logout()}
      />

      {/* Main content column – single wrapper; margin accounts for fixed sidebar */}
      <style>{`
        @media (min-width: 768px) {
          .dashboard-main { margin-left: ${collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)'}; }
        }
      `}</style>
      <div className="dashboard-main flex flex-col flex-1 min-h-screen transition-[margin-left] duration-200">
        {/* Header */}
        <header className="border-b bg-card sticky top-0 z-20 shrink-0">
          <div className="px-4 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              {/* Mobile: hamburger + logo */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 md:hidden">
                <button
                  className="btn-ghost p-2"
                  onClick={() => {
                    setMobileOpen(true);
                  }}
                  aria-label="Open navigation menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <Logo size={28} />
                <div className="min-w-0">
                  <h1 className="text-lg font-bold truncate">SecureYeoman</h1>
                </div>
              </div>

              {/* Desktop: spacer so items center-right */}
              <div className="hidden md:block" />

              {/* Notification bell + search */}
              <div className="flex items-center gap-3">
                <NotificationBell />
                <div className="hidden md:block">
                  <SearchBar />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Server Unreachable Banner */}
        {healthError && (
          <div
            role="alert"
            className="flex items-center gap-3 px-4 py-2.5 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm"
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Unable to connect to SecureYeoman server</strong> — retrying automatically
              every 5 s.
            </span>
            <button
              onClick={() => void refetchMetrics()}
              className="btn-ghost p-1 rounded hover:bg-destructive/20"
              aria-label="Retry connection"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Local AI Unavailable Banner */}
        {aiHealth?.local && aiHealth.status === 'unreachable' && (
          <div
            role="alert"
            className="flex items-center gap-3 px-4 py-2.5 bg-warning/10 border-b border-warning/30 text-warning text-sm"
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Local AI Unavailable</strong> — {aiHealth.provider} at{' '}
              <code className="text-xs bg-warning/10 px-1 rounded">{aiHealth.baseUrl}</code> is not
              reachable. Check that {aiHealth.provider} is running.
            </span>
          </div>
        )}

        {/* Main Content */}
        <main className="px-2 sm:px-3 py-3 sm:py-4 flex-1">
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<Navigate to="/metrics" replace />} />
              <Route
                path="/metrics"
                element={
                  <ErrorBoundary fallbackTitle="Metrics failed to load">
                    <MetricsPage metrics={metrics} health={health} />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/chat"
                element={
                  <ErrorBoundary fallbackTitle="Chat failed to load">
                    <ChatPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/editor/advanced"
                element={
                  <ErrorBoundary fallbackTitle="Advanced Editor failed to load">
                    <AdvancedEditorPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/editor"
                element={
                  <ErrorBoundary fallbackTitle="Editor failed to load">
                    <EditorPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/code" element={<Navigate to="/editor" replace />} />
              <Route
                path="/security"
                element={
                  <ErrorBoundary fallbackTitle="Security failed to load">
                    <SecurityPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/automation"
                element={
                  <ErrorBoundary fallbackTitle="Automation failed to load">
                    <AutomationPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/tasks" element={<Navigate to="/automation" replace />} />
              <Route
                path="/workflows"
                element={<Navigate to="/automation?tab=workflows" replace />}
              />
              <Route
                path="/workflows/:id/builder"
                element={
                  <ErrorBoundary fallbackTitle="Workflow Builder failed to load">
                    <WorkflowBuilder />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/workflows/runs/:runId"
                element={
                  <ErrorBoundary fallbackTitle="Workflow Run failed to load">
                    <WorkflowRunDetail />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/reports"
                element={
                  <ErrorBoundary fallbackTitle="Security failed to load">
                    <SecurityPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/personality"
                element={
                  <ErrorBoundary fallbackTitle="Personality failed to load">
                    <PersonalityView />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/personality/new"
                element={
                  <ErrorBoundary fallbackTitle="Personality Editor failed to load">
                    <PersonalityEditPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/personality/:id/edit"
                element={
                  <ErrorBoundary fallbackTitle="Personality Editor failed to load">
                    <PersonalityEditPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/skills"
                element={
                  <ErrorBoundary fallbackTitle="Skills failed to load">
                    <SkillsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/marketplace"
                element={
                  <ErrorBoundary fallbackTitle="Skills failed to load">
                    <SkillsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/agents"
                element={
                  <ErrorBoundary fallbackTitle="Agents failed to load">
                    <AgentsPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/group-chat" element={<Navigate to="/chat" replace />} />
              <Route
                path="/routing-rules"
                element={<Navigate to="/connections?tab=routing" replace />}
              />
              <Route
                path="/connections/*"
                element={
                  <ErrorBoundary fallbackTitle="Connections failed to load">
                    <ConnectionsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/mcp"
                element={
                  <ErrorBoundary fallbackTitle="Connections failed to load">
                    <ConnectionsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/developers"
                element={
                  <ErrorBoundary fallbackTitle="Developer Tools failed to load">
                    <DeveloperPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/extensions" element={<Navigate to="/developers" replace />} />
              <Route path="/experiments" element={<Navigate to="/developers" replace />} />
              <Route path="/execution" element={<Navigate to="/editor" replace />} />
              <Route path="/a2a" element={<Navigate to="/agents" replace />} />
              <Route
                path="/proactive"
                element={
                  <ErrorBoundary fallbackTitle="Proactive failed to load">
                    <ProactivePage />
                  </ErrorBoundary>
                }
              />
              <Route path="/multimodal" element={<Navigate to="/agents" replace />} />
              <Route path="/costs" element={<Navigate to="/metrics" replace />} />
              <Route
                path="/organization"
                element={
                  <ErrorBoundary fallbackTitle="Organization failed to load">
                    <OrganizationPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/simulation"
                element={
                  <ErrorBoundary fallbackTitle="Simulation failed to load">
                    <SimulationPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/intent" element={<Navigate to="/organization?tab=intent" replace />} />
              <Route
                path="/settings"
                element={
                  <ErrorBoundary fallbackTitle="Settings failed to load">
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/security-settings"
                element={
                  <ErrorBoundary fallbackTitle="Settings failed to load">
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/api-keys"
                element={
                  <ErrorBoundary fallbackTitle="Settings failed to load">
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/users" element={<Navigate to="/organization?tab=users" replace />} />
              <Route
                path="/workspaces"
                element={<Navigate to="/organization?tab=workspaces" replace />}
              />
              <Route
                path="/roles"
                element={
                  <ErrorBoundary fallbackTitle="Settings failed to load">
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/souls"
                element={
                  <ErrorBoundary fallbackTitle="Settings failed to load">
                    <SettingsPage />
                  </ErrorBoundary>
                }
              />
              <Route path="*" element={<Navigate to="/metrics" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// ── PageSkeleton ──────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
