/**
 * Eval Engine — Core evaluation logic for agent scenarios.
 *
 * Executes a single scenario against a personality/skill configuration,
 * records tool calls, validates assertions, and produces a ScenarioRunResult.
 */

import type {
  EvalScenario,
  ScenarioRunResult,
  OutputAssertion,
  AssertionResult,
  ToolCallRecord,
  ExpectedToolCall,
} from '@secureyeoman/shared';

export interface EvalAgentDeps {
  /**
   * Execute a prompt against a personality and return the agent's response.
   * The implementation should record tool calls via the onToolCall callback.
   */
  executePrompt(opts: {
    input: string;
    conversationHistory: { role: 'user' | 'assistant'; content: string }[];
    personalityId?: string | null;
    skillIds?: string[];
    model?: string | null;
    onToolCall?: (record: ToolCallRecord) => void;
    abortSignal?: AbortSignal;
  }): Promise<{
    output: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    model: string;
  }>;

  /** Compute cosine similarity between two strings (for semantic assertions). */
  computeSimilarity?(a: string, b: string): Promise<number>;
}

/**
 * Run a single eval scenario and produce a result.
 */
export async function runScenario(
  scenario: EvalScenario,
  deps: EvalAgentDeps,
  abortSignal?: AbortSignal
): Promise<ScenarioRunResult> {
  const startTime = Date.now();
  const toolCalls: ToolCallRecord[] = [];

  // Set up timeout
  const timeoutMs = scenario.maxDurationMs;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // Chain with external abort signal
  if (abortSignal) {
    abortSignal.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true }
    );
  }

  try {
    const response = await deps.executePrompt({
      input: scenario.input,
      conversationHistory: scenario.conversationHistory,
      personalityId: scenario.personalityId,
      skillIds: scenario.skillIds,
      model: scenario.model,
      onToolCall: (record) => toolCalls.push(record),
      abortSignal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // Check token budget
    if (scenario.maxTokens !== null && response.totalTokens > scenario.maxTokens) {
      return buildResult(scenario, {
        passed: false,
        status: 'budget_exceeded',
        output: response.output,
        toolCalls,
        durationMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.totalTokens,
        costUsd: response.costUsd,
        model: response.model,
        errorMessage: `Token budget exceeded: ${response.totalTokens} > ${scenario.maxTokens}`,
      });
    }

    // Validate tool calls
    const toolCallErrors = validateToolCalls(
      toolCalls,
      scenario.expectedToolCalls,
      scenario.orderedToolCalls
    );

    // Check forbidden tool calls
    const forbiddenViolations = scenario.forbiddenToolCalls.filter((name) =>
      toolCalls.some((tc) => tc.name === name)
    );

    // Run output assertions
    const assertionResults = await evaluateAssertions(
      response.output,
      scenario.outputAssertions,
      deps
    );

    const allAssertionsPassed = assertionResults.every((r) => r.passed);
    const passed =
      allAssertionsPassed && toolCallErrors.length === 0 && forbiddenViolations.length === 0;

    return buildResult(scenario, {
      passed,
      status: passed ? 'passed' : 'failed',
      output: response.output,
      toolCalls,
      assertionResults,
      toolCallErrors,
      forbiddenToolCallViolations: forbiddenViolations,
      durationMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.totalTokens,
      costUsd: response.costUsd,
      model: response.model,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = controller.signal.aborted && !abortSignal?.aborted;

    return buildResult(scenario, {
      passed: false,
      status: isTimeout ? 'timeout' : 'error',
      output: '',
      toolCalls,
      durationMs,
      errorMessage: isTimeout
        ? `Scenario timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

/**
 * Validate actual tool calls against expected tool calls.
 */
export function validateToolCalls(
  actual: ToolCallRecord[],
  expected: ExpectedToolCall[],
  ordered: boolean
): string[] {
  const errors: string[] = [];

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i]!;
    if (!exp.required) continue;

    if (ordered) {
      const act = actual[i];
      if (!act) {
        errors.push(`Expected tool call #${i + 1}: "${exp.name}" but no call at position ${i + 1}`);
        continue;
      }
      if (act.name !== exp.name) {
        errors.push(`Expected tool call #${i + 1}: "${exp.name}" but got "${act.name}"`);
        continue;
      }
      if (exp.args) {
        const argErrors = matchArgs(exp.args, act.args, exp.name, i + 1);
        errors.push(...argErrors);
      }
    } else {
      const match = actual.find((a) => a.name === exp.name);
      if (!match) {
        errors.push(`Expected tool call "${exp.name}" was not made`);
        continue;
      }
      if (exp.args) {
        const argErrors = matchArgs(exp.args, match.args, exp.name);
        errors.push(...argErrors);
      }
    }
  }

  return errors;
}

function matchArgs(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  toolName: string,
  position?: number
): string[] {
  const errors: string[] = [];
  const prefix = position !== undefined ? `Tool #${position} "${toolName}"` : `Tool "${toolName}"`;

  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      errors.push(`${prefix}: missing expected arg "${key}"`);
    } else if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
      errors.push(
        `${prefix}: arg "${key}" expected ${JSON.stringify(value)} but got ${JSON.stringify(actual[key])}`
      );
    }
  }

  return errors;
}

