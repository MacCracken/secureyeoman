/**
 * PersonalitiesTab — Browse and install community personalities from the marketplace.
 * Organized by category (professional, sci-fi/assistant, sci-fi/antagonist, etc.)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Download,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import {
  fetchCommunityPersonalities,
  installCommunityPersonality,
  fetchPersonalities,
  deletePersonality,
  type CommunityPersonality,
  getAccessToken,
} from '../../api/client';

/** Format category label: "sci-fi/antagonist" → "Sci-Fi — Antagonist" */
function formatCategory(cat: string): string {
  return cat
    .split('/')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' — ');
}

/** Category display order */
const CATEGORY_ORDER = [
  'professional',
  'sci-fi/assistant',
  'sci-fi/antagonist',
  'sci-fi/comic',
  'sci-fi/tactical',
  'sci-fi',
  'other',
];

function sortCategories(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(a);
  const bi = CATEGORY_ORDER.indexOf(b);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

/** Build avatar URL — uses backend avatar endpoint or falls back to letter SVG */
function avatarUrl(p: CommunityPersonality): string {
  if (p.avatarFile) {
    const token = getAccessToken();
    return `/api/v1/marketplace/community/personalities/avatar/${encodeURIComponent(p.avatarFile)}${token ? `?token=${token}` : ''}`;
  }
  // Fallback: data URI with first letter
  const letter = (p.name[0] ?? '?').toUpperCase();
  const colors: Record<string, string> = {
    professional: '#3b82f6',
    'sci-fi/assistant': '#22c55e',
    'sci-fi/antagonist': '#ef4444',
    'sci-fi/comic': '#f59e0b',
    'sci-fi/tactical': '#8b5cf6',
  };
  const bg = colors[p.category] ?? '#6b7280';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="${bg}"/><text x="20" y="20" dy=".35em" text-anchor="middle" fill="white" font-family="system-ui" font-size="18" font-weight="600">${letter}</text></svg>`)}`;
}

export function PersonalitiesTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['personalities-community'],
    queryFn: fetchCommunityPersonalities,
  });

  // Fetch installed personalities to check which are already installed
  const { data: installedData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const installedMap = new Map(
    (installedData?.personalities ?? []).map((p) => [p.name.toLowerCase(), p.id])
  );

  const personalities = data?.personalities ?? [];

  const filtered = query
    ? personalities.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description?.toLowerCase().includes(query.toLowerCase()) ||
          p.category.toLowerCase().includes(query.toLowerCase())
      )
    : personalities;

  // Group by category
  const grouped = new Map<string, CommunityPersonality[]>();
  for (const p of filtered) {
    const list = grouped.get(p.category) ?? [];
    list.push(p);
    grouped.set(p.category, list);
  }
  const sortedCategories = [...grouped.keys()].sort(sortCategories);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const installMut = useMutation({
    mutationFn: (filename: string) => installCommunityPersonality(filename),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      setToast(`Installed: ${res.personality.name}`);
      setTimeout(() => {
        setToast(null);
      }, 3000);
    },
    onError: (err: Error) => {
      setToast(`Install failed: ${err.message}`);
      setTimeout(() => {
        setToast(null);
      }, 5000);
    },
  });

  const uninstallMut = useMutation({
    mutationFn: (id: string) => deletePersonality(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personalities'] });
      setToast('Personality uninstalled');
      setTimeout(() => {
        setToast(null);
      }, 3000);
    },
    onError: (err: Error) => {
      setToast(`Uninstall failed: ${err.message}`);
      setTimeout(() => {
        setToast(null);
      }, 5000);
    },
  });

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-card border border-border rounded-lg px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full bg-card border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm"
            placeholder="Search community personalities..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {personalities.length} available
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !filtered.length ? (
        <div className="card p-12 text-center">
          <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {query ? 'No matching personalities' : 'No community personalities found'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Ensure the community repo is configured and contains personalities
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCategories.map((cat) => {
            const items = grouped.get(cat) ?? [];
            const isCollapsed = collapsedCategories.has(cat);
            return (
              <div key={cat} className="card overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    toggleCategory(cat);
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <h3 className="font-medium text-sm">{formatCategory(cat)}</h3>
                  <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 pt-0">
                    {items.map((p) => {
                      const installedId = installedMap.get(p.name.toLowerCase());
                      const isInstalled = !!installedId;
                      return (
                        <div
                          key={p.filename}
                          className="border border-border rounded-lg p-3 flex gap-3"
                        >
                          <img
                            src={avatarUrl(p)}
                            alt=""
                            className="w-10 h-10 rounded-lg shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm truncate">{p.name}</h4>
                              {isInstalled && (
                                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {p.description || 'No description'}
                            </p>
                            {Object.keys(p.traits).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {Object.entries(p.traits)
                                  .slice(0, 3)
                                  .map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                    >
                                      {k}: {v}
                                    </span>
                                  ))}
                                {Object.keys(p.traits).length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{Object.keys(p.traits).length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="mt-2">
                              {isInstalled ? (
                                <button
                                  className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1 text-destructive hover:text-destructive"
                                  onClick={() => {
                                    uninstallMut.mutate(installedId);
                                  }}
                                  disabled={uninstallMut.isPending}
                                >
                                  {uninstallMut.isPending &&
                                  uninstallMut.variables === installedId ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                  )}
                                  Uninstall
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                                  onClick={() => {
                                    installMut.mutate(p.filename);
                                  }}
                                  disabled={installMut.isPending}
                                >
                                  {installMut.isPending && installMut.variables === p.filename ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Download className="w-3 h-3" />
                                  )}
                                  Install
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
