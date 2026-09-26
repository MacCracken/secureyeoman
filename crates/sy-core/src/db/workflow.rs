//! Workflow storage — definitions, runs, and versions via PostgreSQL.
//!
//! The JSON shapes ([`WorkflowRow::to_definition`], [`WorkflowRunRow::to_json`],
//! [`WorkflowVersionRow::to_json`]) are the TS gateway's `WorkflowDefinition`,
//! `WorkflowRun` and `WorkflowVersion`, which the dashboard consumes.

use serde::Deserialize;
use sqlx::PgPool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkflowRow {
    pub id: uuid::Uuid,
    pub name: String,
    pub description: Option<String>,
    pub steps_json: serde_json::Value,
    pub edges_json: serde_json::Value,
    pub triggers_json: serde_json::Value,
    pub is_enabled: bool,
    pub version: i32,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub autonomy_level: String,
    pub emergency_stop_procedure: Option<String>,
    pub source: String,
    pub requires_json: Option<serde_json::Value>,
}

fn array_or_empty(v: &serde_json::Value) -> serde_json::Value {
    if v.is_array() {
        v.clone()
    } else {
        serde_json::json!([])
    }
}

impl WorkflowRow {
    /// The TS `WorkflowDefinition` wire shape.
    pub fn to_definition(&self) -> serde_json::Value {
        let mut def = serde_json::json!({
            "id": self.id,
            "name": self.name,
            "steps": array_or_empty(&self.steps_json),
            "edges": array_or_empty(&self.edges_json),
            "triggers": array_or_empty(&self.triggers_json),
            "isEnabled": self.is_enabled,
            "version": self.version,
            "createdBy": self.created_by,
            "autonomyLevel": self.autonomy_level,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        });
        if let Some(d) = &self.description {
            def["description"] = serde_json::json!(d);
        }
        if let Some(p) = &self.emergency_stop_procedure {
            def["emergencyStopProcedure"] = serde_json::json!(p);
        }
        def
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkflowRunRow {
    pub id: uuid::Uuid,
    pub workflow_id: uuid::Uuid,
    pub workflow_name: String,
    pub status: String,
    pub input_json: Option<serde_json::Value>,
    pub output_json: Option<serde_json::Value>,
    pub error: Option<String>,
    pub triggered_by: String,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

impl WorkflowRunRow {
    /// The TS `WorkflowRun` wire shape.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "workflowId": self.workflow_id,
            "workflowName": self.workflow_name,
            "status": self.status,
            "input": self.input_json,
            "output": self.output_json,
            "error": self.error,
            "triggeredBy": self.triggered_by,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        })
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkflowStepRunRow {
    pub id: uuid::Uuid,
    pub run_id: uuid::Uuid,
    pub step_id: String,
    pub step_name: String,
    pub step_type: String,
    pub status: String,
    pub input_json: Option<serde_json::Value>,
    pub output_json: Option<serde_json::Value>,
    pub error: Option<String>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub duration_ms: Option<i32>,
}

impl WorkflowStepRunRow {
    /// The TS `WorkflowStepRun` wire shape.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "runId": self.run_id,
            "stepId": self.step_id,
            "stepName": self.step_name,
            "stepType": self.step_type,
            "status": self.status,
            "input": self.input_json,
            "output": self.output_json,
            "error": self.error,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "durationMs": self.duration_ms,
        })
    }
}

/// A version snapshot (`workflow.versions`).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkflowVersionRow {
    pub id: String,
    pub workflow_id: uuid::Uuid,
    pub version_tag: Option<String>,
    pub snapshot: serde_json::Value,
    pub diff_summary: Option<String>,
    pub changed_fields: Vec<String>,
    pub author: String,
    pub created_at: i64,
}

impl WorkflowVersionRow {
    /// The TS `WorkflowVersion` wire shape.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "workflowId": self.workflow_id,
            "versionTag": self.version_tag,
            "snapshot": self.snapshot,
            "diffSummary": self.diff_summary,
            "changedFields": self.changed_fields,
            "author": self.author,
            "createdAt": self.created_at,
        })
    }
}

// ── Definitions ──────────────────────────────────────────────────────────

