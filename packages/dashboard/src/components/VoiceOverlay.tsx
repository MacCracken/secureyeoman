import { useEffect, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceOverlayProps {
  isActive: boolean;
  audioLevel: number;
  duration: number;
  transcript?: string;
  error?: string | null;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `0:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function VoiceOverlay({
  isActive,
  audioLevel,
  duration,
  transcript,
  error,
}: VoiceOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isActive]);

  if (!isVisible && !isActive) return null;

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-50
        transition-all duration-300 ease-out
        ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-2xl p-4 min-w-[280px] max-w-md">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`
            w-4 h-4 rounded-full flex items-center justify-center
            ${isActive ? 'bg-red-500 animate-pulse' : 'bg-muted'}
          `}
          >
            {isActive ? (
              <Mic className="w-2.5 h-2.5 text-white" />
            ) : (
              <MicOff className="w-2.5 h-2.5 text-muted-foreground" />
            )}
          </div>

          <span className="font-medium text-sm">
            {error ? 'Error' : isActive ? 'Listening...' : 'Released'}
          </span>

          <div className="flex-1" />

          <span className="text-xs text-muted-foreground font-mono">
            {formatDuration(duration)}
          </span>
        </div>

        {error ? (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-2">{error}</div>
        ) : (
          <>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-100"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>

            {transcript && (
              <div className="text-sm bg-muted/50 rounded-lg p-2 min-h-[40px]">
                <span className="text-muted-foreground mr-2">You:</span>
                {transcript}
              </div>
            )}

            {!transcript && isActive && (
              <div className="text-xs text-muted-foreground text-center py-2">Speak now...</div>
            )}
          </>
        )}

        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Hold Ctrl+Shift+V</span>
            <span>{isActive ? 'Release to send' : 'Hold to talk'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
