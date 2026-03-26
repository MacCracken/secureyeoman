//! AgnosAI orchestration engine — NAPI bindings for Node.js.
//!
//! Exposes agnosai's crew execution, scheduling, model routing,
//! agent scoring, and learning primitives to the TypeScript layer.
//! Async functions (crew execution) return Promises via napi's tokio_rt.

use std::sync::{Arc, OnceLock};

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::runtime::Runtime;

use agnosai::core::{AgentDefinition, CrewSpec, ResourceBudget, Task};
use agnosai::llm::router::{self, TaskProfile, TaskType};
use agnosai::orchestrator::Orchestrator;
use agnosai::orchestrator::scheduler::{self, Scheduler};
use agnosai::orchestrator::scoring;

// ── Tokio Runtime ──────────────────────────────────────────────────────────

fn runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("agnosai tokio runtime")
    })
}

fn orchestrator() -> &'static Arc<Orchestrator> {
    static ORCH: OnceLock<Arc<Orchestrator>> = OnceLock::new();
    ORCH.get_or_init(|| {
        let rt = runtime();
        let orch = rt.block_on(async {
            Orchestrator::new(ResourceBudget::default())
                .await
                .expect("agnosai orchestrator")
        });
        Arc::new(orch)
    })
}

// ── Crew Execution (Async) ─────────────────────────────────────────────────

