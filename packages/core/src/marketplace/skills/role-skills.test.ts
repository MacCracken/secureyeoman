/**
 * Role-Based Skills Tests
 * Validates design, development, infrastructure, finance, and security reference architecture skills.
 */

import { describe, it, expect } from 'vitest';
import { seniorWebDesignerSkill } from './senior-web-designer.js';
import { seniorSoftwareEngineerSkill } from './senior-software-engineer.js';
import { seniorSoftwareEngineerAuditSkill } from './senior-software-engineer-audit.js';
import { devopsSreSkill } from './devops-sre.js';
import { veteranFinancialManagerSkill } from './veteran-financial-manager.js';
import { securityReferenceArchitectureSkill } from './security-reference-architecture.js';

const ALL_SKILLS = [
  { name: 'Senior Web Designer', skill: seniorWebDesignerSkill, category: 'design' },
  { name: 'Senior Software Engineer', skill: seniorSoftwareEngineerSkill, category: 'development' },
  { name: 'Sr. Software Engineer - Audit / Code Review', skill: seniorSoftwareEngineerAuditSkill, category: 'development' },
  { name: 'Senior DevOps/SRE', skill: devopsSreSkill, category: 'infrastructure' },
  { name: 'Veteran Financial Manager/Trader', skill: veteranFinancialManagerSkill, category: 'finance' },
  { name: 'Security Reference Architecture', skill: securityReferenceArchitectureSkill, category: 'security' },
];

