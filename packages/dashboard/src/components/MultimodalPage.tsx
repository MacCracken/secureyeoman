import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Eye,
  Mic,
  Volume2,
  Image,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { fetchMultimodalJobs, fetchSecurityPolicy } from '../api/client';

type JobType = 'vision' | 'stt' | 'tts' | 'image_gen';
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface MultimodalJob {
  id: string;
  type: JobType;
  status: JobStatus;
  platform?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: number;
}

const TYPE_ICONS: Record<JobType, React.ReactNode> = {
  vision: <Eye className="w-4 h-4" />,
  stt: <Mic className="w-4 h-4" />,
  tts: <Volume2 className="w-4 h-4" />,
  image_gen: <Image className="w-4 h-4" />,
};

const TYPE_LABELS: Record<JobType, string> = {
  vision: 'Vision',
  stt: 'Speech-to-Text',
  tts: 'Text-to-Speech',
  image_gen: 'Image Generation',
};

const STATUS_STYLES: Record<JobStatus, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'text-muted-foreground', icon: <Clock className="w-3.5 h-3.5" /> },
  running: { color: 'text-blue-500', icon: <Play className="w-3.5 h-3.5" /> },
  completed: { color: 'text-green-500', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed: { color: 'text-destructive', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const PAGE_SIZE = 20;

export function MultimodalPage({ embedded }: { embedded?: boolean } = {}) {
  const [typeFilter, setTypeFilter] = useState<JobType | ''>('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['multimodalJobs', typeFilter, statusFilter, page],
    queryFn: () =>
      fetchMultimodalJobs({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 5000,
  });

  const jobs = (data?.jobs ?? []) as unknown as MultimodalJob[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const enabled = securityPolicy?.allowMultimodal ?? false;

  // Stats
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  if (!enabled) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {!embedded && (
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Multimodal</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vision, speech, and image generation job viewer
            </p>
          </div>
        )}
        <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-3 text-sm text-yellow-600 dark:text-yellow-400">
          Multimodal processing is currently disabled. Enable it in Settings &gt; Security Policy.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Multimodal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vision, speech, and image generation job viewer
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard label="Total Jobs" value={total} />
        <StatCard label="Completed" value={completedCount} color="text-green-500" />
        <StatCard label="Failed" value={failedCount} color="text-destructive" />
        <StatCard
          label="Success Rate"
          value={
            completedCount + failedCount > 0
              ? `${((completedCount / (completedCount + failedCount)) * 100).toFixed(1)}%`
              : '-'
          }
        />
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-header flex flex-row items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h2 className="card-title text-base">Jobs</h2>
        </div>
        <div className="card-content space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as JobType | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-40"
            >
              <option value="">All Types</option>
              <option value="vision">Vision</option>
              <option value="stt">Speech-to-Text</option>
              <option value="tts">Text-to-Speech</option>
              <option value="image_gen">Image Generation</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as JobStatus | '');
                setPage(0);
              }}
              className="bg-card border border-border rounded-lg text-sm py-1.5 px-2 w-40"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No multimodal jobs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 w-8"></th>
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Platform</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const expanded = expandedId === job.id;
                    const status = STATUS_STYLES[job.status] ?? STATUS_STYLES.pending;
                    return (
                      <React.Fragment key={job.id}>
                        <tr
                          className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => setExpandedId(expanded ? null : job.id)}
                        >
                          <td className="py-2 pr-3">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {job.id.length > 8 ? `${job.id.slice(0, 8)}...` : job.id}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-1.5">
                              {TYPE_ICONS[job.type]}
                              {TYPE_LABELS[job.type] ?? job.type}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`flex items-center gap-1 ${status.color}`}>
                              {status.icon}
                              {job.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {job.durationMs != null ? `${job.durationMs}ms` : '-'}
                          </td>
                          <td className="py-2 pr-3">{job.platform ?? '-'}</td>
                          <td className="py-2">{new Date(job.createdAt).toLocaleString()}</td>
                        </tr>
                        {expanded && (
                          <tr key={`${job.id}-detail`} className="border-b bg-muted/20">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="space-y-2 text-xs">
                                {job.error && (
                                  <div>
                                    <span className="font-medium text-destructive">Error: </span>
                                    {job.error}
                                  </div>
                                )}
                                {job.input && (
                                  <div>
                                    <span className="font-medium">Input: </span>
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                      {JSON.stringify(job.input, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {job.output && (
                                  <div>
                                    <span className="font-medium">Output: </span>
                                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                      {JSON.stringify(job.output, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-1">
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <button
                  className="btn-ghost text-xs px-2 py-1"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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
