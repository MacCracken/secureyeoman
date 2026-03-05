import { useState, useEffect, useCallback } from 'react';
import {
  fetchPersonalityVersions,
  fetchPersonalityDrift,
  tagPersonalityRelease,
  rollbackPersonality,
  deletePersonalityTag,
  fetchPersonalityVersionDiff,
} from '../../api/client';

interface VersionEntry {
  id: string;
  personalityId: string;
  versionTag: string | null;
  snapshotMd: string;
  diffSummary: string | null;
  changedFields: string[];
  author: string;
  createdAt: number;
}

interface DriftInfo {
  lastTaggedVersion: string | null;
  lastTaggedAt: number | null;
  uncommittedChanges: number;
  changedFields: string[];
  diffSummary: string;
}

export default function PersonalityVersionHistory({ personalityId }: { personalityId: string }) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [drift, setDrift] = useState<DriftInfo | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VersionEntry | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffPair, setDiffPair] = useState<[string, string] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vResult, dResult] = await Promise.all([
        fetchPersonalityVersions(personalityId, { limit: 50 }),
        fetchPersonalityDrift(personalityId),
      ]);
      setVersions(vResult.versions);
      setTotal(vResult.total);
      setDrift(dResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [personalityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTag = async () => {
    try {
      await tagPersonalityRelease(personalityId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to tag release');
    }
  };

  const handleRollback = async (versionId: string) => {
    if (
      !window.confirm(
        'Roll back to this version? A new version entry will be created with the restored content.'
      )
    )
      return;
    try {
      await rollbackPersonality(personalityId, versionId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  };

  const handleDeleteTag = async (versionId: string, tag: string) => {
    if (!window.confirm(`Remove tag "${tag}" from this version?`)) return;
    try {
      await deletePersonalityTag(personalityId, versionId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
    }
  };

  const handleDiff = async (a: string, b: string) => {
    try {
      const result = await fetchPersonalityVersionDiff(personalityId, a, b);
      setDiffText(result.diff);
      setDiffPair([a, b]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute diff');
    }
  };

  if (loading && versions.length === 0) {
    return <div className="p-4 text-muted-foreground">Loading version history...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded">
          {error}
        </div>
      )}

      {/* Drift badge */}
      {drift?.lastTaggedVersion && (
        <div className="flex items-center justify-between bg-muted border border-border rounded px-4 py-3">
          <div>
            <span className="font-medium">Last release: </span>
            <span className="font-mono text-sm">{drift.lastTaggedVersion}</span>
            {drift.uncommittedChanges > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning">
                {drift.uncommittedChanges} uncommitted change
                {drift.uncommittedChanges > 1 ? 's' : ''}
              </span>
            )}
            {drift.uncommittedChanges === 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
                up to date
              </span>
            )}
          </div>
          <button
            onClick={handleTag}
            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
          >
            Tag Release
          </button>
        </div>
      )}

      {!drift?.lastTaggedVersion && (
        <div className="flex items-center justify-between bg-muted border border-border rounded px-4 py-3">
          <span className="text-muted-foreground">No tagged releases yet</span>
          <button
            onClick={handleTag}
            className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
          >
            Tag First Release
          </button>
        </div>
      )}

      {/* Version list */}
      <div>
        <h3 className="font-medium text-foreground mb-2">Versions ({total})</h3>
        {versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No versions recorded yet. Edit the personality to create the first version.
          </p>
        ) : (
          <div className="border border-border rounded divide-y divide-border">
            {versions.map((v, i) => {
              const isInitial = i === versions.length - 1;
              return (
                <div
                  key={v.id}
                  className={`px-4 py-3 hover:bg-muted/50 cursor-pointer ${
                    selectedVersion?.id === v.id ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => {
                    setSelectedVersion(selectedVersion?.id === v.id ? null : v);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.versionTag ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                          {v.versionTag}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTag(v.id, v.versionTag!);
                            }}
                            className="ml-0.5 hover:text-destructive"
                            title="Remove tag"
                          >
                            ×
                          </button>
                        </span>
                      ) : isInitial ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                          original
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">untagged</span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground/70">{v.author}</span>
                      {v.changedFields.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          [{v.changedFields.join(', ')}]
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {i < versions.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiff(versions[i + 1].id, v.id);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          diff
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRollback(v.id);
                        }}
                        className="text-xs text-warning hover:underline"
                      >
                        rollback
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Version preview */}
      {selectedVersion && (
        <div>
          <h3 className="font-medium text-foreground mb-2">
            Preview: {selectedVersion.versionTag || selectedVersion.id.slice(0, 8)}
          </h3>
          <pre className="bg-card border border-border text-foreground p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {selectedVersion.snapshotMd}
          </pre>
        </div>
      )}

      {/* Diff viewer */}
      {diffText !== null && diffPair && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-foreground">
              Diff: {diffPair[0].slice(0, 8)} vs {diffPair[1].slice(0, 8)}
            </h3>
            <button
              onClick={() => {
                setDiffText(null);
                setDiffPair(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <pre className="bg-card border border-border text-foreground p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {diffText.split('\n').map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith('+')
                    ? 'text-green-500'
                    : line.startsWith('-')
                      ? 'text-red-500'
                      : line.startsWith('@')
                        ? 'text-blue-500'
                        : ''
                }
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
