import type { MissionCardId } from '../../MissionControl/registry';
import { CARD_REGISTRY } from '../../MissionControl/registry';
import { MissionCardEmbed } from './MissionCardEmbed';

interface Props {
  cardId?: string;
  onConfigChange?: (config: { missionCardId: string }) => void;
}

export function MissionCardNode({ cardId, onConfigChange }: Props) {
  const isValid = cardId && CARD_REGISTRY.some((c) => c.id === cardId);

  if (!cardId || !isValid) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground p-4 gap-2">
        <div className="text-center">Select a Mission Card to embed:</div>
        <select
          className="bg-muted border rounded px-2 py-1 text-xs w-full max-w-[220px]"
          value={cardId ?? ''}
          onChange={(e) => onConfigChange?.({ missionCardId: e.target.value })}
        >
          <option value="" disabled>
            Choose a card...
          </option>
          {CARD_REGISTRY.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return <MissionCardEmbed cardId={cardId as MissionCardId} />;
}
