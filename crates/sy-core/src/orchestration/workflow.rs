//! Workflow engine — DAG execution with topological scheduling.
//!
//! Executes workflow definitions as directed acyclic graphs (DAGs).
//! Steps are organized into tiers via topological sort (from szal Rust crate
//! via NAPI, or fallback Kahn's algorithm). Steps within a tier execute
//! in parallel (up to 20 concurrent).
//!
//! 28 step types are supported — see `StepType` enum.
//! Step handlers dispatch to the appropriate executor (agent, swarm, council,
//! webhook, code execution, etc.).

use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

use crate::orchestration::delegation::{AgentDelegate, DelegationError, DelegationParams};

/// Maximum depth for subworkflow recursion.
const MAX_SUBWORKFLOW_DEPTH: u32 = 10;

/// Maximum concurrent steps per tier (a wider tier runs in batches).
const MAX_PARALLEL_STEPS: usize = 20;

/// Bounds on a step's retry policy (TS: 1–10 attempts).
const MAX_ATTEMPTS: u32 = 10;
const MAX_BACKOFF_MS: u64 = 60_000;

/// Longest `delay` step (TS: one hour).
const MAX_DELAY_MS: u64 = 3_600_000;

/// Bounds on a condition expression (TS: 1,000 characters); the depth bound
/// keeps the recursive parser off the end of the stack.
const MAX_CONDITION_LEN: usize = 1000;
const MAX_CONDITION_DEPTH: usize = 32;

// ── Step Types ──────────────────────────────────────────────────────────

/// All supported workflow step types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepType {
    Agent,
    Swarm,
    Council,
    Tool,
    Condition,
    Transform,
    Loop,
    ParallelMap,
    Resource,
    DataValidation,
    CacheLookup,
    Webhook,
    Notification,
    A2aDelegate,
    DataCuration,
    TrainingJob,
    Evaluation,
    ConditionalDeploy,
    HumanApproval,
    CiTrigger,
    CiWait,
    Subworkflow,
    CodeExecution,
    DiagramGeneration,
    DocumentAnalysis,
    AgnosticCrew,
    AgnosticCrewWait,
    Delay,
}

// ── Workflow Definition ─────────────────────────────────────────────────

/// A workflow step definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// TS definitions (and the dashboard) call it `type`.
    #[serde(alias = "type")]
    pub step_type: StepType,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub config: serde_json::Value,
    /// `any`: run when at least one dependency completed (skip otherwise);
    /// anything else waits for all of them, whatever their outcome.
    #[serde(default)]
    pub trigger_mode: Option<String>,
    /// Run only when this expression holds (see [`evaluate_condition`]);
    /// otherwise, or when it cannot be evaluated, the step is skipped.
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default)]
    pub on_error: Option<String>,
    #[serde(default)]
    pub retry_policy: Option<RetryPolicy>,
}

/// Retry policy for a step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    pub max_attempts: u32,
    #[serde(default = "default_backoff_ms")]
    pub backoff_ms: u64,
}

fn default_backoff_ms() -> u64 {
    1000
}

/// A complete workflow definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub steps: Vec<WorkflowStep>,
    #[serde(default)]
    pub input: serde_json::Value,
}

// ── Execution Context ───────────────────────────────────────────────────

/// Accumulated context during workflow execution.
#[derive(Debug, Clone, Default)]
pub struct WorkflowContext {
    /// Per-step outputs: step_id → { output, status }
    pub steps: HashMap<String, StepResult>,
    /// Workflow input parameters.
    pub input: serde_json::Value,
}

/// Result of a single step execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub output: serde_json::Value,
    pub status: String,
}

/// Complete workflow execution result.
#[derive(Debug, Clone)]
pub struct WorkflowResult {
    pub outputs: HashMap<String, StepResult>,
    pub final_output: serde_json::Value,
    pub steps_completed: usize,
    pub steps_failed: usize,
    pub steps_skipped: usize,
}

