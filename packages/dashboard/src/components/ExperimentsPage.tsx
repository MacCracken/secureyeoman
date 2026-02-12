import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Play, Square, Trash2, Loader2, Plus } from 'lucide-react';

interface Variant {
  id: string;
  name: string;
  config: Record<string, unknown>;
  trafficPercent: number;
}

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: string;
  variants: Variant[];
  createdAt: number;
  startedAt?: number;
  stoppedAt?: number;
}

const API_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('friday_token')}`,
});

async function fetchExperiments(): Promise<{ experiments: Experiment[]; total: number }> {
  const res = await fetch('/api/v1/experiments', { headers: API_HEADERS() });
  if (!res.ok) throw new Error('Failed to fetch experiments');
  return res.json();
}

async function createExperiment(data: { name: string; description: string; variants: Partial<Variant>[] }): Promise<{ experiment: Experiment }> {
  const res = await fetch('/api/v1/experiments', { method: 'POST', headers: API_HEADERS(), body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create experiment');
  return res.json();
}

async function startExperiment(id: string): Promise<void> {
  const res = await fetch(`/api/v1/experiments/${id}/start`, { method: 'POST', headers: API_HEADERS() });
  if (!res.ok) throw new Error('Failed to start experiment');
}

async function stopExperiment(id: string): Promise<void> {
  const res = await fetch(`/api/v1/experiments/${id}/stop`, { method: 'POST', headers: API_HEADERS() });
  if (!res.ok) throw new Error('Failed to stop experiment');
}

async function deleteExperiment(id: string): Promise<void> {
  const res = await fetch(`/api/v1/experiments/${id}`, { method: 'DELETE', headers: API_HEADERS() });
  if (!res.ok) throw new Error('Failed to delete experiment');
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'badge-info',
  running: 'badge-success',
  stopped: 'badge-warning',
  completed: 'badge-success',
};

export function ExperimentsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['experiments'], queryFn: fetchExperiments });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['experiments'] });
  const createMut = useMutation({ mutationFn: createExperiment, onSuccess: () => { invalidate(); setShowCreate(false); setName(''); setDescription(''); } });
  const startMut = useMutation({ mutationFn: startExperiment, onSuccess: invalidate });
  const stopMut = useMutation({ mutationFn: stopExperiment, onSuccess: invalidate });
  const deleteMut = useMutation({ mutationFn: deleteExperiment, onSuccess: invalidate });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A/B Experiments</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage experiments</p>
        </div>
        <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-4 h-4" /> New Experiment
        </button>
      </div>

      {showCreate && (
        <div className="card p-4 space-y-3">
          <input className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm" placeholder="Experiment name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button
            className="btn btn-primary"
            disabled={!name || createMut.isPending}
            onClick={() => createMut.mutate({
              name,
              description,
              variants: [
                { name: 'Control', config: {}, trafficPercent: 50 },
                { name: 'Variant A', config: {}, trafficPercent: 50 },
              ],
            })}
          >
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : !data?.experiments.length ? (
        <div className="card p-12 text-center">
          <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No experiments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.experiments.map((exp) => (
            <div key={exp.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{exp.name}</p>
                    <span className={`badge ${STATUS_STYLES[exp.status] ?? 'badge-info'}`}>{exp.status}</span>
                  </div>
                  {exp.description && <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{exp.variants.length} variants · Created {new Date(exp.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1">
                  {exp.status === 'draft' && (
                    <button className="btn btn-ghost p-2" onClick={() => startMut.mutate(exp.id)} title="Start"><Play className="w-4 h-4" /></button>
                  )}
                  {exp.status === 'running' && (
                    <button className="btn btn-ghost p-2" onClick={() => stopMut.mutate(exp.id)} title="Stop"><Square className="w-4 h-4" /></button>
                  )}
                  <button className="btn btn-ghost p-2 text-destructive" onClick={() => deleteMut.mutate(exp.id)} title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
