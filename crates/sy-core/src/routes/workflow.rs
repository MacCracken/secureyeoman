//! Workflow routes — definitions, runs, versions, import/export.
//!
//! Request and response shapes follow the TS `workflow-routes.ts` (the
//! dashboard's contract): `{ definitions, total }`, `{ definition }`,
//! `{ run }`, `{ runs, total }`, `{ versions, total }`, bare `WorkflowVersion`s.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::workflow::{self, NewWorkflow, WorkflowRow, WorkflowUpdate};
use crate::orchestration::workflow_versions as versions;
use crate::routes::Page;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/v1/workflows",
            get(list_workflows).post(create_workflow),
        )
        .route("/api/v1/workflows/import", post(import_workflow))
        .route("/api/v1/workflows/runs", get(list_runs).post(create_run))
        .route(
            "/api/v1/workflows/runs/{id}",
            get(get_run).delete(cancel_run),
        )
        .route(
            "/api/v1/workflows/{id}",
            get(get_workflow)
                .put(update_workflow)
                .delete(delete_workflow),
        )
        .route("/api/v1/workflows/{id}/run", post(run_workflow))
        .route("/api/v1/workflows/{id}/runs", get(list_runs_for_workflow))
        .route("/api/v1/workflows/{id}/export", get(export_workflow))
        .route("/api/v1/workflows/{id}/versions", get(list_versions))
        .route("/api/v1/workflows/{id}/versions/tag", post(tag_version))
        .route(
            "/api/v1/workflows/{id}/versions/{idOrTag}",
            get(get_version),
        )
        .route(
            "/api/v1/workflows/{id}/versions/{a}/diff/{b}",
            get(diff_versions),
        )
        .route(
            "/api/v1/workflows/{id}/versions/{vId}/export",
            get(export_version),
        )
        .route(
            "/api/v1/workflows/{id}/versions/{vId}/rollback",
            post(rollback_version),
        )
        .route("/api/v1/workflows/{id}/drift", get(get_drift))
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({ "error": message.into() }))).into_response()
}

fn db_unavailable() -> Response {
    error(StatusCode::SERVICE_UNAVAILABLE, "Database not available")
}

