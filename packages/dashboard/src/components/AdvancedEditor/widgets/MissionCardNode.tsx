interface Props {
  cardId?: string;
}

export function MissionCardNode({ cardId }: Props) {
  if (!cardId) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
        No card selected. Edit the widget config to set a Mission Card ID.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
      <div>
        <div className="font-medium mb-1">Mission Card: {cardId}</div>
        <div className="text-[10px]">
          Card sections are embedded in Mission Control. Open the <strong>Mission Control</strong>{' '}
          view to see this card.
        </div>
      </div>
    </div>
  );
}
