/* eslint-disable react-refresh/only-export-components */
/**
 * ServiceKeysPanel — collapsible categorized management of well-known MCP API keys
 * and custom secrets. Shows per-category configuration status at a glance.
 *
 * Extracted from SecuritySettings.tsx (behavior-preserving refactor).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Pen,
  Trash2,
  Puzzle,
  Code2,
  Search,
  Globe,
  Target,
  Key,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { fetchSecretKeys, setSecret, deleteSecret } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';

// ── Well-known MCP service keys ─────────────────────────────────────────────

export interface ServiceKeyDef {
  name: string;
  label: string;
  category: string;
  isUrl?: boolean;
}

export const SERVICE_KEYS: ServiceKeyDef[] = [
  // SecureYeoman — core platform keys
  {
    name: 'SECUREYEOMAN_TOKEN_SECRET',
    label: 'Token Secret (JWT signing)',
    category: 'SecureYeoman',
  },
  { name: 'SECUREYEOMAN_ADMIN_PASSWORD', label: 'Admin Password', category: 'SecureYeoman' },
  { name: 'SECUREYEOMAN_SIGNING_KEY', label: 'Signing Key', category: 'SecureYeoman' },
  { name: 'SECUREYEOMAN_ENCRYPTION_KEY', label: 'Encryption Key', category: 'SecureYeoman' },
  // Yeoman MCP — ecosystem services & MCP tool integrations
  { name: 'AGNOSTIC_API_KEY', label: 'Agnostic API Key', category: 'Yeoman MCP' },
  { name: 'AGNOS_RUNTIME_API_KEY', label: 'AGNOS Agent Runtime API Key', category: 'Yeoman MCP' },
  { name: 'AGNOS_GATEWAY_API_KEY', label: 'AGNOS LLM Gateway API Key', category: 'Yeoman MCP' },
  {
    name: 'BULLSHIFT_API_URL',
    label: 'BullShift Trading API URL',
    category: 'Yeoman MCP',
    isUrl: true,
  },
  {
    name: 'PHOTISNADI_SUPABASE_URL',
    label: 'Photisnadi Supabase URL',
    category: 'Yeoman MCP',
    isUrl: true,
  },
  {
    name: 'PHOTISNADI_SUPABASE_KEY',
    label: 'Photisnadi Supabase Service Key',
    category: 'Yeoman MCP',
  },
  { name: 'PHOTISNADI_USER_ID', label: 'Photisnadi User ID', category: 'Yeoman MCP' },
  {
    name: 'SYNAPSE_API_URL',
    label: 'Synapse LLM Controller API URL',
    category: 'Yeoman MCP',
    isUrl: true,
  },
  // Search
  {
    name: 'MCP_WEB_SEARCH_API_KEY',
    label: 'Web Search API Key (SerpAPI / Tavily)',
    category: 'Search',
  },
  { name: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search API Key', category: 'Search' },
  { name: 'BING_SEARCH_API_KEY', label: 'Bing Search API Key', category: 'Search' },
  { name: 'EXA_API_KEY', label: 'Exa Neural Search API Key', category: 'Search' },
  { name: 'SEARXNG_URL', label: 'SearXNG Instance URL', category: 'Search', isUrl: true },
  // Security
  { name: 'SHODAN_API_KEY', label: 'Shodan API Key', category: 'Security' },
  // Market Data
  { name: 'ALPHAVANTAGE_API_KEY', label: 'AlphaVantage Market Data Key', category: 'Market Data' },
  { name: 'FINNHUB_API_KEY', label: 'Finnhub Market Data Key', category: 'Market Data' },
  // Proxy
  { name: 'PROXY_BRIGHTDATA_URL', label: 'Bright Data Proxy URL', category: 'Proxy', isUrl: true },
  { name: 'PROXY_SCRAPINGBEE_KEY', label: 'ScrapingBee API Key', category: 'Proxy' },
  { name: 'PROXY_SCRAPERAPI_KEY', label: 'ScraperAPI Key', category: 'Proxy' },
  // QuickBooks
  { name: 'QUICKBOOKS_CLIENT_ID', label: 'QuickBooks Client ID', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_CLIENT_SECRET', label: 'QuickBooks Client Secret', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_REALM_ID', label: 'QuickBooks Realm ID', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_REFRESH_TOKEN', label: 'QuickBooks Refresh Token', category: 'QuickBooks' },
];

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  SecureYeoman: <Shield className="w-4 h-4" />,
  'Yeoman MCP': <Puzzle className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Security: <Lock className="w-4 h-4" />,
  'Market Data': <Target className="w-4 h-4" />,
  Proxy: <Globe className="w-4 h-4" />,
  QuickBooks: <Code2 className="w-4 h-4" />,
  'Custom Secrets': <Lock className="w-4 h-4" />,
};

export const SERVICE_KEY_NAMES = new Set(SERVICE_KEYS.map((k) => k.name));

export function ServiceKeysPanel() {
  const queryClient = useQueryClient();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');

  const { data: secretsData, isLoading } = useQuery({
    queryKey: ['secret-keys'],
    queryFn: fetchSecretKeys,
    refetchOnWindowFocus: false,
  });

  const setMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) => setSecret(name, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      setEditingKey(null);
      setEditValue('');
      setAddingCustom(false);
      setNewName('');
      setNewValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSecret(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      setConfirmDelete(null);
    },
  });

  const storedKeys = new Set(secretsData?.keys ?? []);
  const customKeys = (secretsData?.keys ?? []).filter((k) => !SERVICE_KEY_NAMES.has(k));

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const categories = [...new Set(SERVICE_KEYS.map((k) => k.category))];

  const totalConfigured = SERVICE_KEYS.filter((k) => storedKeys.has(k.name)).length;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove Key"
        message={`Remove "${confirmDelete}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete);
        }}
        onCancel={() => {
          setConfirmDelete(null);
        }}
      />

      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Key className="w-5 h-5" />
          Service API Keys
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          API keys for MCP search, security, proxy, and external services. Stored encrypted in the
          secrets backend. Env vars take precedence if set.
        </p>
        {!isLoading && (
          <p className="text-xs text-muted-foreground mt-1">
            {totalConfigured} of {SERVICE_KEYS.length} service keys configured
            {customKeys.length > 0 &&
              ` · ${customKeys.length} custom secret${customKeys.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Service key categories */}
        {categories.map((category) => {
          const keys = SERVICE_KEYS.filter((k) => k.category === category);
          const configuredInCategory = keys.filter((k) => storedKeys.has(k.name)).length;
          const isExpanded = expandedCategories.has(category);

          return (
            <div key={category} className="border-b border-border last:border-0">
              <button
                onClick={() => {
                  toggleCategory(category);
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                aria-expanded={isExpanded}
                data-testid={`category-${category}`}
              >
                <div className="flex items-center gap-2.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  {CATEGORY_ICONS[category] ?? <Key className="w-4 h-4" />}
                  <span className="font-medium text-sm">{category}</span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    configuredInCategory === keys.length
                      ? 'bg-success/10 text-success'
                      : configuredInCategory > 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {configuredInCategory}/{keys.length}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5">
                  {keys.map((keyDef) => {
                    const isSet = storedKeys.has(keyDef.name);
                    const isEditing = editingKey === keyDef.name;

                    return (
                      <div key={keyDef.name}>
                        <div className="flex items-center justify-between p-2 rounded bg-muted/20 text-sm">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {isSet ? (
                              <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs block truncate">{keyDef.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground block truncate">
                                {keyDef.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              className="text-primary hover:text-primary/80 p-1 rounded hover:bg-muted/50"
                              onClick={() => {
                                setEditingKey(isEditing ? null : keyDef.name);
                                setEditValue('');
                              }}
                              aria-label={isSet ? `Update ${keyDef.name}` : `Set ${keyDef.name}`}
                              title={isSet ? 'Update' : 'Set key'}
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            {isSet && (
                              <button
                                className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10"
                                onClick={() => {
                                  setConfirmDelete(keyDef.name);
                                }}
                                aria-label={`Remove ${keyDef.name}`}
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && (
                          <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-2 mt-1 ml-6">
                            <input
                              type={keyDef.isUrl ? 'text' : 'password'}
                              value={editValue}
                              onChange={(e) => {
                                setEditValue(e.target.value);
                              }}
                              placeholder={keyDef.isUrl ? 'https://...' : 'Paste key...'}
                              className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                                onClick={() => {
                                  if (editValue)
                                    setMutation.mutate({ name: keyDef.name, value: editValue });
                                }}
                                disabled={!editValue || setMutation.isPending}
                              >
                                {setMutation.isPending && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {isSet ? 'Update' : 'Save'}
                              </button>
                              <button
                                className="btn btn-ghost text-sm px-3 py-1"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditValue('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Secrets category */}
        <div className="border-b border-border last:border-0">
          <button
            onClick={() => {
              toggleCategory('Custom Secrets');
            }}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            aria-expanded={expandedCategories.has('Custom Secrets')}
            data-testid="category-Custom Secrets"
          >
            <div className="flex items-center gap-2.5">
              {expandedCategories.has('Custom Secrets') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <Lock className="w-4 h-4" />
              <span className="font-medium text-sm">Custom Secrets</span>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                customKeys.length > 0
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {customKeys.length}
            </span>
          </button>

          {expandedCategories.has('Custom Secrets') && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Write-only secrets stored in the configured backend (env / keyring / vault).
              </p>

              {customKeys.length > 0 && (
                <div className="space-y-1.5">
                  {customKeys.map((key) => {
                    const isEditing = editingKey === key;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between p-2 rounded bg-muted/20 text-sm">
                          <div className="flex items-center gap-2.5">
                            <Lock className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-xs">{key}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="text-primary hover:text-primary/80 p-1 rounded hover:bg-muted/50"
                              onClick={() => {
                                setEditingKey(isEditing ? null : key);
                                setEditValue('');
                              }}
                              aria-label={`Update secret ${key}`}
                              title="Update value"
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10"
                              onClick={() => {
                                setConfirmDelete(key);
                              }}
                              aria-label={`Delete secret ${key}`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-2 mt-1 ml-6">
                            <input
                              type="password"
                              value={editValue}
                              onChange={(e) => {
                                setEditValue(e.target.value);
                              }}
                              placeholder="New value..."
                              className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                                onClick={() => {
                                  if (editValue)
                                    setMutation.mutate({ name: key, value: editValue });
                                }}
                                disabled={!editValue || setMutation.isPending}
                              >
                                {setMutation.isPending && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                Update
                              </button>
                              <button
                                className="btn btn-ghost text-sm px-3 py-1"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditValue('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add custom secret */}
              {addingCustom ? (
                <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Name (uppercase)
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                        }}
                        placeholder="MY_SECRET_KEY"
                        className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Value</label>
                      <input
                        type="password"
                        value={newValue}
                        onChange={(e) => {
                          setNewValue(e.target.value);
                        }}
                        placeholder="••••••••"
                        className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                      onClick={() => {
                        if (newName && newValue)
                          setMutation.mutate({ name: newName, value: newValue });
                      }}
                      disabled={!newName || !newValue || setMutation.isPending}
                    >
                      {setMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save
                    </button>
                    <button
                      className="btn btn-ghost text-sm px-3 py-1"
                      onClick={() => {
                        setAddingCustom(false);
                        setNewName('');
                        setNewValue('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 px-2 py-1.5"
                  onClick={() => {
                    setAddingCustom(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Secret
                </button>
              )}

              {customKeys.length === 0 && !addingCustom && (
                <p className="text-xs text-muted-foreground pl-2">No custom secrets stored.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
    </div>
  );
}

/** @deprecated Use ServiceKeysPanel which now includes custom secrets */
export const SecretsPanel = ServiceKeysPanel;
