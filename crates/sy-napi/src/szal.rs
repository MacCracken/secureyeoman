//! Szal workflow engine — NAPI bindings for Node.js.
//!
//! Exposes flow validation, DAG topological sort, condition evaluation,
//! and template resolution to the TypeScript layer.

use napi_derive::napi;
use szal::condition;
use szal::flow::{FlowDef, FlowMode};
use szal::step::{BackoffStrategy, StepDef, TriggerMode};

// ── Condition Evaluation ──────────────────────────────────────────────────

/// Evaluate a condition expression against a JSON context.
/// Returns true/false, or throws on parse error.
///
/// Expression format: `steps.build.status == 'completed' && input.env == 'prod'`
#[napi]
pub fn szal_evaluate_condition(
    expression: String,
    context_json: String,
) -> napi::Result<bool> {
    let context: serde_json::Value = serde_json::from_str(&context_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid context JSON: {e}")))?;

    condition::evaluate(&expression, &context)
        .map_err(|e| napi::Error::from_reason(format!("Condition evaluation failed: {e}")))
}

// ── Flow Validation ───────────────────────────────────────────────────────

/// Validate a workflow flow definition (cycle detection, dependency resolution).
/// Input: JSON flow definition with steps and mode.
/// Returns JSON: `{ valid: true }` or `{ valid: false, error: string }`.
#[napi]
pub fn szal_validate_flow(flow_json: String) -> String {
    match serde_json::from_str::<FlowDef>(&flow_json) {
        Ok(flow) => match flow.validate() {
            Ok(()) => serde_json::json!({ "valid": true }).to_string(),
            Err(e) => serde_json::json!({ "valid": false, "error": e.to_string() }).to_string(),
        },
        Err(e) => serde_json::json!({ "valid": false, "error": format!("Invalid flow JSON: {e}") })
            .to_string(),
    }
}

// ── Step Builder ──────────────────────────────────────────────────────────

/// Create a step definition from JSON config.
/// Returns JSON StepDef with generated UUID.
///
/// Input: `{ name, description?, timeoutMs?, maxRetries?, retryDelayMs?,
///           backoff?, rollbackable?, stepType?, config?, condition?,
///           dependsOn?, triggerMode? }`
#[napi]
pub fn szal_create_step(config_json: String) -> napi::Result<String> {
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid step config: {e}")))?;

    let name = config
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("unnamed");

    let mut step = StepDef::new(name);

    if let Some(desc) = config.get("description").and_then(|v| v.as_str()) {
        step.description = desc.to_string();
    }
    if let Some(ms) = config.get("timeoutMs").and_then(|v| v.as_u64()) {
        step.timeout_ms = ms;
    }
    if let Some(r) = config.get("maxRetries").and_then(|v| v.as_u64()) {
        step.max_retries = r as u32;
    }
    if let Some(ms) = config.get("retryDelayMs").and_then(|v| v.as_u64()) {
        step.retry_delay_ms = ms;
    }
    if let Some(b) = config.get("backoff").and_then(|v| v.as_str()) {
        step.backoff = match b {
            "linear" => BackoffStrategy::Linear,
            "exponential" => BackoffStrategy::Exponential,
            _ => BackoffStrategy::Fixed,
        };
    }
    if let Some(r) = config.get("rollbackable").and_then(|v| v.as_bool()) {
        step.rollbackable = r;
    }
    if let Some(st) = config.get("stepType").and_then(|v| v.as_str()) {
        step.step_type = Some(st.to_string());
    }
    if let Some(c) = config.get("config") {
        step.config = Some(c.clone());
    }
    if let Some(c) = config.get("condition").and_then(|v| v.as_str()) {
        step.condition = Some(c.to_string());
    }
    if let Some(tm) = config.get("triggerMode").and_then(|v| v.as_str()) {
        step.trigger_mode = match tm {
            "any" => TriggerMode::Any,
            _ => TriggerMode::All,
        };
    }

    serde_json::to_string(&step).map_err(|e| napi::Error::from_reason(format!("{e}")))
}

/// Build a DAG flow from an array of step JSON definitions.
/// Validates the DAG (cycle detection) and returns the flow JSON.
#[napi]
pub fn szal_build_dag_flow(name: String, steps_json: String) -> napi::Result<String> {
    let steps: Vec<StepDef> = serde_json::from_str(&steps_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid steps JSON: {e}")))?;

    let mut flow = FlowDef::new(&name, FlowMode::Dag);
    for step in steps {
        flow.add_step(step);
    }

    flow.validate()
        .map_err(|e| napi::Error::from_reason(format!("Flow validation failed: {e}")))?;

    serde_json::to_string(&flow).map_err(|e| napi::Error::from_reason(format!("{e}")))
}

/// Resolve template variables in a string.
/// Supports dot-notation path walking: `{{steps.build.output.url}}`
#[napi]
pub fn szal_resolve_template(template: String, context_json: String) -> napi::Result<String> {
    let context: serde_json::Value = serde_json::from_str(&context_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid context JSON: {e}")))?;

    let mut result = template.clone();
    // Find all {{path}} patterns and resolve them
    while let Some(start) = result.find("{{") {
        let end = match result[start..].find("}}") {
            Some(e) => start + e + 2,
            None => break,
        };

        let path = result[start + 2..end - 2].trim();
        let parts: Vec<&str> = path.split('.').collect();
        let mut value = &context;
        for part in &parts {
            value = match value.get(*part) {
                Some(v) => v,
                None => &serde_json::Value::Null,
            };
        }

        let replacement = match value {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Null => String::new(),
            other => other.to_string(),
        };

        result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
    }

    Ok(result)
}
