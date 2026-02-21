/**
 * Skill Trust Tier tests
 */

import { describe, it, expect } from 'vitest';
import { applySkillTrustFilter, isReadOnlyTool } from './skill-trust.js';
import type { Tool } from '@secureyeoman/shared';
import type { SkillSource } from '@secureyeoman/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const readTool = (name: string): Tool => ({ name, description: `${name} tool` });

const READ_TOOLS: Tool[] = [
  readTool('get_memory'),
  readTool('list_skills'),
  readTool('search_knowledge'),
  readTool('read_file'),
  readTool('fetch_url'),
  readTool('query_db'),
  readTool('find_user'),
  readTool('check_health'),
  readTool('status_report'),
  readTool('inspect_process'),
];

const WRITE_TOOLS: Tool[] = [
  readTool('write_file'),
  readTool('delete_record'),
  readTool('execute_shell'),
  readTool('create_user'),
  readTool('update_config'),
  readTool('send_message'),
  readTool('http_post'),
  readTool('run_script'),
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

// ── isReadOnlyTool ────────────────────────────────────────────────────────────

describe('isReadOnlyTool', () => {
  it('returns true for read-only prefixes', () => {
    const readNames = [
      'get_memory', 'list_skills', 'read_file', 'search_db',
      'query_records', 'fetch_url', 'retrieve_doc', 'find_user',
      'lookup_entry', 'check_status', 'inspect_process', 'describe_table',
      'show_config', 'view_log', 'summarise_text', 'summarize_report',
      'analyze_output', 'analyse_data', 'extract_info', 'count_rows',
      'stat_cpu', 'stats_memory', 'info_disk', 'status_service',
      'ping_host', 'health_check',
    ];
    for (const name of readNames) {
      expect(isReadOnlyTool(name)).toBe(true);
    }
  });

  it('returns false for write / exec tool names', () => {
    const writeNames = [
      'write_file', 'delete_record', 'execute_shell', 'create_user',
      'update_config', 'send_message', 'http_post', 'run_script',
      'remove_entry', 'patch_config', 'insert_row',
    ];
    for (const name of writeNames) {
      expect(isReadOnlyTool(name)).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(isReadOnlyTool('GET_Memory')).toBe(true);
    expect(isReadOnlyTool('SEARCH_DOCS')).toBe(true);
  });
});

// ── applySkillTrustFilter — full-access sources ───────────────────────────────

describe('applySkillTrustFilter — full-access sources', () => {
  const fullAccessSources: SkillSource[] = ['user', 'ai_proposed', 'ai_learned', 'marketplace'];

  for (const source of fullAccessSources) {
    it(`returns all tools for source="${source}"`, () => {
      const result = applySkillTrustFilter(ALL_TOOLS, source);
      expect(result).toHaveLength(ALL_TOOLS.length);
      expect(result).toEqual(ALL_TOOLS);
    });
  }

  it('returns an empty array when tools list is empty (full-access)', () => {
    expect(applySkillTrustFilter([], 'user')).toHaveLength(0);
  });
});

// ── applySkillTrustFilter — community (read-only) ────────────────────────────

describe('applySkillTrustFilter — community source', () => {
  it('keeps only read-only tools for community skills', () => {
    const result = applySkillTrustFilter(ALL_TOOLS, 'community');
    for (const tool of result) {
      expect(isReadOnlyTool(tool.name)).toBe(true);
    }
  });

  it('strips all write/exec tools for community skills', () => {
    const result = applySkillTrustFilter(ALL_TOOLS, 'community');
    const resultNames = result.map((t) => t.name);
    for (const writeTool of WRITE_TOOLS) {
      expect(resultNames).not.toContain(writeTool.name);
    }
  });

  it('preserves all legitimate read tools for community skills', () => {
    const result = applySkillTrustFilter(READ_TOOLS, 'community');
    expect(result).toHaveLength(READ_TOOLS.length);
  });

  it('returns empty array when a community skill has only write tools', () => {
    const result = applySkillTrustFilter(WRITE_TOOLS, 'community');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when tools list is empty (community)', () => {
    expect(applySkillTrustFilter([], 'community')).toHaveLength(0);
  });

  it('filters correctly with a mixed set', () => {
    const mixed: Tool[] = [
      readTool('get_memory'),
      readTool('execute_shell'),
      readTool('list_users'),
      readTool('send_email'),
    ];
    const result = applySkillTrustFilter(mixed, 'community');
    const names = result.map((t) => t.name);
    expect(names).toContain('get_memory');
    expect(names).toContain('list_users');
    expect(names).not.toContain('execute_shell');
    expect(names).not.toContain('send_email');
  });
});
