import { X } from 'lucide-react';
import {
  CANVAS_WIDGET_REGISTRY,
  CATEGORY_LABELS,
  type CanvasWidgetType,
  type CanvasWidgetDef,
} from './canvas-registry';

interface WidgetCatalogProps {
  onAdd: (type: CanvasWidgetType) => void;
  onClose: () => void;
}

export function WidgetCatalog({ onAdd, onClose }: WidgetCatalogProps) {
  const grouped = CANVAS_WIDGET_REGISTRY.reduce<Record<string, CanvasWidgetDef[]>>((acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  }, {});

  const categories = ['development', 'ai-agents', 'monitoring', 'pipelines'] as const;

  return (
    <div className="fixed right-0 top-0 h-full w-72 bg-card border-l shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">Add Widget</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categories.map((cat) => {
          const widgets = grouped[cat] ?? [];
          if (!widgets.length) return null;
          return (
            <div key={cat}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat]}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {widgets.map((def) => (
                  <button
                    key={def.type}
                    onClick={() => { onAdd(def.type); onClose(); }}
                    className="text-left p-2.5 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="text-xs font-medium">{def.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {def.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
