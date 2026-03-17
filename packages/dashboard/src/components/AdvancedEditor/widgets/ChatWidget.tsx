import { useState, useRef, useEffect } from 'react';
import { useChatStream } from '../../../hooks/useChat';
import { Send, Loader2 } from 'lucide-react';
import { ChatMarkdown } from '../../ChatMarkdown';
import { sanitizeText } from '../../../utils/sanitize';

export function ChatWidget() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, isPending, sendMessage } = useChatStream();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isPending) return;
    void sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-2 space-y-2 text-xs">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[90%] rounded p-2 text-xs ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {msg.role === 'user' ? (
                <span>{sanitizeText(msg.content)}</span>
              ) : (
                <ChatMarkdown content={msg.content} />
              )}
            </div>
          </div>
        ))}
        {isPending && (
          <div className="text-muted-foreground animate-pulse text-xs">Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 border-t">
        <input
          className="flex-1 text-xs rounded border px-2 py-1 bg-background"
          placeholder="Ask anything..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isPending}
        />
        <button
          onClick={handleSend}
          disabled={isPending || !input.trim()}
          className="p-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
