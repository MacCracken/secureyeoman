import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Menu } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSidebar } from '../hooks/useSidebar';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchMetrics, fetchHealth, fetchOnboardingStatus } from '../api/client';
import { Sidebar } from './Sidebar';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Logo } from './Logo';
import { ErrorBoundary } from './common/ErrorBoundary';
import { OnboardingWizard } from './OnboardingWizard';
import type { HealthStatus } from '../types';

// Lazy-loaded route components — each becomes its own JS chunk
const MetricsPage = lazy(() =>
  import('./MetricsPage').then((m) => ({ default: m.MetricsPage }))
);
const PersonalityEditor = lazy(() =>
  import('./PersonalityEditor').then((m) => ({ default: m.PersonalityEditor }))
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
const IntentPage = lazy(() =>
  import('./IntentEditor').then((m) => ({ default: m.IntentEditor }))
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
        onRefresh={() => refetchMetrics()}
        onLogout={() => void logout()}
      />

      {/* Main content column */}
      <div
        className="flex flex-col flex-1 min-h-screen transition-[margin-left] duration-200"
        style={{
          marginLeft: `var(--sidebar-collapsed)`,
        }}
      >
        {/* Use CSS media query via class for responsive margin */}
        <style>{`
          @media (min-width: 768px) {
            .sidebar-content-area {
              margin-left: ${collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-expanded)'} !important;
            }
          }
          @media (max-width: 767px) {
            .sidebar-content-area {
              margin-left: 0 !important;
            }
          }
        `}</style>

        <div
          className="sidebar-content-area flex flex-col flex-1 min-h-0 transition-[margin-left] duration-200"
          style={{ marginLeft: 0 }}
        >
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

          {/* Main Content */}
          <main className="px-2 sm:px-3 py-3 sm:py-4 flex-1">
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/metrics" replace />} />
                  <Route
                    path="/metrics"
                    element={<MetricsPage metrics={metrics} health={health} />}
                  />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/editor" element={<EditorPage />} />
                  <Route path="/code" element={<Navigate to="/editor" replace />} />
                  <Route path="/security" element={<SecurityPage />} />
                  <Route path="/automation" element={<AutomationPage />} />
                  <Route path="/tasks" element={<Navigate to="/automation" replace />} />
                  <Route path="/workflows" element={<Navigate to="/automation?tab=workflows" replace />} />
                  <Route path="/workflows/:id/builder" element={<WorkflowBuilder />} />
                  <Route path="/workflows/runs/:runId" element={<WorkflowRunDetail />} />
                  <Route path="/reports" element={<SecurityPage />} />
                  <Route path="/personality" element={<PersonalityEditor />} />
                  <Route path="/skills" element={<SkillsPage />} />
                  <Route path="/marketplace" element={<SkillsPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/group-chat" element={<Navigate to="/chat" replace />} />
                  <Route
                    path="/routing-rules"
                    element={<Navigate to="/connections?tab=routing" replace />}
                  />
                  <Route path="/connections" element={<ConnectionsPage />} />
                  <Route path="/mcp" element={<ConnectionsPage />} />
                  <Route path="/developers" element={<DeveloperPage />} />
                  <Route path="/extensions" element={<Navigate to="/developers" replace />} />
                  <Route path="/experiments" element={<Navigate to="/developers" replace />} />
                  <Route path="/execution" element={<Navigate to="/editor" replace />} />
                  <Route path="/a2a" element={<Navigate to="/agents" replace />} />
                  <Route path="/proactive" element={<ProactivePage />} />
                  <Route path="/multimodal" element={<Navigate to="/agents" replace />} />
                  <Route path="/costs" element={<Navigate to="/metrics" replace />} />
                  <Route path="/intent" element={<IntentPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/security-settings" element={<SettingsPage />} />
                  <Route path="/api-keys" element={<SettingsPage />} />
                  <Route path="/users" element={<SettingsPage />} />
                  <Route path="/workspaces" element={<SettingsPage />} />
                  <Route path="/roles" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/metrics" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
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

