/**
 * MetricsPage
 *
 * Unified metrics dashboard with four views:
 *   - Mission Control: key KPIs, system health, sparklines, and system topology graph
 *   - Costs: cost analytics, provider breakdown, and usage history
 *   - Full Metrics: deep-dive charts covering tasks, resources, and security
 *   - Analytics: advanced analytics tab (lazy-loaded)
 */

import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Sliders } from 'lucide-react';
import {
  fetchHeartbeatStatus,
  fetchMcpServers,
  fetchActiveDelegations,
  fetchPersonalities,
  fetchMcpConfig,
} from '../api/client';
import type { McpServerConfig, Personality, MetricsSnapshot, HealthStatus } from '../types';

import { MissionControlTab, CostsTab, FullMetricsTab } from './metrics';
import type { HistoryPoint, Tab } from './metrics';
import { MAX_HISTORY } from './metrics';

const AnalyticsTab = lazy(() => import('./analytics/AnalyticsTab.js'));

// ── MetricsPage ───────────────────────────────────────────────────────

interface MetricsPageProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
}

export function MetricsPage({ metrics, health }: MetricsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (['control', 'costs', 'full', 'analytics'] as Tab[]).includes(
    searchParams.get('tab') as Tab
  )
    ? (searchParams.get('tab') as Tab)
    : 'control';
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab);
  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    if (tab === 'control') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };
  const [editMode, setEditMode] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const navigate = useNavigate();

  const { data: heartbeatStatus } = useQuery({
    queryKey: ['heartbeatStatus'],
    queryFn: fetchHeartbeatStatus,
    refetchInterval: 10_000,
    // Always refetch on mount so navigating away and back immediately reflects
    // personality enable/disable changes (global staleTime: 30s would otherwise
    // serve cached data for up to 30 seconds after a config change).
    staleTime: 0,
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

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const { data: mcpConfig } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
    refetchInterval: 60_000,
  });

  // Accumulate CPU + memory for time-series charts
  const historyRef = useRef<HistoryPoint[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (metrics?.resources == null) return;
    const point: HistoryPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: metrics.resources.cpuPercent,
      memory: metrics.resources.memoryUsedMb,
    };
    historyRef.current = [...historyRef.current, point].slice(-MAX_HISTORY);
    setHistory([...historyRef.current]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics?.resources?.cpuPercent, metrics?.resources?.memoryUsedMb]);

  const heartbeatTasks = heartbeatStatus?.tasks ?? [];
  const mcpServers: McpServerConfig[] = mcpData?.servers ?? [];
  const enabledMcp = mcpServers.filter((s) => s.enabled).length;
  // Use server-computed totals (personality-aware) when available, fall back to base counts
  const totalHbTasks = heartbeatStatus?.totalTasks ?? heartbeatTasks.length;
  const enabledHb =
    heartbeatStatus?.enabledTasks ??
    heartbeatTasks.filter((t: { enabled: boolean }) => t.enabled).length;
  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p: Personality) => p.isActive);
  const defaultPersonality = personalities.find((p: Personality) => p.isDefault);

  const handleViewCosts = useCallback(() => {
    setActiveTab('costs');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TAB_LABELS: Record<Tab, string> = {
    control: 'Mission Control',
    costs: 'Costs',
    full: 'Full Metrics',
    analytics: 'Analytics',
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="metrics-page">
      {/* Page header with tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Command center — live status, tasks, costs, and security health
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'control' && (
            <button
              onClick={() => {
                setEditMode((e) => !e);
                setCatalogueOpen((e) => !e);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                editMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              {editMode ? 'Editing…' : 'Customize'}
            </button>
          )}
          <div
            className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1"
            role="tablist"
            aria-label="Mission Control views"
          >
            {(['control', 'costs', 'full', 'analytics'] as Tab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'control' && (
        <MissionControlTab
          metrics={metrics}
          health={health}
          history={history}
          heartbeatStatus={heartbeatStatus}
          mcpServers={mcpServers}
          enabledMcp={enabledMcp}
          enabledHb={enabledHb}
          totalHbTasks={totalHbTasks}
          activeDelegations={activeDelegations}
          personalities={personalities}
          activePersonalities={activePersonalities}
          defaultPersonality={defaultPersonality}
          navigate={navigate}
          onViewCosts={handleViewCosts}
          editMode={editMode}
          setEditMode={setEditMode}
          catalogueOpen={catalogueOpen}
          setCatalogueOpen={setCatalogueOpen}
          bullshiftEnabled={mcpConfig?.exposeBullshiftTools ?? false}
        />
      )}
      {activeTab === 'costs' && <CostsTab />}
      {activeTab === 'full' && (
        <FullMetricsTab
          metrics={metrics}
          history={history}
          navigate={navigate}
          onViewCosts={handleViewCosts}
        />
      )}
      {activeTab === 'analytics' && (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <AnalyticsTab />
        </Suspense>
      )}
    </div>
  );
}
