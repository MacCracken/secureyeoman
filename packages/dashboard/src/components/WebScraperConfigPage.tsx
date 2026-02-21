import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, Loader2, Shield, Gauge, Save } from 'lucide-react';
import { fetchMcpConfig, updateMcpConfig } from '../api/client';

export function WebScraperConfigPage({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();

  const { data: mcpConfig, isLoading } = useQuery({
    queryKey: ['mcpConfig'],
    queryFn: fetchMcpConfig,
    staleTime: 10000,
  });

  const [newUrl, setNewUrl] = useState('');
  const [localRateLimit, setLocalRateLimit] = useState<number | null>(null);
  const [localProxyStrategy, setLocalProxyStrategy] = useState<string | null>(null);
  const [localProxyCountry, setLocalProxyCountry] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: updateMcpConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpConfig'] });
      setDirty(false);
    },
  });

  const allowedUrls = mcpConfig?.allowedUrls ?? [];
  const rateLimit = localRateLimit ?? mcpConfig?.webRateLimitPerMinute ?? 10;
  const proxyEnabled = mcpConfig?.proxyEnabled ?? false;
  const proxyProviders = mcpConfig?.proxyProviders ?? [];
  const proxyStrategy = localProxyStrategy ?? mcpConfig?.proxyStrategy ?? 'round-robin';
  const proxyCountry = localProxyCountry ?? mcpConfig?.proxyDefaultCountry ?? '';

  const webEnabled = mcpConfig?.exposeWeb === true || mcpConfig?.exposeWebScraping === true;

  function handleAddUrl() {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    const updated = [...allowedUrls, trimmed];
    saveMutation.mutate({ allowedUrls: updated });
    setNewUrl('');
  }

  function handleRemoveUrl(url: string) {
    const updated = allowedUrls.filter((u) => u !== url);
    saveMutation.mutate({ allowedUrls: updated });
  }

  function handleSaveSettings() {
    saveMutation.mutate({
      webRateLimitPerMinute: rateLimit,
      proxyStrategy,
      proxyDefaultCountry: proxyCountry,
    });
  }

  if (!webEnabled) {
    return (
      <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Web Scraper Configuration</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Configure scraping jobs, URL allowlists, and proxy settings
            </p>
          </div>
        )}
        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3 text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">
          Web scraping tools are not enabled. Enable exposeWeb or exposeWebScraping in MCP settings.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Web Scraper Configuration</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Configure scraping jobs, URL allowlists, and proxy settings
          </p>
        </div>
      )}

      {/* Feature Toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          label="Web Scraping"
          value={mcpConfig?.exposeWebScraping ? 'Enabled' : 'Disabled'}
          color={mcpConfig?.exposeWebScraping ? 'text-green-500' : 'text-muted-foreground'}
        />
        <StatCard
          label="Web Search"
          value={mcpConfig?.exposeWebSearch ? 'Enabled' : 'Disabled'}
          color={mcpConfig?.exposeWebSearch ? 'text-green-500' : 'text-muted-foreground'}
        />
        <StatCard
          label="Proxy"
          value={proxyEnabled ? 'Enabled' : 'Disabled'}
          color={proxyEnabled ? 'text-green-500' : 'text-muted-foreground'}
        />
      </div>

      {/* URL Allowlist */}
      <div className="card">
        <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-sm sm:text-base">URL Allowlist</h2>
        </div>
        <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
          <p className="text-xs text-muted-foreground">
            When empty, all URLs are allowed. Add specific URLs or patterns to restrict scraping.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
              }}
              placeholder="https://example.com/*"
              className="flex-1 bg-card border border-border rounded-lg text-sm py-1.5 px-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUrl();
              }}
            />
            <button
              className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 w-full sm:w-auto"
              onClick={handleAddUrl}
              disabled={!newUrl.trim() || saveMutation.isPending}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {allowedUrls.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-xs">
              No URL restrictions — all URLs are allowed for scraping.
            </div>
          ) : (
            <div className="space-y-1">
              {allowedUrls.map((url) => (
                <div
                  key={url}
                  className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 text-sm"
                >
                  <span className="font-mono text-xs truncate">{url}</span>
                  <button
                    className="btn-ghost text-xs p-1 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      handleRemoveUrl(url);
                    }}
                    disabled={saveMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rate Limiting & Proxy Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Rate Limiting */}
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Rate Limiting</h2>
          </div>
          <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Requests per minute
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={rateLimit}
                onChange={(e) => {
                  setLocalRateLimit(parseInt(e.target.value, 10) || 10);
                  setDirty(true);
                }}
                className="bg-card border border-border rounded-lg text-sm py-1.5 px-3 w-24"
              />
            </div>
          </div>
        </div>

        {/* Proxy Settings */}
        <div className="card">
          <div className="card-header flex flex-row items-center gap-2 p-3 sm:p-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="card-title text-sm sm:text-base">Proxy Settings</h2>
          </div>
          <div className="card-content space-y-3 p-3 sm:p-4 pt-0 sm:pt-0">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Strategy</label>
              <select
                value={proxyStrategy}
                onChange={(e) => {
                  setLocalProxyStrategy(e.target.value);
                  setDirty(true);
                }}
                className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-40"
                disabled={!proxyEnabled}
              >
                <option value="round-robin">Round Robin</option>
                <option value="random">Random</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Default Country (ISO)
              </label>
              <input
                type="text"
                maxLength={2}
                value={proxyCountry}
                onChange={(e) => {
                  setLocalProxyCountry(e.target.value.toUpperCase());
                  setDirty(true);
                }}
                placeholder="US"
                className="bg-card border border-border rounded-lg text-sm py-1.5 px-3 w-20"
                disabled={!proxyEnabled}
              />
            </div>
            {proxyProviders.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Active Providers</label>
                <div className="flex flex-wrap gap-1">
                  {proxyProviders.map((p) => (
                    <span
                      key={p}
                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      {dirty && (
        <div className="flex justify-end">
          <button
            className="btn-ghost text-sm px-4 py-2 flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20"
            onClick={handleSaveSettings}
            disabled={saveMutation.isPending}
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-0.5 ${color ?? ''}`}>{value}</p>
    </div>
  );
}
