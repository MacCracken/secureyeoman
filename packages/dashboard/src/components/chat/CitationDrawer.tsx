/**
 * CitationDrawer — Slide-in panel showing full source content for a citation.
 *
 * Phase 110 — Inline Citations & Grounding
 */

import React, { useState } from 'react';
import { submitCitationFeedback } from '../../api/client';
import type { SourceReference } from '../../types';

interface CitationDrawerProps {
  source: SourceReference | null;
  messageId: string;
  onClose: () => void;
}

export function CitationDrawer({ source, messageId, onClose }: CitationDrawerProps) {
  const [feedbackSent, setFeedbackSent] = useState(false);

  if (!source) return null;

  const handleFeedback = async (relevant: boolean) => {
    try {
      await submitCitationFeedback(messageId, {
        citationIndex: source.index,
        sourceId: source.sourceId,
        relevant,
      });
      setFeedbackSent(true);
    } catch {
      // best-effort
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-sm">Source [{source.index}]</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Label</p>
          <p className="text-sm font-medium">{source.sourceLabel}</p>
        </div>

        {source.documentTitle && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Document
            </p>
            <p className="text-sm">{source.documentTitle}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</p>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs ${
              source.type === 'web_search'
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : source.type === 'document_chunk'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : source.type === 'memory'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {source.type.replace('_', ' ')}
          </span>
        </div>

        {source.url && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">URL</p>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {source.url}
            </a>
          </div>
        )}

        {source.confidence != null && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Confidence
            </p>
            <p className="text-sm">{(source.confidence * 100).toFixed(0)}%</p>
          </div>
        )}

        {source.trustScore != null && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Trust Score
            </p>
            <p className="text-sm">{(source.trustScore * 100).toFixed(0)}%</p>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Content
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
            {source.content}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        {feedbackSent ? (
          <p className="text-xs text-gray-500 text-center">Feedback recorded</p>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => void handleFeedback(true)}
              className="flex-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
            >
              Relevant
            </button>
            <button
              onClick={() => void handleFeedback(false)}
              className="flex-1 px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
            >
              Not Relevant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
