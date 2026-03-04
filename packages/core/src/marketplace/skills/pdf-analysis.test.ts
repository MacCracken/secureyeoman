import { describe, it, expect } from 'vitest';
import { pdfAnalysisSkill } from './pdf-analysis.js';

describe('pdfAnalysisSkill', () => {
  it('has the correct name', () => {
    expect(pdfAnalysisSkill.name).toBe('PDF Analysis');
  });

  it('has the correct category', () => {
    expect(pdfAnalysisSkill.category).toBe('productivity');
  });

  it('has the correct author', () => {
    expect(pdfAnalysisSkill.author).toBe('YEOMAN');
  });

  it('allows all 11 PDF MCP tools', () => {
    expect(pdfAnalysisSkill.mcpToolsAllowed).toHaveLength(11);
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_extract_text');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_upload');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_analyze');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_search');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_compare');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_list');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_extract_pages');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_extract_tables');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_visual_analyze');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_summarize');
    expect(pdfAnalysisSkill.mcpToolsAllowed).toContain('pdf_form_fields');
  });

  it('has trigger patterns', () => {
    expect(pdfAnalysisSkill.triggerPatterns).toBeDefined();
    expect(pdfAnalysisSkill.triggerPatterns!.length).toBeGreaterThan(0);
  });

  it('uses fuzzy routing', () => {
    expect(pdfAnalysisSkill.routing).toBe('fuzzy');
  });

  it('has L1 autonomy level', () => {
    expect(pdfAnalysisSkill.autonomyLevel).toBe('L1');
  });
});
