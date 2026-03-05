/**
 * Productivity & Utility Skills Tests
 * Validates all productivity, utility, and SOP skills.
 */

import { describe, it, expect } from 'vitest';
import { summarizeTextSkill } from './summarize-text.js';
import { promptCraftSkill } from './prompt-craft.js';
import { contextEngineeringSkill } from './context-engineering.js';
import { intentEngineeringSkill } from './intent-engineering.js';
import { specificationEngineeringSkill } from './specification-engineering.js';
import { sopWriterSkill } from './sop-writer.js';

const ALL_SKILLS = [
  { name: 'Summarize Text', skill: summarizeTextSkill, category: 'utilities' },
  { name: 'Prompt Craft', skill: promptCraftSkill, category: 'productivity' },
  { name: 'Context Engineering', skill: contextEngineeringSkill, category: 'productivity' },
  { name: 'Intent Engineering', skill: intentEngineeringSkill, category: 'productivity' },
  {
    name: 'Specification Engineering',
    skill: specificationEngineeringSkill,
    category: 'productivity',
  },
  { name: 'SOP Writer', skill: sopWriterSkill, category: 'productivity' },
];

describe('Productivity & Utility Skills', () => {
  describe('all skills have required fields', () => {
    for (const { name, skill, category } of ALL_SKILLS) {
      describe(name, () => {
        it('has name, description, category, author, version', () => {
          expect(skill.name).toBe(name);
          expect(skill.description).toBeTruthy();
          expect(skill.category).toBe(category);
          expect(skill.author).toBe('YEOMAN');
          expect(skill.version).toBe('2026.3.1');
        });

        it('has instructions', () => {
          const text =
            typeof skill.instructions === 'string'
              ? skill.instructions
              : Array.isArray(skill.instructions)
                ? (skill.instructions as string[]).join('\n')
                : '';
          expect(text.length).toBeGreaterThan(50);
        });

        it('has description within length limit (2000 chars)', () => {
          expect(skill.description!.length).toBeLessThanOrEqual(2000);
        });

        it('has successCriteria within length limit (300 chars)', () => {
          expect(skill.successCriteria).toBeTruthy();
          expect(skill.successCriteria!.length).toBeLessThanOrEqual(300);
        });

        it('has tags array with entries', () => {
          expect(Array.isArray(skill.tags)).toBe(true);
          expect(skill.tags!.length).toBeGreaterThan(0);
        });

        it('has triggerPatterns that compile as valid regex', () => {
          expect(Array.isArray(skill.triggerPatterns)).toBe(true);
          expect(skill.triggerPatterns!.length).toBeGreaterThan(0);
          for (const pattern of skill.triggerPatterns!) {
            expect(() => new RegExp(pattern, 'i')).not.toThrow();
          }
        });

        it('has useWhen and doNotUseWhen', () => {
          expect(skill.useWhen).toBeTruthy();
          expect(skill.doNotUseWhen).toBeTruthy();
        });

        it('has routing=fuzzy and autonomyLevel=L1', () => {
          expect(skill.routing).toBe('fuzzy');
          expect(skill.autonomyLevel).toBe('L1');
        });
      });
    }
  });

  describe('authorInfo present on engineering skills', () => {
    const withAuthorInfo = [
      promptCraftSkill,
      contextEngineeringSkill,
      intentEngineeringSkill,
      specificationEngineeringSkill,
      sopWriterSkill,
    ];
    for (const skill of withAuthorInfo) {
      it(`${skill.name} has authorInfo`, () => {
        expect(skill.authorInfo).toBeDefined();
        expect(skill.authorInfo!.name).toBe('YEOMAN');
        expect(skill.authorInfo!.github).toBe('MacCracken');
      });
    }
  });

  describe('trigger patterns match expected inputs', () => {
    it('Summarize Text matches "summarize this document"', () => {
      const matches = summarizeTextSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('summarize this document')
      );
      expect(matches).toBe(true);
    });

    it('Summarize Text matches "give me a brief overview"', () => {
      const matches = summarizeTextSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('give me a brief overview')
      );
      expect(matches).toBe(true);
    });

    it('Summarize Text matches "tl;dr"', () => {
      const matches = summarizeTextSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('tl;dr of the above')
      );
      expect(matches).toBe(true);
    });

    it('Prompt Craft matches "improve my prompt"', () => {
      const matches = promptCraftSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('improve my prompt')
      );
      expect(matches).toBe(true);
    });

    it('Prompt Craft matches "this prompt is not working"', () => {
      const matches = promptCraftSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('this prompt is not working well')
      );
      expect(matches).toBe(true);
    });

    it('Context Engineering matches "design the context window"', () => {
      const matches = contextEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('design the context window for our agent')
      );
      expect(matches).toBe(true);
    });

    it('Context Engineering matches "RAG design"', () => {
      const matches = contextEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('help me with RAG design')
      );
      expect(matches).toBe(true);
    });

    it('Intent Engineering matches "clarify the intent"', () => {
      const matches = intentEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('clarify the intent of this request')
      );
      expect(matches).toBe(true);
    });

    it('Intent Engineering matches "what is the user trying to do"', () => {
      const matches = intentEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('what is the user trying to achieve')
      );
      expect(matches).toBe(true);
    });

    it('Specification Engineering matches "write a spec"', () => {
      const matches = specificationEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('write a spec for this feature')
      );
      expect(matches).toBe(true);
    });

    it('Specification Engineering matches "define acceptance criteria"', () => {
      const matches = specificationEngineeringSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('define acceptance criteria for this task')
      );
      expect(matches).toBe(true);
    });

    it('SOP Writer matches "write an SOP"', () => {
      const matches = sopWriterSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('write an SOP for incident response')
      );
      expect(matches).toBe(true);
    });

    it('SOP Writer matches "create a step-by-step procedure"', () => {
      const matches = sopWriterSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('create a step-by-step procedure for onboarding')
      );
      expect(matches).toBe(true);
    });

    it('SOP Writer matches "standard operating procedure"', () => {
      const matches = sopWriterSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('I need a standard operating procedure')
      );
      expect(matches).toBe(true);
    });
  });

  describe('instruction content quality', () => {
    it('Specification Engineering instructions mention all 4 sections', () => {
      const text = specificationEngineeringSkill.instructions!;
      expect(text).toContain('Problem Statement');
      expect(text).toContain('Acceptance Criteria');
      expect(text).toContain('Constraint');
      expect(text).toContain('Decomposition');
    });

    it('Context Engineering instructions mention Write/Select/Compress/Isolate', () => {
      const text = contextEngineeringSkill.instructions!;
      expect(text).toContain('**Write**');
      expect(text).toContain('**Select**');
      expect(text).toContain('**Compress**');
      expect(text).toContain('**Isolate**');
    });

    it('Intent Engineering instructions mention the 4-step process', () => {
      const text = intentEngineeringSkill.instructions!;
      expect(text).toContain('Step 1');
      expect(text).toContain('Step 2');
      expect(text).toContain('Step 3');
      expect(text).toContain('Step 4');
    });

    it('SOP Writer instructions list all 5 SOP types', () => {
      const text = sopWriterSkill.instructions!;
      expect(text).toContain('Checklist');
      expect(text).toContain('Hierarchical');
      expect(text).toContain('Flowchart');
      expect(text).toContain('Process SOP');
      expect(text).toContain('Emergency SOP');
    });

    it('Prompt Craft instructions cover technique selection', () => {
      const text = promptCraftSkill.instructions!;
      expect(text).toContain('Zero-shot');
      expect(text).toContain('Few-shot');
      expect(text).toContain('Chain-of-Thought');
      expect(text).toContain('Role prompting');
      expect(text).toContain('Prompt chaining');
    });
  });
});
