/**
 * Trace Differ — compares two execution traces for debugging.
 *
 * Aligns steps, diffs tool calls, and computes output similarity.
 */

import type {
  ExecutionTrace,
  TraceDiff,
  ToolCallDiff,
  StepAlignment,
  TraceStep,
  ToolCallStep,
} from '@secureyeoman/shared';

export function diffTraces(
  a: ExecutionTrace,
  b: ExecutionTrace,
  outputSimilarity?: number
): TraceDiff {
  return {
    traceA: { id: a.id, label: a.label, model: a.model },
    traceB: { id: b.id, label: b.label, model: b.model },
    outputMatch: a.output === b.output,
    outputSimilarity,
    toolCallDiffs: diffToolCalls(a.steps, b.steps),
    durationDiffMs: b.totalDurationMs - a.totalDurationMs,
    tokenDiff:
      b.totalInputTokens + b.totalOutputTokens - (a.totalInputTokens + a.totalOutputTokens),
    costDiff: b.totalCostUsd - a.totalCostUsd,
    stepAlignment: alignSteps(a.steps, b.steps),
  };
}

function getToolCalls(steps: TraceStep[]): ToolCallStep[] {
  return steps.filter((s): s is ToolCallStep => s.type === 'tool_call');
}

function diffToolCalls(stepsA: TraceStep[], stepsB: TraceStep[]): ToolCallDiff[] {
  const toolsA = getToolCalls(stepsA);
  const toolsB = getToolCalls(stepsB);
  const diffs: ToolCallDiff[] = [];

  const matchedB = new Set<number>();

  for (const ta of toolsA) {
    const matchIdx = toolsB.findIndex((tb, i) => !matchedB.has(i) && tb.toolName === ta.toolName);

    if (matchIdx === -1) {
      diffs.push({ toolName: ta.toolName, status: 'removed_in_b' });
      continue;
    }

    matchedB.add(matchIdx);
    const tb = toolsB[matchIdx]!;

    const argsMatch = JSON.stringify(ta.args) === JSON.stringify(tb.args);
    const resultMatch = ta.result === tb.result;

    if (argsMatch && resultMatch) {
      diffs.push({ toolName: ta.toolName, status: 'same' });
    } else if (!argsMatch) {
      diffs.push({
        toolName: ta.toolName,
        status: 'args_differ',
        detailA: JSON.stringify(ta.args),
        detailB: JSON.stringify(tb.args),
      });
    } else {
      diffs.push({
        toolName: ta.toolName,
        status: 'result_differ',
        detailA: ta.result.slice(0, 200),
        detailB: tb.result.slice(0, 200),
      });
    }
  }

  // Tools in B not matched
  for (let i = 0; i < toolsB.length; i++) {
    if (!matchedB.has(i)) {
      diffs.push({ toolName: toolsB[i]!.toolName, status: 'added_in_b' });
    }
  }

  return diffs;
}

function alignSteps(stepsA: TraceStep[], stepsB: TraceStep[]): StepAlignment[] {
  const alignments: StepAlignment[] = [];
  const maxLen = Math.max(stepsA.length, stepsB.length);

  // Simple index-based alignment (good enough for sequential execution)
  for (let i = 0; i < maxLen; i++) {
    const sa = stepsA[i];
    const sb = stepsB[i];

    if (!sa && sb) {
      alignments.push({
        indexA: null,
        indexB: sb.index,
        type: sb.type,
        match: 'missing_a',
        summary: `Only in B: ${stepSummary(sb)}`,
      });
    } else if (sa && !sb) {
      alignments.push({
        indexA: sa.index,
        indexB: null,
        type: sa.type,
        match: 'missing_b',
        summary: `Only in A: ${stepSummary(sa)}`,
      });
    } else if (sa && sb) {
      if (sa.type !== sb.type) {
        alignments.push({
          indexA: sa.index,
          indexB: sb.index,
          type: sa.type,
          match: 'different',
          summary: `A: ${stepSummary(sa)} vs B: ${stepSummary(sb)}`,
        });
      } else if (stepsEqual(sa, sb)) {
        alignments.push({
          indexA: sa.index,
          indexB: sb.index,
          type: sa.type,
          match: 'exact',
          summary: stepSummary(sa),
        });
      } else {
        alignments.push({
          indexA: sa.index,
          indexB: sb.index,
          type: sa.type,
          match: 'similar',
          summary: `${stepSummary(sa)} (differs)`,
        });
      }
    }
  }

  return alignments;
}

function stepSummary(step: TraceStep): string {
  switch (step.type) {
    case 'llm_call':
      return `LLM call (${step.model}, ${step.inputTokens + step.outputTokens} tokens)`;
    case 'tool_call':
      return `Tool: ${step.toolName}${step.blocked ? ' [BLOCKED]' : ''}${step.isError ? ' [ERROR]' : ''}`;
    case 'guard_check':
      return `Guard: ${step.guardName} (${step.passed ? 'passed' : 'BLOCKED'}, ${step.findingCount} findings)`;
    case 'brain_retrieval':
      return `Brain: ${step.memoriesUsed} memories, ${step.knowledgeUsed} knowledge (${step.retrievalMode})`;
    case 'error':
      return `Error: ${step.message.slice(0, 100)}`;
  }
}

function stepsEqual(a: TraceStep, b: TraceStep): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'tool_call': {
      const bt = b as ToolCallStep;
      return a.toolName === bt.toolName && JSON.stringify(a.args) === JSON.stringify(bt.args);
    }
    case 'llm_call':
      return a.model === (b as typeof a).model && a.responseText === (b as typeof a).responseText;
    case 'guard_check':
      return a.guardName === (b as typeof a).guardName && a.passed === (b as typeof a).passed;
    default:
      return false;
  }
}
