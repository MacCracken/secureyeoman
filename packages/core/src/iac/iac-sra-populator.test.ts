/**
 * IaC SRA Populator Tests
 */

import { describe, it, expect } from 'vitest';
import { IacSraPopulator } from './iac-sra-populator.js';

describe('IacSraPopulator', () => {
  it('returns built-in templates', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('all templates are marked as builtin', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    for (const t of templates) {
      expect(t.isBuiltin).toBe(true);
    }
  });

  it('all templates have SRA control IDs', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    for (const t of templates) {
      expect(t.sraControlIds.length).toBeGreaterThan(0);
    }
  });

  it('all templates have valid file hashes', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    for (const t of templates) {
      for (const f of t.files) {
        expect(f.sha256).toHaveLength(64);
      }
    }
  });

  it('templates cover AWS, Azure, and GCP', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    const providers = new Set(templates.map((t) => t.cloudProvider));
    expect(providers.has('aws')).toBe(true);
    expect(providers.has('azure')).toBe(true);
    expect(providers.has('gcp')).toBe(true);
  });

  it('all templates are Terraform tool type', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    for (const t of templates) {
      expect(t.tool).toBe('terraform');
    }
  });

  it('templates have non-empty files', () => {
    const templates = IacSraPopulator.getBuiltinTemplates();
    for (const t of templates) {
      expect(t.files.length).toBeGreaterThan(0);
      for (const f of t.files) {
        expect(f.content.length).toBeGreaterThan(0);
      }
    }
  });
});
