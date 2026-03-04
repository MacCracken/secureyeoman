import { describe, it, expect } from 'vitest';
import {
  getTemplateCategories,
  getTemplatesByCategory,
  getTemplate,
  getPalette,
  getAllPalettes,
} from './excalidraw-templates.js';

describe('excalidraw-templates', () => {
  describe('getTemplateCategories', () => {
    it('returns expected categories', () => {
      const cats = getTemplateCategories();
      expect(cats).toContain('data');
      expect(cats).toContain('compute');
      expect(cats).toContain('infrastructure');
      expect(cats).toContain('messaging');
      expect(cats).toContain('actors');
      expect(cats).toContain('security');
    });

    it('returns sorted array', () => {
      const cats = getTemplateCategories();
      const sorted = [...cats].sort();
      expect(cats).toEqual(sorted);
    });
  });

  describe('getTemplatesByCategory', () => {
    it('returns all templates when no category specified', () => {
      const all = getTemplatesByCategory();
      expect(all.length).toBeGreaterThanOrEqual(15);
    });

    it('filters by category', () => {
      const data = getTemplatesByCategory('data');
      expect(data.length).toBeGreaterThan(0);
      for (const t of data) {
        expect(t.category).toBe('data');
      }
    });

    it('returns empty array for unknown category', () => {
      const result = getTemplatesByCategory('nonexistent');
      expect(result).toEqual([]);
    });

    it('each template has name, description, category', () => {
      const all = getTemplatesByCategory();
      for (const t of all) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.category).toBeTruthy();
      }
    });
  });

  describe('getTemplate', () => {
    it('returns ExcalidrawElementSpec array for known template', () => {
      const specs = getTemplate('database');
      expect(specs).toBeDefined();
      expect(Array.isArray(specs)).toBe(true);
      expect(specs!.length).toBeGreaterThan(0);
      for (const s of specs!) {
        expect(s.type).toBeTruthy();
        expect(typeof s.x).toBe('number');
        expect(typeof s.y).toBe('number');
      }
    });

    it('applies anchor offset', () => {
      const specsAtOrigin = getTemplate('server', 0, 0)!;
      const specsOffset = getTemplate('server', 100, 200)!;
      expect(specsOffset[0]!.x).toBe(specsAtOrigin[0]!.x + 100);
      expect(specsOffset[0]!.y).toBe(specsAtOrigin[0]!.y + 200);
    });

    it('returns undefined for unknown template', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });

    it('all registered templates return valid specs', () => {
      const names = getTemplatesByCategory().map((t) => t.name);
      for (const name of names) {
        const specs = getTemplate(name);
        expect(specs).toBeDefined();
        expect(specs!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getPalette', () => {
    it('returns color object for known palette', () => {
      const palette = getPalette('default');
      expect(palette).toBeDefined();
      expect(palette!.name).toBe('Default');
      expect(palette!.stroke).toBeTruthy();
      expect(palette!.background).toBeTruthy();
      expect(palette!.fill).toBeTruthy();
      expect(palette!.text).toBeTruthy();
      expect(palette!.accent).toBeTruthy();
    });

    it('returns undefined for unknown palette', () => {
      expect(getPalette('nonexistent')).toBeUndefined();
    });

    it('all palettes have required fields', () => {
      const palettes = getAllPalettes();
      for (const [key, palette] of Object.entries(palettes)) {
        expect(palette.name).toBeTruthy();
        expect(palette.stroke).toMatch(/^#/);
        expect(palette.background).toMatch(/^#/);
        expect(key).toBeTruthy();
      }
    });
  });
});