/// What happened to one step, for the run's step history.
#[derive(Debug, Clone)]
pub struct StepRecord {
    pub step_id: String,
    pub step_name: String,
    /// The step type as definitions spell it (`human_approval`).
    pub step_type: String,
    /// `completed`, `failed` or `skipped`.
    pub status: &'static str,
    pub output: serde_json::Value,
    pub error: Option<String>,
    /// Unix ms.
    pub started_at: i64,
    pub completed_at: i64,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn type_name(step_type: StepType) -> String {
    serde_json::to_value(step_type)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

// ── Conditions ──────────────────────────────────────────────────────────

/// Evaluate a condition against the run so far: `steps.<id>.status`,
/// `steps.<id>.output...` and `input...`, with `== != > >= < <=`, `&& || !`,
/// parentheses and string (single-quoted), number and boolean literals — the
/// evaluator (szal) the TS engine used.
pub fn evaluate_condition(expr: &str, context: &WorkflowContext) -> Result<bool, String> {
    let expr = expr.trim();
    if expr.is_empty() {
        return Err("Expression is empty".to_string());
    }
    if expr.len() > MAX_CONDITION_LEN {
        return Err(format!(
            "Expression too long ({} chars, max {MAX_CONDITION_LEN})",
            expr.len()
        ));
    }
    let (mut depth, mut deepest, mut nots) = (0usize, 0usize, 0usize);
    let mut chars = expr.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '(' => {
                depth += 1;
                deepest = deepest.max(depth);
            }
            ')' => depth = depth.saturating_sub(1),
            '!' if chars.peek() != Some(&'=') => nots += 1,
            _ => {}
        }
    }
    if deepest + nots > MAX_CONDITION_DEPTH {
        return Err(format!(
            "Expression nests too deeply (max {MAX_CONDITION_DEPTH})"
        ));
    }
    let steps: serde_json::Map<String, serde_json::Value> = context
        .steps
        .iter()
        .map(|(id, r)| {
            (
                id.clone(),
                serde_json::json!({ "output": r.output, "status": r.status }),
            )
        })
        .collect();
    let ctx = serde_json::json!({ "steps": steps, "input": context.input });
    szal::condition::evaluate(expr, &ctx)
}

/// A step's attempts and base backoff, within the bounds.
fn retry_bounds(policy: Option<&RetryPolicy>) -> (u32, u64) {
    policy.map_or((1, 1000), |r| {
        (
            r.max_attempts.clamp(1, MAX_ATTEMPTS),
            r.backoff_ms.min(MAX_BACKOFF_MS),
        )
    })
}

/// The wait after failed attempt `attempt` (0-based): linear backoff.
fn retry_wait_ms(backoff_ms: u64, attempt: u32) -> u64 {
    backoff_ms.saturating_mul(u64::from(attempt) + 1)
}

/// A `delay` step's duration, within the bound.
fn delay_ms(config: &serde_json::Value) -> u64 {
    config
        .get("durationMs")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1000)
        .min(MAX_DELAY_MS)
}

/// Why a step does not run, if it does not.
fn skip_reason(step: &WorkflowStep, context: &WorkflowContext) -> Option<String> {
    if step.trigger_mode.as_deref() == Some("any")
        && !step.depends_on.is_empty()
        && !step.depends_on.iter().any(|dep| {
            context
                .steps
                .get(dep)
                .is_some_and(|r| r.status == "completed")
        })
    {
        return Some("no dependency completed".to_string());
    }
    let condition = step.condition.as_deref().map(str::trim)?;
    if condition.is_empty() {
        return None;
    }
    match evaluate_condition(condition, context) {
        Ok(true) => None,
        Ok(false) => Some("condition is false".to_string()),
        Err(e) => {
            warn!(step = step.id, error = %e, "workflow condition could not be evaluated");
            Some(format!("condition could not be evaluated: {e}"))
        }
    }
}

