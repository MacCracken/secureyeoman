import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  FileText,
  Layers,
  Lock,
  Brain,
  TrendingUp,
  Server,
  Crosshair,
  Loader2,
  Camera,
} from 'lucide-react';
import {
  fetchSecurityEvents,
  fetchAuditEntries,
  verifyAuditChain,
  fetchSecurityPolicy,
} from '../api/client';
import { RiskAssessmentTab } from './RiskAssessmentTab';
import { ScopeManifestTab } from './ScopeManifestTab';
import type { SecurityEvent } from '../types';

// ─── Lazy tab imports ────────────────────────────────────────────────────────

const SecurityOverviewTab = lazy(() =>
  import('./security/SecurityOverviewTab').then((m) => ({ default: m.SecurityOverviewTab }))
);
const AutomationsSecurityTab = lazy(() =>
  import('./security/SecurityAutomationsTab').then((m) => ({ default: m.AutomationsSecurityTab }))
);
const AutonomyTab = lazy(() =>
  import('./security/SecurityAutonomyTab').then((m) => ({ default: m.AutonomyTab }))
);
const MLSecurityTab = lazy(() =>
  import('./security/SecurityMLTab').then((m) => ({ default: m.MLSecurityTab }))
);
const ReportsTab = lazy(() =>
  import('./security/SecurityReportsTab').then((m) => ({ default: m.ReportsTab }))
);
const NodeDetailsTab = lazy(() =>
  import('./security/SecurityNodesTab').then((m) => ({ default: m.NodeDetailsTab }))
);
const CaptureTab = lazy(() => import('./capture/CaptureTab'));

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType =
  | 'overview'
  | 'nodes'
  | 'automations'
  | 'autonomy'
  | 'ml'
  | 'reports-logs'
  | 'risk'
  | 'scope'
  | 'capture';

// ─── Shared localStorage helpers ─────────────────────────────────────────────

const ACK_STORAGE_KEY = 'friday_acknowledged_events';
const AUDIT_REVIEWED_KEY = 'friday_reviewed_audit';