/// A page of definitions (by name) and the total count.
pub async fn list_workflows(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> Result<(Vec<WorkflowRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow.definitions")
        .fetch_one(pool)
        .await?;
    let rows = sqlx::query_as::<_, WorkflowRow>(
        "SELECT * FROM workflow.definitions ORDER BY name ASC LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_workflow(
    pool: &PgPool,
    id: uuid::Uuid,
) -> Result<Option<WorkflowRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowRow>("SELECT * FROM workflow.definitions WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// A new workflow definition.
pub struct NewWorkflow<'a> {
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub steps: &'a serde_json::Value,
    pub edges: &'a serde_json::Value,
    pub triggers: &'a serde_json::Value,
    pub is_enabled: bool,
    pub created_by: &'a str,
    pub autonomy_level: &'a str,
    pub source: &'a str,
}

pub async fn create_workflow(
    pool: &PgPool,
    w: &NewWorkflow<'_>,
) -> Result<WorkflowRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, WorkflowRow>(
        "INSERT INTO workflow.definitions
             (name, description, steps_json, edges_json, triggers_json, is_enabled, version,
              created_by, autonomy_level, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $10)
         RETURNING *",
    )
    .bind(w.name)
    .bind(w.description)
    .bind(w.steps)
    .bind(w.edges)
    .bind(w.triggers)
    .bind(w.is_enabled)
    .bind(w.created_by)
    .bind(w.autonomy_level)
    .bind(w.source)
    .bind(now)
    .fetch_one(pool)
    .await
}

/// A partial update of a definition (the TS `WorkflowDefinitionUpdate`);
/// absent fields keep their value.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowUpdate {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub description: Option<Option<String>>,
    pub steps: Option<Vec<serde_json::Value>>,
    pub edges: Option<Vec<serde_json::Value>>,
    pub triggers: Option<Vec<serde_json::Value>>,
    pub is_enabled: Option<bool>,
    pub version: Option<i32>,
    pub autonomy_level: Option<String>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub emergency_stop_procedure: Option<Option<String>>,
}

impl WorkflowUpdate {
    /// The tracked fields of a version snapshot, as an update.
    pub fn from_snapshot(snapshot: &serde_json::Value) -> Self {
        let text = |k: &str| snapshot.get(k).and_then(|v| v.as_str()).map(str::to_string);
        let list = |k: &str| snapshot.get(k).and_then(|v| v.as_array()).cloned();
        WorkflowUpdate {
            name: text("name"),
            description: snapshot
                .get("description")
                .map(|v| v.as_str().map(str::to_string)),
            steps: list("steps"),
            edges: list("edges"),
            triggers: list("triggers"),
            is_enabled: snapshot.get("isEnabled").and_then(|v| v.as_bool()),
            version: None,
            autonomy_level: text("autonomyLevel"),
            emergency_stop_procedure: None,
        }
    }
}

fn json_list(v: &Option<Vec<serde_json::Value>>) -> Option<serde_json::Value> {
    v.as_ref()
        .map(|items| serde_json::Value::Array(items.clone()))
}

