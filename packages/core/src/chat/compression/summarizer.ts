/**
 * LLM Summarizer — Generates topic and bulk summaries using AI.
 */

import type { AIProvider } from '../../ai/providers/base.js';

export interface SummarizerDeps {
  aiProvider: AIProvider;
  model?: string;
}

/**
 * Summarize a group of messages into a topic-level summary (~200 tokens).
 */
export async function summarizeTopic(
  messages: Array<{ role: string; content: string }>,
  deps: SummarizerDeps,
): Promise<string> {
  const messageText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await deps.aiProvider.chat({
    messages: [
      {
        role: 'system',
        content: `You are a conversation summarizer. Produce a concise summary (approximately 200 tokens) of the following conversation segment. Preserve key facts, decisions, and action items. Write in third person.`,
      },
      {
        role: 'user',
        content: `Summarize this conversation segment:\n\n${messageText}`,
      },
    ],
    model: deps.model,
    stream: false,
    maxTokens: 300,
    temperature: 0.3,
  });

  return response.content;
}

/**
 * Merge multiple topic summaries into a bulk summary (~300 tokens).
 */
export async function summarizeBulk(
  topics: string[],
  deps: SummarizerDeps,
): Promise<string> {
  const topicText = topics
    .map((t, i) => `Topic ${i + 1}:\n${t}`)
    .join('\n\n');

  const response = await deps.aiProvider.chat({
    messages: [
      {
        role: 'system',
        content: `You are a conversation summarizer. Merge the following topic summaries into a single cohesive summary (approximately 300 tokens). Preserve the most important facts, decisions, and action items. Eliminate redundancy. Write in third person.`,
      },
      {
        role: 'user',
        content: `Merge these topic summaries:\n\n${topicText}`,
      },
    ],
    model: deps.model,
    stream: false,
    maxTokens: 400,
    temperature: 0.3,
  });

  return response.content;
}