function loadAcknowledged(): Set<string> {
  try {
    const stored = localStorage.getItem(ACK_STORAGE_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveAcknowledged(ids: Set<string>): void {
  localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function loadReviewedAudit(): Set<string> {
  try {
    const stored = localStorage.getItem(AUDIT_REVIEWED_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function saveReviewedAudit(ids: Set<string>): void {
  localStorage.setItem(AUDIT_REVIEWED_KEY, JSON.stringify(Array.from(ids)));
}

// ─── Tab skeleton ─────────────────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── SecurityPage ─────────────────────────────────────────────────────────────

export function SecurityPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (
      tabParam === 'audit' ||
      tabParam === 'reports' ||
      tabParam === 'reports-logs' ||
      path.includes('/reports')
    )
      return 'reports-logs';
    if (tabParam === 'automations') return 'automations';
    if (tabParam === 'ml') return 'ml';
    if (tabParam === 'nodes') return 'nodes';
    if (tabParam === 'autonomy') return 'autonomy';
    if (tabParam === 'risk') return 'risk';
    if (tabParam === 'scope') return 'scope';
    if (tabParam === 'capture') return 'capture';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    entriesChecked: number;
    error?: string;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(loadAcknowledged);
  const [auditReviewed, setAuditReviewed] = useState<Set<string>>(loadReviewedAudit);

  const markAuditReviewed = useCallback((ids: string[]) => {
    setAuditReviewed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveReviewedAudit(next);
      return next;
    });
  }, []);

  const markAllAuditReviewed = useCallback(async () => {
    try {
      const result = await fetchAuditEntries({ limit: 10000, offset: 0 });
      const allIds = result.entries.map((e) => e.id);
      markAuditReviewed(allIds);
    } catch {
      // fallback: no-op
    }
  }, [markAuditReviewed]);

  const { data: policy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    refetchInterval: 60_000,
  });

  const mlEnabled = policy?.allowAnomalyDetection ?? false;

  // Redirect away from the ML tab if the policy disables anomaly detection
  useEffect(() => {
    if (policy !== undefined && !policy.allowAnomalyDetection && activeTab === 'ml') {
      setActiveTab('overview');
    }
  }, [policy, activeTab]);

  const { data: eventsData } = useQuery({
    queryKey: ['security-events'],
    queryFn: () => fetchSecurityEvents({ limit: 20 }),
    refetchInterval: 10000,
  });

  const events = eventsData?.events ?? [];

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerificationResult(result);
      // Verification is an audit of the entire chain — mark all entries reviewed
      await markAllAuditReviewed();
    } finally {
      setVerifying(false);
    }
  };

  const acknowledgeEvent = useCallback((eventId: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(eventId);
      saveAcknowledged(next);
      return next;
    });
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      events.forEach((e: SecurityEvent) => next.add(e.id));
      saveAcknowledged(next);
      return next;
    });
  }, [events]);

  const visibleEvents = events.filter((e: SecurityEvent) => !acknowledged.has(e.id));
  const criticalCount = events.filter((e: SecurityEvent) => e.severity === 'critical').length;
  const warningCount = events.filter((e: SecurityEvent) => e.severity === 'warn').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Security</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Monitor security events, audit logs, and system health
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('overview');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => {
            setActiveTab('nodes');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'nodes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Server className="w-4 h-4" />
          System
        </button>
        <button
          onClick={() => {
            setActiveTab('automations');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'automations'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-4 h-4" />
          Automations
        </button>
        <button
          onClick={() => {
            setActiveTab('autonomy');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'autonomy'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lock className="w-4 h-4" />
          Autonomy
        </button>
        {mlEnabled && (
          <button
            onClick={() => {
              setActiveTab('ml');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'ml'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-ml"
          >
            <Brain className="w-4 h-4" />
            ML
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('reports-logs');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'reports-logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Reports &amp; Logs
        </button>
        <button
          onClick={() => {
            setActiveTab('risk');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'risk'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Risk
        </button>
        <button
          onClick={() => {
            setActiveTab('scope');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'scope'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          Scope
        </button>
        <button
          onClick={() => {
            setActiveTab('capture');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'capture'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Camera className="w-4 h-4" />
          Capture
        </button>
      </div>

      {activeTab === 'overview' && (
        <Suspense fallback={<TabSkeleton />}>
          <SecurityOverviewTab
            events={visibleEvents}
            criticalCount={criticalCount}
            warningCount={warningCount}
            verifying={verifying}
            verificationResult={verificationResult}
            onVerify={handleVerifyChain}
            onAcknowledge={acknowledgeEvent}
            onAcknowledgeAll={acknowledgeAll}
            onViewAuditLog={() => {
              setActiveTab('reports-logs');
            }}
          />
        </Suspense>
      )}

      {activeTab === 'nodes' && (
        <Suspense fallback={<TabSkeleton />}>
          <NodeDetailsTab />
        </Suspense>
      )}

      {activeTab === 'automations' && (
        <Suspense fallback={<TabSkeleton />}>
          <AutomationsSecurityTab allowWorkflows={policy?.allowWorkflows ?? false} />
        </Suspense>
      )}

      {activeTab === 'autonomy' && (
        <Suspense fallback={<TabSkeleton />}>
          <AutonomyTab />
        </Suspense>
      )}

      {activeTab === 'ml' && (
        <Suspense fallback={<TabSkeleton />}>
          <MLSecurityTab />
        </Suspense>
      )}

      {activeTab === 'reports-logs' && (
        <Suspense fallback={<TabSkeleton />}>
          <ReportsTab
            reviewed={auditReviewed}
            onMarkReviewed={markAuditReviewed}
            onMarkAllReviewed={markAllAuditReviewed}
          />
        </Suspense>
      )}

      {activeTab === 'risk' && <RiskAssessmentTab />}

      {activeTab === 'scope' && <ScopeManifestTab />}

      {activeTab === 'capture' && (
        <Suspense fallback={<TabSkeleton />}>
          <CaptureTab />
        </Suspense>
      )}
    </div>
  );
}
