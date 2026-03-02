/**
 * TopicCloudWidget — key phrase cloud with font sizes proportional to frequency.
 */

import type { KeyPhraseItem } from '../../api/client';

interface TopicCloudWidgetProps {
  phrases: KeyPhraseItem[];
  isLoading: boolean;
}

export function TopicCloudWidget({ phrases, isLoading }: TopicCloudWidgetProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading key phrases...
      </div>
    );
  }

  if (phrases.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No key phrases extracted yet
      </div>
    );
  }

  const maxFreq = Math.max(...phrases.map((p) => p.frequency));
  const minSize = 12;
  const maxSize = 28;

  return (
    <div className="flex flex-wrap gap-2 items-center" data-testid="topic-cloud">
      {phrases.map((p) => {
        const ratio = maxFreq > 0 ? p.frequency / maxFreq : 0.5;
        const size = minSize + ratio * (maxSize - minSize);
        const opacity = 0.5 + ratio * 0.5;
        return (
          <span
            key={p.id}
            className="text-foreground transition-opacity hover:opacity-100 cursor-default"
            style={{ fontSize: `${size}px`, opacity }}
            title={`${p.phrase} (${p.frequency})`}
          >
            {p.phrase}
          </span>
        );
      })}
    </div>
  );
}
