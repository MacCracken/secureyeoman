import { describe, it, expect } from 'vitest';
import { excalidrawDiagramSkill } from './excalidraw-diagram.js';

describe('excalidrawDiagramSkill', () => {
  it('has required fields', () => {
    expect(excalidrawDiagramSkill.name).toBe('Excalidraw Diagram');
    expect(excalidrawDiagramSkill.description).toBeTruthy();
    expect(excalidrawDiagramSkill.category).toBe('productivity');
    expect(excalidrawDiagramSkill.author).toBe('YEOMAN');
    expect(excalidrawDiagramSkill.instructions).toBeTruthy();
    expect(excalidrawDiagramSkill.triggerPatterns).toBeDefined();
    expect(excalidrawDiagramSkill.mcpToolsAllowed).toBeDefined();
  });

  it('has non-empty instructions string', () => {
    expect(typeof excalidrawDiagramSkill.instructions).toBe('string');
    expect((excalidrawDiagramSkill.instructions as string).length).toBeGreaterThan(100);
  });

  it('triggerPatterns compile as valid RegExp', () => {
    for (const pattern of excalidrawDiagramSkill.triggerPatterns!) {
      expect(() => new RegExp(pattern, 'i')).not.toThrow();
    }
  });

  it('mcpToolsAllowed includes all 4 excalidraw tools', () => {
    const tools = excalidrawDiagramSkill.mcpToolsAllowed!;
    expect(tools).toContain('excalidraw_create');
    expect(tools).toContain('excalidraw_validate');
    expect(tools).toContain('excalidraw_modify');
    expect(tools).toContain('excalidraw_templates');
    expect(tools).toHaveLength(4);
  });

  it('has routing and autonomyLevel', () => {
    expect(excalidrawDiagramSkill.routing).toBe('fuzzy');
    expect(excalidrawDiagramSkill.autonomyLevel).toBe('L1');
  });

  it('has useWhen and doNotUseWhen', () => {
    expect(excalidrawDiagramSkill.useWhen).toBeTruthy();
    expect(excalidrawDiagramSkill.doNotUseWhen).toBeTruthy();
  });

  it('has tags array', () => {
    expect(Array.isArray(excalidrawDiagramSkill.tags)).toBe(true);
    expect(excalidrawDiagramSkill.tags!.length).toBeGreaterThan(0);
  });
});
