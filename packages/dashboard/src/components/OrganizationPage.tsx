import { useState, useMemo, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Target, TrendingUp, Building2, UserCircle, BookOpen, Loader2 } from 'lucide-react';
import { fetchSecurityPolicy } from '../api/client';

const IntentEditor = lazy(() =>
  import('./IntentEditor').then((m) => ({ default: m.IntentEditor }))
);
const DepartmentalRiskTab = lazy(() =>
  import('./DepartmentalRiskTab').then((m) => ({ default: m.DepartmentalRiskTab }))
);
const WorkspacesSettings = lazy(() =>
  import('./WorkspacesSettings').then((m) => ({ default: m.WorkspacesSettings }))
);
const UsersSettings = lazy(() =>
  import('./UsersSettings').then((m) => ({ default: m.UsersSettings }))
);
const OrgKnowledgeBaseTab = lazy(() =>
  import('./knowledge/OrgKnowledgeBaseTab').then((m) => ({ default: m.OrgKnowledgeBaseTab }))
);

type TabType = 'intent' | 'risk' | 'knowledge' | 'workspaces' | 'users';

function TabSkeleton() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function OrganizationPage() {
  const location = useLocation();

  const { data: securityPolicy } = useQuery({
    queryKey: ['securityPolicy'],
    queryFn: fetchSecurityPolicy,
  });

  const intentAllowed = securityPolicy?.allowIntent ?? false;

  const TABS = useMemo(() => {
    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [];
    tabs.push({ id: 'knowledge', label: 'Knowledge Base', icon: <BookOpen className="w-4 h-4" /> });
    if (intentAllowed) {
      tabs.push({ id: 'intent', label: 'Intent', icon: <Target className="w-4 h-4" /> });
    }
    tabs.push({ id: 'risk', label: 'Risk', icon: <TrendingUp className="w-4 h-4" /> });
    tabs.push({ id: 'workspaces', label: 'Workspaces', icon: <Building2 className="w-4 h-4" /> });
    tabs.push({ id: 'users', label: 'Users', icon: <UserCircle className="w-4 h-4" /> });
    return tabs;
  }, [intentAllowed]);

  const getInitialTab = (): TabType => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'knowledge') return 'knowledge';
    if (tab === 'intent' && intentAllowed) return 'intent';
    if (tab === 'risk') return 'risk';
    if (tab === 'workspaces') return 'workspaces';
    if (tab === 'users') return 'users';
    // Default to first available tab
    return TABS[0]?.id ?? 'knowledge';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // If the active tab gets disabled, fall back
  const effectiveTab = TABS.some((t) => t.id === activeTab) ? activeTab : (TABS[0]?.id ?? 'risk');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage organizational intent, risk, knowledge, workspaces, and users
        </p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              effectiveTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {effectiveTab === 'intent' && <IntentEditor />}
        {effectiveTab === 'risk' && <DepartmentalRiskTab />}
        {effectiveTab === 'knowledge' && <OrgKnowledgeBaseTab />}
        {effectiveTab === 'workspaces' && <WorkspacesSettings />}
        {effectiveTab === 'users' && <UsersSettings />}
      </Suspense>
    </div>
  );
}
