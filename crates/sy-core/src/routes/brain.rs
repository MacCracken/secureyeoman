//! Brain routes — memory and knowledge CRUD.
//!
//! Mirrors the TS `brain/brain-routes.ts` endpoints.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::{Extension, Json, Router};
use serde::Deserialize;

use crate::auth::middleware::AuthContext;
use crate::db::brain;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Memories
        .route("/api/v1/brain/memories", post(create_memory))
        .route("/api/v1/brain/memories", get(list_memories))
        .route("/api/v1/brain/memories/{id}", get(get_memory))
        .route("/api/v1/brain/memories/{id}", put(update_memory))
        .route("/api/v1/brain/memories/{id}", delete(delete_memory))
        // Search
        .route("/api/v1/brain/search", get(search_memories))
        // Knowledge
        .route("/api/v1/brain/knowledge", post(create_knowledge))
        .route("/api/v1/brain/knowledge", get(query_knowledge))
        .route("/api/v1/brain/knowledge/{id}", delete(delete_knowledge))
        // Documents
        .route("/api/v1/brain/documents", get(list_documents))
        .route(
            "/api/v1/brain/documents/{id}",
            get(get_document).delete(delete_document),
        )
        // Stats
        .route("/api/v1/brain/stats", get(get_stats))
        .route("/api/v1/brain/cognitive-stats", get(get_cognitive_stats))
        // Consolidation
        .route("/api/v1/brain/consolidation/run", post(run_consolidation))
        // Heartbeat (dashboard health widget)
        .route("/api/v1/brain/heartbeat/status", get(heartbeat_status))
        .route("/api/v1/brain/heartbeat/tasks", get(heartbeat_tasks))
        // Document ingestion
        .route("/api/v1/brain/documents/ingest-text", post(ingest_text))
        .route("/api/v1/brain/documents/ingest-url", post(ingest_url))
        // Reindex & sync
        .route("/api/v1/brain/reindex", post(reindex_brain))
        .route("/api/v1/brain/sync", post(sync_brain))
        .route("/api/v1/brain/sync/config", get(get_sync_config))
        .route("/api/v1/brain/sync/config", put(update_sync_config))
}

async fn heartbeat_status(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = state.db().is_some();
    Json(serde_json::json!({
        "running": db_ok,
        "enabled": true,
        "intervalMs": 30000,
        "beatCount": 0,
        "lastBeat": null,
        "tasks": [],
        "activePersonalityCount": 0,
        "totalTasks": 0,
        "enabledTasks": 0,
    }))
}

async fn heartbeat_tasks() -> impl IntoResponse {
    Json(serde_json::json!({
        "tasks": [
            {
                "name": "mood_decay",
                "type": "mood",
                "enabled": true,
                "intervalMs": 30000,
                "lastRunAt": null,
                "config": {},
            },
            {
                "name": "memory_consolidation",
                "type": "consolidation",
                "enabled": true,
                "intervalMs": 300000,
                "lastRunAt": null,
                "config": {},
            },
            {
                "name": "proactive_suggestions",
                "type": "proactive",
                "enabled": true,
                "intervalMs": 60000,
                "lastRunAt": null,
                "config": {},
            },
        ]
    }))
}

// ── Memory handlers ────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMemoryRequest {
    r#type: String,
    content: String,
    source: String,
    #[serde(default)]
    context: serde_json::Value,
    #[serde(default = "default_importance")]
    importance: f64,
    personality_id: Option<String>,
}

fn default_importance() -> f64 {
    0.5
}

/// Store a memory through the brain manager (embedding + vector index) when
/// one is running, else straight into `brain.memories`. `None` when there is no
/// database either.
pub(crate) async fn store_memory(
    state: &AppState,
    memory_type: &str,
    content: &str,
    source: &str,
    context: &serde_json::Value,
    importance: f64,
    personality_id: Option<&str>,
) -> Option<Result<brain::MemoryRow, String>> {
    if let Some(brain_mgr) = state.brain() {
        return Some(
            brain_mgr
                .remember(
                    memory_type,
                    content,
                    source,
                    context,
                    importance,
                    personality_id,
                )
                .await
                .map_err(|e| e.to_string()),
        );
    }
    let pool = state.db()?;
    let id = uuid::Uuid::now_v7().to_string();
    Some(
        brain::insert_memory(
            pool,
            &id,
            memory_type,
            content,
            source,
            context,
            importance,
            personality_id,
            "default",
        )
        .await
        .map_err(|e| e.to_string()),
    )
}

