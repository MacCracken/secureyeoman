import { describe, it, expect } from 'vitest';
import {
  AgnosBridgeProfileSchema,
  AgnosBridgeToolCategorySchema,
  AGNOS_BRIDGE_CATEGORIES,
  getToolPrefixesForProfile,
  toolMatchesProfile,
  McpServiceConfigSchema,
} from '../mcp.js';

describe('AgnosBridgeProfileSchema', () => {
  it('accepts valid profiles', () => {
    const profiles = ['sensor', 'security', 'devops', 'web', 'analysis', 'full'];
    for (const p of profiles) {
      expect(AgnosBridgeProfileSchema.parse(p)).toBe(p);
    }
  });

  it('rejects invalid profiles', () => {
    expect(() => AgnosBridgeProfileSchema.parse('invalid')).toThrow();
    expect(() => AgnosBridgeProfileSchema.parse('')).toThrow();
    expect(() => AgnosBridgeProfileSchema.parse(123)).toThrow();
  });
});

describe('AGNOS_BRIDGE_CATEGORIES', () => {
  it('has all required categories', () => {
    const names = AGNOS_BRIDGE_CATEGORIES.map((c) => c.name);
    expect(names).toContain('core');
    expect(names).toContain('sensor');
    expect(names).toContain('security');
    expect(names).toContain('devops');
    expect(names).toContain('web');
    expect(names).toContain('analysis');
  });

  it('core category is in all profiles', () => {
    const core = AGNOS_BRIDGE_CATEGORIES.find((c) => c.name === 'core');
    expect(core).toBeDefined();
    expect(core!.profiles).toContain('sensor');
    expect(core!.profiles).toContain('security');
    expect(core!.profiles).toContain('devops');
    expect(core!.profiles).toContain('web');
    expect(core!.profiles).toContain('analysis');
    expect(core!.profiles).toContain('full');
  });

  it('every category has at least one tool prefix', () => {
    for (const cat of AGNOS_BRIDGE_CATEGORIES) {
      expect(cat.toolPrefixes.length).toBeGreaterThan(0);
    }
  });

  it('every category has at least one profile', () => {
    for (const cat of AGNOS_BRIDGE_CATEGORIES) {
      expect(cat.profiles.length).toBeGreaterThan(0);
    }
  });

  it('all categories include full profile', () => {
    for (const cat of AGNOS_BRIDGE_CATEGORIES) {
      expect(cat.profiles).toContain('full');
    }
  });

  it('validates against schema', () => {
    for (const cat of AGNOS_BRIDGE_CATEGORIES) {
      expect(() => AgnosBridgeToolCategorySchema.parse(cat)).not.toThrow();
    }
  });

  it('has no duplicate prefixes within a category', () => {
    for (const cat of AGNOS_BRIDGE_CATEGORIES) {
      const unique = new Set(cat.toolPrefixes);
      expect(unique.size).toBe(cat.toolPrefixes.length);
    }
  });
});

describe('getToolPrefixesForProfile', () => {
  it('full profile includes all prefixes', () => {
    const fullPrefixes = getToolPrefixesForProfile('full');
    // full should include every prefix from every category
    const allPrefixes = AGNOS_BRIDGE_CATEGORIES.flatMap((c) => c.toolPrefixes);
    const uniqueAll = [...new Set(allPrefixes)];
    for (const p of uniqueAll) {
      expect(fullPrefixes).toContain(p);
    }
  });

  it('sensor profile includes core and sensor prefixes', () => {
    const prefixes = getToolPrefixesForProfile('sensor');
    expect(prefixes).toContain('edge_');
    expect(prefixes).toContain('knowledge_');
    expect(prefixes).toContain('task_');
    // Should NOT include security-specific
    expect(prefixes).not.toContain('network_');
    expect(prefixes).not.toContain('docker_');
  });

  it('security profile includes security prefixes', () => {
    const prefixes = getToolPrefixesForProfile('security');
    expect(prefixes).toContain('network_');
    expect(prefixes).toContain('sec_');
    expect(prefixes).toContain('dlp_');
    expect(prefixes).toContain('twingate_');
    // Should also include core
    expect(prefixes).toContain('knowledge_');
  });

  it('devops profile includes devops prefixes', () => {
    const prefixes = getToolPrefixesForProfile('devops');
    expect(prefixes).toContain('docker_');
    expect(prefixes).toContain('gha_');
    expect(prefixes).toContain('git_');
    expect(prefixes).toContain('terminal_');
  });

  it('web profile includes web prefixes', () => {
    const prefixes = getToolPrefixesForProfile('web');
    expect(prefixes).toContain('web_');
    expect(prefixes).toContain('browser_');
  });

  it('analysis profile includes analysis prefixes', () => {
    const prefixes = getToolPrefixesForProfile('analysis');
    expect(prefixes).toContain('pdf_');
    expect(prefixes).toContain('chart_');
    expect(prefixes).toContain('excalidraw_');
  });
});

describe('toolMatchesProfile', () => {
  it('core tools match all profiles', () => {
    const profiles = ['sensor', 'security', 'devops', 'web', 'analysis', 'full'] as const;
    for (const p of profiles) {
      expect(toolMatchesProfile('knowledge_search', p)).toBe(true);
      expect(toolMatchesProfile('task_create', p)).toBe(true);
    }
  });

  it('edge tools match sensor and full only', () => {
    expect(toolMatchesProfile('edge_list', 'sensor')).toBe(true);
    expect(toolMatchesProfile('edge_list', 'full')).toBe(true);
    expect(toolMatchesProfile('edge_list', 'security')).toBe(false);
    expect(toolMatchesProfile('edge_list', 'devops')).toBe(false);
  });

  it('docker tools match devops and full only', () => {
    expect(toolMatchesProfile('docker_ps', 'devops')).toBe(true);
    expect(toolMatchesProfile('docker_ps', 'full')).toBe(true);
    expect(toolMatchesProfile('docker_ps', 'sensor')).toBe(false);
  });

  it('network tools match security and full only', () => {
    expect(toolMatchesProfile('network_scan', 'security')).toBe(true);
    expect(toolMatchesProfile('network_scan', 'full')).toBe(true);
    expect(toolMatchesProfile('network_scan', 'web')).toBe(false);
  });

  it('web tools match web and full only', () => {
    expect(toolMatchesProfile('web_scrape_markdown', 'web')).toBe(true);
    expect(toolMatchesProfile('web_scrape_markdown', 'full')).toBe(true);
    expect(toolMatchesProfile('web_scrape_markdown', 'sensor')).toBe(false);
  });

  it('unknown tools match no profiles', () => {
    expect(toolMatchesProfile('unknown_tool', 'full')).toBe(false);
    expect(toolMatchesProfile('random_thing', 'sensor')).toBe(false);
  });
});

describe('McpServiceConfigSchema agnosBridgeProfile', () => {
  it('defaults to full', () => {
    const config = McpServiceConfigSchema.parse({});
    expect(config.agnosBridgeProfile).toBe('full');
  });

  it('accepts valid profiles', () => {
    const config = McpServiceConfigSchema.parse({ agnosBridgeProfile: 'sensor' });
    expect(config.agnosBridgeProfile).toBe('sensor');
  });

  it('rejects invalid profiles', () => {
    expect(() => McpServiceConfigSchema.parse({ agnosBridgeProfile: 'invalid' })).toThrow();
  });
});
