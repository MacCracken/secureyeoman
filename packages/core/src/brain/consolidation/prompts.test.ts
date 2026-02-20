import { describe, it, expect } from 'vitest';
import {
  CONSOLIDATION_SYSTEM_PROMPT,
  buildConsolidationPrompt,
  parseConsolidationResponse,
} from './prompts.js';
import type { ConsolidationCandidate } from './types.js';

const candidate: ConsolidationCandidate = {
  memoryId: 'mem-1',
  type: 'episodic',
  importance: 0.8,
  content: 'The user prefers dark mode.',
  similarMemories: [
    {
      id: 'mem-2',
      score: 0.92,
      importance: 0.7,
      content: 'User likes dark themes.',
    },
    {
      id: 'mem-3',
      score: 0.85,
      importance: 0.6,
      content: 'User enabled dark mode in settings.',
    },
  ],
};

describe('CONSOLIDATION_SYSTEM_PROMPT', () => {
  it('contains all action types', () => {
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('MERGE');
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('REPLACE');
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('KEEP_SEPARATE');
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('UPDATE');
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('SKIP');
  });

  it('mentions JSON array format', () => {
    expect(CONSOLIDATION_SYSTEM_PROMPT).toContain('JSON array');
  });
});

describe('buildConsolidationPrompt', () => {
  it('includes primary memory details', () => {
    const prompt = buildConsolidationPrompt([candidate]);
    expect(prompt).toContain('mem-1');
    expect(prompt).toContain('episodic');
    expect(prompt).toContain('0.8');
    expect(prompt).toContain('The user prefers dark mode.');
  });

  it('includes similar memories with scores', () => {
    const prompt = buildConsolidationPrompt([candidate]);
    expect(prompt).toContain('mem-2');
    expect(prompt).toContain('0.920');
    expect(prompt).toContain('User likes dark themes.');
    expect(prompt).toContain('mem-3');
    expect(prompt).toContain('User enabled dark mode in settings.');
  });

  it('numbers groups correctly', () => {
    const prompt = buildConsolidationPrompt([candidate, { ...candidate, memoryId: 'mem-4', similarMemories: [] }]);
    expect(prompt).toContain('Group 1:');
    expect(prompt).toContain('Group 2:');
  });

  it('handles empty candidates', () => {
    const prompt = buildConsolidationPrompt([]);
    expect(prompt).toContain('JSON array');
  });

  it('handles candidate with no similar memories', () => {
    const c = { ...candidate, similarMemories: [] };
    const prompt = buildConsolidationPrompt([c]);
    expect(prompt).toContain('mem-1');
  });
});

describe('parseConsolidationResponse', () => {
  it('parses valid JSON array', () => {
    const response = JSON.stringify([
      { type: 'MERGE', sourceIds: ['mem-1', 'mem-2'], mergedContent: 'merged', reason: 'duplicates' },
    ]);
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('MERGE');
    expect(result[0].sourceIds).toEqual(['mem-1', 'mem-2']);
    expect(result[0].reason).toBe('duplicates');
  });

  it('extracts JSON from markdown code block', () => {
    const response = `Here is the analysis:\n\`\`\`json\n[{"type":"KEEP_SEPARATE","sourceIds":["a"],"reason":"distinct"}]\n\`\`\``;
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('KEEP_SEPARATE');
  });

  it('extracts JSON from plain code block', () => {
    const response = '```\n[{"type":"SKIP","sourceIds":[],"reason":"unrelated"}]\n```';
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('SKIP');
  });

  it('returns empty array for no JSON array in response', () => {
    const result = parseConsolidationResponse('No JSON here at all');
    expect(result).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    const result = parseConsolidationResponse('[invalid json');
    expect(result).toEqual([]);
  });

  it('returns empty array if not an array', () => {
    const result = parseConsolidationResponse('{"type":"MERGE"}');
    expect(result).toEqual([]);
  });

  it('filters out invalid actions missing required fields', () => {
    const response = JSON.stringify([
      { type: 'MERGE', sourceIds: ['a'], reason: 'valid' },
      { sourceIds: ['b'], reason: 'missing type' },
      { type: 'SKIP', reason: 'missing sourceIds' },
      { type: 'REPLACE', sourceIds: ['c'] },  // missing reason
      null,
    ]);
    const result = parseConsolidationResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('MERGE');
  });

  it('preserves optional fields (mergedContent, updateData)', () => {
    const response = JSON.stringify([
      {
        type: 'MERGE',
        sourceIds: ['a', 'b'],
        mergedContent: 'combined info',
        reason: 'test',
      },
      {
        type: 'UPDATE',
        sourceIds: ['c'],
        updateData: { content: 'new content', importance: 0.9 },
        reason: 'update',
      },
    ]);
    const result = parseConsolidationResponse(response);
    expect(result[0].mergedContent).toBe('combined info');
    expect(result[1].updateData?.content).toBe('new content');
    expect(result[1].updateData?.importance).toBe(0.9);
  });
});