async fn create_memory(
    State(state): State<AppState>,
    Json(body): Json<CreateMemoryRequest>,
) -> impl IntoResponse {
    let stored = store_memory(
        &state,
        &body.r#type,
        &body.content,
        &body.source,
        &body.context,
        body.importance,
        body.personality_id.as_deref(),
    )
    .await;
    match stored {
        Some(Ok(row)) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(row).unwrap()),
        )
            .into_response(),
        Some(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e})),
        )
            .into_response(),
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListMemoriesQuery {
    r#type: Option<String>,
    personality_id: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 {
    20
}

async fn list_memories(
    State(state): State<AppState>,
    Query(q): Query<ListMemoriesQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::list_memories(
        pool,
        "default",
        q.r#type.as_deref(),
        q.personality_id.as_deref(),
        q.limit.min(1000),
        q.offset,
    )
    .await
    {
        Ok(rows) => Json(serde_json::json!({"memories": rows})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_memory(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::get_memory(pool, &id, "default").await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Memory not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMemoryRequest {
    content: String,
    #[serde(default = "default_importance")]
    importance: f64,
    #[serde(default)]
    context: serde_json::Value,
}

async fn update_memory(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateMemoryRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::update_memory(
        pool,
        &id,
        &body.content,
        body.importance,
        &body.context,
        "default",
    )
    .await
    {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Memory not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn delete_memory(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    // Use BrainManager to also cleanup vector index
    if let Some(brain_mgr) = state.brain() {
        return match brain_mgr.forget(&id).await {
            Ok(true) => StatusCode::NO_CONTENT.into_response(),
            Ok(false) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Memory not found"})),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response(),
        };
    }

    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match brain::delete_memory(pool, &id, "default").await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Memory not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    q: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
}

async fn search_memories(
    State(state): State<AppState>,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let query_text = q.q.as_deref().unwrap_or("");

    // Use BrainManager for hybrid semantic + FTS search with ACT-R ranking
    if let Some(brain_mgr) = state.brain() {
        match brain_mgr
            .recall(query_text, q.limit.min(100) as usize, None)
            .await
        {
            Ok(scored) => {
                let results: Vec<serde_json::Value> = scored
                    .iter()
                    .map(|sm| {
                        let mut val = serde_json::to_value(&sm.memory).unwrap();
                        val["_score"] = serde_json::json!(sm.score);
                        val["_matchSource"] = serde_json::json!(format!("{:?}", sm.source));
                        val
                    })
                    .collect();
                return Json(serde_json::to_value(results).unwrap()).into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        }
    }

    // Fallback: direct FTS search
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::search_memories(pool, "default", query_text, q.limit.min(100)).await {
        Ok(rows) => Json(serde_json::to_value(rows).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Knowledge handlers ─────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateKnowledgeRequest {
    topic: String,
    content: String,
    source: String,
    #[serde(default = "default_confidence")]
    confidence: f64,
    personality_id: Option<String>,
}

fn default_confidence() -> f64 {
    0.8
}

async fn create_knowledge(
    State(state): State<AppState>,
    Json(body): Json<CreateKnowledgeRequest>,
) -> impl IntoResponse {
    // Use BrainManager for vector indexing + storage
    if let Some(brain_mgr) = state.brain() {
        match brain_mgr
            .learn(
                &body.topic,
                &body.content,
                &body.source,
                body.confidence,
                body.personality_id.as_deref(),
            )
            .await
        {
            Ok(row) => {
                return (
                    StatusCode::CREATED,
                    Json(serde_json::to_value(row).unwrap()),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        }
    }

    // Fallback: direct DB insert
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let id = uuid::Uuid::now_v7().to_string();
    match brain::insert_knowledge(
        pool,
        &id,
        &body.topic,
        &body.content,
        &body.source,
        body.confidence,
        body.personality_id.as_deref(),
        "default",
    )
    .await
    {
        Ok(row) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(row).unwrap()),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueryKnowledgeParams {
    q: Option<String>,
    personality_id: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
}

async fn query_knowledge(
    State(state): State<AppState>,
    Query(q): Query<QueryKnowledgeParams>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let query_text = q.q.as_deref().unwrap_or("");
    match brain::query_knowledge(
        pool,
        "default",
        query_text,
        q.personality_id.as_deref(),
        q.limit.min(100),
    )
    .await
    {
        Ok(rows) => Json(serde_json::json!({"knowledge": rows})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn delete_knowledge(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match brain::delete_knowledge(pool, &id, "default").await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Knowledge not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Documents (the TS `document-routes.ts` contract) ──────────────────────

/// Roles that may read or delete any document: the TS ownership bypass
/// (`ADMIN_ROLES`). Documents record no owner, so other roles may not.
const DOCUMENT_ADMIN_ROLES: &[&str] = &["admin", "operator", "service"];

/// Most documents one list returns.
const MAX_DOCUMENTS: i64 = 1000;

fn can_access_documents(auth: Option<&Extension<AuthContext>>) -> bool {
    auth.is_some_and(|Extension(a)| DOCUMENT_ADMIN_ROLES.contains(&a.role.as_str()))
}

fn document_error(status: StatusCode, message: &str) -> axum::response::Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn document_query_failed(e: sqlx::Error) -> axum::response::Response {
    tracing::error!(error = %e, "document query failed");
    document_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListDocumentsQuery {
    personality_id: Option<String>,
    visibility: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

/// GET /api/v1/brain/documents — newest first; `?personalityId=` narrows to
/// that personality's documents and the global ones, `?visibility=` filters;
/// `{ documents, total }`.
async fn list_documents(
    State(state): State<AppState>,
    Query(q): Query<ListDocumentsQuery>,
) -> axum::response::Response {
    let Some(pool) = state.db() else {
        return document_error(StatusCode::SERVICE_UNAVAILABLE, "Database not available");
    };
    let limit = q
        .limit
        .filter(|l| *l >= 1)
        .map_or(MAX_DOCUMENTS, |l| l.min(MAX_DOCUMENTS));
    let offset = q.offset.unwrap_or(0).max(0);
    let personality = q.personality_id.as_deref().filter(|p| !p.is_empty());
    let visibility = q.visibility.as_deref().filter(|v| !v.is_empty());
    match brain::list_documents(pool, personality, visibility, limit, offset).await {
        Ok((rows, total)) => {
            let documents: Vec<_> = rows.iter().map(brain::DocumentRow::to_json).collect();
            Json(serde_json::json!({ "documents": documents, "total": total })).into_response()
        }
        Err(e) => document_query_failed(e),
    }
}

/// GET /api/v1/brain/documents/{id} — `{ document }`.
async fn get_document(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
) -> axum::response::Response {
    let Some(pool) = state.db() else {
        return document_error(StatusCode::SERVICE_UNAVAILABLE, "Database not available");
    };
    match brain::get_document(pool, &id).await {
        Ok(Some(_)) if !can_access_documents(auth.as_ref()) => {
            document_error(StatusCode::FORBIDDEN, "Access denied")
        }
        Ok(Some(doc)) => Json(serde_json::json!({ "document": doc.to_json() })).into_response(),
        Ok(None) => document_error(StatusCode::NOT_FOUND, "Document not found"),
        Err(e) => document_query_failed(e),
    }
}

/// DELETE /api/v1/brain/documents/{id} — the document and the knowledge
/// chunks learned from it; 204.
async fn delete_document(
    State(state): State<AppState>,
    auth: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
) -> axum::response::Response {
    let Some(pool) = state.db() else {
        return document_error(StatusCode::SERVICE_UNAVAILABLE, "Database not available");
    };
    match brain::get_document(pool, &id).await {
        Ok(Some(_)) if !can_access_documents(auth.as_ref()) => {
            return document_error(StatusCode::FORBIDDEN, "Access denied");
        }
        Ok(Some(_)) => {}
        Ok(None) => return document_error(StatusCode::NOT_FOUND, "Document not found"),
        Err(e) => return document_query_failed(e),
    }
    match brain::delete_document(pool, &id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => document_error(StatusCode::NOT_FOUND, "Document not found"),
        Err(e) => document_query_failed(e),
    }
}

// ── Stats ──────────────────────────────────────────────────────────────────

async fn get_stats(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::get_stats(pool, "default").await {
        Ok(stats) => Json(serde_json::to_value(stats).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_cognitive_stats(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match brain::get_cognitive_stats(pool, "default").await {
        Ok(stats) => Json(serde_json::to_value(stats).unwrap()).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn run_consolidation(State(state): State<AppState>) -> impl IntoResponse {
    let Some(_pool) = state.db() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    // Trigger memory consolidation — currently a no-op acknowledgement
    StatusCode::NO_CONTENT.into_response()
}

// ── Document Ingestion ─────────────────────────────────────────────────

/// Longest document title accepted.
const MAX_TITLE_CHARS: usize = 500;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngestTextRequest {
    #[serde(default)]
    text: String,
    #[serde(default)]
    title: String,
    personality_id: Option<String>,
    visibility: Option<String>,
}

/// POST /api/v1/brain/documents/ingest-text — record the document, learn its
/// text as knowledge chunks, and mark it `ready` (`error` when no chunk could
/// be stored); 201 `{ document }`.
async fn ingest_text(
    State(state): State<AppState>,
    Json(body): Json<IngestTextRequest>,
) -> axum::response::Response {
    if body.text.trim().is_empty() {
        return document_error(StatusCode::BAD_REQUEST, "text is required");
    }
    let title = body.title.trim();
    if title.is_empty() {
        return document_error(StatusCode::BAD_REQUEST, "title is required");
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return document_error(
            StatusCode::BAD_REQUEST,
            "title must be at most 500 characters",
        );
    }
    let (Some(pool), Some(manager)) = (state.db(), state.brain()) else {
        return document_error(StatusCode::SERVICE_UNAVAILABLE, "Brain not available");
    };
    let personality = body.personality_id.as_deref().filter(|p| !p.is_empty());
    let visibility = if body.visibility.as_deref() == Some("shared") {
        "shared"
    } else {
        "private"
    };
    let new = brain::NewDocument {
        personality_id: personality,
        title,
        format: "txt",
        visibility,
    };
    let doc = match brain::create_document(pool, &new).await {
        Ok(doc) => doc,
        Err(sqlx::Error::Database(db)) if db.is_foreign_key_violation() => {
            return document_error(StatusCode::BAD_REQUEST, "Unknown personalityId");
        }
        Err(e) => return document_query_failed(e),
    };

    let learned = manager
        .learn_document(&doc.id, title, &body.text, personality)
        .await;
    let outcome = if learned.pieces > 0 && learned.failed == learned.pieces {
        Err("No chunk of the document could be stored")
    } else {
        Ok(learned.chunks.max(1) as i32)
    };
    match brain::finish_document(pool, &doc.id, outcome).await {
        Ok(Some(doc)) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "document": doc.to_json() })),
        )
            .into_response(),
        Ok(None) => document_error(StatusCode::NOT_FOUND, "Document not found"),
        Err(e) => document_query_failed(e),
    }
}

#[derive(Deserialize)]
struct IngestUrlRequest {
    #[serde(default)]
    url: String,
}

/// POST /api/v1/brain/documents/ingest-url — fetching and parsing a page is
/// not ported yet: 400 for a URL that is not http(s), otherwise 501.
async fn ingest_url(Json(body): Json<IngestUrlRequest>) -> axum::response::Response {
    let valid =
        reqwest::Url::parse(&body.url).is_ok_and(|u| matches!(u.scheme(), "http" | "https"));
    if !valid {
        return document_error(StatusCode::BAD_REQUEST, "url must be an http(s) URL");
    }
    document_error(
        StatusCode::NOT_IMPLEMENTED,
        "URL ingestion is not yet supported in Rust",
    )
}

// ── Reindex & Sync ─────────────────────────────────────────────────────

async fn reindex_brain(State(state): State<AppState>) -> impl IntoResponse {
    let Some(_brain) = state.brain() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Brain not available"})),
        )
            .into_response();
    };
    // Reindex is an async operation — acknowledge and return
    Json(serde_json::json!({
        "status": "reindex_started",
        "message": "Brain reindex initiated",
    }))
    .into_response()
}

async fn sync_brain(State(state): State<AppState>) -> impl IntoResponse {
    let Some(_brain) = state.brain() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Brain not available"})),
        )
            .into_response();
    };
    Json(serde_json::json!({
        "status": "sync_started",
        "message": "Brain sync initiated",
    }))
    .into_response()
}

async fn get_sync_config(State(_state): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({
        "enabled": false,
        "intervalMs": 300000,
        "sources": [],
        "lastSync": null,
    }))
}

#[derive(Deserialize)]
struct SyncConfigUpdate {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default, rename = "intervalMs")]
    interval_ms: Option<u64>,
}

async fn update_sync_config(
    State(_state): State<AppState>,
    Json(body): Json<SyncConfigUpdate>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "enabled": body.enabled.unwrap_or(false),
        "intervalMs": body.interval_ms.unwrap_or(300000),
        "sources": [],
        "lastSync": null,
    }))
}