/// Run a crew specification. Returns a Promise that resolves to JSON CrewState.
/// Input: JSON CrewSpec { name, agents: [...], tasks: [...], process? }
#[napi]
pub async fn agnosai_run_crew(spec_json: String) -> Result<String> {
    let spec: CrewSpec =
        serde_json::from_str(&spec_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    let orch = orchestrator().clone();
    let result = orch
        .run_crew(spec)
        .await
        .map_err(|e| Error::from_reason(format!("{e}")))?;

    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Cancel a running crew by ID. Returns a Promise.
#[napi]
pub async fn agnosai_cancel_crew(crew_id: String) -> Result<()> {
    let orch = orchestrator().clone();
    let uuid = uuid::Uuid::parse_str(&crew_id)
        .map_err(|e| Error::from_reason(format!("Invalid crew ID: {e}")))?;
    orch.cancel_crew(uuid)
        .await
        .map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Validation (Sync) ──────────────────────────────────────────────────────

/// Validate a CrewSpec JSON. Returns JSON { valid: bool, errors: string[] }.
#[napi]
pub fn agnosai_validate_crew(spec_json: String) -> String {
    let mut errors: Vec<String> = Vec::new();

    match serde_json::from_str::<CrewSpec>(&spec_json) {
        Ok(spec) => {
            if spec.agents.is_empty() {
                errors.push("Crew must have at least one agent".into());
            }
            if spec.tasks.is_empty() {
                errors.push("Crew must have at least one task".into());
            }
            for (i, agent) in spec.agents.iter().enumerate() {
                if agent.role.is_empty() {
                    errors.push(format!("Agent {i} has empty role"));
                }
                if agent.goal.is_empty() {
                    errors.push(format!("Agent {i} has empty goal"));
                }
            }
            for (i, task) in spec.tasks.iter().enumerate() {
                if task.description.is_empty() {
                    errors.push(format!("Task {i} has empty description"));
                }
            }
        }
        Err(e) => {
            errors.push(format!("Invalid JSON: {e}"));
        }
    }

    serde_json::json!({
        "valid": errors.is_empty(),
        "errors": errors,
    })
    .to_string()
}

// ── Scheduling (Sync) ──────────────────────────────────────────────────────

/// Schedule tasks by priority. Returns JSON array of task IDs in execution order.
/// Input: JSON array of tasks [{ id, description, priority?, dependencies? }]
#[napi]
pub fn agnosai_schedule_tasks(tasks_json: String) -> Result<String> {
    let tasks: Vec<Task> =
        serde_json::from_str(&tasks_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    let mut scheduler = Scheduler::new();
    for task in tasks {
        scheduler.enqueue(task);
    }

    let mut ordered = Vec::new();
    while let Some(task) = scheduler.dequeue() {
        ordered.push(task.id.to_string());
    }

    serde_json::to_string(&ordered).map_err(|e| Error::from_reason(format!("{e}")))
}

/// Topological sort of tasks with dependencies.
/// Returns JSON { order: string[], has_cycle: bool }.
#[napi]
pub fn agnosai_topological_sort(tasks_json: String) -> Result<String> {
    let tasks: Vec<Task> =
        serde_json::from_str(&tasks_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    match scheduler::topological_sort_tasks(&tasks) {
        Ok(order) => {
            let ids: Vec<String> = order.iter().map(|id| id.to_string()).collect();
            let result = serde_json::json!({ "order": ids, "has_cycle": false });
            serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
        }
        Err(e) => {
            let result =
                serde_json::json!({ "order": [], "has_cycle": true, "error": e.to_string() });
            serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
        }
    }
}

// ── Model Routing (Sync) ───────────────────────────────────────────────────

/// Route a task to the recommended model tier.
/// Input: task_type (summarize|classify|code|plan|reason|research|multistep),
///        complexity (simple|medium|complex)
/// Returns JSON { tier: string, model: string }.
#[napi]
pub fn agnosai_route_model(task_type: String, complexity: String) -> Result<String> {
    let tt = match task_type.to_lowercase().as_str() {
        "summarize" => TaskType::Summarize,
        "classify" => TaskType::Classify,
        "code" => TaskType::Code,
        "plan" => TaskType::Plan,
        "reason" => TaskType::Reason,
        "research" => TaskType::Research,
        "multistep" | "multi_step" => TaskType::MultiStep,
        _ => {
            return Err(Error::from_reason(format!(
                "Unknown task type: {task_type}"
            )));
        }
    };

    let cx = router::parse_complexity(&complexity);
    let profile = TaskProfile::new(tt, cx);
    let tier = router::route(&profile);
    let model = router::default_model(tier);

    let result = serde_json::json!({
        "tier": format!("{tier:?}"),
        "model": model,
    });

    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Agent Scoring (Sync) ───────────────────────────────────────────────────

/// Rank agents for a task. Returns JSON array of [agent_index, score] pairs,
/// sorted by score descending.
/// Input: agents_json (array of AgentDefinition), task_json (Task)
#[napi]
pub fn agnosai_rank_agents(agents_json: String, task_json: String) -> Result<String> {
    let agents: Vec<AgentDefinition> =
        serde_json::from_str(&agents_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    let task: Task =
        serde_json::from_str(&task_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    let ranked = scoring::rank_agents(&agents, &task);
    let result: Vec<serde_json::Value> = ranked
        .iter()
        .map(|&(idx, score)| serde_json::json!([idx, score]))
        .collect();

    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Agent Definition (Sync) ────────────────────────────────────────────────

/// Create an AgentDefinition from SY profile data.
/// Input: JSON { agent_key, name?, role, goal, tools?, complexity?, domain? }
/// Returns: JSON AgentDefinition.
#[napi]
pub fn agnosai_create_agent_def(profile_json: String) -> Result<String> {
    let def: AgentDefinition =
        serde_json::from_str(&profile_json).map_err(|e| Error::from_reason(format!("{e}")))?;
    serde_json::to_string(&def).map_err(|e| Error::from_reason(format!("{e}")))
}

// ── Tool Registry (Sync) ───────────────────────────────────────────────────

/// List agnosai's built-in tool names.
#[napi]
pub fn agnosai_list_builtin_tools() -> String {
    let registry = agnosai::tools::registry::ToolRegistry::new();
    let schemas = registry.list();
    let names: Vec<&str> = schemas.iter().map(|s| s.name.as_str()).collect();
    serde_json::to_string(&names).unwrap_or_else(|_| "[]".to_string())
}

// ── Learning Primitives (Sync) ─────────────────────────────────────────────

/// UCB1 bandit arm selection.
/// Input: JSON array of { name: string, rewards: number, pulls: number }
/// Returns: JSON { selected: string, ucb_score: number }
#[napi]
pub fn agnosai_ucb1_select(arms_json: String) -> Result<String> {
    let arms: Vec<serde_json::Value> =
        serde_json::from_str(&arms_json).map_err(|e| Error::from_reason(format!("{e}")))?;

    let total_pulls: f64 = arms
        .iter()
        .map(|a| a.get("pulls").and_then(|v| v.as_f64()).unwrap_or(0.0))
        .sum();

    if total_pulls < 1.0 {
        // No data yet — select first arm
        let first = arms
            .first()
            .and_then(|a| a.get("name").and_then(|v| v.as_str()))
            .unwrap_or("unknown");
        let result = serde_json::json!({ "selected": first, "ucb_score": f64::INFINITY });
        return serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")));
    }

    let ln_total = total_pulls.ln();
    let mut best_name = "unknown";
    let mut best_score = f64::NEG_INFINITY;

    for arm in &arms {
        let name = arm
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let rewards = arm.get("rewards").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let pulls = arm.get("pulls").and_then(|v| v.as_f64()).unwrap_or(0.0);

        if pulls < 1.0 {
            // Unexplored arm — highest priority
            best_name = name;
            best_score = f64::INFINITY;
            break;
        }

        let exploitation = rewards / pulls;
        let exploration = (2.0 * ln_total / pulls).sqrt();
        let ucb = exploitation + exploration;

        if ucb > best_score {
            best_score = ucb;
            best_name = name;
        }
    }

    let result = serde_json::json!({ "selected": best_name, "ucb_score": best_score });
    serde_json::to_string(&result).map_err(|e| Error::from_reason(format!("{e}")))
}
