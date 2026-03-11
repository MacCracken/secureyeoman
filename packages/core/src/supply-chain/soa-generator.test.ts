import { describe, it, expect } from 'vitest';
import {
  enrichEntry,
  generateSoA,
  generateSoAJson,
  generateSoAMarkdown,
  type SoAEntry,
  type SoADocument,
} from './soa-generator.js';
import {
  getComplianceMappings,
  ALL_FRAMEWORKS,
  type ComplianceFramework,
} from './compliance-mapping.js';

// ── enrichEntry ──────────────────────────────────────────────────────────────

describe('enrichEntry', () => {
  it('returns SoAEntry with narrativeEvidence field', () => {
    const mapping = getComplianceMappings('nist-800-53')[0];
    const entry: SoAEntry = enrichEntry(mapping);

    expect(entry).toHaveProperty('narrativeEvidence');
    expect(typeof entry.narrativeEvidence).toBe('string');
    expect(entry.narrativeEvidence.length).toBeGreaterThan(0);
    // preserves original fields
    expect(entry.controlId).toBe(mapping.controlId);
    expect(entry.controlTitle).toBe(mapping.controlTitle);
    expect(entry.framework).toBe(mapping.framework);
    expect(entry.feature).toBe(mapping.feature);
    expect(entry.evidence).toBe(mapping.evidence);
    expect(entry.status).toBe(mapping.status);
  });

  it('uses NARRATIVE_MAP when available', () => {
    const mapping = getComplianceMappings('nist-800-53').find((m) => m.controlId === 'AC-2')!;
    const entry = enrichEntry(mapping);

    // The hand-written NARRATIVE_MAP entry for AC-2 mentions RBAC
    expect(entry.narrativeEvidence).toContain('role-based access control');
    expect(entry.narrativeEvidence).toContain('RBAC');
  });

  it('falls back to generated narrative when no NARRATIVE_MAP entry exists', () => {
    const fakeMapping = {
      controlId: 'ZZ-99',
      controlTitle: 'Fake Control',
      framework: 'nist-800-53' as ComplianceFramework,
      feature: 'Some Feature',
      evidence: 'some/file.ts',
      status: 'implemented' as const,
    };
    const entry = enrichEntry(fakeMapping);

    expect(entry.narrativeEvidence).toContain('This control is fully implemented');
    expect(entry.narrativeEvidence).toContain('"Some Feature"');
    expect(entry.narrativeEvidence).toContain('some/file.ts');
  });
});

// ── generateSoA ──────────────────────────────────────────────────────────────

describe('generateSoA', () => {
  it('returns array of SoAEntry objects', () => {
    const entries = generateSoA();

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toHaveProperty('narrativeEvidence');
      expect(entry).toHaveProperty('controlId');
      expect(entry).toHaveProperty('framework');
    }
  });

  it('filters to NIST framework only when passed nist-800-53', () => {
    const entries = generateSoA('nist-800-53');

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.framework).toBe('nist-800-53');
    }
  });
});

// ── generateSoAJson ──────────────────────────────────────────────────────────

describe('generateSoAJson', () => {
  it('returns SoADocument with generatedAt, version, controls, summary', () => {
    const doc: SoADocument = generateSoAJson();

    expect(doc).toHaveProperty('generatedAt');
    expect(doc).toHaveProperty('version');
    expect(doc).toHaveProperty('controls');
    expect(doc).toHaveProperty('summary');
    expect(typeof doc.generatedAt).toBe('string');
    expect(typeof doc.version).toBe('string');
    expect(Array.isArray(doc.controls)).toBe(true);
    expect(Array.isArray(doc.summary)).toBe(true);
    expect(doc.summary.length).toBe(ALL_FRAMEWORKS.length);
  });

  it('includes only SOC 2 controls when passed soc2', () => {
    const doc = generateSoAJson('soc2');

    expect(doc.framework).toBe('soc2');
    expect(doc.controls.length).toBeGreaterThan(0);
    for (const control of doc.controls) {
      expect(control.framework).toBe('soc2');
    }
    expect(doc.summary).toHaveLength(1);
    expect(doc.summary[0].framework).toBe('soc2');
  });
});

// ── generateSoAMarkdown ─────────────────────────────────────────────────────

describe('generateSoAMarkdown', () => {
  it('returns string starting with # Statement of Applicability', () => {
    const md = generateSoAMarkdown();

    expect(md.startsWith('# Statement of Applicability')).toBe(true);
  });

  it('includes coverage summary table', () => {
    const md = generateSoAMarkdown();

    expect(md).toContain('## Coverage Summary');
    expect(md).toContain('| Framework |');
    expect(md).toContain('Coverage');
  });

  it('scopes to HIPAA framework when passed hipaa', () => {
    const md = generateSoAMarkdown('hipaa');

    expect(md).toContain('HIPAA Security Rule');
    // Should NOT contain other framework section headings
    expect(md).not.toContain('## NIST SP 800-53');
    expect(md).not.toContain('## SOC 2 Type II');
  });
});

// ── All 5 frameworks produce non-empty SoA entries ──────────────────────────

describe('all frameworks produce non-empty SoA entries', () => {
  it.each(ALL_FRAMEWORKS)('framework "%s" produces non-empty SoA entries', (fw) => {
    const entries = generateSoA(fw);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.framework).toBe(fw);
      expect(entry.narrativeEvidence.length).toBeGreaterThan(0);
    }
  });
});