// ── Topological Sort ────────────────────────────────────────────────────

/// Kahn's algorithm — returns tiers of parallel-executable step IDs.
///
/// Each tier contains steps whose dependencies are all in prior tiers.
/// Returns Err if a cycle is detected.
pub fn topological_sort(steps: &[WorkflowStep]) -> Result<Vec<Vec<String>>, WorkflowError> {
    let step_ids: HashSet<&str> = steps.iter().map(|s| s.id.as_str()).collect();

    // Build adjacency and in-degree maps
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();

    for step in steps {
        in_degree.entry(step.id.as_str()).or_insert(0);
        for dep in &step.depends_on {
            if !step_ids.contains(dep.as_str()) {
                return Err(WorkflowError::MissingDependency {
                    step: step.id.clone(),
                    dependency: dep.clone(),
                });
            }
            *in_degree.entry(step.id.as_str()).or_insert(0) += 1;
            dependents
                .entry(dep.as_str())
                .or_default()
                .push(step.id.as_str());
        }
    }

    let mut tiers: Vec<Vec<String>> = Vec::new();
    let mut queue: VecDeque<&str> = in_degree
        .iter()
        .filter(|&(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut visited = 0;

    while !queue.is_empty() {
        let tier: Vec<String> = queue.drain(..).map(|s| s.to_string()).collect();
        visited += tier.len();

        let mut next_queue = VecDeque::new();
        for step_id in &tier {
            if let Some(deps) = dependents.get(step_id.as_str()) {
                for &dep in deps {
                    if let Some(deg) = in_degree.get_mut(dep) {
                        *deg -= 1;
                        if *deg == 0 {
                            next_queue.push_back(dep);
                        }
                    }
                }
            }
        }

        tiers.push(tier);
        queue = next_queue;
    }

    if visited < steps.len() {
        return Err(WorkflowError::CycleDetected);
    }

    Ok(tiers)
}

// ── Template Resolution ─────────────────────────────────────────────────

/// Resolve a Mustache-style template against the workflow context.
///
/// Supports `{{steps.X.output.field}}` and `{{input.key}}` patterns.
pub fn resolve_template(template: &str, context: &WorkflowContext) -> String {
    // Single left-to-right pass. Substituted values are NOT re-scanned, which
    // (a) avoids re-resolving template syntax that appears *inside* a resolved
    // value (a template-injection vector) and (b) guarantees termination: a
    // self-referential value such as `{{input.x}}` resolving to `"{{input.x}}"`
    // previously looped forever via `replace_range` (CPU-exhaustion DoS).
    let mut result = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        let Some(end_rel) = rest[start + 2..].find("}}") else {
            break; // no closing delimiter — emit the remainder verbatim below
        };
        let end = start + 2 + end_rel;
        result.push_str(&rest[..start]);
        let path = rest[start + 2..end].trim();
        result.push_str(&resolve_path(path, context));
        rest = &rest[end + 2..];
    }
    result.push_str(rest);
    result
}

/// Walk a dot-separated path to resolve a value from context.
fn resolve_path(path: &str, context: &WorkflowContext) -> String {
    let parts: Vec<&str> = path.split('.').collect();
    if parts.is_empty() {
        return String::new();
    }

    match parts[0] {
        "steps" => {
            if parts.len() < 2 {
                return String::new();
            }
            let step_id = parts[1];
            match context.steps.get(step_id) {
                Some(result) => {
                    if parts.len() == 2 {
                        return serde_json::to_string(&result.output).unwrap_or_default();
                    }
                    if parts.len() >= 3 && parts[2] == "output" {
                        walk_json(&result.output, &parts[3..])
                    } else if parts.len() >= 3 && parts[2] == "status" {
                        result.status.clone()
                    } else {
                        walk_json(&result.output, &parts[2..])
                    }
                }
                None => String::new(),
            }
        }
        "input" => walk_json(&context.input, &parts[1..]),
        _ => String::new(),
    }
}

/// Walk a JSON value by dot-path segments.
fn walk_json(value: &serde_json::Value, path: &[&str]) -> String {
    let mut current = value;
    for segment in path {
        match current {
            serde_json::Value::Object(map) => {
                current = match map.get(*segment) {
                    Some(v) => v,
                    None => return String::new(),
                };
            }
            serde_json::Value::Array(arr) => {
                if let Ok(idx) = segment.parse::<usize>() {
                    current = match arr.get(idx) {
                        Some(v) => v,
                        None => return String::new(),
                    };
                } else {
                    return String::new();
                }
            }
            _ => return String::new(),
        }
    }

    match current {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

// ── Workflow Engine ─────────────────────────────────────────────────────

/// The workflow execution engine.
pub struct WorkflowEngine<D: AgentDelegate> {
    delegate: D,
}

impl<D: AgentDelegate> WorkflowEngine<D> {
    pub fn new(delegate: D) -> Self {
        Self { delegate }
    }

    /// Execute a workflow definition.
    pub async fn execute(
        &self,
        definition: &WorkflowDefinition,
    ) -> Result<WorkflowResult, WorkflowError> {
        self.execute_recorded(definition).await.0
    }

    /// Execute a workflow definition, also returning what happened to each
    /// step that was reached (in order), whatever the outcome.
    pub async fn execute_recorded(
        &self,
        definition: &WorkflowDefinition,
    ) -> (Result<WorkflowResult, WorkflowError>, Vec<StepRecord>) {
        let mut records = Vec::new();
        let tiers = match topological_sort(&definition.steps) {
            Ok(tiers) => tiers,
            Err(e) => return (Err(e), records),
        };

        let mut context = WorkflowContext {
            steps: HashMap::new(),
            input: definition.input.clone(),
        };
        let (mut completed, mut failed, mut skipped) = (0, 0, 0);

        for tier in &tiers {
            let mut runnable: Vec<&WorkflowStep> = Vec::new();
            for step in tier
                .iter()
                .filter_map(|id| definition.steps.iter().find(|s| s.id == *id))
            {
                match skip_reason(step, &context) {
                    Some(reason) => {
                        debug!(step = step.id, reason, "step skipped");
                        context.steps.insert(
                            step.id.clone(),
                            StepResult {
                                output: serde_json::Value::Null,
                                status: "skipped".to_string(),
                            },
                        );
                        let now = now_ms();
                        records.push(StepRecord {
                            step_id: step.id.clone(),
                            step_name: step.name.clone(),
                            step_type: type_name(step.step_type),
                            status: "skipped",
                            output: serde_json::Value::Null,
                            error: Some(reason),
                            started_at: now,
                            completed_at: now,
                        });
                        skipped += 1;
                    }
                    None => runnable.push(step),
                }
            }

            // Every runnable step runs, MAX_PARALLEL_STEPS at a time.
            for batch in runnable.chunks(MAX_PARALLEL_STEPS) {
                let started_at = now_ms();
                let results = futures::future::join_all(
                    batch.iter().map(|step| self.execute_step(step, &context)),
                )
                .await;
                let completed_at = now_ms();

                for (step, result) in batch.iter().zip(results) {
                    let mut record = StepRecord {
                        step_id: step.id.clone(),
                        step_name: step.name.clone(),
                        step_type: type_name(step.step_type),
                        status: "completed",
                        output: serde_json::Value::Null,
                        error: None,
                        started_at,
                        completed_at,
                    };
                    match result {
                        Ok(output) => {
                            record.output = output.clone();
                            records.push(record);
                            context.steps.insert(
                                step.id.clone(),
                                StepResult {
                                    output,
                                    status: "completed".to_string(),
                                },
                            );
                            completed += 1;
                        }
                        Err(e) => {
                            record.status = "failed";
                            record.error = Some(e.to_string());
                            records.push(record);
                            failed += 1;
                            let on_error = step.on_error.as_deref().unwrap_or("fail");
                            match on_error {
                                "continue" | "skip" => {
                                    warn!(step = step.id, error = %e, "step failed, continuing");
                                    context.steps.insert(
                                        step.id.clone(),
                                        StepResult {
                                            output: serde_json::json!({"error": e.to_string()}),
                                            status: "failed".to_string(),
                                        },
                                    );
                                }
                                _ => {
                                    return (
                                        Err(WorkflowError::StepFailed {
                                            step: step.id.clone(),
                                            error: e.to_string(),
                                        }),
                                        records,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        // Final output is the last step's output
        let final_output = definition
            .steps
            .last()
            .and_then(|s| context.steps.get(&s.id))
            .map(|r| r.output.clone())
            .unwrap_or(serde_json::Value::Null);

        (
            Ok(WorkflowResult {
                outputs: context.steps,
                final_output,
                steps_completed: completed,
                steps_failed: failed,
                steps_skipped: skipped,
            }),
            records,
        )
    }

    /// Execute a single step with retry.
    async fn execute_step(
        &self,
        step: &WorkflowStep,
        context: &WorkflowContext,
    ) -> Result<serde_json::Value, WorkflowError> {
        let (max_attempts, backoff_ms) = retry_bounds(step.retry_policy.as_ref());

        let mut last_error = None;

        for attempt in 0..max_attempts {
            match self.dispatch_step(step, context).await {
                Ok(output) => {
                    debug!(step = step.id, attempt, "step completed");
                    return Ok(output);
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt + 1 < max_attempts {
                        tokio::time::sleep(std::time::Duration::from_millis(retry_wait_ms(
                            backoff_ms, attempt,
                        )))
                        .await;
                    }
                }
            }
        }

        Err(last_error
            .map(|e| WorkflowError::StepFailed {
                step: step.id.clone(),
                error: e.to_string(),
            })
            .unwrap_or(WorkflowError::StepFailed {
                step: step.id.clone(),
                error: "unknown error".to_string(),
            }))
    }

    /// Dispatch a step to its type-specific handler.
    async fn dispatch_step(
        &self,
        step: &WorkflowStep,
        context: &WorkflowContext,
    ) -> Result<serde_json::Value, DelegationError> {
        match step.step_type {
            StepType::Agent => {
                let task = step
                    .config
                    .get("taskTemplate")
                    .and_then(|t| t.as_str())
                    .map(|t| resolve_template(t, context))
                    .unwrap_or_default();
                let profile = step
                    .config
                    .get("profile")
                    .and_then(|p| p.as_str())
                    .unwrap_or("assistant")
                    .to_string();
                let budget = step
                    .config
                    .get("maxTokenBudget")
                    .and_then(|b| b.as_u64())
                    .unwrap_or(4096) as u32;
                let ctx = step
                    .config
                    .get("contextTemplate")
                    .and_then(|c| c.as_str())
                    .map(|c| resolve_template(c, context));

                let result = self
                    .delegate
                    .delegate(DelegationParams {
                        profile,
                        task,
                        context: ctx,
                        max_token_budget: budget,
                        model_override: step
                            .config
                            .get("modelOverride")
                            .and_then(|m| m.as_str())
                            .map(|s| s.to_string()),
                    })
                    .await?;

                Ok(serde_json::json!({"result": result.result, "tokensUsed": result.tokens_used}))
            }

            StepType::Condition => {
                let expr = step
                    .config
                    .get("expression")
                    .and_then(|e| e.as_str())
                    .unwrap_or("false");
                // As TS: an expression that cannot be evaluated is false.
                let result = evaluate_condition(expr, context).unwrap_or_else(|e| {
                    warn!(step = step.id, error = %e, "workflow condition could not be evaluated");
                    false
                });
                Ok(serde_json::json!(result))
            }

            StepType::Transform => {
                let template = step
                    .config
                    .get("outputTemplate")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let resolved = resolve_template(template, context);
                Ok(serde_json::json!(resolved))
            }

            StepType::Delay => {
                let ms = delay_ms(&step.config);
                tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
                Ok(serde_json::json!({"delayedMs": ms}))
            }

            // Not implemented here yet. Failing is the only honest outcome: a
            // stub "success" would wave a human_approval gate through, report
            // a webhook as sent and feed made-up output to later steps.
            _ => Err(DelegationError::Failed(format!(
                "step type '{}' is not supported by this server yet",
                type_name(step.step_type)
            ))),
        }
    }
}

// ── Errors ──────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("cycle detected in workflow DAG")]
    CycleDetected,
    #[error("step '{step}' depends on missing step '{dependency}'")]
    MissingDependency { step: String, dependency: String },
    #[error("step '{step}' failed: {error}")]
    StepFailed { step: String, error: String },
    #[error("max subworkflow depth ({0}) exceeded")]
    MaxDepthExceeded(u32),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(id: &str, deps: &[&str]) -> WorkflowStep {
        WorkflowStep {
            id: id.into(),
            name: id.into(),
            step_type: StepType::Transform,
            depends_on: deps.iter().map(|s| s.to_string()).collect(),
            config: serde_json::json!({"outputTemplate": "{{input.x}}"}),
            trigger_mode: None,
            condition: None,
            on_error: None,
            retry_policy: None,
        }
    }

    #[test]
    fn topo_sort_simple() {
        let steps = vec![step("a", &[]), step("b", &["a"]), step("c", &["b"])];
        let tiers = topological_sort(&steps).unwrap();
        assert_eq!(tiers.len(), 3);
        assert_eq!(tiers[0], vec!["a"]);
        assert_eq!(tiers[1], vec!["b"]);
        assert_eq!(tiers[2], vec!["c"]);
    }

    #[test]
    fn topo_sort_parallel() {
        let steps = vec![step("a", &[]), step("b", &[]), step("c", &["a", "b"])];
        let tiers = topological_sort(&steps).unwrap();
        assert_eq!(tiers.len(), 2);
        assert!(tiers[0].contains(&"a".to_string()));
        assert!(tiers[0].contains(&"b".to_string()));
        assert_eq!(tiers[1], vec!["c"]);
    }

    #[test]
    fn topo_sort_detects_cycle() {
        let steps = vec![step("a", &["b"]), step("b", &["a"])];
        assert!(matches!(
            topological_sort(&steps),
            Err(WorkflowError::CycleDetected)
        ));
    }

    #[test]
    fn topo_sort_detects_missing_dep() {
        let steps = vec![step("a", &["nonexistent"])];
        assert!(matches!(
            topological_sort(&steps),
            Err(WorkflowError::MissingDependency { .. })
        ));
    }

    #[test]
    fn resolve_template_basic() {
        let mut ctx = WorkflowContext {
            input: serde_json::json!({"name": "test"}),
            ..Default::default()
        };
        ctx.steps.insert(
            "s1".into(),
            StepResult {
                output: serde_json::json!({"result": "hello"}),
                status: "completed".into(),
            },
        );

        assert_eq!(resolve_template("{{input.name}}", &ctx), "test");
        assert_eq!(
            resolve_template("{{steps.s1.output.result}}", &ctx),
            "hello"
        );
        assert_eq!(resolve_template("{{steps.s1.status}}", &ctx), "completed");
        assert_eq!(
            resolve_template("no templates here", &ctx),
            "no templates here"
        );
    }

    #[test]
    fn resolve_template_nested() {
        let mut ctx = WorkflowContext::default();
        ctx.steps.insert(
            "s1".into(),
            StepResult {
                output: serde_json::json!({"data": {"items": [1, 2, 3]}}),
                status: "completed".into(),
            },
        );

        let result = resolve_template("{{steps.s1.output.data.items}}", &ctx);
        assert!(result.contains("[1,2,3]"));
    }

    #[test]
    fn resolve_template_missing_path() {
        let ctx = WorkflowContext::default();
        assert_eq!(resolve_template("{{steps.missing.output}}", &ctx), "");
        assert_eq!(resolve_template("{{input.nonexistent}}", &ctx), "");
    }

    #[tokio::test]
    async fn engine_executes_simple_dag() {
        use crate::orchestration::delegation::EchoDelegate;

        let engine = WorkflowEngine::new(EchoDelegate);
        let def = WorkflowDefinition {
            id: "test".into(),
            name: "Test Workflow".into(),
            input: serde_json::json!({"x": "hello"}),
            steps: vec![WorkflowStep {
                id: "s1".into(),
                name: "Transform".into(),
                step_type: StepType::Transform,
                depends_on: vec![],
                config: serde_json::json!({"outputTemplate": "{{input.x}} world"}),
                trigger_mode: None,
                condition: None,
                on_error: None,
                retry_policy: None,
            }],
        };

        let result = engine.execute(&def).await.unwrap();
        assert_eq!(result.steps_completed, 1);
        assert_eq!(result.steps_failed, 0);
    }

    fn definition(steps: Vec<WorkflowStep>) -> WorkflowDefinition {
        WorkflowDefinition {
            id: "wf".into(),
            name: "wf".into(),
            input: serde_json::json!({"x": "hello", "score": 7}),
            steps,
        }
    }

    fn transform(id: &str, deps: &[&str], template: &str) -> WorkflowStep {
        WorkflowStep {
            config: serde_json::json!({ "outputTemplate": template }),
            ..step(id, deps)
        }
    }

    #[test]
    fn ts_definitions_parse() {
        // The dashboard and TS definitions use `type`, and may omit `name`.
        let steps: Vec<WorkflowStep> = serde_json::from_value(serde_json::json!([
            {"id": "a", "type": "transform", "config": {"outputTemplate": "x"}},
            {"id": "b", "type": "human_approval", "dependsOn": ["a"],
             "condition": "steps.a.status == 'completed'", "triggerMode": "all",
             "retryPolicy": {"maxAttempts": 3}},
        ]))
        .unwrap();
        assert_eq!(steps[1].step_type, StepType::HumanApproval);
        assert_eq!(steps[1].retry_policy.as_ref().unwrap().backoff_ms, 1000);
        // An unknown type is an error, not an empty workflow.
        assert!(
            serde_json::from_value::<Vec<WorkflowStep>>(serde_json::json!([
                {"id": "a", "type": "teleport"}
            ]))
            .is_err()
        );
    }

    #[test]
    fn conditions_use_the_ts_grammar_and_fail_closed() {
        let mut ctx = WorkflowContext {
            input: serde_json::json!({"score": 7, "env": "prod"}),
            ..Default::default()
        };
        ctx.steps.insert(
            "build".into(),
            StepResult {
                output: serde_json::json!({"coverage": 0.91}),
                status: "completed".into(),
            },
        );
        let eval = |e: &str| evaluate_condition(e, &ctx);
        assert_eq!(eval("steps.build.status == 'completed'"), Ok(true));
        assert_eq!(
            eval("steps.build.output.coverage >= 0.9 && input.score > 5"),
            Ok(true)
        );
        assert_eq!(
            eval("input.env != 'prod' || !(input.score < 10)"),
            Ok(false)
        );
        assert_eq!(eval("steps.missing.status == 'completed'"), Ok(false));
        // The old heuristic passed anything mentioning "completed".
        assert_eq!(eval("'not completed' == 'x'"), Ok(false));
        assert!(eval("").is_err());
        assert!(eval(&"x".repeat(MAX_CONDITION_LEN + 1)).is_err());
        let deep = format!("{}true{}", "(".repeat(64), ")".repeat(64));
        assert!(
            eval(&deep).is_err(),
            "deep nesting is refused before parsing"
        );
        assert!(eval(&format!("{}true", "!".repeat(64))).is_err());
    }

    #[tokio::test]
    async fn conditions_and_trigger_modes_gate_steps() {
        use crate::orchestration::delegation::EchoDelegate;
        let mut gated = transform("gated", &["a"], "ran");
        gated.condition = Some("input.score > 100".into());
        let mut open = transform("open", &["a"], "ran");
        open.condition = Some("input.score > 5".into());
        let mut broken = transform("broken", &["a"], "ran");
        broken.condition = Some("input.score >".into());
        let mut any = transform("any", &["gated"], "ran");
        any.trigger_mode = Some("any".into());
        let def = definition(vec![
            transform("a", &[], "{{input.x}}"),
            gated,
            open,
            broken,
            any,
        ]);

        let (result, records) = WorkflowEngine::new(EchoDelegate)
            .execute_recorded(&def)
            .await;
        let result = result.unwrap();
        assert_eq!(result.outputs["gated"].status, "skipped");
        assert_eq!(result.outputs["open"].status, "completed");
        assert_eq!(result.outputs["broken"].status, "skipped", "fails closed");
        assert_eq!(
            result.outputs["any"].status, "skipped",
            "no dependency completed"
        );
        assert_eq!((result.steps_completed, result.steps_skipped), (2, 3));
        assert_eq!(records.len(), 5);
        assert!(records.iter().all(|r| r.step_type == "transform"));
    }

    #[tokio::test]
    async fn unimplemented_steps_fail_instead_of_passing() {
        use crate::orchestration::delegation::EchoDelegate;
        let mut approval = step("approve", &["a"]);
        approval.step_type = StepType::HumanApproval;
        let deploy = transform("deploy", &["approve"], "deployed");
        let def = definition(vec![transform("a", &[], "x"), approval, deploy]);

        let (result, records) = WorkflowEngine::new(EchoDelegate)
            .execute_recorded(&def)
            .await;
        let err = result.unwrap_err().to_string();
        assert!(err.contains("human_approval"), "{err}");
        // The gate stopped the run before `deploy`.
        assert_eq!(
            records
                .iter()
                .map(|r| (r.step_id.as_str(), r.status))
                .collect::<Vec<_>>(),
            [("a", "completed"), ("approve", "failed")]
        );
    }

    #[tokio::test]
    async fn a_wide_tier_runs_every_step() {
        use crate::orchestration::delegation::EchoDelegate;
        let steps: Vec<WorkflowStep> = (0..MAX_PARALLEL_STEPS * 2 + 3)
            .map(|i| transform(&format!("s{i}"), &[], "x"))
            .collect();
        let result = WorkflowEngine::new(EchoDelegate)
            .execute(&definition(steps))
            .await
            .unwrap();
        assert_eq!(result.steps_completed, MAX_PARALLEL_STEPS * 2 + 3);
    }

    #[test]
    fn delays_and_retries_are_bounded() {
        assert_eq!(
            delay_ms(&serde_json::json!({ "durationMs": u64::MAX })),
            MAX_DELAY_MS
        );
        assert_eq!(delay_ms(&serde_json::json!({})), 1000);
        // u32::MAX attempts with u64::MAX backoff: clamped, and no overflow.
        let (attempts, backoff) = retry_bounds(Some(&RetryPolicy {
            max_attempts: u32::MAX,
            backoff_ms: u64::MAX,
        }));
        assert_eq!((attempts, backoff), (MAX_ATTEMPTS, MAX_BACKOFF_MS));
        assert_eq!(retry_wait_ms(u64::MAX, u32::MAX), u64::MAX);
        assert_eq!(
            retry_bounds(Some(&RetryPolicy {
                max_attempts: 0,
                backoff_ms: 5
            })),
            (1, 5)
        );
        assert_eq!(retry_bounds(None), (1, 1000));
    }
}
