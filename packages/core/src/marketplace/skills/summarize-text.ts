/**
 * Summarize Text Skill
 * Condenses long text into clear, concise summaries
 */

import type { MarketplaceSkill } from '@secureyeoman/shared';

export const summarizeTextSkill: Partial<MarketplaceSkill> = {
  name: 'Summarize Text',
  description: 'Condense long text into a clear, concise summary',
  category: 'utilities',
  author: 'YEOMAN',
  version: '1.0.0',
  instructions:
    'When the user asks you to summarize text, produce a concise summary that captures the key points. Structure the summary with bullet points for clarity. Keep the summary under 20% of the original length.',
  tags: ['summarize', 'text', 'utility'],
  triggerPatterns: [
    'summarize|summarise|condense|shorten|tl.?dr',
    '(give|write|create|make|produce).{0,20}(summary|overview|recap|digest)',
    'in (a )?(few|short|brief|concise) (words|sentences|points|bullets)',
  ],
  useWhen: 'User asks to summarize, condense, or shorten a piece of text',
  doNotUseWhen:
    'User wants the full original text preserved or is asking for expansion or elaboration',
  successCriteria:
    'A concise summary under 20% of the original length that captures all key points',
  routing: 'fuzzy',
  autonomyLevel: 'L1',
};
