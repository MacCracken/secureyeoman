import { useState, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Target, TrendingUp, Building2, UserCircle, Loader2 } from 'lucide-react';

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

type TabType = 'intent' | 'risk' | 'workspaces' | 'users';

function TabSkeleton() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function OrganizationPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'risk') return 'risk';
    if (tab === 'workspaces') return 'workspaces';
    if (tab === 'users') return 'users';
    return 'intent';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'intent', label: 'Intent', icon: <Target className="w-4 h-4" /> },
    { id: 'risk', label: 'Risk', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'workspaces', label: 'Workspaces', icon: <Building2 className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <UserCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage organizational intent, risk, workspaces, and users
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
              activeTab === tab.id
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
        {activeTab === 'intent' && <IntentEditor />}
        {activeTab === 'risk' && <DepartmentalRiskTab />}
        {activeTab === 'workspaces' && <WorkspacesSettings />}
        {activeTab === 'users' && <UsersSettings />}
      </Suspense>
    </div>
  );
}
