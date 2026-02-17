import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  HardDrive,
  Loader2,
  Menu,
  Heart,
  Database,
  Server,
  Link,
  Bot,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useSidebar } from '../hooks/useSidebar';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  fetchMetrics,
  fetchHealth,
  fetchOnboardingStatus,
  fetchHeartbeatStatus,
  fetchMcpServers,
  fetchActiveDelegations,
} from '../api/client';
import { Sidebar } from './Sidebar';
import { SearchBar } from './SearchBar';
import { NotificationBell } from './NotificationBell';
import { Logo } from './Logo';
import { ErrorBoundary } from './common/ErrorBoundary';
import { OnboardingWizard } from './OnboardingWizard';
import type { MetricsSnapshot, HealthStatus } from '../types';

// Lazy-loaded route components — splits ReactFlow (~200KB) + Recharts (~100KB)
// into separate chunks that only load when their routes are visited.
const MetricsGraph = lazy(() =>
  import('./MetricsGraph').then((m) => ({ default: m.MetricsGraph }))
);
const ResourceMonitor = lazy(() =>
  import('./ResourceMonitor').then((m) => ({ default: m.ResourceMonitor }))
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
const ExtensionsPage = lazy(() =>
  import('./ExtensionsPage').then((m) => ({ default: m.ExtensionsPage }))
);
const ProactivePage = lazy(() =>
  import('./ProactivePage').then((m) => ({ default: m.ProactivePage }))
);
const ExperimentsPage = lazy(() =>
  import('./ExperimentsPage').then((m) => ({ default: m.ExperimentsPage }))
);

export function DashboardLayout() {
  const { logout } = useAuth();
  const { collapsed, setMobileOpen } = useSidebar();

  // Local network check
  const [isLocalNetwork, setIsLocalNetwork] = useState(true);
  useEffect(() => {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.endsWith('.local');
    setIsLocalNetwork(isLocal);
  }, []);

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

  if (!isLocalNetwork) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="card max-w-md p-8 text-center">
          <Lock className="w-16 h-16 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            The SecureYeoman Dashboard is only accessible from the local network.
          </p>
        </div>
      </div>
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
                  <Route path="/" element={<OverviewPage metrics={metrics} health={health} />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/editor" element={<EditorPage />} />
                  <Route path="/code" element={<Navigate to="/editor" replace />} />
                  <Route path="/security" element={<SecurityPage />} />
                  <Route path="/tasks" element={<SecurityPage />} />
                  <Route path="/reports" element={<SecurityPage />} />
                  <Route path="/personality" element={<PersonalityEditor />} />
                  <Route path="/skills" element={<SkillsPage />} />
                  <Route path="/marketplace" element={<SkillsPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/connections" element={<ConnectionsPage />} />
                  <Route path="/mcp" element={<ConnectionsPage />} />
                  <Route path="/extensions" element={<ExtensionsPage />} />
                  <Route path="/execution" element={<Navigate to="/editor" replace />} />
                  <Route path="/a2a" element={<Navigate to="/agents" replace />} />
                  <Route path="/proactive" element={<ProactivePage />} />
                  <Route path="/experiments" element={<ExperimentsPage />} />
                  <Route path="/multimodal" element={<Navigate to="/agents" replace />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/security-settings" element={<SettingsPage />} />
                  <Route path="/api-keys" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Overview Page ─────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function OverviewPage({ metrics, health }: { metrics?: MetricsSnapshot; health?: HealthStatus }) {
  const navigate = useNavigate();

  const { data: heartbeatStatus } = useQuery({
    queryKey: ['heartbeatStatus'],
    queryFn: fetchHeartbeatStatus,
    refetchInterval: 10_000,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 30_000,
  });

  const { data: activeDelegations } = useQuery({
    queryKey: ['activeDelegations'],
    queryFn: fetchActiveDelegations,
    refetchInterval: 10_000,
  });

  const heartbeatTasks = heartbeatStatus?.tasks ?? [];
  const mcpServers = mcpData?.servers ?? [];
  const enabledMcpServers = mcpServers.filter((s) => s.enabled).length;
  const enabledHeartbeats = heartbeatTasks.filter((t) => t.enabled).length;
  const heartbeatRunning = heartbeatStatus?.running ?? false;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <StatCard
          title="Active Agents"
          value={activeDelegations?.delegations?.length ?? 0}
          icon={<Bot className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={
            activeDelegations?.delegations?.length
              ? `Depth: ${Math.max(...(activeDelegations.delegations.map((d) => d.depth) || [0]))}`
              : undefined
          }
          onClick={() => navigate('/agents')}
        />
        <StatCard
          title="Heartbeat"
          value={heartbeatStatus?.beatCount ?? 0}
          icon={<Heart className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={`${enabledHeartbeats}/${heartbeatTasks.length} tasks`}
          trend={heartbeatRunning ? 'Running' : 'Stopped'}
          trendUp={heartbeatRunning}
          onClick={() => navigate('/security?tab=tasks&heartbeat=1')}
        />
        <StatCard
          title="Active Tasks"
          value={metrics?.tasks?.inProgress ?? 0}
          icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={`${metrics?.tasks?.queueDepth ?? 0} queued`}
        />
        <StatCard
          title="Tasks Today"
          value={metrics?.tasks?.total ?? 0}
          icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
          trend={
            metrics?.tasks?.successRate
              ? `${(metrics.tasks.successRate * 100).toFixed(1)}% success`
              : undefined
          }
          trendUp={metrics?.tasks?.successRate ? metrics.tasks.successRate > 0.9 : undefined}
        />
        <StatCard
          title="Memory Usage"
          value={`${(metrics?.resources?.memoryUsedMb ?? 0).toFixed(1)} MB`}
          icon={<HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />}
        />
        <StatCard
          title="Audit Entries"
          value={metrics?.security?.auditEntriesTotal ?? 0}
          icon={<Shield className="w-4 h-4 sm:w-5 sm:h-5" />}
          trend={metrics?.security?.auditChainValid ? 'Chain Valid' : 'Chain Invalid'}
          trendUp={metrics?.security?.auditChainValid}
          onClick={() => navigate('/security?tab=audit')}
        />
      </div>

      {/* System Overview */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title text-base sm:text-lg">System Overview</h2>
          <p className="card-description text-xs sm:text-sm">
            Infrastructure status and real-time visualization
          </p>
        </div>
        <div className="card-content space-y-3 sm:space-y-4">
          {/* Services Status */}
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <ServiceStatus
              label="Core"
              ok={health?.status === 'ok'}
              detail={health?.status ?? 'unknown'}
              icon={<Server className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            />
            <ServiceStatus
              label="Database"
              ok={health?.checks?.database ?? false}
              detail={health?.checks?.database ? 'Connected' : 'Down'}
              icon={<Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            />
            <ServiceStatus
              label="Audit"
              ok={health?.checks?.auditChain ?? false}
              detail={health?.checks?.auditChain ? 'Valid' : 'Invalid'}
              icon={<Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            />
            <ServiceStatus
              label="MCP"
              ok={enabledMcpServers > 0}
              detail={`${enabledMcpServers}/${mcpServers.length}`}
              icon={<Link className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              onClick={() => navigate('/mcp')}
            />
            <ServiceStatus
              label="Uptime"
              ok={true}
              detail={health?.uptime ? formatUptime(health.uptime) : '-'}
              icon={<Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            />
            <ServiceStatus
              label="Version"
              ok={true}
              detail={health?.version ?? '-'}
              icon={<Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            />
          </div>

          {/* Metrics Graph */}
          <ErrorBoundary fallbackTitle="Graph failed to render">
            <MetricsGraph
              metrics={metrics}
              health={health}
              mcpServers={mcpServers}
              onNodeClick={(nodeId) => {
                const routes: Record<string, string> = {
                  security: '/security?tab=overview',
                  audit: '/security?tab=audit',
                  tasks: '/security?tab=tasks',
                  mcp: '/mcp',
                };
                navigate(routes[nodeId] ?? `/security?tab=nodes&node=${nodeId}`);
              }}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Resource Monitor */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title text-base sm:text-lg">Resource Usage</h2>
        </div>
        <div className="card-content">
          <ResourceMonitor metrics={metrics} />
        </div>
      </div>
    </div>
  );
}

// ── ServiceStatus ─────────────────────────────────────────────────────

function ServiceStatus({
  label,
  ok,
  detail,
  icon,
  onClick,
}: {
  label: string;
  ok: boolean;
  detail: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`border rounded-lg p-2 sm:p-3 text-center${onClick ? ' cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
        <span className={ok ? 'text-green-500' : 'text-destructive'}>{icon}</span>
      </div>
      <p className="text-[10px] sm:text-xs font-medium truncate">{label}</p>
      <p
        className={`text-[10px] sm:text-xs mt-0.5 truncate ${ok ? 'text-green-500' : 'text-destructive'}`}
      >
        {detail}
      </p>
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

// ── StatCard ──────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
  onClick?: () => void;
}

function StatCard({ title, value, icon, trend, trendUp, subtitle, onClick }: StatCardProps) {
  return (
    <div
      className={`card p-3 sm:p-4${onClick ? ' cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold mt-0.5 sm:mt-1 truncate">
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 flex items-center gap-1 ${
                trendUp === true
                  ? 'text-success'
                  : trendUp === false
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {trendUp === true && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
              {trendUp === false && <XCircle className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate">{trend}</span>
            </p>
          )}
        </div>
        <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg text-primary flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}
