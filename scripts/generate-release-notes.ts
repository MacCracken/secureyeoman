/**
 * Release Notes Generator
 *
 * Parses git log for conventional commits since the last tag and
 * generates a Markdown release notes document grouped by type.
 *
 * Usage: npx tsx scripts/generate-release-notes.ts [--tag <tag>]
 */

import { execSync } from 'node:child_process';

// ── Conventional commit types ────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  style: 'Styles',
  refactor: 'Refactoring',
  perf: 'Performance',
  test: 'Tests',
  build: 'Build',
  ci: 'CI/CD',
  chore: 'Chores',
};

export interface ParsedCommit {
  type: string;
  scope?: string;
  description: string;
  hash: string;
  author: string;
}

// ── Git helpers ─────────────────────────────────────────────────

function getLastTag(): string | null {
  try {
    return execSync('git describe --tags --abbrev=0 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

function getCommitsSince(tag: string | null): string[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  try {
    const raw = execSync(
      `git log ${range} --pretty=format:"%H||%an||%s" --no-merges`,
      { encoding: 'utf-8' },
    ).trim();
    return raw ? raw.split('\n') : [];
  } catch {
    return [];
  }
}

// ── Parser ──────────────────────────────────────────────────────

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s+(.+)$/;

export function parseCommit(line: string): ParsedCommit | null {
  const parts = line.split('||');
  if (parts.length < 3) return null;

  const [hash, author, subject] = parts;
  const match = CONVENTIONAL_RE.exec(subject);
  if (!match) return null;

  return {
    type: match[1],
    scope: match[2] || undefined,
    description: match[3],
    hash: hash.slice(0, 7),
    author,
  };
}

// ── Markdown generator ──────────────────────────────────────────

export function generateMarkdown(commits: ParsedCommit[], tag?: string): string {
  const grouped = new Map<string, ParsedCommit[]>();

  for (const commit of commits) {
    const label = TYPE_LABELS[commit.type] ?? 'Other';
    const list = grouped.get(label) ?? [];
    list.push(commit);
    grouped.set(label, list);
  }

  const lines: string[] = [];
  const title = tag ? `Release ${tag}` : 'Unreleased Changes';
  lines.push(`# ${title}\n`);

  // Order: features first, then bug fixes, then rest
  const order = Object.values(TYPE_LABELS);
  const sortedKeys = [...grouped.keys()].sort(
    (a, b) => (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) -
              (order.indexOf(b) === -1 ? 999 : order.indexOf(b)),
  );

  for (const label of sortedKeys) {
    const group = grouped.get(label)!;
    lines.push(`## ${label}\n`);
    for (const c of group) {
      const scope = c.scope ? `**${c.scope}**: ` : '';
      lines.push(`- ${scope}${c.description} (\`${c.hash}\`)`);
    }
    lines.push('');
  }

  // Contributors
  const authors = [...new Set(commits.map((c) => c.author))];
  if (authors.length > 0) {
    lines.push('## Contributors\n');
    for (const author of authors) {
      lines.push(`- ${author}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────

export function main(args: string[] = process.argv.slice(2)): string {
  let fromTag: string | null = null;
  const tagIdx = args.indexOf('--tag');
  if (tagIdx !== -1 && args[tagIdx + 1]) {
    fromTag = args[tagIdx + 1];
  } else {
    fromTag = getLastTag();
  }

  const rawLines = getCommitsSince(fromTag);
  const commits = rawLines.map(parseCommit).filter((c): c is ParsedCommit => c !== null);

  if (commits.length === 0) {
    return '# Release Notes\n\nNo conventional commits found since last tag.\n';
  }

  return generateMarkdown(commits, fromTag ?? undefined);
}

// Run if called directly
if (process.argv[1]?.endsWith('generate-release-notes.ts')) {
  const output = main();
  process.stdout.write(output);
}
