/**
 * ArtifactoryPanel — JFrog Artifactory dashboard panel.
 *
 * Shows configured Artifactory connections and lets users browse repos,
 * artifacts, Docker images, and builds.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchArtifactoryConnections,
  addArtifactoryConnection,
  removeArtifactoryConnection,
  fetchArtifactoryRepos,
  fetchArtifactoryFolderItems,
  fetchArtifactorySearch,
  fetchArtifactoryDockerImages,
  fetchArtifactoryDockerTags,
  fetchArtifactoryBuilds,
  fetchArtifactoryBuild,
  promoteArtifactoryBuild,
  fetchArtifactoryHealth,
} from '../api/client';
import type {
  ArtifactoryConnection,
  ArtifactoryRepo,
  ArtifactoryItem,
  ArtifactoryDockerImage,
  ArtifactoryBuildSummary,
  ArtifactoryBuildInfo,
} from '../api/client';

const REPO_TYPE_COLORS: Record<string, string> = {
  local: '#22c55e',
  remote: '#3b82f6',
  virtual: '#a855f7',
  federated: '#f59e0b',
};

const PKG_TYPE_LABELS: Record<string, string> = {
  docker: 'Docker',
  npm: 'npm',
  maven: 'Maven',
  pypi: 'PyPI',
  gradle: 'Gradle',
  nuget: 'NuGet',
  go: 'Go',
  generic: 'Generic',
};

type ActiveTab = 'repos' | 'docker' | 'builds' | 'search';

export function ArtifactoryPanel() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ baseUrl: '', token: '', username: '', password: '' });
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('repos');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null);
  const [promoteForm, setPromoteForm] = useState({ targetRepo: '', status: '' });
  const [promoteBuildTarget, setPromoteBuildTarget] = useState<{
    name: string;
    number: string;
  } | null>(null);

  // ── Connections ──────────────────────────────────────────

  const connectionsQuery = useQuery({
    queryKey: ['artifactoryConnections'],
    queryFn: fetchArtifactoryConnections,
    refetchInterval: 60_000,
  });

  const addMut = useMutation({
    mutationFn: (data: { baseUrl: string; token?: string; username?: string; password?: string }) =>
      addArtifactoryConnection(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['artifactoryConnections'] });
      setShowAddForm(false);
      setAddForm({ baseUrl: '', token: '', username: '', password: '' });
    },
  });

  const removeMut = useMutation({
    mutationFn: removeArtifactoryConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['artifactoryConnections'] });
      if (selectedConn) setSelectedConn(null);
    },
  });

  // ── Repos ───────────────────────────────────────────────

  const reposQuery = useQuery({
    queryKey: ['artifactoryRepos', selectedConn],
    queryFn: () => fetchArtifactoryRepos(selectedConn!),
    enabled: !!selectedConn && activeTab === 'repos',
  });

  // ── Browse ──────────────────────────────────────────────

  const browseQuery = useQuery({
    queryKey: ['artifactoryBrowse', selectedConn, selectedRepo, browsePath],
    queryFn: () =>
      fetchArtifactoryFolderItems(selectedConn!, selectedRepo!, browsePath || undefined),
    enabled: !!selectedConn && !!selectedRepo && activeTab === 'repos',
  });

  // ── Search ──────────────────────────────────────────────

  const searchResultsQuery = useQuery({
    queryKey: ['artifactorySearch', selectedConn, searchQuery],
    queryFn: () => fetchArtifactorySearch(selectedConn!, searchQuery),
    enabled: !!selectedConn && !!searchQuery && activeTab === 'search',
  });

  // ── Docker ──────────────────────────────────────────────

  const dockerImagesQuery = useQuery({
    queryKey: ['artifactoryDockerImages', selectedConn, selectedRepo],
    queryFn: () => fetchArtifactoryDockerImages(selectedConn!, selectedRepo!),
    enabled: !!selectedConn && !!selectedRepo && activeTab === 'docker',
  });

  // ── Builds ──────────────────────────────────────────────

  const buildsQuery = useQuery({
    queryKey: ['artifactoryBuilds', selectedConn],
    queryFn: () => fetchArtifactoryBuilds(selectedConn!),
    enabled: !!selectedConn && activeTab === 'builds',
  });

  const buildDetailQuery = useQuery({
    queryKey: ['artifactoryBuild', selectedConn, selectedBuild],
    queryFn: () => fetchArtifactoryBuild(selectedConn!, selectedBuild!),
    enabled: !!selectedConn && !!selectedBuild && activeTab === 'builds',
  });

  const promoteMut = useMutation({
    mutationFn: (vars: { name: string; number: string; targetRepo: string; status?: string }) =>
      promoteArtifactoryBuild(selectedConn!, vars.name, vars.number, vars.targetRepo, vars.status),
    onSuccess: () => {
      setPromoteBuildTarget(null);
      setPromoteForm({ targetRepo: '', status: '' });
      void queryClient.invalidateQueries({ queryKey: ['artifactoryBuilds'] });
    },
  });

  // ── Health ──────────────────────────────────────────────

  const healthQuery = useQuery({
    queryKey: ['artifactoryHealth', selectedConn],
    queryFn: () => fetchArtifactoryHealth(selectedConn!),
    enabled: !!selectedConn,
    refetchInterval: 30_000,
  });

  const connections = connectionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          JFrog Artifactory
        </h3>
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => {
            setShowAddForm(!showAddForm);
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add Instance'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="card p-3 space-y-2">
          <input
            className="w-full text-xs p-1.5 rounded border border-border bg-background"
            placeholder="Base URL (e.g. https://mycompany.jfrog.io/artifactory)"
            value={addForm.baseUrl}
            onChange={(e) => {
              setAddForm({ ...addForm, baseUrl: e.target.value });
            }}
          />
          <input
            className="w-full text-xs p-1.5 rounded border border-border bg-background"
            placeholder="Access Token (optional)"
            type="password"
            value={addForm.token}
            onChange={(e) => {
              setAddForm({ ...addForm, token: e.target.value });
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="w-full text-xs p-1.5 rounded border border-border bg-background"
              placeholder="Username (optional)"
              value={addForm.username}
              onChange={(e) => {
                setAddForm({ ...addForm, username: e.target.value });
              }}
            />
            <input
              className="w-full text-xs p-1.5 rounded border border-border bg-background"
              placeholder="Password (optional)"
              type="password"
              value={addForm.password}
              onChange={(e) => {
                setAddForm({ ...addForm, password: e.target.value });
              }}
            />
          </div>
          <button
            className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={!addForm.baseUrl || addMut.isPending}
            onClick={() => {
              addMut.mutate({
                baseUrl: addForm.baseUrl,
                token: addForm.token || undefined,
                username: addForm.username || undefined,
                password: addForm.password || undefined,
              });
            }}
          >
            {addMut.isPending ? 'Adding...' : 'Add Connection'}
          </button>
          {addMut.error && <p className="text-xs text-red-500">{addMut.error.message}</p>}
        </div>
      )}

      {/* Connection cards */}
      {connections.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground">No Artifactory connections configured</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {connections.map((conn: ArtifactoryConnection) => (
          <div
            key={conn.key}
            className={`card p-3 cursor-pointer transition-colors ${
              selectedConn === conn.key ? 'ring-1 ring-primary' : ''
            }`}
            onClick={() => {
              setSelectedConn(selectedConn === conn.key ? null : conn.key);
              setSelectedRepo(null);
              setBrowsePath('');
              setSelectedBuild(null);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Artifactory</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">{conn.key}</span>
                {selectedConn === conn.key && healthQuery.data !== undefined && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: healthQuery.data ? '#22c55e' : '#ef4444' }}
                  />
                )}
              </div>
              <button
                className="text-[10px] text-red-500 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  removeMut.mutate(conn.key);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      {selectedConn && (
        <div className="flex gap-2 mb-2">
          {(['repos', 'docker', 'builds', 'search'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              className={`text-xs px-2 py-1 rounded capitalize ${
                activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => {
                setActiveTab(tab);
                setSelectedRepo(null);
                setBrowsePath('');
                setSelectedBuild(null);
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Repos tab */}
      {selectedConn && activeTab === 'repos' && (
        <ReposTab
          repos={reposQuery.data}
          isLoading={reposQuery.isLoading}
          error={reposQuery.error}
          selectedRepo={selectedRepo}
          onSelectRepo={(key) => {
            setSelectedRepo(selectedRepo === key ? null : key);
            setBrowsePath('');
          }}
          browseItems={browseQuery.data}
          browseLoading={browseQuery.isLoading}
          browsePath={browsePath}
          onBrowse={setBrowsePath}
        />
      )}

      {/* Docker tab */}
      {selectedConn && activeTab === 'docker' && (
        <DockerTab
          repos={reposQuery.data?.filter((r: ArtifactoryRepo) => r.packageType === 'docker')}
          selectedRepo={selectedRepo}
          onSelectRepo={(key) => {
            setSelectedRepo(selectedRepo === key ? null : key);
          }}
          images={dockerImagesQuery.data}
          imagesLoading={dockerImagesQuery.isLoading}
          connKey={selectedConn}
        />
      )}

      {/* Builds tab */}
      {selectedConn && activeTab === 'builds' && (
        <BuildsTab
          builds={buildsQuery.data}
          isLoading={buildsQuery.isLoading}
          error={buildsQuery.error}
          selectedBuild={selectedBuild}
          onSelectBuild={(name) => {
            setSelectedBuild(selectedBuild === name ? null : name);
          }}
          buildDetail={buildDetailQuery.data}
          buildDetailLoading={buildDetailQuery.isLoading}
          promoteBuildTarget={promoteBuildTarget}
          setPromoteBuildTarget={setPromoteBuildTarget}
          promoteForm={promoteForm}
          setPromoteForm={setPromoteForm}
          promoteMut={promoteMut}
        />
      )}

      {/* Search tab */}
      {selectedConn && activeTab === 'search' && (
        <SearchTab
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          results={searchResultsQuery.data}
          isLoading={searchResultsQuery.isLoading}
          error={searchResultsQuery.error}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function ReposTab({
  repos,
  isLoading,
  error,
  selectedRepo,
  onSelectRepo,
  browseItems,
  browseLoading,
  browsePath,
  onBrowse,
}: {
  repos: ArtifactoryRepo[] | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedRepo: string | null;
  onSelectRepo: (key: string) => void;
  browseItems: ArtifactoryItem[] | undefined;
  browseLoading: boolean;
  browsePath: string;
  onBrowse: (path: string) => void;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading repositories...</p>;
  if (error) return <p className="text-xs text-red-500">{error.message}</p>;
  if (!repos || repos.length === 0)
    return <p className="text-xs text-muted-foreground">No repositories found</p>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">Repositories</h4>
      <div className="space-y-1">
        {repos.map((repo: ArtifactoryRepo) => (
          <div
            key={repo.key}
            className={`card p-2 cursor-pointer text-xs ${
              selectedRepo === repo.key ? 'ring-1 ring-primary' : ''
            }`}
            onClick={() => {
              onSelectRepo(repo.key);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{repo.key}</span>
                <span
                  className="text-[10px] px-1 rounded"
                  style={{ background: REPO_TYPE_COLORS[repo.type] ?? '#64748b', color: '#fff' }}
                >
                  {repo.type}
                </span>
                <span className="text-muted-foreground/60">
                  {PKG_TYPE_LABELS[repo.packageType] ?? repo.packageType}
                </span>
              </div>
            </div>
            {repo.description && (
              <p className="text-muted-foreground mt-0.5 truncate">{repo.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Folder browser */}
      {selectedRepo && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground">
              Browse: {selectedRepo}/{browsePath || '(root)'}
            </h4>
            {browsePath && (
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => {
                  const parts = browsePath.split('/').filter(Boolean);
                  parts.pop();
                  onBrowse(parts.join('/'));
                }}
              >
                Up
              </button>
            )}
          </div>
          {browseLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {browseItems?.length === 0 && (
            <p className="text-xs text-muted-foreground">Empty folder</p>
          )}
          {(browseItems ?? []).map((item: ArtifactoryItem) => (
            <div key={item.name} className="card p-2 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.name}</span>
                {item.sha256 && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    {item.sha256.slice(0, 12)}
                  </span>
                )}
              </div>
              <span className="text-muted-foreground/60">{formatBytes(item.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DockerTab({
  repos,
  selectedRepo,
  onSelectRepo,
  images,
  imagesLoading,
  connKey,
}: {
  repos: ArtifactoryRepo[] | undefined;
  selectedRepo: string | null;
  onSelectRepo: (key: string) => void;
  images: ArtifactoryDockerImage[] | undefined;
  imagesLoading: boolean;
  connKey: string;
}) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const tagsQuery = useQuery({
    queryKey: ['artifactoryDockerTags', connKey, selectedRepo, expandedImage],
    queryFn: () => fetchArtifactoryDockerTags(connKey, selectedRepo!, expandedImage!),
    enabled: !!selectedRepo && !!expandedImage,
  });

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">Docker Repositories</h4>
      {!repos || repos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Docker repositories found</p>
      ) : (
        <div className="space-y-1">
          {repos.map((repo: ArtifactoryRepo) => (
            <div
              key={repo.key}
              className={`card p-2 cursor-pointer text-xs ${
                selectedRepo === repo.key ? 'ring-1 ring-primary' : ''
              }`}
              onClick={() => {
                onSelectRepo(repo.key);
              }}
            >
              <span className="font-medium">{repo.key}</span>
            </div>
          ))}
        </div>
      )}

      {/* Docker images */}
      {selectedRepo && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground">Images</h4>
          {imagesLoading && <p className="text-xs text-muted-foreground">Loading images...</p>}
          {images?.length === 0 && <p className="text-xs text-muted-foreground">No images found</p>}
          {(images ?? []).map((img: ArtifactoryDockerImage) => (
            <div key={img.name} className="card p-2 text-xs">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => {
                  setExpandedImage(expandedImage === img.name ? null : img.name);
                }}
              >
                <span className="font-medium">{img.name}</span>
                <span className="text-muted-foreground/60">{img.tags.length} tags</span>
              </div>
              {expandedImage === img.name && (
                <div className="mt-1 ml-2 space-y-0.5">
                  {tagsQuery.isLoading && <p className="text-muted-foreground">Loading tags...</p>}
                  {(tagsQuery.data ?? img.tags).map((tag: string) => (
                    <div key={tag} className="text-muted-foreground font-mono">
                      {tag}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildsTab({
  builds,
  isLoading,
  error,
  selectedBuild,
  onSelectBuild,
  buildDetail,
  buildDetailLoading,
  promoteBuildTarget,
  setPromoteBuildTarget,
  promoteForm,
  setPromoteForm,
  promoteMut,
}: {
  builds: ArtifactoryBuildSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
  selectedBuild: string | null;
  onSelectBuild: (name: string) => void;
  buildDetail: ArtifactoryBuildInfo | undefined;
  buildDetailLoading: boolean;
  promoteBuildTarget: { name: string; number: string } | null;
  setPromoteBuildTarget: (t: { name: string; number: string } | null) => void;
  promoteForm: { targetRepo: string; status: string };
  setPromoteForm: (f: { targetRepo: string; status: string }) => void;
  promoteMut: any;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading builds...</p>;
  if (error) return <p className="text-xs text-red-500">{error.message}</p>;
  if (!builds || builds.length === 0)
    return <p className="text-xs text-muted-foreground">No builds found</p>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">Builds</h4>
      <div className="space-y-1">
        {builds.map((b: ArtifactoryBuildSummary) => (
          <div
            key={b.name}
            className={`card p-2 cursor-pointer text-xs ${
              selectedBuild === b.name ? 'ring-1 ring-primary' : ''
            }`}
            onClick={() => {
              onSelectBuild(b.name);
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{b.name}</span>
              <span className="text-muted-foreground/60">
                {b.lastStarted ? new Date(b.lastStarted).toLocaleDateString() : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Build detail */}
      {selectedBuild && (
        <div className="space-y-1">
          {buildDetailLoading && <p className="text-xs text-muted-foreground">Loading build...</p>}
          {buildDetail && (
            <div className="card p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {buildDetail.name} #{buildDetail.number}
                </span>
                {buildDetail.status && (
                  <span className="text-muted-foreground/60">{buildDetail.status}</span>
                )}
              </div>
              <p className="text-muted-foreground">Started: {buildDetail.started}</p>

              {/* Modules */}
              {buildDetail.modules?.map((mod) => (
                <div key={mod.id} className="ml-2">
                  <p className="font-medium">{mod.id}</p>
                  {mod.artifacts.map((a) => (
                    <div key={a.sha256} className="ml-2 text-muted-foreground flex gap-2">
                      <span>{a.name}</span>
                      <span className="font-mono text-[10px]">{a.sha256.slice(0, 12)}</span>
                    </div>
                  ))}
                </div>
              ))}

              {/* Promote button */}
              <button
                className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 mt-1"
                onClick={() => {
                  setPromoteBuildTarget({ name: buildDetail.name, number: buildDetail.number });
                }}
              >
                Promote Build
              </button>
            </div>
          )}

          {/* Promote form */}
          {promoteBuildTarget && (
            <div className="card p-3 space-y-2">
              <p className="text-xs font-medium">
                Promote {promoteBuildTarget.name} #{promoteBuildTarget.number}
              </p>
              <input
                className="w-full text-xs p-1.5 rounded border border-border bg-background"
                placeholder="Target repository (e.g. libs-release)"
                value={promoteForm.targetRepo}
                onChange={(e) => {
                  setPromoteForm({ ...promoteForm, targetRepo: e.target.value });
                }}
              />
              <input
                className="w-full text-xs p-1.5 rounded border border-border bg-background"
                placeholder="Status (optional, e.g. released)"
                value={promoteForm.status}
                onChange={(e) => {
                  setPromoteForm({ ...promoteForm, status: e.target.value });
                }}
              />
              <div className="flex gap-2">
                <button
                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  disabled={!promoteForm.targetRepo || promoteMut.isPending}
                  onClick={() =>
                    promoteMut.mutate({
                      name: promoteBuildTarget.name,
                      number: promoteBuildTarget.number,
                      targetRepo: promoteForm.targetRepo,
                      status: promoteForm.status || undefined,
                    })
                  }
                >
                  {promoteMut.isPending ? 'Promoting...' : 'Confirm Promote'}
                </button>
                <button
                  className="text-xs px-3 py-1 rounded text-muted-foreground hover:underline"
                  onClick={() => {
                    setPromoteBuildTarget(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {promoteMut.error && (
                <p className="text-xs text-red-500">{(promoteMut.error as Error).message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchTab({
  searchQuery,
  onSearchChange,
  results,
  isLoading,
  error,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  results: ArtifactoryItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">Search Artifacts</h4>
      <input
        className="w-full text-xs p-1.5 rounded border border-border bg-background"
        placeholder="Search by name..."
        value={searchQuery}
        onChange={(e) => {
          onSearchChange(e.target.value);
        }}
      />
      {isLoading && <p className="text-xs text-muted-foreground">Searching...</p>}
      {error && <p className="text-xs text-red-500">{error.message}</p>}
      {results?.length === 0 && <p className="text-xs text-muted-foreground">No results</p>}
      {(results ?? []).map((item: ArtifactoryItem, i: number) => (
        <div key={`${item.path}/${item.name}-${i}`} className="card p-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.name}</span>
              {item.sha256 && (
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  {item.sha256.slice(0, 12)}
                </span>
              )}
            </div>
            <span className="text-muted-foreground/60">{formatBytes(item.size)}</span>
          </div>
          {item.path && <p className="text-muted-foreground mt-0.5 truncate">{item.path}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
