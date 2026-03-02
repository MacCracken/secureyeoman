import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Download, Trash2, Loader2, Search } from 'lucide-react';
import {
  fetchMarketplaceSkills,
  installMarketplaceSkill,
  uninstallMarketplaceSkill,
} from '../api/client';
import type { CatalogSkill } from '../types';

const WorkflowsTab = lazy(() =>
  import('./marketplace/WorkflowsTab').then((m) => ({ default: m.WorkflowsTab }))
);
const SwarmTemplatesTab = lazy(() =>
  import('./marketplace/SwarmTemplatesTab').then((m) => ({ default: m.SwarmTemplatesTab }))
);

type TypeFilter = 'skills' | 'workflows' | 'swarms';
type OriginFilter = 'all' | 'marketplace' | 'community';

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'skills', label: 'Skills' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'swarms', label: 'Swarm Templates' },
];

const ORIGIN_TABS: { value: OriginFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'community', label: 'Community' },
];

const PAGE_SIZE = 20;

export function MarketplacePage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('skills');
  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [page, setPage] = useState(0);

  // Reset to first page when filter or search changes
  useEffect(() => {
    setPage(0);
  }, [query, originFilter, typeFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', query, originFilter, page],
    queryFn: () =>
      fetchMarketplaceSkills(
        query || undefined,
        undefined,
        undefined,
        originFilter !== 'all' ? originFilter : undefined,
        PAGE_SIZE,
        page * PAGE_SIZE
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
  };
  const installMut = useMutation({
    mutationFn: (id: string) => installMarketplaceSkill(id),
    onSuccess: invalidate,
  });
  const uninstallMut = useMutation({
    mutationFn: (id: string) => uninstallMarketplaceSkill(id),
    onSuccess: invalidate,
  });

  const total = data?.total ?? 0;
  const skills = data?.skills ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Browse and install skills, workflows, and swarm templates
        </p>
      </div>

      {/* Type selector */}
      <div className="flex gap-1 border-b border-border">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              typeFilter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              setTypeFilter(tab.value);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Render non-skills tabs */}
      {typeFilter === 'workflows' && (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <WorkflowsTab />
        </Suspense>
      )}
      {typeFilter === 'swarms' && (
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <SwarmTemplatesTab />
        </Suspense>
      )}

      {/* Skills tab content */}
      {typeFilter === 'skills' && (
        <>
          {/* Origin filter tabs */}
          <div className="flex gap-1 border-b border-border">
            {ORIGIN_TABS.map((tab) => (
              <button
                key={tab.value}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  originFilter === tab.value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setOriginFilter(tab.value);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full bg-card border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm"
              placeholder="Search skills..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !skills.length ? (
            <div className="card p-12 text-center">
              <Store className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {query ? 'No skills found' : 'Marketplace is empty'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill: CatalogSkill) => (
                  <div key={skill.id} className="card p-4 flex flex-col">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{skill.name}</h3>
                        <div className="flex items-center gap-2">
                          {skill.origin === 'community' && (
                            <span className="badge badge-info text-xs">Community</span>
                          )}
                          <span className="text-xs text-muted-foreground">v{skill.version}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {skill.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{skill.author}</span>
                        <span>{skill.category}</span>
                        <span>{skill.downloadCount} installs</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      {skill.installed ? (
                        <button
                          className="btn btn-ghost text-destructive flex items-center gap-2 w-full justify-center"
                          onClick={() => {
                            uninstallMut.mutate(skill.id);
                          }}
                          disabled={uninstallMut.isPending}
                        >
                          <Trash2 className="w-4 h-4" /> Uninstall
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost flex items-center gap-2 w-full justify-center"
                          onClick={() => {
                            installMut.mutate(skill.id);
                          }}
                          disabled={installMut.isPending}
                        >
                          {installMut.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{' '}
                    {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={page === 0}
                      onClick={() => {
                        setPage((p) => p - 1);
                      }}
                    >
                      ← Prev
                    </button>
                    <span className="text-xs text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => {
                        setPage((p) => p + 1);
                      }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
