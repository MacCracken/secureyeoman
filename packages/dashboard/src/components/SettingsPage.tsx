import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Settings,
  Shield,
  Key,
  UserCircle,
  Users,
  Clock,
  Building2,
  Star,
  Power,
  ArrowRight,
  Users2,
  Zap,
  Bell,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSoulConfig,
  updateSoulConfig,
  fetchAuditStats,
  fetchMetrics,
  fetchPersonalities,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
} from '../api/client';
import type { Personality, SoulConfig } from '../types';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import { SecuritySettings, RolesSettings, SecretsPanel } from './SecuritySettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { UsersSettings } from './UsersSettings';
import { WorkspacesSettings } from './WorkspacesSettings';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';

type TabType = 'general' | 'security' | 'keys' | 'workspaces' | 'users' | 'roles' | 'notifications';

function getTabFromPath(path: string): TabType {
  if (path.includes('/security-settings')) return 'security';
  if (path.includes('/api-keys')) return 'keys';
  if (path === '/users') return 'users';
  if (path === '/workspaces') return 'workspaces';
  if (path === '/roles') return 'roles';
  return 'general';
}

export function SettingsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>(() => getTabFromPath(location.pathname));

  useEffect(() => {
    setActiveTab(getTabFromPath(location.pathname));
  }, [location.pathname]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System configuration and preferences</p>
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
          Secrets
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
            setActiveTab('notifications');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
        </button>
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'keys' && (
        <div className="space-y-8">
          <ApiKeysSettings />
          <SecretsPanel />
        </div>
      )}
      {activeTab === 'workspaces' && <WorkspacesSettings />}
      {activeTab === 'users' && <UsersSettings />}
      {activeTab === 'roles' && <RolesSettings />}
      {activeTab === 'notifications' && <NotificationPrefsPanel />}
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

  // Soul config form state
  const [formEnabled, setFormEnabled] = useState(soulConfig?.enabled ?? true);
  const [formLearningMode, setFormLearningMode] = useState<string[]>(
    soulConfig?.learningMode ?? ['user_authored']
  );
  const [formMaxSkills, setFormMaxSkills] = useState(soulConfig?.maxSkills ?? 100);
  const [formMaxPromptTokens, setFormMaxPromptTokens] = useState(
    soulConfig?.maxPromptTokens ?? 64000
  );

  useEffect(() => {
    if (soulConfig) {
      setFormEnabled(soulConfig.enabled);
      setFormLearningMode(soulConfig.learningMode);
      setFormMaxSkills(soulConfig.maxSkills);
      setFormMaxPromptTokens(soulConfig.maxPromptTokens);
    }
  }, [soulConfig]);

  const configMutation = useMutation({
    mutationFn: (patch: Partial<SoulConfig>) => updateSoulConfig(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['soulConfig'] }),
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

  const clearDefaultMut = useMutation({
    mutationFn: () => clearDefaultPersonality(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['personalities'] }),
  });

  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p) => p.isActive);
  const globalMaxPromptTokens = soulConfig?.maxPromptTokens ?? 16000;

  return (
    <div className="space-y-6">
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

      <NotificationSettings />

      {/* ── Soul System ───────────────────────────────────────── */}
      {soulConfig && (
        <div className="card p-4 space-y-4">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Soul System
          </h3>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Enabled</span>
              <p className="text-xs text-muted-foreground">
                Allow soul system to influence AI responses
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formEnabled}
              onClick={() => setFormEnabled(!formEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                formEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  formEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Learning mode */}
          <div>
            <span className="text-sm font-medium block mb-2">Learning Mode</span>
            <div className="space-y-1.5">
              {(['user_authored', 'ai_proposed', 'autonomous'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formLearningMode.includes(mode)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormLearningMode([...formLearningMode, mode]);
                      } else {
                        setFormLearningMode(formLearningMode.filter((m) => m !== mode));
                      }
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-sm">{LEARNING_MODE_LABELS[mode]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Numeric limits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Max Skills</label>
              <input
                type="number"
                min={1}
                max={200}
                value={formMaxSkills}
                onChange={(e) => setFormMaxSkills(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Global limit across all souls (1–200)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Default Prompt Budget</label>
              <input
                type="number"
                min={1024}
                max={100000}
                step={1024}
                value={formMaxPromptTokens}
                onChange={(e) => setFormMaxPromptTokens(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Overridable per soul (1,024–100,000 tokens)
              </p>
            </div>
          </div>

          {/* Error + Save */}
          {configMutation.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="mt-0.5 shrink-0">✕</span>
              <span>
                Failed to save:{' '}
                {configMutation.error instanceof Error
                  ? configMutation.error.message
                  : 'Unknown error'}
              </span>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                configMutation.mutate({
                  enabled: formEnabled,
                  learningMode: formLearningMode,
                  maxSkills: formMaxSkills,
                  maxPromptTokens: formMaxPromptTokens,
                })
              }
              disabled={configMutation.isPending}
              className="btn btn-ghost btn-sm"
            >
              {configMutation.isPending ? 'Saving…' : 'Save'}
            </button>
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

      <LogRetentionSettings />

    </div>
  );
}

interface SoulRowProps {
  personality: Personality;
  globalMaxPromptTokens: number;
}

function SoulRow({
  personality: p,
  globalMaxPromptTokens,
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
          {p.isActive && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
              Active
            </span>
          )}
          {alwaysOn && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              Always On
            </span>
          )}
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

    </div>
  );
}

