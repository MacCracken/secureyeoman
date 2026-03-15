import { useState, useEffect, useCallback } from 'react';
import {
  fetchWorkflowVersions,
  fetchWorkflowDrift,
  tagWorkflowRelease,
  rollbackWorkflow,
  fetchWorkflowVersionDiff,
} from '../../api/client';

interface VersionEntry {
  id: string;
  workflowId: string;
  versionTag: string | null;
  snapshot: Record<string, unknown>;
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

export default function WorkflowVersionHistory({ workflowId }: { workflowId: string }) {
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
        fetchWorkflowVersions(workflowId, { limit: 50 }),
        fetchWorkflowDrift(workflowId),
      ]);
      setVersions(vResult.versions);
      setTotal(vResult.total);
      setDrift(dResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTag = async () => {
    try {
      await tagWorkflowRelease(workflowId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to tag release');
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!window.confirm('Are you sure you want to rollback to this version?')) return;
    try {
      await rollbackWorkflow(workflowId, versionId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  };

  const handleDiff = async (a: string, b: string) => {
    try {
      const result = await fetchWorkflowVersionDiff(workflowId, a, b);
      setDiffText(result.diff);
      setDiffPair([a, b]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute diff');
    }
  };

  if (loading && versions.length === 0) {
    return <div className="p-4 text-gray-500">Loading version history...</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
          {error}
        </div>
      )}

      {/* Drift badge */}
      {drift?.lastTaggedVersion && (
        <div className="flex items-center justify-between bg-gray-50 border rounded px-4 py-3">
          <div>
            <span className="font-medium">Last release: </span>
            <span className="font-mono text-sm">{drift.lastTaggedVersion}</span>
            {drift.uncommittedChanges > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                {drift.uncommittedChanges} uncommitted change
                {drift.uncommittedChanges > 1 ? 's' : ''}
              </span>
            )}
            {drift.uncommittedChanges === 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                up to date
              </span>
            )}
          </div>
          <button
            onClick={() => void handleTag()}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Tag Release
          </button>
        </div>
      )}

      {!drift?.lastTaggedVersion && (
        <div className="flex items-center justify-between bg-gray-50 border rounded px-4 py-3">
          <span className="text-gray-500">No tagged releases yet</span>
          <button
            onClick={() => void handleTag()}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Tag First Release
          </button>
        </div>
      )}

      {/* Version list */}
      <div>
        <h3 className="font-medium text-gray-700 mb-2">Versions ({total})</h3>
        {versions.length === 0 ? (
          <p className="text-gray-500 text-sm">No versions recorded yet.</p>
        ) : (
          <div className="border rounded divide-y">
            {versions.map((v, i) => (
              <div
                key={v.id}
                className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                  selectedVersion?.id === v.id ? 'bg-blue-50' : ''
                }`}
                onClick={() => {
                  setSelectedVersion(selectedVersion?.id === v.id ? null : v);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {v.versionTag ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {v.versionTag}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">untagged</span>
                    )}
                    <span className="text-sm text-gray-600">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">{v.author}</span>
                    {v.changedFields.length > 0 && (
                      <span className="text-xs text-gray-500">[{v.changedFields.join(', ')}]</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {i < versions.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiff(versions[i + 1].id, v.id);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        diff
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRollback(v.id);
                      }}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      rollback
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version preview */}
      {selectedVersion && (
        <div>
          <h3 className="font-medium text-gray-700 mb-2">
            Snapshot: {selectedVersion.versionTag || selectedVersion.id.slice(0, 8)}
          </h3>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {JSON.stringify(selectedVersion.snapshot, null, 2)}
          </pre>
        </div>
      )}

      {/* Diff viewer */}
      {diffText !== null && diffPair && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-700">
              Diff: {diffPair[0].slice(0, 8)} vs {diffPair[1].slice(0, 8)}
            </h3>
            <button
              onClick={() => {
                setDiffText(null);
                setDiffPair(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {diffText.split('\n').map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith('+')
                    ? 'text-green-400'
                    : line.startsWith('-')
                      ? 'text-red-400'
                      : line.startsWith('@')
                        ? 'text-cyan-400'
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
