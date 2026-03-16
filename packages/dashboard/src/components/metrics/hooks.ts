/**
 * Card layout + drag-and-drop hook for Mission Control.
 */

import { useState, useCallback } from 'react';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { loadLayout, saveLayout, type CardLayout } from '../MissionControl/layout';

export function useCardLayout() {
  const [cardLayouts, setCardLayouts] = useState<CardLayout[]>(() => loadLayout().cards);

  const updateLayouts = useCallback((updated: CardLayout[]) => {
    setCardLayouts(updated);
    saveLayout({ version: 1, cards: updated });
  }, []);

  // ── DnD sensors ───────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const sorted = [...cardLayouts].sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((c) => c.id === active.id);
      const to = sorted.findIndex((c) => c.id === over.id);
      updateLayouts(arrayMove(sorted, from, to).map((c, i) => ({ ...c, order: i })));
    },
    [cardLayouts, updateLayouts]
  );

  return { cardLayouts, updateLayouts, sensors, handleDragEnd };
}
