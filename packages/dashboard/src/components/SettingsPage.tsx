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
  Wrench,
  AlertTriangle,
  Palette,
  Check,
  Database,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  BadgeCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSoulConfig,
  updateSoulConfig,
  fetchAuditStats,
  repairAuditChain,
  fetchMetrics,
  fetchPersonalities,
  enablePersonality,
  disablePersonality,
  setDefaultPersonality,
  clearDefaultPersonality,
  fetchBackups,
  createBackup,
  downloadBackup,
  deleteBackup,
  fetchLicenseStatus,
  setLicenseKey,
  type LicenseStatus,
} from '../api/client';
import type { Personality, SoulConfig, BackupRecord } from '../types';
import { NotificationSettings } from './NotificationSettings';
import { LogRetentionSettings } from './LogRetentionSettings';
import { SecuritySettings, RolesSettings, SecretsPanel } from './SecuritySettings';
import { ApiKeysSettings } from './ApiKeysSettings';
import { ProviderKeysSettings } from './ProviderKeysSettings';
import { UsersSettings } from './UsersSettings';
import { WorkspacesSettings } from './WorkspacesSettings';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';
import { useTheme, THEMES, type ThemeId } from '../hooks/useTheme';

type TabType =
  | 'general'
  | 'appearance'
  | 'security'
  | 'keys'
  | 'workspaces'
  | 'users'
  | 'roles'
  | 'notifications'
  | 'backup';

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
            setActiveTab('appearance');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'appearance'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="w-4 h-4" />
          Appearance
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
        <button
          onClick={() => {
            setActiveTab('backup');
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'backup'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database className="w-4 h-4" />
          Backup
        </button>
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'appearance' && <AppearanceTab />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'keys' && (
        <div className="space-y-8">
          <ProviderKeysSettings />
          <ApiKeysSettings />
          <SecretsPanel />
        </div>
      )}
      {activeTab === 'workspaces' && <WorkspacesSettings />}
      {activeTab === 'users' && <UsersSettings />}
      {activeTab === 'roles' && <RolesSettings />}
      {activeTab === 'notifications' && <NotificationPrefsPanel />}
      {activeTab === 'backup' && <BackupTab />}
    </div>
  );
}

