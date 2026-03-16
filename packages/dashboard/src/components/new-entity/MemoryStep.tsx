import { ChevronDown } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface MemoryStepProps {
  memory: WizardState['memory'];
  setMemory: WizardState['setMemory'];
  addMemoryMut: WizardState['addMemoryMut'];
  learnKnowledgeMut: WizardState['learnKnowledgeMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function MemoryStep({
  memory,
  setMemory,
  addMemoryMut,
  learnKnowledgeMut,
  goBack,
  handleClose,
}: MemoryStepProps) {
  const set = (patch: Partial<typeof memory>) => {
    setMemory((m) => ({ ...m, ...patch }));
  };
  const isMemory = memory.subtype === 'memory';
  const canSubmit = isMemory
    ? !!memory.content.trim() && !!memory.source.trim()
    : !!memory.topic.trim() && !!memory.knowledgeContent.trim();
  const isPending = addMemoryMut.isPending || learnKnowledgeMut.isPending;

  const handleSubmit = () => {
    set({ error: '' });
    if (isMemory) {
      addMemoryMut.mutate({
        type: memory.memType,
        content: memory.content.trim(),
        source: memory.source.trim(),
        importance: memory.importance,
      });
    } else {
      learnKnowledgeMut.mutate({
        topic: memory.topic.trim(),
        content: memory.knowledgeContent.trim(),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">Add Memory</h3>
      </div>

      {/* Subtype switcher */}
      <div className="flex rounded-lg border overflow-hidden text-sm">
        <button
          onClick={() => {
            set({ subtype: 'memory', error: '' });
          }}
          className={`flex-1 py-2 transition-colors ${isMemory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
        >
          Vector Memory
        </button>
        <button
          onClick={() => {
            set({ subtype: 'knowledge', error: '' });
          }}
          className={`flex-1 py-2 transition-colors ${!isMemory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
        >
          Knowledge Base
        </button>
      </div>

      {isMemory ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Memory Type</label>
            <select
              value={memory.memType}
              onChange={(e) => {
                set({ memType: e.target.value as typeof memory.memType });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
            >
              <option value="episodic">Episodic — specific events or experiences</option>
              <option value="semantic">Semantic — facts and concepts</option>
              <option value="procedural">Procedural — how-to knowledge</option>
              <option value="preference">Preference — user preferences</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Content *</label>
            <textarea
              value={memory.content}
              onChange={(e) => {
                set({ content: e.target.value, error: '' });
              }}
              className="w-full px-3 py-2 rounded border bg-background text-sm resize-none"
              rows={3}
              placeholder="The memory content to store..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Source *</label>
              <input
                type="text"
                value={memory.source}
                onChange={(e) => {
                  set({ source: e.target.value, error: '' });
                }}
                className="w-full px-3 py-2 rounded border bg-background"
                placeholder="e.g. user, system, chat"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Importance{' '}
                <span className="text-muted-foreground">({memory.importance.toFixed(1)})</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={memory.importance}
                onChange={(e) => {
                  set({ importance: parseFloat(e.target.value) });
                }}
                className="w-full mt-2"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Topic *</label>
            <input
              type="text"
              value={memory.topic}
              onChange={(e) => {
                set({ topic: e.target.value, error: '' });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
              placeholder="e.g. Project Architecture, API Design"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Content *</label>
            <textarea
              value={memory.knowledgeContent}
              onChange={(e) => {
                set({ knowledgeContent: e.target.value, error: '' });
              }}
              className="w-full px-3 py-2 rounded border bg-background text-sm resize-none"
              rows={5}
              placeholder="Markdown or plain text content to store in the knowledge base..."
            />
          </div>
        </>
      )}

      {memory.error && <p className="text-xs text-destructive">{memory.error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!canSubmit || isPending}
          className="btn btn-ghost"
          onClick={handleSubmit}
        >
          {isPending ? 'Saving...' : isMemory ? 'Add to Memory' : 'Save to Knowledge Base'}
        </button>
      </div>
    </div>
  );
}