/// Apply a partial update. `None` if the definition does not exist.
pub async fn update_workflow(
    pool: &PgPool,
    id: uuid::Uuid,
    u: &WorkflowUpdate,
) -> Result<Option<WorkflowRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowRow>(
        "UPDATE workflow.definitions SET
             name = COALESCE($2, name),
             description = CASE WHEN $3 THEN $4 ELSE description END,
             steps_json = COALESCE($5, steps_json),
             edges_json = COALESCE($6, edges_json),
             triggers_json = COALESCE($7, triggers_json),
             is_enabled = COALESCE($8, is_enabled),
             version = COALESCE($9, version),
             autonomy_level = COALESCE($10, autonomy_level),
             emergency_stop_procedure = CASE WHEN $11 THEN $12 ELSE emergency_stop_procedure END,
             updated_at = $13
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .bind(u.name.as_deref())
    .bind(u.description.is_some())
    .bind(u.description.clone().flatten())
    .bind(json_list(&u.steps))
    .bind(json_list(&u.edges))
    .bind(json_list(&u.triggers))
    .bind(u.is_enabled)
    .bind(u.version)
    .bind(u.autonomy_level.as_deref())
    .bind(u.emergency_stop_procedure.is_some())
    .bind(u.emergency_stop_procedure.clone().flatten())
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

pub async fn delete_workflow(pool: &PgPool, id: uuid::Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM workflow.definitions WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

// ── Runs ─────────────────────────────────────────────────────────────────

/// A page of runs, newest first, optionally for one workflow, and the total.
pub async fn list_runs(
    pool: &PgPool,
    workflow_id: Option<uuid::Uuid>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<WorkflowRunRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workflow.runs WHERE $1::uuid IS NULL OR workflow_id = $1",
    )
    .bind(workflow_id)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, WorkflowRunRow>(
        "SELECT * FROM workflow.runs WHERE $1::uuid IS NULL OR workflow_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
    )
    .bind(workflow_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn create_run(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    workflow_name: &str,
    input_json: Option<&serde_json::Value>,
    triggered_by: &str,
) -> Result<WorkflowRunRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, WorkflowRunRow>(
        "INSERT INTO workflow.runs (workflow_id, workflow_name, input_json, triggered_by, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(workflow_id).bind(workflow_name).bind(input_json).bind(triggered_by).bind(now)
    .fetch_one(pool).await
}

pub async fn get_run(pool: &PgPool, id: uuid::Uuid) -> Result<Option<WorkflowRunRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowRunRow>("SELECT * FROM workflow.runs WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_step_runs(
    pool: &PgPool,
    run_id: uuid::Uuid,
) -> Result<Vec<WorkflowStepRunRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowStepRunRow>(
        "SELECT * FROM workflow.step_runs WHERE run_id = $1 ORDER BY started_at ASC NULLS LAST, id ASC",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await
}

/// Cancel a pending or running run. Returns the run as it now is (a finished
/// run is returned unchanged), or `None` if it does not exist.
pub async fn cancel_run(
    pool: &PgPool,
    id: uuid::Uuid,
) -> Result<Option<WorkflowRunRow>, sqlx::Error> {
    let cancelled = sqlx::query_as::<_, WorkflowRunRow>(
        "UPDATE workflow.runs SET status = 'cancelled', completed_at = $2
         WHERE id = $1 AND status IN ('pending', 'running')
         RETURNING *",
    )
    .bind(id)
    .bind(now_ms())
    .fetch_optional(pool)
    .await?;
    match cancelled {
        Some(run) => Ok(Some(run)),
        None => get_run(pool, id).await,
    }
}

/// Update a workflow run status, output, and error. A cancelled run keeps its
/// status: the engine finishing afterwards must not revive it.
pub async fn update_run_status(
    pool: &PgPool,
    id: uuid::Uuid,
    status: &str,
    output_json: Option<&serde_json::Value>,
    error: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = now_ms();
    let (started, completed) = match status {
        "running" => (Some(now), None),
        "completed" | "failed" | "cancelled" => (None, Some(now)),
        _ => (None, None),
    };

    if let Some(started_at) = started {
        sqlx::query(
            "UPDATE workflow.runs SET status = $1, started_at = COALESCE(started_at, $2), output_json = COALESCE($3, output_json), error = $4
             WHERE id = $5 AND status <> 'cancelled'",
        )
        .bind(status)
        .bind(started_at)
        .bind(output_json)
        .bind(error)
        .bind(id)
        .execute(pool)
        .await?;
    } else if let Some(completed_at) = completed {
        sqlx::query(
            "UPDATE workflow.runs SET status = $1, completed_at = $2, output_json = COALESCE($3, output_json), error = $4
             WHERE id = $5 AND status <> 'cancelled'",
        )
        .bind(status)
        .bind(completed_at)
        .bind(output_json)
        .bind(error)
        .bind(id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query("UPDATE workflow.runs SET status = $1 WHERE id = $2 AND status <> 'cancelled'")
            .bind(status)
            .bind(id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

// ── Versions ─────────────────────────────────────────────────────────────

/// A new version snapshot.
pub struct NewVersion<'a> {
    pub workflow_id: uuid::Uuid,
    pub snapshot: &'a serde_json::Value,
    pub diff_summary: Option<&'a str>,
    pub changed_fields: &'a [String],
    pub author: &'a str,
}

pub async fn create_version(
    pool: &PgPool,
    v: &NewVersion<'_>,
) -> Result<WorkflowVersionRow, sqlx::Error> {
    sqlx::query_as::<_, WorkflowVersionRow>(
        "INSERT INTO workflow.versions
             (id, workflow_id, version_tag, snapshot, diff_summary, changed_fields, author, created_at)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(uuid::Uuid::now_v7().to_string())
    .bind(v.workflow_id)
    .bind(v.snapshot)
    .bind(v.diff_summary)
    .bind(v.changed_fields)
    .bind(v.author)
    .bind(now_ms())
    .fetch_one(pool)
    .await
}

/// A page of a workflow's versions, newest first, and the total.
pub async fn list_versions(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    limit: i64,
    offset: i64,
) -> Result<(Vec<WorkflowVersionRow>, i64), sqlx::Error> {
    let total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM workflow.versions WHERE workflow_id = $1")
            .bind(workflow_id)
            .fetch_one(pool)
            .await?;
    let rows = sqlx::query_as::<_, WorkflowVersionRow>(
        "SELECT * FROM workflow.versions WHERE workflow_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
    )
    .bind(workflow_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

/// A version of this workflow by id, else by tag.
pub async fn get_version(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    id_or_tag: &str,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowVersionRow>(
        "SELECT * FROM workflow.versions
         WHERE workflow_id = $1 AND (id = $2 OR version_tag = $2)
         ORDER BY (id = $2) DESC, created_at DESC
         LIMIT 1",
    )
    .bind(workflow_id)
    .bind(id_or_tag)
    .fetch_optional(pool)
    .await
}

/// The newest version, or the newest tagged one.
pub async fn latest_version(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    tagged_only: bool,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowVersionRow>(
        "SELECT * FROM workflow.versions
         WHERE workflow_id = $1 AND (NOT $2 OR version_tag IS NOT NULL)
         ORDER BY created_at DESC, id DESC
         LIMIT 1",
    )
    .bind(workflow_id)
    .bind(tagged_only)
    .fetch_optional(pool)
    .await
}

pub async fn tag_version(
    pool: &PgPool,
    id: &str,
    tag: &str,
) -> Result<Option<WorkflowVersionRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkflowVersionRow>(
        "UPDATE workflow.versions SET version_tag = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(tag)
    .fetch_optional(pool)
    .await
}

/// Tags of this workflow that start with `prefix`.
pub async fn tags_with_prefix(
    pool: &PgPool,
    workflow_id: uuid::Uuid,
    prefix: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT version_tag FROM workflow.versions
         WHERE workflow_id = $1 AND starts_with(version_tag, $2)",
    )
    .bind(workflow_id)
    .bind(prefix)
    .fetch_all(pool)
    .await
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
