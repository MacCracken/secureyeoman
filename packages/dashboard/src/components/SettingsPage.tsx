import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, Shield, Key, Blocks, Users, Clock, Archive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchSoulConfig, fetchAuditStats, fetchMetrics } from '../api/client';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import { SecuritySettings, RolesSettings } from './SecuritySettings';
import { ApiKeysSettings } from './ApiKeysSettings';

type TabType = 'general' | 'security' | 'keys' | 'roles' | 'logs';

export function SettingsPage() {
  const location = useLocation();
  const getInitialTab = (): TabType => {
    const path = location.pathname;
    if (path.includes('/security-settings')) return 'security';
    if (path.includes('/api-keys')) return 'keys';
    return 'general';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">System configuration and preferences</p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => {
            setActiveTab('general');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="w-4 h-4" />
          General
        </button>
        <button
          onClick={() => {
            setActiveTab('security');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Shield className="w-4 h-4" />
          Security
        </button>
        <button
          onClick={() => {
            setActiveTab('keys');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'keys'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Key className="w-4 h-4" />
          Keys
        </button>
        <button
          onClick={() => {
            setActiveTab('roles');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4" />
          Roles
        </button>
        <button
          onClick={() => {
            setActiveTab('logs');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Archive className="w-4 h-4" />
          Logs
        </button>
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'keys' && <ApiKeysSettings />}
      {activeTab === 'roles' && <RolesSettings />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  );
}

function GeneralTab() {
  const navigate = useNavigate();

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  const { data: auditStats, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      <NotificationSettings />

      {soulConfig && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Soul System
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Status</span>
              <span className={soulConfig.enabled ? 'text-success' : 'text-destructive'}>
                {soulConfig.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Learning Mode</span>
              <span>{soulConfig.learningMode.join(', ')}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Max Skills</span>
              <span>{soulConfig.maxSkills}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Max Prompt Tokens</span>
              <span>{soulConfig.maxPromptTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Rate Limiting</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Rate Limit Hits</p>
              <p className="text-xl font-bold">{metrics?.security?.rateLimitHitsTotal ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Blocked Requests</p>
              <p className="text-xl font-bold">{metrics?.security?.blockedRequestsTotal ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Injection Attempts</p>
              <p className="text-xl font-bold text-destructive">
                {metrics?.security?.injectionAttemptsTotal ?? 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Permission Denials</p>
              <p className="text-xl font-bold">{metrics?.security?.permissionDenialsTotal ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Audit Chain</h3>
        </div>
        <div className="p-4">
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 animate-spin" /> Loading audit stats...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Chain Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {auditStats?.chainValid ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-success" />
                      <span className="font-medium text-success">Valid</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-destructive" />
                      <span className="font-medium text-destructive">Invalid</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-xl font-bold">{auditStats?.totalEntries ?? 0}</p>
              </div>
              {auditStats?.lastVerification && (
                <div>
                  <p className="text-sm text-muted-foreground">Last Verification</p>
                  <p className="text-sm">
                    {new Date(auditStats.lastVerification).toLocaleString()}
                  </p>
                </div>
              )}
              {auditStats?.dbSizeEstimateMb !== undefined && (
                <div>
                  <p className="text-sm text-muted-foreground">Database Size</p>
                  <p className="text-sm">{auditStats.dbSizeEstimateMb.toFixed(1)} MB</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsTab() {
  return (
    <div className="space-y-6">
      <LogRetentionSettings />
    </div>
  );
}
