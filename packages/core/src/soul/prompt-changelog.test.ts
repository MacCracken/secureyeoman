import { describe, it, expect } from 'vitest';
import { PromptChangelog } from './prompt-changelog.js';

describe('PromptChangelog', () => {
  it('adds and retrieves entries', () => {
    const changelog = new PromptChangelog();
    const entry = changelog.addEntry({
      personalityId: 'p1',
      author: 'admin',
      category: 'safety',
      rationale: 'Added safety boundaries',
      changedFields: ['systemPrompt'],
      currentPrompt: 'Updated prompt',
      previousPrompt: 'Old prompt',
      diffSummary: '-Old\n+Updated',
      versionTag: 'v1.0',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(changelog.size).toBe(1);
  });

  it('getEntries filters by personalityId', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'behavior',
      rationale: 'r',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });
    changelog.addEntry({
      personalityId: 'p2',
      author: 'a',
      category: 'tone',
      rationale: 'r',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    expect(changelog.getEntries('p1')).toHaveLength(1);
    expect(changelog.getEntries('p2')).toHaveLength(1);
    expect(changelog.getEntries()).toHaveLength(2);
  });

  it('getEntries respects limit', () => {
    const changelog = new PromptChangelog();
    for (let i = 0; i < 5; i++) {
      changelog.addEntry({
        personalityId: 'p1',
        author: 'a',
        category: 'other',
        rationale: `change ${i}`,
        changedFields: [],
        currentPrompt: `prompt ${i}`,
        previousPrompt: null,
        diffSummary: null,
        versionTag: null,
      });
    }

    expect(changelog.getEntries('p1', 3)).toHaveLength(3);
  });

  it('getEntries returns most recent first', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'other',
      rationale: 'first',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });
    changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'other',
      rationale: 'second',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    const entries = changelog.getEntries('p1');
    expect(entries[0]!.rationale).toBe('second');
    expect(entries[1]!.rationale).toBe('first');
  });

  it('getEntry returns by id', () => {
    const changelog = new PromptChangelog();
    const entry = changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'compliance',
      rationale: 'r',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    expect(changelog.getEntry(entry.id)).toBeTruthy();
    expect(changelog.getEntry('nonexistent')).toBeNull();
  });

  it('exports as JSON', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'other',
      rationale: 'r',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    const json = changelog.export({ format: 'json' });
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('exports as CSV', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'admin',
      category: 'safety',
      rationale: 'Added safety rules',
      changedFields: ['systemPrompt'],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: 'v1',
    });

    const csv = changelog.export({ format: 'csv' });
    expect(csv).toContain('id,personalityId');
    expect(csv).toContain('admin');
    expect(csv).toContain('safety');
  });

  it('CSV escapes commas and quotes', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'admin',
      category: 'other',
      rationale: 'Added "safety", compliance rules',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    const csv = changelog.export({ format: 'csv' });
    expect(csv).toContain('"Added ""safety"", compliance rules"');
  });

  it('export filters by date range', () => {
    const changelog = new PromptChangelog();
    changelog.addEntry({
      personalityId: 'p1',
      author: 'a',
      category: 'other',
      rationale: 'r',
      changedFields: [],
      currentPrompt: 'p',
      previousPrompt: null,
      diffSummary: null,
      versionTag: null,
    });

    const json = changelog.export({
      format: 'json',
      fromDate: Date.now() + 100000, // future date
    });
    expect(JSON.parse(json)).toHaveLength(0);
  });
});
