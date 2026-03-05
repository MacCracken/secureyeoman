import { describe, it, expect } from 'vitest';
import {
  getComplianceMappings,
  getFrameworkSummary,
  getAllFrameworkSummaries,
  formatMappingMarkdown,
  ALL_FRAMEWORKS,
} from './compliance-mapping.js';
import type { ComplianceFramework } from './compliance-mapping.js';

describe('Compliance Mapping', () => {
  it('ALL_FRAMEWORKS contains 5 frameworks', () => {
    expect(ALL_FRAMEWORKS).toHaveLength(5);
    expect(ALL_FRAMEWORKS).toContain('nist-800-53');
    expect(ALL_FRAMEWORKS).toContain('soc2');
    expect(ALL_FRAMEWORKS).toContain('iso27001');
    expect(ALL_FRAMEWORKS).toContain('hipaa');
    expect(ALL_FRAMEWORKS).toContain('eu-ai-act');
  });

  it('returns all mappings when no framework specified', () => {
    const all = getComplianceMappings();
    expect(all.length).toBeGreaterThan(50);
  });

  it('filters by framework', () => {
    const nist = getComplianceMappings('nist-800-53');
    expect(nist.every((m) => m.framework === 'nist-800-53')).toBe(true);
    expect(nist.length).toBeGreaterThan(10);
  });

  it('returns empty array for unknown framework', () => {
    const mappings = getComplianceMappings('unknown' as ComplianceFramework);
    expect(mappings).toEqual([]);
  });

  it('each mapping has required fields', () => {
    const all = getComplianceMappings();
    for (const m of all) {
      expect(m.controlId).toBeTruthy();
      expect(m.controlTitle).toBeTruthy();
      expect(m.framework).toBeTruthy();
      expect(m.feature).toBeTruthy();
      expect(m.evidence).toBeTruthy();
      expect(['implemented', 'partial', 'planned']).toContain(m.status);
    }
  });

  describe('getFrameworkSummary', () => {
    it('returns summary for NIST 800-53', () => {
      const s = getFrameworkSummary('nist-800-53');
      expect(s.framework).toBe('nist-800-53');
      expect(s.total).toBeGreaterThan(0);
      expect(s.implemented).toBeGreaterThan(0);
      expect(s.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(s.coveragePercent).toBeLessThanOrEqual(100);
    });

    it('coverage math is correct', () => {
      for (const fw of ALL_FRAMEWORKS) {
        const s = getFrameworkSummary(fw);
        expect(s.implemented + s.partial + s.planned).toBe(s.total);
        if (s.total > 0) {
          expect(s.coveragePercent).toBe(Math.round((s.implemented / s.total) * 100));
        }
      }
    });
  });

  describe('getAllFrameworkSummaries', () => {
    it('returns one summary per framework', () => {
      const summaries = getAllFrameworkSummaries();
      expect(summaries).toHaveLength(ALL_FRAMEWORKS.length);
    });
  });

  describe('formatMappingMarkdown', () => {
    it('generates markdown with table headers', () => {
      const md = formatMappingMarkdown('soc2');
      expect(md).toContain('# Compliance Mapping');
      expect(md).toContain('SOC2');
      expect(md).toContain('Control ID');
      expect(md).toContain('Feature');
      expect(md).toContain('Evidence');
    });

    it('generates all-framework markdown when no filter', () => {
      const md = formatMappingMarkdown();
      expect(md).toContain('All Frameworks');
      // Should contain controls from multiple frameworks
      expect(md).toContain('nist-800-53');
      expect(md).toContain('soc2');
    });
  });

  describe('NIST 800-53 supply chain controls', () => {
    it('includes SR-3 (Supply Chain Controls)', () => {
      const nist = getComplianceMappings('nist-800-53');
      const sr3 = nist.find((m) => m.controlId === 'SR-3');
      expect(sr3).toBeDefined();
      expect(sr3!.feature).toContain('SBOM');
    });

    it('includes SR-4 (Provenance)', () => {
      const nist = getComplianceMappings('nist-800-53');
      const sr4 = nist.find((m) => m.controlId === 'SR-4');
      expect(sr4).toBeDefined();
      expect(sr4!.feature).toContain('provenance');
    });
  });

  describe('EU AI Act controls', () => {
    it('includes Art. 11 (Technical Documentation)', () => {
      const eu = getComplianceMappings('eu-ai-act');
      const art11 = eu.find((m) => m.controlId === 'Art. 11');
      expect(art11).toBeDefined();
      expect(art11!.feature).toContain('SBOM');
    });

    it('includes Art. 52 (Transparency for Users)', () => {
      const eu = getComplianceMappings('eu-ai-act');
      const art52 = eu.find((m) => m.controlId === 'Art. 52');
      expect(art52).toBeDefined();
      expect(art52!.feature).toContain('watermark');
    });
  });
});