// ── Appearance Tab ────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const darkThemes = THEMES.filter((t) => t.isDark && !t.enterprise);
  const darkEnterprise = THEMES.filter((t) => t.isDark && t.enterprise);
  const lightThemes = THEMES.filter((t) => !t.isDark && t.id !== 'system' && !t.enterprise);
  const lightEnterprise = THEMES.filter((t) => !t.isDark && t.enterprise);
  const systemTheme = THEMES.filter((t) => t.id === 'system');

  const ThemeCard = ({ t }: { t: (typeof THEMES)[0] }) => (
    <button
      key={t.id}
      onClick={() => {
        setTheme(t.id);
      }}
      className={`relative flex flex-col rounded-lg border-2 overflow-hidden transition-all duration-150 ${
        theme === t.id
          ? 'border-primary shadow-md shadow-primary/20'
          : 'border-border hover:border-muted-foreground/50'
      }`}
    >
      {/* Swatch strip */}
      <div className="h-12 flex">
        {t.preview.map((color, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      {/* Label */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card text-left">
        <span className="text-xs font-medium truncate flex-1">{t.name}</span>
        {theme === t.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
      </div>
    </button>
  );

  const Section = ({ label, themes }: { label: string; themes: typeof THEMES }) => (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {themes.map((t) => (
          <ThemeCard key={t.id} t={t} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Choose a theme for the dashboard</p>
      </div>
      <Section label="System" themes={systemTheme} />
      <Section label="Dark" themes={darkThemes} />
      <Section label="Light" themes={lightThemes} />
      <Section label="Enterprise" themes={[...darkEnterprise, ...lightEnterprise]} />
    </div>
  );
}

// ── Backup Tab ────────────────────────────────────────────────────

const STATUS_BADGE: Record<BackupRecord['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-500',
  completed: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
};

function formatBytes(n: number | null): string {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTs(ts: number | null): string {
  if (ts === null) return '—';
  return new Date(ts).toLocaleString();
}

function BackupTab() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => fetchBackups({ limit: 50 }),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => createBackup(label),
    onSuccess: () => {
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBackup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const handleDownload = async (backup: BackupRecord) => {
    try {
      const blob = await downloadBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${backup.id}.pgdump`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // download error — silently ignore (user sees no file)
    }
  };

  const backups = data?.backups ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Backup &amp; Disaster Recovery</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create and manage database backups using pg_dump
        </p>
      </div>

      {/* Create backup */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">New Backup</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => {
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            className="flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? 'Creating…' : 'Create Backup'}
          </button>
        </div>
        {createMutation.isError && (
          <p className="text-sm text-destructive">Failed to create backup</p>
        )}
      </div>

      {/* Backup list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Backups</h3>
          <button
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['backups'] })}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            No backups yet. Create one above.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center gap-3 px-4 py-3">
                <Database className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {backup.label || `backup-${backup.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[backup.status]}`}
                    >
                      {backup.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Created {formatTs(backup.createdAt)}
                    {backup.completedAt && ` · Completed ${formatTs(backup.completedAt)}`}
                    {backup.createdBy && ` · by ${backup.createdBy}`}
                  </div>
                  {backup.error && (
                    <p className="text-xs text-destructive mt-0.5 truncate">{backup.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {backup.status === 'completed' && (
                    <button
                      onClick={() => void handleDownload(backup)}
                      title="Download"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      deleteMutation.mutate(backup.id);
                    }}
                    disabled={deleteMutation.isPending}
                    title="Delete"
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            {data.total} backup{data.total !== 1 ? 's' : ''} total
          </div>
        )}
      </div>
    </div>
  );
}

const LEARNING_MODE_LABELS: Record<string, string> = {
  user_authored: 'User Authored',
  ai_proposed: 'AI Proposed',
  autonomous: 'Autonomous',
};

// ── License Card ───────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  adaptive_learning: 'Adaptive Learning Pipeline',
  sso_saml: 'SSO / SAML',
  multi_tenancy: 'Multi-Tenancy',
  cicd_integration: 'CI/CD Integration',
  advanced_observability: 'Advanced Observability',
};

function LicenseCard() {
  const queryClient = useQueryClient();
  const [keyInput, setKeyInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const { data: license, isLoading } = useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: fetchLicenseStatus,
  });

  const setKeyMutation = useMutation({
    mutationFn: (key: string) => setLicenseKey(key),
    onSuccess: () => {
      setKeyInput('');
      setShowInput(false);
      void queryClient.invalidateQueries({ queryKey: ['license-status'] });
    },
  });

  const isEnterprise = license?.tier === 'enterprise';

  return (
    <div className="card">
      <div className="p-4 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BadgeCheck className={`w-5 h-5 ${isEnterprise ? 'text-primary' : 'text-muted-foreground'}`} />
          <h3 className="font-medium">License</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${isEnterprise ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {isLoading ? '…' : (isEnterprise ? 'Enterprise' : 'Community')}
          </span>
        </div>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          {showInput ? 'Cancel' : 'Set license key'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {isEnterprise && license && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Organization</p>
                  <p className="font-medium">{license.organization ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Seats</p>
                  <p className="font-medium">{license.seats ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Expires</p>
                  <p className="font-medium">
                    {license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>
            )}

            {isEnterprise && license && license.features.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {license.features.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success/10 text-success font-medium">
                    <Check className="w-3 h-3" />
                    {FEATURE_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            )}

            {!isEnterprise && (
              <p className="text-sm text-muted-foreground">
                Running on the community tier. Enterprise features (Adaptive Learning, SSO/SAML, Multi-Tenancy, CI/CD, Advanced Observability) require a license key.
              </p>
            )}

            {license?.error && (
              <p className="text-xs text-destructive">Key error: {license.error}</p>
            )}
          </>
        )}

        {showInput && (
          <div className="flex gap-2 pt-1">
            <input
              type="password"
              placeholder="Paste license key…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => setKeyMutation.mutate(keyInput)}
              disabled={!keyInput.trim() || setKeyMutation.isPending}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setKeyMutation.isPending ? 'Saving…' : 'Apply'}
            </button>
          </div>
        )}
        {setKeyMutation.isError && (
          <p className="text-xs text-destructive">
            {setKeyMutation.error instanceof Error ? setKeyMutation.error.message : 'Failed to set key'}
          </p>
        )}
      </div>
    </div>
  );
}

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

  const repairMutation = useMutation({
    mutationFn: repairAuditChain,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['audit-stats'] }),
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
      {/* ── License ───────────────────────────────────────────── */}
      <LicenseCard />

      {/* ── Audit Chain ───────────────────────────────────────── */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Audit Chain</h3>
        </div>
        <div className="p-4 space-y-4">
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 animate-spin" /> Loading audit stats...
            </div>
          ) : (
            <>
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

              {/* Invalid-chain detail + repair action */}
              {!auditStats?.chainValid && (
                <div className="border border-destructive/30 bg-destructive/5 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Chain integrity failure detected
                  </div>
                  {auditStats?.chainError && (
                    <p className="text-xs text-muted-foreground">{auditStats.chainError}</p>
                  )}
                  {auditStats?.chainBrokenAt && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      First broken entry: {auditStats.chainBrokenAt}
                    </p>
                  )}
                  <button
                    className="btn btn-sm btn-ghost border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1.5 mt-1"
                    disabled={repairMutation.isPending}
                    onClick={() => {
                      repairMutation.mutate();
                    }}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {repairMutation.isPending ? 'Repairing…' : 'Repair Chain'}
                  </button>
                  {repairMutation.isSuccess && (
                    <p className="text-xs text-success">
                      Repair complete — {repairMutation.data.repairedCount} of{' '}
                      {repairMutation.data.entriesTotal} entries re-signed.
                    </p>
                  )}
                  {repairMutation.isError && (
                    <p className="text-xs text-destructive">Repair failed. Check server logs.</p>
                  )}
                </div>
              )}
            </>
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
              onClick={() => {
                setFormEnabled(!formEnabled);
              }}
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
                onChange={(e) => {
                  setFormMaxSkills(Number(e.target.value));
                }}
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
                onChange={(e) => {
                  setFormMaxPromptTokens(Number(e.target.value));
                }}
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
              onClick={() => {
                configMutation.mutate({
                  enabled: formEnabled,
                  learningMode: formLearningMode,
                  maxSkills: formMaxSkills,
                  maxPromptTokens: formMaxPromptTokens,
                });
              }}
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
              <SoulRow key={p.id} personality={p} globalMaxPromptTokens={globalMaxPromptTokens} />
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

function SoulRow({ personality: p, globalMaxPromptTokens }: SoulRowProps) {
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
          {p.isArchetype && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              Preset
            </span>
          )}
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
