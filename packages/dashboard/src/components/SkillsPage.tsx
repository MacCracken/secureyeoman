import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Store, Users, Download } from 'lucide-react';
import { fetchSecurityPolicy } from '../api/client';
import { type TabType, type ContentType } from './catalog/shared';
import { PersonalTab } from './catalog/PersonalTab';
import { MarketplaceTab } from './catalog/MarketplaceTab';
import { CommunityTab } from './catalog/CommunityTab';
import { InstalledTab } from './catalog/InstalledTab';

export function SkillsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });
  const communityEnabled = securityPolicy?.allowCommunityGitFetch ?? false;
  const workflowsEnabled = securityPolicy?.allowWorkflows ?? false;
  const subAgentsEnabled = securityPolicy?.allowSubAgents ?? false;

  const getInitialTab = (): TabType => {
    const path = location.pathname;
    if (path.includes('/community')) return 'community';
    if (path.includes('/marketplace')) return 'marketplace';
    if (path.includes('/installed')) return 'installed';
    const stateTab = (location.state as { initialTab?: TabType } | null)?.initialTab;
    if (stateTab) return stateTab;
    return 'my-skills';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [marketplaceContentType, setMarketplaceContentType] = useState<ContentType | undefined>();

  const handleNavigateTab = (tab: TabType, contentType?: ContentType) => {
    setActiveTab(tab);
    if (tab === 'marketplace' && contentType) {
      setMarketplaceContentType(contentType);
    } else {
      setMarketplaceContentType(undefined);
    }
  };

  // If community is disabled while on that tab, fall back to Personal
  useEffect(() => {
    if (!communityEnabled && activeTab === 'community') {
      setActiveTab('my-skills');
    }
  }, [communityEnabled, activeTab]);

  useEffect(() => {
    if ((location.state as { initialTab?: string } | null)?.initialTab) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse and install skills, workflows, and swarm templates
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => {
            setActiveTab('my-skills');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'my-skills'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4" />
          Personal
        </button>
        <button
          onClick={() => {
            setActiveTab('marketplace');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'marketplace'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Store className="w-4 h-4" />
          Marketplace
        </button>
        {communityEnabled && (
          <button
            onClick={() => {
              setActiveTab('community');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'community'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-4 h-4" />
            Community
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('installed');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'installed'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Download className="w-4 h-4" />
          Installed
        </button>
      </div>

      {activeTab === 'my-skills' && <PersonalTab />}
      {activeTab === 'marketplace' && (
        <MarketplaceTab
          workflowsEnabled={workflowsEnabled}
          subAgentsEnabled={subAgentsEnabled}
          initialContentType={marketplaceContentType}
        />
      )}
      {activeTab === 'community' && communityEnabled && (
        <CommunityTab workflowsEnabled={workflowsEnabled} subAgentsEnabled={subAgentsEnabled} />
      )}
      {activeTab === 'installed' && (
        <InstalledTab
          onNavigateTab={handleNavigateTab}
          workflowsEnabled={workflowsEnabled}
          subAgentsEnabled={subAgentsEnabled}
        />
      )}
    </div>
  );
}
