import { describe, it, expect } from 'vitest';
import {
  REORGANIZATION_SYSTEM_PROMPT,
  buildClusterDecisionPrompt,
  buildKnowledgeMergePrompt,
  parseReorganizationResponse,
} from './reorganization-prompts.js';
import type { Memory, KnowledgeEntry } from '../types.js';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'm-1',
    personalityId: 'p-1',
    type: 'episodic',
    content: 'Test memory content',
    source: 'test',
    context: {},
    importance: 0.75,
    accessCount: 5,
    lastAccessedAt: Date.now(),
    expiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeKnowledge(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'k-1',
    personalityId: 'p-1',
    topic: 'Test Topic',
    content: 'Test knowledge content',
    source: 'test',
    confidence: 0.85,
    supersedes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('reorganization-prompts', () => {
  describe('REORGANIZATION_SYSTEM_PROMPT', () => {
    it('is non-empty and contains action types', () => {
      expect(REORGANIZATION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(REORGANIZATION_SYSTEM_PROMPT).toContain('PROMOTE');
      expect(REORGANIZATION_SYSTEM_PROMPT).toContain('DEMOTE');
      expect(REORGANIZATION_SYSTEM_PROMPT).toContain('MERGE');
      expect(REORGANIZATION_SYSTEM_PROMPT).toContain('SPLIT');
      expect(REORGANIZATION_SYSTEM_PROMPT).toContain('KEEP');
    });
  });

  describe('buildClusterDecisionPrompt', () => {
    it('includes memory type and importance', () => {
      const prompt = buildClusterDecisionPrompt([
        makeMemory({ type: 'episodic', importance: 0.75 }),
      ]);

      expect(prompt).toContain('episodic');
      expect(prompt).toContain('0.75');
    });

    it('includes access count', () => {
      const prompt = buildClusterDecisionPrompt([
        makeMemory({ accessCount: 42 }),
      ]);

      expect(prompt).toContain('accesses=42');
    });

    it('includes content from all memories', () => {
      const prompt = buildClusterDecisionPrompt([
        makeMemory({ content: 'First memory here' }),
        makeMemory({ id: 'm-2', content: 'Second memory here' }),
      ]);

      expect(prompt).toContain('First memory here');
      expect(prompt).toContain('Second memory here');
    });
  });

  describe('buildKnowledgeMergePrompt', () => {
    it('includes topic and confidence', () => {
      const prompt = buildKnowledgeMergePrompt([
        makeKnowledge({ topic: 'Neural Networks', confidence: 0.92 }),
      ]);

      expect(prompt).toContain('Neural Networks');
      expect(prompt).toContain('0.92');
    });

    it('includes content from all entries', () => {
      const prompt = buildKnowledgeMergePrompt([
        makeKnowledge({ content: 'Knowledge A' }),
        makeKnowledge({ id: 'k-2', content: 'Knowledge B' }),
      ]);

      expect(prompt).toContain('Knowledge A');
      expect(prompt).toContain('Knowledge B');
    });
  });

  describe('parseReorganizationResponse', () => {
    it('parses valid JSON array', () => {
      const response = JSON.stringify([
        { action: 'PROMOTE', id: 'm-1', reason: 'high access' },
        { action: 'KEEP', id: 'm-2', reason: 'uncertain' },
      ]);

      const result = parseReorganizationResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ action: 'PROMOTE', id: 'm-1', reason: 'high access' });
      expect(result[1]).toEqual({ action: 'KEEP', id: 'm-2', reason: 'uncertain' });
    });

    it('parses JSON from markdown code block', () => {
      const response = `Here is my analysis:
\`\`\`json
[{"action":"MERGE","id":"m-1","mergeWith":["m-2"],"reason":"similar content"}]
\`\`\``;

      const result = parseReorganizationResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('MERGE');
      expect(result[0].mergeWith).toEqual(['m-2']);
    });

    it('returns empty array for empty/invalid input', () => {
      expect(parseReorganizationResponse('')).toEqual([]);
      expect(parseReorganizationResponse('no json here')).toEqual([]);
      expect(parseReorganizationResponse('{}')).toEqual([]);
    });

    it('filters entries without required action and reason fields', () => {
      const response = JSON.stringify([
        { action: 'KEEP', id: 'm-1', reason: 'fine' },
        { action: 'PROMOTE', id: 'm-2' },          // missing reason
        { reason: 'some reason' },                   // missing action
        { action: 123, reason: 'wrong type' },       // action is not string
        null,
      ]);

      const result = parseReorganizationResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('KEEP');
    });
  });
});
