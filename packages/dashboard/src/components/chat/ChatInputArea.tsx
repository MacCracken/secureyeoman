import { useRef, useEffect, useState, memo } from 'react';
import {
  Send,
  Loader2,
  Pencil,
  Check,
  X,
  ImagePlus,
} from 'lucide-react';
import { VoiceToggle } from '../VoiceToggle';
import { VoiceOverlay } from '../VoiceOverlay';
import type { useVoice } from '../../hooks/useVoice';
import type { usePushToTalk } from '../../hooks/usePushToTalk';

// ── ChatInputArea ─────────────────────────────────────────────────────────────

export interface ChatInputAreaProps {
  onSend: (text: string) => void;
  isPending: boolean;
  disabled?: boolean;
  editValue: string;
  onCancelEdit: () => void;
  isEditing: boolean;
  voice: ReturnType<typeof useVoice>;
  ptt: ReturnType<typeof usePushToTalk>;
  hasVision: boolean;
  hasAuditory: boolean;
  personalityName: string | undefined;
  onTyping: () => void;
}

export const ChatInputArea = memo(function ChatInputArea({
  onSend,
  isPending,
  disabled,
  editValue,
  onCancelEdit,
  isEditing,
  voice,
  ptt,
  hasVision,
  hasAuditory,
  personalityName,
  onTyping,
}: ChatInputAreaProps) {
  const [localInput, setLocalInput] = useState('');

  // Seed localInput from editValue when editing starts or the message changes
  useEffect(() => {
    setLocalInput(editValue);
  }, [editValue]);

  // Append voice transcript
  useEffect(() => {
    if (voice.transcript) {
      setLocalInput((prev) => prev + voice.transcript);
      voice.clearTranscript();
    }
  }, [voice.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // Append PTT transcript (detect new transcript via value change)
  const prevPttTranscript = useRef('');
  useEffect(() => {
    if (ptt.transcript && ptt.transcript !== prevPttTranscript.current) {
      setLocalInput((prev) => prev + ptt.transcript);
      prevPttTranscript.current = ptt.transcript;
    }
  }, [ptt.transcript]);

  const handleSend = () => {
    const trimmed = localInput.trim();
    if (!trimmed || isPending) return;
    onSend(trimmed);
    setLocalInput('');
  };

  const handleCancel = () => {
    setLocalInput('');
    onCancelEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t pt-4">
      {/* Edit mode indicator */}
      {isEditing && (
        <div className="flex items-center justify-between bg-primary/10 text-primary text-xs px-3 py-1.5 rounded-t-lg border border-b-0 border-primary/20 mb-0">
          <div className="flex items-center gap-1.5">
            <Pencil className="w-3 h-3" />
            <span>Editing message — history from this point will be replaced</span>
          </div>
          <button
            onClick={handleCancel}
            className="hover:opacity-80 transition-opacity"
            title="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex gap-2 sm:gap-3 items-end">
        {hasVision && (
          <button
            className="btn-ghost p-3 rounded-lg text-muted-foreground hover:text-foreground"
            title="Upload image (vision enabled)"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        )}
        <textarea
          value={localInput}
          onChange={(e) => {
            setLocalInput(e.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? 'No AI provider keys configured. Add one in Administration > Secrets.'
              : `Message ${personalityName ?? 'the assistant'}...`
          }
          disabled={isPending || disabled}
          rows={3}
          className="flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[80px] max-h-[200px]"
        />
        {hasAuditory && (
          <VoiceToggle
            voiceEnabled={voice.voiceEnabled}
            isListening={voice.isListening}
            isSpeaking={voice.isSpeaking}
            supported={voice.supported}
            onToggle={voice.toggleVoice}
          />
        )}
        <button
          onClick={handleSend}
          disabled={!localInput.trim() || isPending || disabled}
          className="btn btn-ghost px-3 py-3 rounded-lg disabled:opacity-50 h-[52px]"
          title={isEditing ? 'Update and resend' : 'Send message'}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isEditing ? (
            <Check className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <VoiceOverlay
        isActive={ptt.isActive}
        audioLevel={ptt.audioLevel}
        duration={ptt.duration}
        transcript={ptt.transcript}
        error={ptt.error}
      />
    </div>
  );
});
