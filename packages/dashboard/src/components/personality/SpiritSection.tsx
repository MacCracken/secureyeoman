import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  fetchPassions,
  createPassion,
  deletePassion,
  fetchInspirations,
  createInspiration,
  deleteInspiration,
  fetchPains,
  createPainEntry,
  deletePain,
} from '../../api/client';
import type { Passion, Inspiration, Pain } from '../../types';
import { CollapsibleSection } from './shared';

export function SpiritSection({
  includeArchetypes,
  onIncludeArchetypesChange,
  empathyResonance,
  onEmpathyResonanceChange,
}: {
  includeArchetypes: boolean;
  onIncludeArchetypesChange: (v: boolean) => void;
  empathyResonance: boolean;
  onEmpathyResonanceChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [newPassion, setNewPassion] = useState({ name: '', description: '', intensity: 0.5 });
  const [newInspiration, setNewInspiration] = useState({
    source: '',
    description: '',
    impact: 0.5,
  });
  const [newPain, setNewPain] = useState({ trigger: '', description: '', severity: 0.5 });

  const { data: passionsData } = useQuery({ queryKey: ['passions'], queryFn: fetchPassions });
  const { data: inspirationsData } = useQuery({
    queryKey: ['inspirations'],
    queryFn: fetchInspirations,
  });
  const { data: painsData } = useQuery({ queryKey: ['pains'], queryFn: fetchPains });

  const passions = passionsData?.passions ?? [];
  const inspirations = inspirationsData?.inspirations ?? [];
  const pains = painsData?.pains ?? [];

  const createPassionMut = useMutation({
    mutationFn: () => createPassion(newPassion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['passions'] });
      setNewPassion({ name: '', description: '', intensity: 0.5 });
    },
  });

  const deletePassionMut = useMutation({
    mutationFn: (id: string) => deletePassion(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['passions'] }),
  });

  const createInspirationMut = useMutation({
    mutationFn: () => createInspiration(newInspiration),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inspirations'] });
      setNewInspiration({ source: '', description: '', impact: 0.5 });
    },
  });

  const deleteInspirationMut = useMutation({
    mutationFn: (id: string) => deleteInspiration(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['inspirations'] }),
  });

  const createPainMut = useMutation({
    mutationFn: () => createPainEntry(newPain),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pains'] });
      setNewPain({ trigger: '', description: '', severity: 0.5 });
    },
  });

  const deletePainMut = useMutation({
    mutationFn: (id: string) => deletePain(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pains'] }),
  });

  return (
    <CollapsibleSection title="Spirit - Pathos">
      {/* Passions */}
      <div>
        <h4 className="text-sm font-medium mb-2">Passions</h4>
        <div className="space-y-1 mb-2">
          {passions.map((p: Passion) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.name}</strong> (intensity: {p.intensity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePassionMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Name"
              value={newPassion.name}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, name: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPassion.intensity}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, intensity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Intensity: ${newPassion.intensity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPassion.description}
              onChange={(e) => {
                setNewPassion((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPassionMut.mutate();
              }}
              disabled={!newPassion.name.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Inspirations */}
      <div>
        <h4 className="text-sm font-medium mb-2">Inspirations</h4>
        <div className="space-y-1 mb-2">
          {inspirations.map((i: Inspiration) => (
            <div
              key={i.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{i.source}</strong> (impact: {i.impact}){' '}
                {i.description && `— ${i.description}`}
              </span>
              <button
                onClick={() => {
                  deleteInspirationMut.mutate(i.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Source"
              value={newInspiration.source}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, source: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newInspiration.impact}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, impact: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Impact: ${newInspiration.impact}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newInspiration.description}
              onChange={(e) => {
                setNewInspiration((i) => ({ ...i, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createInspirationMut.mutate();
              }}
              disabled={!newInspiration.source.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Pains */}
      <div>
        <h4 className="text-sm font-medium mb-2">Pain Points</h4>
        <div className="space-y-1 mb-2">
          {pains.map((p: Pain) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
            >
              <span>
                <strong>{p.trigger}</strong> (severity: {p.severity}){' '}
                {p.description && `— ${p.description}`}
              </span>
              <button
                onClick={() => {
                  deletePainMut.mutate(p.id);
                }}
                className="text-destructive hover:text-destructive/80 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Trigger"
              value={newPain.trigger}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, trigger: e.target.value }));
              }}
              className="flex-1 px-2 py-1.5 text-sm rounded border bg-background"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={newPain.severity}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, severity: parseFloat(e.target.value) }));
              }}
              className="w-20"
              title={`Severity: ${newPain.severity}`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPain.description}
              onChange={(e) => {
                setNewPain((p) => ({ ...p, description: e.target.value }));
              }}
              className="flex-1 max-w-[calc(100%-80px)] px-2 py-1.5 text-sm rounded border bg-background"
            />
            <button
              onClick={() => {
                createPainMut.mutate();
              }}
              disabled={!newPain.trigger.trim()}
              className="btn btn-ghost px-3 py-1.5 text-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Morphogenesis */}
      <div className="flex items-center justify-between" data-testid="archetype-toggle">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">Morphogenesis</span>
          <span className="text-xs text-muted-foreground">
            Weaves the Sacred Archetypes into the system prompt — these are the foundational
            patterns that give this personality its actual shape and character
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchetypes}
            onChange={(e) => {
              onIncludeArchetypesChange(e.target.checked);
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
      </div>

      {/* Empathy Resonance */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">Empathy Resonance</span>
          <span className="text-xs text-muted-foreground">
            When enabled, the personality mirrors and adapts to the user's detected emotional
            register — matching tone, pacing, and affect to what the user is feeling
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={empathyResonance}
            onChange={(e) => {
              onEmpathyResonanceChange(e.target.checked);
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted-foreground/30 peer-checked:bg-success rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
      </div>
    </CollapsibleSection>
  );
}