describe('Role-Based Skills', () => {
  describe('all skills have required fields', () => {
    for (const { name, skill, category } of ALL_SKILLS) {
      describe(name, () => {
        it('has name, description, category, author, version', () => {
          expect(skill.name).toBe(name);
          expect(skill.description).toBeTruthy();
          expect(skill.category).toBe(category);
          expect(skill.author).toBe('YEOMAN');
          expect(skill.version).toBeDefined();
        });

        it('has instructions as joined string', () => {
          expect(typeof skill.instructions).toBe('string');
          expect((skill.instructions as string).length).toBeGreaterThan(100);
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

        it('has routing=fuzzy', () => {
          expect(skill.routing).toBe('fuzzy');
        });
      });
    }
  });

  describe('autonomy levels', () => {
    it('most role skills are L1', () => {
      const l1Skills = [seniorWebDesignerSkill, seniorSoftwareEngineerSkill, seniorSoftwareEngineerAuditSkill, devopsSreSkill, veteranFinancialManagerSkill];
      for (const skill of l1Skills) {
        expect(skill.autonomyLevel, `${skill.name} should be L1`).toBe('L1');
      }
    });

    it('Security Reference Architecture is L2 (tool-calling)', () => {
      expect(securityReferenceArchitectureSkill.autonomyLevel).toBe('L2');
    });
  });

  describe('Security Reference Architecture has mcpToolsAllowed', () => {
    it('includes all 7 SRA tools', () => {
      const tools = securityReferenceArchitectureSkill.mcpToolsAllowed!;
      expect(tools).toContain('sra_list_blueprints');
      expect(tools).toContain('sra_get_blueprint');
      expect(tools).toContain('sra_create_blueprint');
      expect(tools).toContain('sra_assess');
      expect(tools).toContain('sra_get_assessment');
      expect(tools).toContain('sra_compliance_map');
      expect(tools).toContain('sra_summary');
      expect(tools).toHaveLength(7);
    });
  });

  describe('authorInfo present on Security Reference Architecture', () => {
    it('has authorInfo with github', () => {
      expect(securityReferenceArchitectureSkill.authorInfo).toBeDefined();
      expect(securityReferenceArchitectureSkill.authorInfo!.name).toBe('YEOMAN');
      expect(securityReferenceArchitectureSkill.authorInfo!.github).toBe('MacCracken');
    });
  });

  describe('trigger patterns match expected inputs', () => {
    it('Senior Web Designer matches "review my UI design"', () => {
      const matches = seniorWebDesignerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('review my UI design')
      );
      expect(matches).toBe(true);
    });

    it('Senior Web Designer matches "WCAG accessibility audit"', () => {
      const matches = seniorWebDesignerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('run a WCAG accessibility check')
      );
      expect(matches).toBe(true);
    });

    it('Senior Software Engineer matches "design a distributed system"', () => {
      const matches = seniorSoftwareEngineerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('design a distributed system for order processing')
      );
      expect(matches).toBe(true);
    });

    it('Senior Software Engineer matches "how should I implement caching"', () => {
      const matches = seniorSoftwareEngineerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('how should I implement caching for this service')
      );
      expect(matches).toBe(true);
    });

    it('Audit skill matches "review this code"', () => {
      const matches = seniorSoftwareEngineerAuditSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('review this code for issues')
      );
      expect(matches).toBe(true);
    });

    it('Audit skill matches "code audit"', () => {
      const matches = seniorSoftwareEngineerAuditSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('perform a code audit on this module')
      );
      expect(matches).toBe(true);
    });

    it('DevOps/SRE matches "kubernetes deployment"', () => {
      const matches = devopsSreSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('help with kubernetes deployment')
      );
      expect(matches).toBe(true);
    });

    it('DevOps/SRE matches "terraform infrastructure"', () => {
      const matches = devopsSreSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('write terraform for our infrastructure')
      );
      expect(matches).toBe(true);
    });

    it('DevOps/SRE matches "SRE observability"', () => {
      const matches = devopsSreSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('set up SRE observability monitoring')
      );
      expect(matches).toBe(true);
    });

    it('Financial Manager matches "analyze this stock"', () => {
      const matches = veteranFinancialManagerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('analyze this stock ticker')
      );
      expect(matches).toBe(true);
    });

    it('Financial Manager matches "portfolio risk assessment"', () => {
      const matches = veteranFinancialManagerSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('do a portfolio risk assessment')
      );
      expect(matches).toBe(true);
    });

    it('Security Reference Architecture matches "AWS SRA blueprint"', () => {
      const matches = securityReferenceArchitectureSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('review our AWS SRA security reference architecture')
      );
      expect(matches).toBe(true);
    });

    it('Security Reference Architecture matches "CISA zero trust"', () => {
      const matches = securityReferenceArchitectureSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('assess our CISA zero trust architecture')
      );
      expect(matches).toBe(true);
    });

    it('Security Reference Architecture matches "compliance mapping to NIST"', () => {
      const matches = securityReferenceArchitectureSkill.triggerPatterns!.some((p) =>
        new RegExp(p, 'i').test('NIST CSF compliance mapping')
      );
      expect(matches).toBe(true);
    });
  });

  describe('instruction content quality', () => {
    it('Senior Web Designer covers all 4 review areas', () => {
      const text = seniorWebDesignerSkill.instructions as string;
      expect(text).toContain('Visual Hierarchy');
      expect(text).toContain('Friction');
      expect(text).toContain('Technical Feasibility');
      expect(text).toContain('Accessibility');
    });

    it('Senior Software Engineer mentions core principles', () => {
      const text = seniorSoftwareEngineerSkill.instructions as string;
      expect(text).toContain('Clarity over Cleverness');
      expect(text).toContain('Context is King');
      expect(text).toContain('trade-off');
    });

    it('Audit skill covers all 6 review criteria', () => {
      const text = seniorSoftwareEngineerAuditSkill.instructions as string;
      expect(text).toContain('Logic & Safety');
      expect(text).toContain('Security');
      expect(text).toContain('Performance');
      expect(text).toContain('Readability');
      expect(text).toContain('Error Handling');
      expect(text).toContain('Testing Coverage');
    });

    it('Audit skill includes severity guidelines', () => {
      const text = seniorSoftwareEngineerAuditSkill.instructions as string;
      expect(text).toContain('HIGH');
      expect(text).toContain('MEDIUM');
      expect(text).toContain('LOW');
    });

    it('DevOps/SRE covers reliability, scalability, observability', () => {
      const text = devopsSreSkill.instructions as string;
      expect(text).toContain('Reliability First');
      expect(text).toContain('Scalability');
      expect(text).toContain('Observability');
      expect(text).toContain('Security & Compliance');
      expect(text).toContain('Automation');
    });

    it('Financial Manager includes bear/bull case framework', () => {
      const text = veteranFinancialManagerSkill.instructions as string;
      expect(text).toContain('Bear Case');
      expect(text).toContain('Bull Case');
      expect(text).toContain('Risk/Reward');
      expect(text).toContain("Veteran's Take");
    });

    it('Security Reference Architecture references SRA frameworks', () => {
      const text = securityReferenceArchitectureSkill.instructions as string;
      expect(text).toContain('AWS SRA');
      expect(text).toContain('CISA Zero Trust');
      expect(text).toContain('MCRA');
      expect(text).toContain('NIST CSF');
      expect(text).toContain('FedRAMP');
    });

    it('Security Reference Architecture covers all 7 assessment steps', () => {
      const text = securityReferenceArchitectureSkill.instructions as string;
      expect(text).toContain('Blueprint Selection');
      expect(text).toContain('Control Assessment');
      expect(text).toContain('Gap Analysis');
      expect(text).toContain('IaC Remediation');
      expect(text).toContain('Compliance Mapping');
      expect(text).toContain('Multi-Cloud');
      expect(text).toContain('Output Format');
    });
  });
});
