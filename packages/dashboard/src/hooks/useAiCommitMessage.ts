import { useState, useCallback } from 'react';
import { executeTerminalCommand, sendChatMessage } from '../api/client';

const MAX_DIFF_CHARS = 5000;

const PROMPT_PREFIX = `Analyze this git diff and generate a concise conventional commit message (type(scope): description). Only return the commit message, nothing else.

Diff stats:
`;

export function useAiCommitMessage(cwd: string, personalityId?: string | null) {
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const statResult = await executeTerminalCommand('git diff --cached --stat', cwd);
      const diffResult = await executeTerminalCommand('git diff --cached', cwd);

      const stat = statResult.output || '';
      const diff = (diffResult.output || '').substring(0, MAX_DIFF_CHARS);

      if (!stat.trim() && !diff.trim()) {
        setMessage('');
        return;
      }

      const prompt = `${PROMPT_PREFIX}${stat}\n\nDiff:\n${diff}`;

      const response = await sendChatMessage({
        message: prompt,
        personalityId: personalityId ?? undefined,
      });

      const generated = (response.content || '').trim();
      // Strip any surrounding quotes or markdown code fences
      const cleaned = generated
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```$/, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      setMessage(cleaned);
    } catch {
      setMessage('');
    } finally {
      setIsGenerating(false);
    }
  }, [cwd, personalityId]);

  return { generate, message, setMessage, isGenerating };
}