/**
 * Evaluate output assertions against agent output.
 */
export async function evaluateAssertions(
  output: string,
  assertions: OutputAssertion[],
  deps: EvalAgentDeps
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    results.push(await evaluateAssertion(output, assertion, deps));
  }

  return results;
}

async function evaluateAssertion(
  output: string,
  assertion: OutputAssertion,
  deps: EvalAgentDeps
): Promise<AssertionResult> {
  switch (assertion.type) {
    case 'exact':
      return {
        assertion,
        passed: output === assertion.value,
        actual: output,
        reason:
          output === assertion.value ? undefined : 'Output does not exactly match expected value',
      };

    case 'regex': {
      const regex = new RegExp(assertion.pattern);
      const passed = regex.test(output);
      return {
        assertion,
        passed,
        actual: output,
        reason: passed ? undefined : `Output does not match pattern: ${assertion.pattern}`,
      };
    }

    case 'contains': {
      const haystack = assertion.caseSensitive ? output : output.toLowerCase();
      const needle = assertion.caseSensitive ? assertion.value : assertion.value.toLowerCase();
      const passed = haystack.includes(needle);
      return {
        assertion,
        passed,
        actual: output,
        reason: passed ? undefined : `Output does not contain: "${assertion.value}"`,
      };
    }

    case 'not_contains': {
      const haystack = assertion.caseSensitive ? output : output.toLowerCase();
      const needle = assertion.caseSensitive ? assertion.value : assertion.value.toLowerCase();
      const passed = !haystack.includes(needle);
      return {
        assertion,
        passed,
        actual: output,
        reason: passed ? undefined : `Output should not contain: "${assertion.value}"`,
      };
    }

    case 'semantic': {
      if (!deps.computeSimilarity) {
        return {
          assertion,
          passed: false,
          reason: 'Semantic similarity not available (no embedding provider configured)',
        };
      }
      const similarity = await deps.computeSimilarity(output, assertion.value);
      const passed = similarity >= assertion.threshold;
      return {
        assertion,
        passed,
        actual: `similarity: ${similarity.toFixed(4)}`,
        reason: passed
          ? undefined
          : `Semantic similarity ${similarity.toFixed(4)} < threshold ${assertion.threshold}`,
      };
    }
  }
}

function buildResult(
  scenario: EvalScenario,
  overrides: Partial<ScenarioRunResult> & { passed: boolean; status: ScenarioRunResult['status'] }
): ScenarioRunResult {
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    passed: overrides.passed,
    status: overrides.status,
    output: overrides.output ?? '',
    assertionResults: overrides.assertionResults ?? [],
    toolCalls: overrides.toolCalls ?? [],
    toolCallErrors: overrides.toolCallErrors ?? [],
    forbiddenToolCallViolations: overrides.forbiddenToolCallViolations ?? [],
    inputTokens: overrides.inputTokens ?? 0,
    outputTokens: overrides.outputTokens ?? 0,
    totalTokens: overrides.totalTokens ?? 0,
    costUsd: overrides.costUsd ?? 0,
    durationMs: overrides.durationMs ?? 0,
    errorMessage: overrides.errorMessage,
    model: overrides.model,
    personalityId: scenario.personalityId ?? undefined,
  };
}
