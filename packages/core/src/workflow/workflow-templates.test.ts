/**
 * Workflow Templates Tests
 *
 * Validates the structure of the built-in workflow template definitions.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_WORKFLOW_TEMPLATES } from './workflow-templates.js';

describe('BUILTIN_WORKFLOW_TEMPLATES', () => {
  it('exports an array of templates', () => {
    expect(Array.isArray(BUILTIN_WORKFLOW_TEMPLATES)).toBe(true);
    expect(BUILTIN_WORKFLOW_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('each template has required fields', () => {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      expect(typeof tpl.name).toBe('string');
      expect(typeof tpl.description).toBe('string');
      expect(Array.isArray(tpl.steps)).toBe(true);
      expect(Array.isArray(tpl.edges)).toBe(true);
      expect(Array.isArray(tpl.triggers)).toBe(true);
      expect(typeof tpl.isEnabled).toBe('boolean');
    }
  });

  it('each step has required fields', () => {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      for (const step of tpl.steps) {
        expect(typeof step.id).toBe('string');
        expect(typeof step.type).toBe('string');
        expect(typeof step.name).toBe('string');
        expect(Array.isArray(step.dependsOn)).toBe(true);
      }
    }
  });

  it('includes research-report-pipeline template', () => {
    const tpl = BUILTIN_WORKFLOW_TEMPLATES.find((t) => t.name === 'research-report-pipeline');
    expect(tpl).toBeDefined();
    expect(tpl!.steps.some((s) => s.id === 'researcher')).toBe(true);
    expect(tpl!.steps.some((s) => s.id === 'analyst')).toBe(true);
  });

  it('includes code-review-webhook template', () => {
    const tpl = BUILTIN_WORKFLOW_TEMPLATES.find((t) => t.name === 'code-review-webhook');
    expect(tpl).toBeDefined();
    expect(tpl!.steps.some((s) => s.type === 'swarm')).toBe(true);
    expect(tpl!.steps.some((s) => s.type === 'condition')).toBe(true);
  });

  it('includes parallel-intelligence-gather template', () => {
    const tpl = BUILTIN_WORKFLOW_TEMPLATES.find((t) => t.name === 'parallel-intelligence-gather');
    expect(tpl).toBeDefined();
    // Three parallel research agents
    const agentSteps = tpl!.steps.filter((s) => s.type === 'agent');
    expect(agentSteps.length).toBeGreaterThanOrEqual(3);
  });
});
