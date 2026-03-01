import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface CiEvent {
  id: string;
  name: string;
  status: string;
  url?: string;
  provider: string;
  branch?: string;
}

async function fetchCiEvents(provider?: string): Promise<{ events: CiEvent[] }> {
  const token = localStorage.getItem('accessToken') ?? '';
  try {
    const toolName =
      provider === 'jenkins' ? 'jenkins_list_builds' :
      provider === 'gitlab' ? 'gitlab_list_pipelines' :
      'gha_list_runs';
    const res = await fetch('/api/v1/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: toolName, args: {} }),
    });
    if (!res.ok) return { events: [] };
    const data = await res.json() as { result?: unknown[] };
    const items = (data.result ?? []).slice(0, 10);
    return {
      events: items.map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: String(row.id ?? ''),
          name: String(row.name ?? 'Build'),
          status: String(row.status ?? 'unknown'),
          url: row.html_url ? String(row.html_url) : undefined,
          provider: provider ?? 'ci',
          branch: row.head_branch ? String(row.head_branch) : undefined,
        };
      }),
    };
  } catch {
    return { events: [] };
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success' || status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (status === 'failure' || status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === 'in_progress' || status === 'running') return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
  return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
}

interface Props {
  provider?: string;
}

export function CicdMonitorWidget({ provider }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['canvas-cicd-events', provider],
    queryFn: () => fetchCiEvents(provider),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-full p-2 space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-[11px]">
        <Activity className="w-3.5 h-3.5" />
        CI/CD Monitor {provider ? `— ${provider}` : ''}
      </div>
      {isLoading && <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />}
      <div className="flex-1 overflow-auto space-y-1">
        {(data?.events ?? []).map((evt) => (
          <div key={evt.id} className="flex items-center gap-2 p-1.5 rounded border text-[10px]">
            <StatusIcon status={evt.status} />
            <span className="flex-1 truncate">{evt.name}</span>
            {evt.branch && (
              <span className="text-muted-foreground truncate max-w-[60px]">{evt.branch}</span>
            )}
            {evt.url && (
              <a href={evt.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[9px]">
                &uarr;
              </a>
            )}
          </div>
        ))}
        {!isLoading && (data?.events ?? []).length === 0 && (
          <div className="text-muted-foreground text-[10px] text-center py-4">No recent CI events</div>
        )}
      </div>
    </div>
  );
}
