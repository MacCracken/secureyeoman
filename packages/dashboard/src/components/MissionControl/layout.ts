import { CARD_REGISTRY, type MissionCardId } from './registry';

export const STORAGE_KEY = 'mission-control:layout';

export interface CardLayout {
  id: MissionCardId;
  visible: boolean;
  colSpan: 3 | 4 | 6 | 12;
  order: number;
}

export interface MissionLayout {
  version: 1;
  cards: CardLayout[];
}

export function defaultLayout(): MissionLayout {
  return {
    version: 1,
    cards: CARD_REGISTRY.map((def, i) => ({
      id: def.id,
      visible: def.defaultVisible,
      colSpan: def.defaultColSpan,
      order: i,
    })),
  };
}

/** Load + merge from localStorage. New cards not in saved layout get default values. */
export function loadLayout(): MissionLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    const saved = JSON.parse(raw) as MissionLayout;
    const savedIds = new Set(saved.cards.map((c) => c.id));
    const missing = CARD_REGISTRY.filter((def) => !savedIds.has(def.id)).map((def, i) => ({
      id: def.id,
      visible: def.defaultVisible,
      colSpan: def.defaultColSpan,
      order: saved.cards.length + i,
    }));
    return { version: 1, cards: [...saved.cards, ...missing] };
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout: MissionLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}
