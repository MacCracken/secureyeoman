import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Settings,
  Shield,
  Key,
  UserCircle,
  Users,
  Clock,
  Archive,
  Building2,
  Star,
  Power,
  ArrowRight,
  Users2,
  Zap,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSoulConfig,
  fetchAuditStats,
  fetchMetrics,
  fetchPersonalities,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
} from '../api/client';
import type { Personality } from '../types';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import { SecuritySettings, RolesSettings } from './SecuritySettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { UsersSettings } from './UsersSettings';
import { WorkspacesSettings } from './WorkspacesSettings';

type TabType = 'general' | 'security' | 'keys' | 'workspaces' | 'users' | 'roles' | 'logs';

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
            setActiveTab('workspaces');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'workspaces'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Workspaces
        </button>
        <button
          onClick={() => {
            setActiveTab('users');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCircle className="w-4 h-4" />
          Users
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
      {activeTab === 'workspaces' && <WorkspacesSettings />}
      {activeTab === 'users' && <UsersSettings />}
      {activeTab === 'roles' && <RolesSettings />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  );
}

const LEARNING_MODE_LABELS: Record<string, string> = {
  user_authored: 'User Authored',
  ai_proposed: 'AI Proposed',
  autonomous: 'Autonomous',
};

function GeneralTab() {
  const queryClient = useQueryClient();

  const { data: soulConfig } = useQuery({
    queryKey: ['soulConfig'],
    queryFn: fetchSoulConfig,
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
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

  const enableMut = useMutation({
    mutationFn: (id: string) => enablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => disablePersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => setDefaultPersonality(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p) => p.isActive);
  const globalMaxPromptTokens = soulConfig?.maxPromptTokens ?? 16000;

  return (
    <div className="space-y-6">
      <NotificationSettings />

      {/* ── Soul System ───────────────────────────────────────── */}
      {soulConfig && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Soul System
            </h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                soulConfig.enabled
                  ? 'bg-success/15 text-success'
                  : 'bg-destructive/15 text-destructive'
              }`}
            >
              {soulConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Learning Mode</span>
              <div className="flex flex-wrap gap-1">
                {soulConfig.learningMode.map((mode) => (
                  <span
                    key={mode}
                    className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                  >
                    {LEARNING_MODE_LABELS[mode] ?? mode}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Max Skills</span>
              <span className="font-medium">{soulConfig.maxSkills}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">global limit across all souls</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Default Prompt Budget</span>
              <span className="font-medium">{soulConfig.maxPromptTokens.toLocaleString()} tokens</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">overridable per soul</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Souls ──────────────────────────────────────── */}
      {personalitiesData && (
        <div className="card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Users2 className="w-4 h-4" />
              Active Souls
              <span className="text-xs text-muted-foreground font-normal">
                {activePersonalities.length} / {personalities.length} enabled
              </span>
            </h3>
            <Link
              to="/personality"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Manage Souls
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {personalities.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No souls configured.{' '}
                <Link to="/personality" className="text-primary hover:underline">
                  Create one
                </Link>
              </div>
            )}
            {personalities.map((p) => (
              <SoulRow
                key={p.id}
                personality={p}
                globalMaxPromptTokens={globalMaxPromptTokens}
                onEnable={() => enableMut.mutate(p.id)}
                onDisable={() => disableMut.mutate(p.id)}
                onSetDefault={() => setDefaultMut.mutate(p.id)}
                isMutating={
                  enableMut.isPending || disableMut.isPending || setDefaultMut.isPending
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Rate Limiting ─────────────────────────────────────── */}
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

      {/* ── Audit Chain ───────────────────────────────────────── */}
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

interface SoulRowProps {
  personality: Personality;
  globalMaxPromptTokens: number;
  onEnable: () => void;
  onDisable: () => void;
  onSetDefault: () => void;
  isMutating: boolean;
}

function SoulRow({
  personality: p,
  globalMaxPromptTokens,
  onEnable,
  onDisable,
  onSetDefault,
  isMutating,
}: SoulRowProps) {
  const activeHoursEnabled = p.body?.activeHours?.enabled;
  const alwaysOn = p.isActive && !activeHoursEnabled;
  const offHours = p.isActive && activeHoursEnabled && p.isWithinActiveHours === false;
  const promptBudget = p.body?.maxPromptTokens;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${p.isActive ? 'bg-success' : 'bg-muted-foreground/30'}`}
        title={p.isActive ? 'Active' : 'Inactive'}
      />

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{p.name}</span>
          {p.isDefault && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />
              Default
            </span>
          )}
          {p.isArchetype && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              Preset
            </span>
          )}
          {alwaysOn && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              Always On
            </span>
          )}
          {offHours && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Off-hours
            </span>
          )}
          {promptBudget !== undefined && promptBudget !== globalMaxPromptTokens && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {promptBudget.toLocaleString()} tkns
            </span>
          )}
        </div>
        {p.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Set default — only for active non-default personalities */}
        {!p.isDefault && p.isActive && (
          <button
            className="btn btn-ghost btn-xs p-1 text-muted-foreground hover:text-primary"
            onClick={onSetDefault}
            disabled={isMutating}
            title="Set as default"
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Enable / Disable toggle — default can't be disabled */}
        {!p.isDefault && (
          <button
            className={`btn btn-ghost btn-xs p-1 ${p.isActive ? 'text-success hover:text-destructive' : 'text-muted-foreground hover:text-success'}`}
            onClick={p.isActive ? onDisable : onEnable}
            disabled={isMutating}
            title={p.isActive ? 'Disable soul' : 'Enable soul'}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
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