fn internal(e: sqlx::Error) -> Response {
    error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

fn not_found(what: &str) -> Response {
    error(StatusCode::NOT_FOUND, format!("{what} not found"))
}

/// Workflow names are unique (`uq_workflow_def_name`): a clash is the
/// caller's conflict, not a server error.
fn write_error(e: sqlx::Error, name: &str) -> Response {
    match &e {
        sqlx::Error::Database(db) if db.is_unique_violation() => error(
            StatusCode::CONFLICT,
            format!("A workflow named \"{name}\" already exists"),
        ),
        _ => internal(e),
    }
}

/// Who a change is attributed to in version history (as in the TS gateway).
const AUTHOR: &str = "system";

const AUTONOMY_LEVELS: &[&str] = &["L1", "L2", "L3", "L4", "L5"];

// ── Definitions ──────────────────────────────────────────────────────────

/// GET /api/v1/workflows — `{ definitions, total }`, by name.
async fn list_workflows(State(state): State<AppState>, Query(page): Query<Page>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::list_workflows(pool, page.limit(20), page.offset()).await {
        Ok((rows, total)) => {
            let definitions: Vec<_> = rows.iter().map(WorkflowRow::to_definition).collect();
            Json(serde_json::json!({ "definitions": definitions, "total": total })).into_response()
        }
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id} — `{ definition }`.
async fn get_workflow(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::get_workflow(pool, id).await {
        Ok(Some(row)) => {
            Json(serde_json::json!({ "definition": row.to_definition() })).into_response()
        }
        Ok(None) => not_found("Workflow"),
        Err(e) => internal(e),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkflowRequest {
    #[serde(default)]
    name: String,
    description: Option<String>,
    #[serde(default)]
    steps: Vec<serde_json::Value>,
    #[serde(default)]
    edges: Vec<serde_json::Value>,
    #[serde(default)]
    triggers: Vec<serde_json::Value>,
    is_enabled: Option<bool>,
    autonomy_level: Option<String>,
}

fn check_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 200 {
        return Err("name must be 1-200 characters".into());
    }
    Ok(())
}

fn check_autonomy(level: Option<&str>) -> Result<(), String> {
    match level {
        Some(l) if !AUTONOMY_LEVELS.contains(&l) => Err(format!(
            "autonomyLevel must be one of: {}",
            AUTONOMY_LEVELS.join(", ")
        )),
        _ => Ok(()),
    }
}

/// POST /api/v1/workflows — `201 { definition }`.
async fn create_workflow(
    State(state): State<AppState>,
    Json(body): Json<CreateWorkflowRequest>,
) -> Response {
    if let Err(message) = check_name(&body.name).and(check_autonomy(body.autonomy_level.as_deref()))
    {
        return error(StatusCode::BAD_REQUEST, message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let new = NewWorkflow {
        name: body.name.trim(),
        description: body.description.as_deref(),
        steps: &serde_json::Value::Array(body.steps),
        edges: &serde_json::Value::Array(body.edges),
        triggers: &serde_json::Value::Array(body.triggers),
        is_enabled: body.is_enabled.unwrap_or(true),
        created_by: AUTHOR,
        autonomy_level: body.autonomy_level.as_deref().unwrap_or("L2"),
        source: "user",
    };
    match workflow::create_workflow(pool, &new).await {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "definition": row.to_definition() })),
        )
            .into_response(),
        Err(e) => write_error(e, new.name),
    }
}

fn autonomy_rank(level: &str) -> u32 {
    level.trim_start_matches('L').parse().unwrap_or(0)
}

/// PUT /api/v1/workflows/{id} — partial update, recorded as a new version;
/// `{ definition, warnings? }` (a warning flags an autonomy escalation).
async fn update_workflow(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<WorkflowUpdate>,
) -> Response {
    let name_check = body.name.as_deref().map_or(Ok(()), check_name);
    if let Err(message) = name_check.and(check_autonomy(body.autonomy_level.as_deref())) {
        return error(StatusCode::BAD_REQUEST, message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let previous_level = match workflow::get_workflow(pool, id).await {
        Ok(Some(row)) => row.autonomy_level,
        Ok(None) => return not_found("Workflow"),
        Err(e) => return internal(e),
    };
    let row = match workflow::update_workflow(pool, id, &body).await {
        Ok(Some(row)) => row,
        Ok(None) => return not_found("Workflow"),
        Err(e) => return write_error(e, body.name.as_deref().unwrap_or_default()),
    };
    // Version history is best-effort: a failure to record it must not fail
    // the edit itself (the TS gateway recorded it fire-and-forget).
    if let Err(e) = versions::record_version(pool, id, AUTHOR).await {
        tracing::warn!(workflow_id = %id, error = %e, "failed to record workflow version");
    }
    let mut response = serde_json::json!({ "definition": row.to_definition() });
    if let Some(new_level) = body.autonomy_level.as_deref()
        && autonomy_rank(new_level) > autonomy_rank(&previous_level)
    {
        response["warnings"] = serde_json::json!([format!(
            "Autonomy escalated from {previous_level} to {new_level} — confirm this changes the human oversight level"
        )]);
    }
    Json(response).into_response()
}

/// DELETE /api/v1/workflows/{id} — 204.
async fn delete_workflow(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::delete_workflow(pool, id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => not_found("Workflow"),
        Err(e) => internal(e),
    }
}

// ── Import / export ──────────────────────────────────────────────────────

/// Integrations a step's config may mention (the TS export's keyword list).
const INTEGRATION_KEYWORDS: &[&str] = &[
    "github", "gmail", "slack", "discord", "telegram", "notion", "jira", "stripe", "twitter",
    "youtube", "spotify", "linear", "airtable", "figma", "gitlab", "azure", "aws",
];

/// Tools (`config.toolName`) and integrations a definition's steps rely on.
fn requirements(steps: &serde_json::Value) -> serde_json::Value {
    let mut tools: Vec<String> = Vec::new();
    let mut integrations: Vec<&str> = Vec::new();
    for step in steps.as_array().into_iter().flatten() {
        let config = step.get("config").cloned().unwrap_or_default();
        if let Some(tool) = config.get("toolName").and_then(|t| t.as_str())
            && !tools.iter().any(|t| t == tool)
        {
            tools.push(tool.to_string());
        }
        let text = config.to_string().to_lowercase();
        for kw in INTEGRATION_KEYWORDS {
            if text.contains(kw) && !integrations.contains(kw) {
                integrations.push(kw);
            }
        }
    }
    let mut requires = serde_json::json!({});
    if !tools.is_empty() {
        requires["tools"] = serde_json::json!(tools);
    }
    if !integrations.is_empty() {
        requires["integrations"] = serde_json::json!(integrations);
    }
    requires
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// GET /api/v1/workflows/{id}/export — `{ exportedAt, requires, workflow }`.
async fn export_workflow(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::get_workflow(pool, id).await {
        Ok(Some(row)) => Json(serde_json::json!({
            "exportedAt": now_ms(),
            "requires": requirements(&row.steps_json),
            "workflow": row.to_definition(),
        }))
        .into_response(),
        Ok(None) => not_found("Workflow"),
        Err(e) => internal(e),
    }
}

#[derive(Deserialize)]
struct ImportWorkflowRequest {
    /// A `WorkflowExport`: `{ exportedAt, requires, workflow }`.
    #[serde(default)]
    workflow: serde_json::Value,
}

/// POST /api/v1/workflows/import — create a definition from an export;
/// `201 { definition, compatibility }` (missing requirements are reported,
/// not enforced).
async fn import_workflow(
    State(state): State<AppState>,
    Json(body): Json<ImportWorkflowRequest>,
) -> Response {
    let export = &body.workflow;
    let def = &export["workflow"];
    let Some(name) = def["name"].as_str().filter(|n| !n.trim().is_empty()) else {
        return error(
            StatusCode::BAD_REQUEST,
            "Invalid export: missing workflow.name",
        );
    };
    if !def["steps"].is_array() {
        return error(
            StatusCode::BAD_REQUEST,
            "Invalid export: workflow.steps must be an array",
        );
    }
    let autonomy = def["autonomyLevel"].as_str();
    if let Err(message) = check_name(name).and(check_autonomy(autonomy)) {
        return error(StatusCode::BAD_REQUEST, message);
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };

    let mut gaps = serde_json::Map::new();
    for key in ["integrations", "tools"] {
        if let Some(list) = export["requires"][key].as_array().filter(|l| !l.is_empty()) {
            gaps.insert(key.to_string(), serde_json::Value::Array(list.clone()));
        }
    }
    let compatibility = serde_json::json!({ "compatible": gaps.is_empty(), "gaps": gaps });

    let list = |key: &str| {
        def[key].as_array().map_or_else(
            || serde_json::json!([]),
            |a| serde_json::Value::Array(a.clone()),
        )
    };
    let new = NewWorkflow {
        name: name.trim(),
        description: Some(def["description"].as_str().unwrap_or("")),
        steps: &list("steps"),
        edges: &list("edges"),
        triggers: &list("triggers"),
        is_enabled: true,
        created_by: "imported",
        autonomy_level: autonomy.unwrap_or("L2"),
        source: "imported",
    };
    match workflow::create_workflow(pool, &new).await {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::json!({
                "definition": row.to_definition(),
                "compatibility": compatibility,
            })),
        )
            .into_response(),
        Err(e) => write_error(e, new.name),
    }
}

// ── Runs ─────────────────────────────────────────────────────────────────

fn manual_trigger() -> String {
    "manual".to_string()
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RunWorkflowRequest {
    input: Option<serde_json::Value>,
    #[serde(default = "manual_trigger")]
    triggered_by: String,
}

/// Execute a run on the workflow engine in the background, recording its
/// progress on the run row.
fn spawn_execution(
    pool: sqlx::PgPool,
    run_id: uuid::Uuid,
    wf: &WorkflowRow,
    input: Option<serde_json::Value>,
) {
    let wf_id = wf.id.to_string();
    let wf_name = wf.name.clone();
    let steps_json = wf.steps_json.clone();
    tokio::spawn(async move {
        let _ = workflow::update_run_status(&pool, run_id, "running", None, None).await;

        let steps: Vec<crate::orchestration::workflow::WorkflowStep> =
            serde_json::from_value(steps_json).unwrap_or_default();
        let def = crate::orchestration::workflow::WorkflowDefinition {
            id: wf_id,
            name: wf_name,
            steps,
            input: input.unwrap_or(serde_json::json!({})),
        };

        // Execute the workflow DAG via Hoosh/AGNOS LLM Gateway
        let engine = crate::orchestration::workflow::WorkflowEngine::new(
            crate::orchestration::hoosh::HooshDelegate::from_env(),
        );
        match engine.execute(&def).await {
            Ok(result) => {
                let output = serde_json::to_value(&result.final_output).ok();
                let _ =
                    workflow::update_run_status(&pool, run_id, "completed", output.as_ref(), None)
                        .await;
                tracing::info!(run_id = %run_id, steps = result.steps_completed, "workflow completed");
            }
            Err(e) => {
                let _ = workflow::update_run_status(
                    &pool,
                    run_id,
                    "failed",
                    None,
                    Some(&e.to_string()),
                )
                .await;
                tracing::error!(run_id = %run_id, error = %e, "workflow failed");
            }
        }
    });
}

/// POST /api/v1/workflows/{id}/run — start a run; `202 { run }`.
async fn run_workflow(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    body: Option<Json<RunWorkflowRequest>>,
) -> Response {
    let body = body.map(|Json(b)| b).unwrap_or_default();
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let wf = match workflow::get_workflow(pool, id).await {
        Ok(Some(row)) => row,
        Ok(None) => return not_found("Workflow"),
        Err(e) => return internal(e),
    };
    if !wf.is_enabled {
        return error(
            StatusCode::BAD_REQUEST,
            format!("Workflow is disabled: {}", wf.name),
        );
    }
    match workflow::create_run(pool, id, &wf.name, body.input.as_ref(), &body.triggered_by).await {
        Ok(run) => {
            spawn_execution(pool.clone(), run.id, &wf, body.input);
            (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({ "run": run.to_json() })),
            )
                .into_response()
        }
        Err(e) => internal(e),
    }
}

fn runs_page(result: Result<(Vec<workflow::WorkflowRunRow>, i64), sqlx::Error>) -> Response {
    match result {
        Ok((rows, total)) => {
            let runs: Vec<_> = rows.iter().map(|r| r.to_json()).collect();
            Json(serde_json::json!({ "runs": runs, "total": total })).into_response()
        }
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id}/runs — `{ runs, total }`, newest first.
async fn list_runs_for_workflow(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    runs_page(workflow::list_runs(pool, Some(id), page.limit(20), page.offset()).await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunsQuery {
    workflow_id: Option<uuid::Uuid>,
    limit: Option<i64>,
    offset: Option<i64>,
}

/// GET /api/v1/workflows/runs — all runs (optionally `?workflowId=`).
async fn list_runs(State(state): State<AppState>, Query(q): Query<RunsQuery>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let page = Page {
        limit: q.limit,
        offset: q.offset,
    };
    runs_page(workflow::list_runs(pool, q.workflow_id, page.limit(20), page.offset()).await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRunRequest {
    workflow_id: uuid::Uuid,
    input: Option<serde_json::Value>,
    #[serde(default = "manual_trigger")]
    triggered_by: String,
}

/// POST /api/v1/workflows/runs — start a run of `workflowId`; `202 { run }`.
async fn create_run(State(state): State<AppState>, Json(body): Json<CreateRunRequest>) -> Response {
    run_workflow(
        State(state),
        Path(body.workflow_id),
        Some(Json(RunWorkflowRequest {
            input: body.input,
            triggered_by: body.triggered_by,
        })),
    )
    .await
}

/// GET /api/v1/workflows/runs/{id} — `{ run }` with its `stepRuns`.
async fn get_run(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    let run = match workflow::get_run(pool, id).await {
        Ok(Some(run)) => run,
        Ok(None) => return not_found("Run"),
        Err(e) => return internal(e),
    };
    match workflow::list_step_runs(pool, id).await {
        Ok(steps) => {
            let mut json = run.to_json();
            json["stepRuns"] =
                serde_json::json!(steps.iter().map(|s| s.to_json()).collect::<Vec<_>>());
            Json(serde_json::json!({ "run": json })).into_response()
        }
        Err(e) => internal(e),
    }
}

/// DELETE /api/v1/workflows/runs/{id} — cancel a pending/running run; `{ run }`.
async fn cancel_run(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::cancel_run(pool, id).await {
        Ok(Some(run)) => Json(serde_json::json!({ "run": run.to_json() })).into_response(),
        Ok(None) => not_found("Run"),
        Err(e) => internal(e),
    }
}

// ── Versions ─────────────────────────────────────────────────────────────

/// GET /api/v1/workflows/{id}/versions — `{ versions, total }`, newest first.
async fn list_versions(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Query(page): Query<Page>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::list_versions(pool, id, page.limit(50), page.offset()).await {
        Ok((rows, total)) => {
            let list: Vec<_> = rows.iter().map(|v| v.to_json()).collect();
            Json(serde_json::json!({ "versions": list, "total": total })).into_response()
        }
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id}/versions/{idOrTag} — a `WorkflowVersion`.
async fn get_version(
    State(state): State<AppState>,
    Path((id, id_or_tag)): Path<(uuid::Uuid, String)>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::get_version(pool, id, &id_or_tag).await {
        Ok(Some(v)) => Json(v.to_json()).into_response(),
        Ok(None) => not_found("Version"),
        Err(e) => internal(e),
    }
}

#[derive(Deserialize, Default)]
struct TagRequest {
    tag: Option<String>,
}

/// POST /api/v1/workflows/{id}/versions/tag — snapshot and tag a release
/// (`{ tag? }`; generated `Y.M.D[-n]` otherwise); `201` + the version.
async fn tag_version(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    body: Option<Json<TagRequest>>,
) -> Response {
    let tag = body
        .and_then(|Json(b)| b.tag)
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    if tag.as_ref().is_some_and(|t| t.chars().count() > 100) {
        return error(
            StatusCode::BAD_REQUEST,
            "tag must be at most 100 characters",
        );
    }
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match versions::tag_release(pool, id, tag.as_deref(), AUTHOR).await {
        Ok(Some(v)) => (StatusCode::CREATED, Json(v.to_json())).into_response(),
        Ok(None) => not_found("Workflow"),
        Err(e) => internal(e),
    }
}

/// POST /api/v1/workflows/{id}/versions/{vId}/rollback — restore that
/// version's definition, recorded as a new version (returned).
async fn rollback_version(
    State(state): State<AppState>,
    Path((id, v_id)): Path<(uuid::Uuid, String)>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match versions::rollback(pool, id, &v_id, AUTHOR).await {
        Ok(Some(v)) => Json(v.to_json()).into_response(),
        Ok(None) => not_found("Version"),
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id}/versions/{a}/diff/{b} — `{ diff }` (unified).
async fn diff_versions(
    State(state): State<AppState>,
    Path((id, a, b)): Path<(uuid::Uuid, String, String)>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match versions::diff_versions(pool, id, &a, &b).await {
        Ok(Some(diff)) => Json(serde_json::json!({ "diff": diff })).into_response(),
        Ok(None) => not_found("Version"),
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id}/versions/{vId}/export — the version's snapshot
/// as a `WorkflowExport`.
async fn export_version(
    State(state): State<AppState>,
    Path((id, v_id)): Path<(uuid::Uuid, String)>,
) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match workflow::get_version(pool, id, &v_id).await {
        Ok(Some(v)) => Json(serde_json::json!({
            "exportedAt": now_ms(),
            "requires": {},
            "workflow": v.snapshot,
            "versionTag": v.version_tag,
        }))
        .into_response(),
        Ok(None) => not_found("Version"),
        Err(e) => internal(e),
    }
}

/// GET /api/v1/workflows/{id}/drift — changes since the last tagged release.
async fn get_drift(State(state): State<AppState>, Path(id): Path<uuid::Uuid>) -> Response {
    let Some(pool) = state.db() else {
        return db_unavailable();
    };
    match versions::drift(pool, id).await {
        Ok(Some(summary)) => Json(summary).into_response(),
        Ok(None) => not_found("Workflow"),
        Err(e) => internal(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_follows_the_ts_rules() {
        let page = |limit, offset| Page { limit, offset };
        assert_eq!(page(None, None).limit(20), 20);
        assert_eq!(page(Some(0), None).limit(20), 20);
        assert_eq!(page(Some(500), None).limit(20), 100);
        assert_eq!(page(None, Some(-5)).offset(), 0);
    }

    #[test]
    fn export_lists_tools_and_integrations() {
        let steps = serde_json::json!([
            {"config": {"toolName": "web_search", "query": "GitHub issues"}},
            {"config": {"toolName": "web_search", "channel": "slack"}},
        ]);
        let requires = requirements(&steps);
        assert_eq!(requires["tools"], serde_json::json!(["web_search"]));
        assert_eq!(
            requires["integrations"],
            serde_json::json!(["github", "slack"])
        );
        assert_eq!(requirements(&serde_json::json!([])), serde_json::json!({}));
    }
}
