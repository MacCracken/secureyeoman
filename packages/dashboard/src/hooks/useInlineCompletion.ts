/**
 * useInlineCompletion — Copilot-style ghost text suggestions for Monaco.
 *
 * Registers a Monaco InlineCompletionsProvider that fetches suggestions
 * from the active personality via the /api/v1/ai/inline-complete endpoint.
 *
 * Ghost text appears as dimmed text after the cursor; press Tab to accept.
 */

import { useEffect, useRef, useCallback } from 'react';
import { fetchInlineCompletion } from '../api/client.js';

type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type Monaco = typeof import('monaco-editor');

const DEBOUNCE_MS = 500;

export interface InlineCompletionOptions {
  enabled: boolean;
  personalityId?: string | null;
}

export function useInlineCompletion(options: InlineCompletionOptions) {
  const { enabled, personalityId } = options;
  const disposableRef = useRef<{ dispose: () => void } | null>(null);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const cleanup = useCallback(() => {
    disposableRef.current?.dispose();
    disposableRef.current = null;
  }, []);

  const register = useCallback(() => {
    cleanup();
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    const provider = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position, _context, token) => {
        // Cancel any pending request
        abortController?.abort();
        if (debounceTimer) clearTimeout(debounceTimer);

        // Wait for debounce
        await new Promise<void>((resolve, reject) => {
          debounceTimer = setTimeout(resolve, DEBOUNCE_MS);
          token.onCancellationRequested(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            reject(new Error('cancelled'));
          });
        });

        if (token.isCancellationRequested) return { items: [] };

        const offset = model.getOffsetAt(position);
        const fullText = model.getValue();
        const prefix = fullText.slice(0, offset);
        const suffix = fullText.slice(offset);

        // Don't fetch for very short context
        if (prefix.trim().length < 5) return { items: [] };

        const language = model.getLanguageId();
        abortController = new AbortController();

        try {
          const { completion } = await fetchInlineCompletion({
            prefix,
            suffix,
            language,
            personalityId: personalityId ?? undefined,
          });

          if (!completion || token.isCancellationRequested) return { items: [] };

          return {
            items: [
              {
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          };
        } catch {
          return { items: [] };
        }
      },

      disposeInlineCompletions: () => {
        // No cleanup needed
      },
    });

    disposableRef.current = {
      dispose: () => {
        provider.dispose();
        if (debounceTimer) clearTimeout(debounceTimer);
        abortController?.abort();
      },
    };
  }, [enabled, personalityId, cleanup]);

  const bindEditor = useCallback(
    (editor: MonacoEditor, monaco: Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      register();
    },
    [register]
  );

  const unbindEditor = useCallback(() => {
    cleanup();
    editorRef.current = null;
    monacoRef.current = null;
  }, [cleanup]);

  // Re-register when options change
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      register();
    }
    return cleanup;
  }, [enabled, personalityId, register, cleanup]);

  return { bindEditor, unbindEditor };
}
