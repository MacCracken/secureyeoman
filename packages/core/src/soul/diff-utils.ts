/**
 * Simple unified diff utility for personality distillation comparison.
 * No external dependencies — uses a basic LCS-based algorithm.
 */

/**
 * Compute a unified diff between two strings.
 * Returns empty string when inputs are identical.
 */
export function computeUnifiedDiff(
  a: string,
  b: string,
  labelA = 'a',
  labelB = 'b'
): string {
  const linesA = a.split('\n');
  const linesB = b.split('\n');

  if (a === b) return '';

  // Compute LCS table
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to build diff entries
  interface DiffEntry {
    type: 'same' | 'add' | 'remove';
    line: string;
    lineA?: number;
    lineB?: number;
  }

  const entries: DiffEntry[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      entries.push({ type: 'same', line: linesA[i - 1]!, lineA: i, lineB: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      entries.push({ type: 'add', line: linesB[j - 1]!, lineB: j });
      j--;
    } else {
      entries.push({ type: 'remove', line: linesA[i - 1]!, lineA: i });
      i--;
    }
  }

  entries.reverse();

  // Format as unified diff with hunks
  const output: string[] = [];
  output.push(`--- ${labelA}`);
  output.push(`+++ ${labelB}`);

  // Group into hunks (context of 3 lines)
  const contextLines = 3;
  let hunkStart = -1;
  let hunkEnd = -1;

  for (let idx = 0; idx < entries.length; idx++) {
    if (entries[idx]!.type !== 'same') {
      const start = Math.max(0, idx - contextLines);
      const end = Math.min(entries.length - 1, idx + contextLines);
      if (hunkStart === -1) {
        hunkStart = start;
        hunkEnd = end;
      } else if (start <= hunkEnd + 1) {
        hunkEnd = end;
      } else {
        // Emit previous hunk
        emitHunk(entries, hunkStart, hunkEnd, output);
        hunkStart = start;
        hunkEnd = end;
      }
    }
  }

  if (hunkStart !== -1) {
    emitHunk(entries, hunkStart, hunkEnd, output);
  }

  return output.join('\n');
}

function emitHunk(
  entries: { type: string; line: string; lineA?: number; lineB?: number }[],
  start: number,
  end: number,
  output: string[]
): void {
  // Compute hunk header line numbers
  let aStart = 0;
  let aCount = 0;
  let bStart = 0;
  let bCount = 0;
  let aStartSet = false;
  let bStartSet = false;

  for (let i = start; i <= end; i++) {
    const e = entries[i]!;
    if (e.type === 'same' || e.type === 'remove') {
      if (!aStartSet && e.lineA) {
        aStart = e.lineA;
        aStartSet = true;
      }
      aCount++;
    }
    if (e.type === 'same' || e.type === 'add') {
      if (!bStartSet && e.lineB) {
        bStart = e.lineB;
        bStartSet = true;
      }
      bCount++;
    }
  }

  output.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);

  for (let i = start; i <= end; i++) {
    const e = entries[i]!;
    switch (e.type) {
      case 'same':
        output.push(` ${e.line}`);
        break;
      case 'add':
        output.push(`+${e.line}`);
        break;
      case 'remove':
        output.push(`-${e.line}`);
        break;
    }
  }
}
