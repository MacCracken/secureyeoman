/**
 * Security Skills Tests — Phase 107-B
 * Validates all 7 security prompt template skills and 2 companion workflow templates.
 */

import { describe, it, expect } from 'vitest';
import { strideThreatModelSkill } from './stride-threat-model.js';
import { sigmaRuleGeneratorSkill } from './sigma-rule-generator.js';
import { malwareAnalysisSkill } from './malware-analysis.js';
import { emailHeaderForensicsSkill } from './email-header-forensics.js';
import { ttrcAnalysisSkill } from './ttrc-analysis.js';
import { securityArchitectureReviewSkill } from './security-architecture-review.js';
import { securityLogAnalysisSkill } from './security-log-analysis.js';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../../workflow/workflow-templates.js';

const ALL_SKILLS = [
  { name: 'STRIDE Threat Model', skill: strideThreatModelSkill },
  { name: 'SIGMA Rule Generator', skill: sigmaRuleGeneratorSkill },
  { name: 'Malware Analysis', skill: malwareAnalysisSkill },
  { name: 'Email Header Forensics', skill: emailHeaderForensicsSkill },
  { name: 'TTRC Analysis', skill: ttrcAnalysisSkill },
  { name: 'Security Architecture Review', skill: securityArchitectureReviewSkill },
  { name: 'Security Log Analysis', skill: securityLogAnalysisSkill },
];

describe('Phase 107-B — Security Prompt Template Skills', () => {
  describe('all 7 skills have required fields', () => {
    for (const { name, skill } of ALL_SKILLS) {
      describe(name, () => {
        it('has name, description, category, author, version', () => {
          expect(skill.name).toBe(name);
          expect(skill.description).toBeTruthy();
          expect(skill.category).toBe('security');
          expect(skill.author).toBe('YEOMAN');
          expect(skill.version).toBe('2026.3.2');
        });

        it('has authorInfo', () => {
          expect(skill.authorInfo).toBeDefined();
          expect(skill.authorInfo!.name).toBe('YEOMAN');
          expect(skill.authorInfo!.github).toBe('MacCracken');
        });

        it('has instructions within length limit (8000 chars)', () => {
          expect(typeof skill.instructions).toBe('string');
          expect(skill.instructions!.length).toBeGreaterThan(100);
          expect(skill.instructions!.length).toBeLessThanOrEqual(8000);
        });

        it('has description within length limit (2000 chars)', () => {
          expect(skill.description!.length).toBeLessThanOrEqual(2000);
        });

        it('has successCriteria within length limit (300 chars)', () => {
          expect(skill.successCriteria).toBeTruthy();
          expect(skill.successCriteria!.length).toBeLessThanOrEqual(300);
        });

        it('has tags array', () => {
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

  describe('trigger patterns match expected inputs', () => {
    it('STRIDE matches "threat model"', () => {
      const matches = strideThreatModelSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('perform a stride threat model on our API')
      );
      expect(matches).toBe(true);
    });

    it('SIGMA matches "create detection rule"', () => {
      const matches = sigmaRuleGeneratorSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('create a sigma detection rule for lateral movement')
      );
      expect(matches).toBe(true);
    });

    it('Malware matches "analyze this malware sample"', () => {
      const matches = malwareAnalysisSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('analyze this malware sample')
      );
      expect(matches).toBe(true);
    });

    it('Email matches "check email headers"', () => {
      const matches = emailHeaderForensicsSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('check these email headers for spoofing')
      );
      expect(matches).toBe(true);
    });

    it('TTRC matches "time to remediate"', () => {
      const matches = ttrcAnalysisSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('calculate our time to remediate ratio')
      );
      expect(matches).toBe(true);
    });

    it('Architecture Review matches "security architecture review"', () => {
      const matches = securityArchitectureReviewSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('do a security architecture review of our platform')
      );
      expect(matches).toBe(true);
    });

    it('Log Analysis matches "analyze security logs"', () => {
      const matches = securityLogAnalysisSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('analyze these security log entries')
      );
      expect(matches).toBe(true);
    });
  });
});

describe('Phase 107-B — Security Workflow Templates', () => {
  const strideTemplate = BUILTIN_WORKFLOW_TEMPLATES.find(
    (t) => t.name === 'stride-threat-analysis'
  );
  const archReviewTemplate = BUILTIN_WORKFLOW_TEMPLATES.find(
    (t) => t.name === 'security-architecture-review'
  );

  it('stride-threat-analysis template exists', () => {
    expect(strideTemplate).toBeDefined();
  });

  it('stride-threat-analysis has 3 steps: agent → transform → resource', () => {
    expect(strideTemplate!.steps).toHaveLength(3);
    expect(strideTemplate!.steps[0].type).toBe('agent');
    expect(strideTemplate!.steps[1].type).toBe('transform');
    expect(strideTemplate!.steps[2].type).toBe('resource');
  });

  it('stride-threat-analysis has correct edges', () => {
    expect(strideTemplate!.edges).toHaveLength(2);
    expect(strideTemplate!.edges[0]).toEqual({
      source: 'stride-analysis',
      target: 'format-report',
    });
    expect(strideTemplate!.edges[1]).toEqual({
      source: 'format-report',
      target: 'save-to-kb',
    });
  });

  it('stride-threat-analysis is manual trigger, L2 autonomy', () => {
    expect(strideTemplate!.triggers).toEqual([{ type: 'manual', config: {} }]);
    expect(strideTemplate!.autonomyLevel).toBe('L2');
  });

  it('security-architecture-review template exists', () => {
    expect(archReviewTemplate).toBeDefined();
  });

  it('security-architecture-review has 3 steps: agent → human_approval → resource', () => {
    expect(archReviewTemplate!.steps).toHaveLength(3);
    expect(archReviewTemplate!.steps[0].type).toBe('agent');
    expect(archReviewTemplate!.steps[1].type).toBe('human_approval');
    expect(archReviewTemplate!.steps[2].type).toBe('resource');
  });

  it('security-architecture-review has correct edges', () => {
    expect(archReviewTemplate!.edges).toHaveLength(2);
    expect(archReviewTemplate!.edges[0]).toEqual({
      source: 'arch-review',
      target: 'approval',
    });
    expect(archReviewTemplate!.edges[1]).toEqual({
      source: 'approval',
      target: 'save-approved',
    });
  });

  it('security-architecture-review is manual trigger, L3 autonomy', () => {
    expect(archReviewTemplate!.triggers).toEqual([{ type: 'manual', config: {} }]);
    expect(archReviewTemplate!.autonomyLevel).toBe('L3');
  });

  it('security-architecture-review human approval has 24h timeout', () => {
    const approvalStep = archReviewTemplate!.steps[1];
    expect((approvalStep.config as any).timeoutMs).toBe(86_400_000);
  });
});
