//! Marketplace routes — skill browsing, publishing, and the community repo sync.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::db::marketplace;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/marketplace/skills", get(list_skills))
        .route("/api/v1/marketplace/skills/{id}", get(get_skill))
        .route("/api/v1/marketplace/{id}", get(get_marketplace_item))
        .route("/api/v1/marketplace/{id}/install", post(install_item))
        .route("/api/v1/marketplace/{id}/uninstall", post(uninstall_item))
        .route("/api/v1/marketplace/publish", post(publish_item))
        .route(
            "/api/v1/marketplace/community/status",
            get(community_status),
        )
        .route("/api/v1/marketplace/community/sync", post(community_sync))
        .route("/api/v1/marketplace", get(list_marketplace))
        .route(
            "/api/v1/marketplace/community/personalities",
            get(list_community_personalities),
        )
        .route(
            "/api/v1/marketplace/community/personalities/install",
            post(install_community_personality),
        )
        .route(
            "/api/v1/marketplace/community/personalities/avatar/{path}",
            get(community_personality_avatar),
        )
}

#[derive(Deserialize)]
struct SkillQuery {
    category: Option<String>,
    installed: Option<bool>,
    origin: Option<String>,
    source: Option<String>,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 {
    20
}

async fn list_skills(
    State(state): State<AppState>,
    Query(q): Query<SkillQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };

    // Translate origin → source filter (matches TS marketplace-routes.ts)
    let effective_source = match q.origin.as_deref() {
        Some("community") => Some("community"),
        Some("marketplace") => Some("marketplace"),
        _ => q.source.as_deref(),
    };

    match marketplace::list_skills(
        pool,
        q.category.as_deref(),
        q.installed,
        effective_source,
        q.limit.min(100),
        q.offset,
    )
    .await
    {
        Ok(rows) => Json(serde_json::json!({"skills": rows, "total": rows.len()})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_skill(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::get_skill(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Skill not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_marketplace_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::get_marketplace_item(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Item not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn install_item(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::install_item(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Item not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn uninstall_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::uninstall_item(pool, &id).await {
        Ok(Some(row)) => Json(serde_json::to_value(row).unwrap()).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Item not found"})),
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
struct PublishRequest {
    name: String,
    description: Option<String>,
    version: Option<String>,
    category: Option<String>,
    #[serde(default = "empty_tools")]
    tools: serde_json::Value,
    instructions: Option<String>,
}
fn empty_tools() -> serde_json::Value {
    serde_json::json!([])
}

async fn publish_item(
    State(state): State<AppState>,
    Json(body): Json<PublishRequest>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let id = uuid::Uuid::now_v7().to_string();
    match marketplace::publish_item(
        pool,
        &id,
        &body.name,
        body.description.as_deref(),
        body.version.as_deref(),
        body.category.as_deref(),
        &body.tools,
        body.instructions.as_deref(),
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

/// Where the community repository is checked out.
fn community_repo_path() -> String {
    std::env::var("COMMUNITY_REPO_PATH")
        .unwrap_or_else(|_| "/usr/share/secureyeoman/community-repo".to_string())
}

/// GET /api/v1/marketplace/community/status — the TS shape:
/// `{ communityRepoPath, skillCount, lastSyncedAt }`.
async fn community_status(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::community_status(pool).await {
        Ok((skill_count, last_synced_at)) => Json(serde_json::json!({
            "communityRepoPath": community_repo_path(),
            "skillCount": skill_count,
            "lastSyncedAt": last_synced_at,
        }))
        .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "community status query failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal server error"})),
            )
                .into_response()
        }
    }
}

async fn list_marketplace(
    State(state): State<AppState>,
    Query(q): Query<SkillQuery>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };

    // Same origin → source translation as list_skills
    let effective_source = match q.origin.as_deref() {
        Some("community") => Some("community"),
        Some("marketplace") => Some("marketplace"),
        _ => q.source.as_deref(),
    };

    match marketplace::list_skills(
        pool,
        q.category.as_deref(),
        q.installed,
        effective_source,
        q.limit.min(100),
        q.offset,
    )
    .await
    {
        Ok(rows) => Json(serde_json::json!({"skills": rows, "total": rows.len()})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// Personality sexes the soul accepts (the TS `PersonalitySchema`).
const PERSONALITY_SEXES: &[&str] = &["male", "female", "non-binary", "unspecified"];

/// Split a personality markdown file into its frontmatter and body.
fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    let rest = content.strip_prefix("---")?;
    let rest = rest
        .strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'))?;
    let end = rest.find("\n---")?;
    let frontmatter = rest[..end].trim_end_matches('\r');
    let after = &rest[end + "\n---".len()..];
    let body = after.split_once('\n').map_or("", |(_, body)| body);
    Some((frontmatter, body))
}

/// A frontmatter value, unquoted (the TS `parseFrontmatter` for one key).
fn frontmatter_value<'a>(frontmatter: &'a str, key: &str) -> Option<&'a str> {
    frontmatter.lines().find_map(|line| {
        let line = line.trim();
        if line.starts_with('#') {
            return None;
        }
        let (k, v) = line.split_once(':')?;
        (k.trim() == key).then(|| unquote(v.trim()))
    })
}

fn unquote(value: &str) -> &str {
    ['"', '\'']
        .iter()
        .find_map(|q| value.strip_prefix(*q)?.strip_suffix(*q))
        .unwrap_or(value)
}

/// Traits as the TS `parseTraits` read them: `- **Key**: value` lines, then
/// any frontmatter `traits` keys without a value, mapped to themselves.
fn community_traits(
    content: &str,
    frontmatter: &str,
) -> serde_json::Map<String, serde_json::Value> {
    let mut traits = serde_json::Map::new();
    for line in content.lines() {
        let Some(rest) = line.strip_prefix('-') else {
            continue;
        };
        if !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let Some((key, value)) = rest
            .trim_start()
            .strip_prefix("**")
            .and_then(|r| r.split_once("**:"))
        else {
            continue;
        };
        let value = value.trim();
        if key.is_empty() || key.contains('*') || value.is_empty() {
            continue;
        }
        traits.insert(
            key.trim().to_string(),
            serde_json::Value::String(value.to_string()),
        );
    }
    let keys = frontmatter_value(frontmatter, "traits").unwrap_or_default();
    let keys = keys.trim_start_matches('[').trim_end_matches(']');
    for key in keys
        .split(',')
        .map(|k| unquote(k.trim()))
        .filter(|k| !k.is_empty())
    {
        traits
            .entry(key.to_string())
            .or_insert_with(|| serde_json::Value::String(key.to_string()));
    }
    traits
}

/// A synced personality in the dashboard's `CommunityPersonality` shape; its
/// `filename` is the opaque id the install endpoint takes back.
fn community_personality_json(row: &marketplace::CommunityPersonalityRow) -> serde_json::Value {
    let content = row.instructions.as_deref().unwrap_or_default();
    let (frontmatter, body) = split_frontmatter(content).unwrap_or(("", content));
    let category = row.category.as_deref().unwrap_or_default();
    let mut personality = serde_json::json!({
        "name": row.name,
        "description": row.description.as_deref().unwrap_or_default(),
        "category": category.strip_prefix("personality:").unwrap_or(category),
        "author": row.author.as_deref().unwrap_or_default(),
        "version": row.version.as_deref().unwrap_or_default(),
        "traits": community_traits(content, frontmatter),
        "filename": row.id,
        "systemPrompt": body.trim(),
    });
    if let Some(sex) = frontmatter_value(frontmatter, "sex") {
        personality["sex"] = serde_json::Value::String(sex.to_string());
    }
    personality
}

/// GET /api/v1/marketplace/community/personalities — the personalities the
/// community sync stored; `{ personalities }`.
async fn list_community_personalities(State(state): State<AppState>) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    match marketplace::list_community_personalities(pool).await {
        Ok(rows) => {
            let personalities: Vec<_> = rows.iter().map(community_personality_json).collect();
            Json(serde_json::json!({ "personalities": personalities })).into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "community personalities query failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal server error"})),
            )
                .into_response()
        }
    }
}

#[derive(Deserialize)]
struct InstallPersonalityRequest {
    #[serde(default)]
    filename: String,
}

/// POST /api/v1/marketplace/community/personalities/install — create a soul
/// personality from a synced community one; 201 `{ personality }`.
async fn install_community_personality(
    State(state): State<AppState>,
    Json(body): Json<InstallPersonalityRequest>,
) -> impl IntoResponse {
    if body.filename.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "filename is required"})),
        )
            .into_response();
    }
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };
    let internal = |e: sqlx::Error| {
        tracing::error!(error = %e, "community personality install failed");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Internal server error"})),
        )
            .into_response()
    };
    let row = match marketplace::get_community_personality(pool, &body.filename).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Community personality not found"})),
            )
                .into_response();
        }
        Err(e) => return internal(e),
    };
    let community = community_personality_json(&row);
    let sex = community["sex"]
        .as_str()
        .filter(|s| PERSONALITY_SEXES.contains(s))
        .unwrap_or("unspecified");
    let description = format!(
        "[community:{}] {}",
        community["category"].as_str().unwrap_or_default(),
        community["description"].as_str().unwrap_or_default()
    );
    match crate::db::soul::create_personality(
        pool,
        &uuid::Uuid::now_v7().to_string(),
        &row.name,
        &description,
        community["systemPrompt"].as_str().unwrap_or_default(),
        &community["traits"],
        sex,
        "default",
    )
    .await
    {
        Ok(personality) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "personality": personality })),
        )
            .into_response(),
        Err(e) => internal(e),
    }
}

/// GET /api/v1/marketplace/community/personalities/avatar/{path} — the sync
/// stores no avatars, so there are none to serve.
async fn community_personality_avatar(Path(_path): Path<String>) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({"error": "Avatar not found"})),
    )
        .into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncRequest {
    #[serde(default)]
    repo_url: Option<String>,
}

async fn community_sync(
    State(state): State<AppState>,
    auth: Option<axum::Extension<crate::auth::middleware::AuthContext>>,
    body: Option<Json<SyncRequest>>,
) -> impl IntoResponse {
    let Some(pool) = state.db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Database not available"})),
        )
            .into_response();
    };

    // A caller-chosen repository makes the server fetch arbitrary git URLs:
    // only when the security policy allows it (as in the TS gateway).
    let requested_url = body.as_ref().and_then(|b| b.repo_url.clone());
    if requested_url.is_some()
        && !crate::routes::security::policy_allows(pool, "allowCommunityGitFetch").await
    {
        return (
            StatusCode::FORBIDDEN,
            Json(
                serde_json::json!({"error": "Community git fetch is disabled by security policy"}),
            ),
        )
            .into_response();
    }
    // A local repository is the server's own filesystem: admins only.
    let is_admin = auth.is_some_and(|axum::Extension(a)| a.role == "admin");
    if requested_url
        .as_deref()
        .is_some_and(|url| url.starts_with("file://"))
        && !is_admin
    {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "Only admins may sync from a local repository"})),
        )
            .into_response();
    }

    let repo_path = community_repo_path();

    const DEFAULT_COMMUNITY_GIT_URL: &str =
        "https://github.com/MacCracken/secureyeoman-community-repo";

    let repo_url = requested_url
        .or_else(|| {
            std::env::var("COMMUNITY_GIT_URL")
                .ok()
                .filter(|u| !u.is_empty())
        })
        .or_else(|| Some(DEFAULT_COMMUNITY_GIT_URL.to_string()));

    let mut result = serde_json::json!({
        "added": 0, "updated": 0, "skipped": 0, "removed": 0, "errors": [],
        "workflowsAdded": 0, "workflowsUpdated": 0,
        "swarmsAdded": 0, "swarmsUpdated": 0,
        "personalitiesAdded": 0, "personalitiesUpdated": 0,
    });

    // Git clone/pull if URL provided
    if let Some(ref url) = repo_url {
        // Validate URL — only https:// and file:// allowed
        if !url.starts_with("https://") && !url.starts_with("file://") {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Git URL must use https:// or file:// protocol"})),
            )
                .into_response();
        }

        let is_git_repo = std::path::Path::new(&repo_path).join(".git").exists();
        let git_result = if is_git_repo {
            tokio::process::Command::new("git")
                .args(["-C", &repo_path, "pull", "--ff-only"])
                .output()
                .await
        } else {
            tokio::process::Command::new("git")
                .args(["clone", "--depth=1", url, &repo_path])
                .output()
                .await
        };

        match git_result {
            Ok(output) if output.status.success() => {
                tracing::info!(repo_path, "community repo git sync successful");
            }
            Ok(output) => {
                let err = String::from_utf8_lossy(&output.stderr);
                tracing::warn!(repo_path, error = %err, "git sync failed");
                result["errors"] = serde_json::json!([format!("Git failed: {err}")]);
                return Json(result).into_response();
            }
            Err(e) => {
                result["errors"] = serde_json::json!([format!("Git command failed: {e}")]);
                return Json(result).into_response();
            }
        }
    }

    // Check repo path exists
    let skills_dir = std::path::Path::new(&repo_path).join("skills");
    if !skills_dir.exists() {
        result["errors"] = serde_json::json!([format!("No skills/ directory at {repo_path}")]);
        return Json(result).into_response();
    }

    // Scan skills/ directory for JSON files
    let mut added = 0i64;
    let mut updated = 0i64;
    let mut skipped = 0i64;
    let mut errors: Vec<String> = Vec::new();

    // Recursive scan for JSON files in skills/ (organized by category subdirs)
    fn find_json_files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    files.extend(find_json_files(&path));
                } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    files.push(path);
                }
            }
        }
        files
    }

    for path in find_json_files(&skills_dir) {
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(data) => {
                        let name = data.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        if name.is_empty() {
                            errors.push(format!("Skipped {:?}: missing name", path.file_name()));
                            skipped += 1;
                            continue;
                        }

                        let description = data
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let version = data
                            .get("version")
                            .and_then(|v| v.as_str())
                            .unwrap_or("1.0.0");
                        let author = data
                            .get("author")
                            .and_then(|a| a.as_str())
                            .unwrap_or("Community");
                        let category = data
                            .get("category")
                            .and_then(|c| c.as_str())
                            .unwrap_or("general");
                        let tags = data.get("tags").cloned().unwrap_or(serde_json::json!([]));
                        let instructions = data
                            .get("instructions")
                            .and_then(|i| i.as_str())
                            .unwrap_or("");
                        let tools = data.get("tools").cloned().unwrap_or(serde_json::json!([]));

                        // Upsert into marketplace.skills with source='community'
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as i64;

                        // Check if skill exists by name + source
                        let existing: Option<(String,)> = sqlx::query_as(
                                "SELECT id FROM marketplace.skills WHERE name = $1 AND source = 'community'"
                            ).bind(name).fetch_optional(pool).await.unwrap_or(None);
                        let is_update = existing.is_some();

                        let result = if let Some((existing_id,)) = existing {
                            // Update existing
                            sqlx::query(
                                    "UPDATE marketplace.skills SET description=$1, version=$2, author=$3, category=$4, tags=$5, instructions=$6, tools=$7, updated_at=$8 WHERE id=$9"
                                )
                                .bind(description).bind(version).bind(author).bind(category)
                                .bind(&tags).bind(instructions).bind(&tools).bind(now)
                                .bind(&existing_id)
                                .execute(pool).await
                        } else {
                            // Insert new
                            sqlx::query(
                                    "INSERT INTO marketplace.skills (id, name, description, version, author, category, tags, instructions, tools, source, installed, download_count, published_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'community',false,0,$10,$10)"
                                )
                                .bind(uuid::Uuid::now_v7().to_string())
                                .bind(name).bind(description).bind(version).bind(author)
                                .bind(category).bind(&tags).bind(instructions).bind(&tools).bind(now)
                                .execute(pool).await
                        };

                        match result {
                            Ok(_) => {
                                if is_update {
                                    updated += 1;
                                } else {
                                    added += 1;
                                }
                            }
                            Err(e) => errors.push(format!("{name}: {e}")),
                        }
                    }
                    Err(e) => {
                        errors.push(format!("{:?}: invalid JSON: {e}", path.file_name()));
                        skipped += 1;
                    }
                }
            }
            Err(e) => {
                errors.push(format!("{:?}: read error: {e}", path.file_name()));
                skipped += 1;
            }
        }
    } // end for path in find_json_files (skills)

    // ── Sync community workflows ────────────────────────────────────────
    let mut workflows_added = 0i64;
    let mut workflows_updated = 0i64;
    let workflows_dir = std::path::Path::new(&repo_path).join("workflows");
    if workflows_dir.exists() {
        for path in find_json_files(&workflows_dir) {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = data.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        if name.is_empty() {
                            continue;
                        }
                        let description = data
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let steps = data.get("steps").cloned().unwrap_or(serde_json::json!([]));
                        let edges = data.get("edges").cloned().unwrap_or(serde_json::json!([]));
                        let triggers = data
                            .get("triggers")
                            .cloned()
                            .unwrap_or(serde_json::json!([]));
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as i64;

                        let existing: Option<(uuid::Uuid,)> = sqlx::query_as(
                            "SELECT id FROM workflow.definitions WHERE name = $1 AND created_by = 'community'"
                        ).bind(name).fetch_optional(pool).await.unwrap_or(None);

                        let r = if let Some((eid,)) = existing {
                            workflows_updated += 1;
                            sqlx::query("UPDATE workflow.definitions SET description=$1, steps_json=$2, edges_json=$3, triggers_json=$4, updated_at=$5 WHERE id=$6")
                                .bind(description).bind(&steps).bind(&edges).bind(&triggers).bind(now).bind(eid)
                                .execute(pool).await
                        } else {
                            workflows_added += 1;
                            sqlx::query("INSERT INTO workflow.definitions (id, name, description, steps_json, edges_json, triggers_json, is_enabled, version, created_by, source, created_at, updated_at, autonomy_level) VALUES ($1,$2,$3,$4,$5,$6,true,1,'community','community',$7,$7,'L2')")
                                .bind(uuid::Uuid::now_v7()).bind(name).bind(description).bind(&steps).bind(&edges).bind(&triggers).bind(now)
                                .execute(pool).await
                        };
                        if let Err(e) = r {
                            errors.push(format!("workflow {name}: {e}"));
                        }
                    }
                }
                Err(e) => errors.push(format!("workflow {:?}: {e}", path.file_name())),
            }
        }
    }

    // ── Sync community swarms ────────────────────────────────────────
    let mut swarms_added = 0i64;
    let mut swarms_updated = 0i64;
    let swarms_dir = std::path::Path::new(&repo_path).join("swarms");
    if swarms_dir.exists() {
        for path in find_json_files(&swarms_dir) {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = data.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        if name.is_empty() {
                            continue;
                        }
                        let description = data
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let strategy = data
                            .get("strategy")
                            .and_then(|s| s.as_str())
                            .unwrap_or("parallel");
                        let roles = data.get("roles").cloned().unwrap_or(serde_json::json!([]));

                        let existing: Option<(String,)> = sqlx::query_as(
                            "SELECT id FROM agents.swarm_templates WHERE name = $1 AND is_builtin = false"
                        ).bind(name).fetch_optional(pool).await.unwrap_or(None);

                        let r = if let Some((eid,)) = existing {
                            swarms_updated += 1;
                            sqlx::query("UPDATE agents.swarm_templates SET description=$1, strategy=$2, roles=$3 WHERE id=$4")
                                .bind(description).bind(strategy).bind(&roles).bind(&eid)
                                .execute(pool).await
                        } else {
                            swarms_added += 1;
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64;
                            sqlx::query("INSERT INTO agents.swarm_templates (id, name, description, strategy, roles, is_builtin, created_at) VALUES ($1,$2,$3,$4,$5,false,$6)")
                                .bind(uuid::Uuid::now_v7().to_string()).bind(name).bind(description).bind(strategy).bind(&roles).bind(now_ms)
                                .execute(pool).await
                        };
                        if let Err(e) = r {
                            errors.push(format!("swarm {name}: {e}"));
                        }
                    }
                }
                Err(e) => errors.push(format!("swarm {:?}: {e}", path.file_name())),
            }
        }
    }

    // ── Sync community councils ────────────────────────────────────────
    let mut councils_added = 0i64;
    let mut councils_updated = 0i64;
    let councils_dir = std::path::Path::new(&repo_path).join("councils");
    if councils_dir.exists() {
        for path in find_json_files(&councils_dir) {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = data.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        if name.is_empty() {
                            continue;
                        }
                        let description = data
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let members = data
                            .get("members")
                            .cloned()
                            .unwrap_or(serde_json::json!([]));
                        let facilitator = data
                            .get("facilitatorProfile")
                            .and_then(|f| f.as_str())
                            .unwrap_or("facilitator");
                        let strategy = data
                            .get("deliberationStrategy")
                            .and_then(|s| s.as_str())
                            .unwrap_or("rounds");
                        let voting = data
                            .get("votingStrategy")
                            .and_then(|s| s.as_str())
                            .unwrap_or("facilitator_judgment");
                        let max_rounds =
                            data.get("maxRounds").and_then(|m| m.as_i64()).unwrap_or(3) as i32;

                        let existing: Option<(String,)> = sqlx::query_as(
                            "SELECT id FROM agents.council_templates WHERE name = $1 AND is_builtin = false"
                        ).bind(name).fetch_optional(pool).await.unwrap_or(None);

                        let r = if let Some((eid,)) = existing {
                            councils_updated += 1;
                            sqlx::query("UPDATE agents.council_templates SET description=$1, members=$2, facilitator_profile=$3, deliberation_strategy=$4, voting_strategy=$5, max_rounds=$6 WHERE id=$7")
                                .bind(description).bind(&members).bind(facilitator).bind(strategy).bind(voting).bind(max_rounds).bind(&eid)
                                .execute(pool).await
                        } else {
                            councils_added += 1;
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64;
                            sqlx::query("INSERT INTO agents.council_templates (id, name, description, members, facilitator_profile, deliberation_strategy, voting_strategy, max_rounds, is_builtin, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)")
                                .bind(uuid::Uuid::now_v7().to_string()).bind(name).bind(description).bind(&members).bind(facilitator).bind(strategy).bind(voting).bind(max_rounds).bind(now_ms)
                                .execute(pool).await
                        };
                        if let Err(e) = r {
                            errors.push(format!("council {name}: {e}"));
                        }
                    }
                }
                Err(e) => errors.push(format!("council {:?}: {e}", path.file_name())),
            }
        }
    }

    // ── Sync community themes (stored as skills with category='theme') ───
    let mut themes_added = 0i64;
    let mut themes_updated = 0i64;
    let themes_dir = std::path::Path::new(&repo_path).join("themes");
    if themes_dir.exists() {
        for path in find_json_files(&themes_dir) {
            if let Ok(content) = std::fs::read_to_string(&path)
                && let Ok(data) = serde_json::from_str::<serde_json::Value>(&content)
            {
                let name = data.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name.is_empty() {
                    continue;
                }
                let description = data
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("");
                let version = data
                    .get("version")
                    .and_then(|v| v.as_str())
                    .unwrap_or("1.0.0");
                let author = data
                    .get("author")
                    .and_then(|a| {
                        a.get("name")
                            .and_then(|n| n.as_str())
                            .or_else(|| a.as_str())
                    })
                    .unwrap_or("Community");
                let is_dark = data.get("isDark").and_then(|d| d.as_bool()).unwrap_or(true);
                let mut tags = vec!["theme", "community-theme"];
                tags.push(if is_dark { "dark" } else { "light" });
                let now_t = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;

                let existing: Option<(String,)> = sqlx::query_as(
                        "SELECT id FROM marketplace.skills WHERE name = $1 AND source = 'community' AND category = 'theme'"
                    ).bind(name).fetch_optional(pool).await.unwrap_or(None);
                let is_upd = existing.is_some();

                let r = if let Some((eid,)) = existing {
                    sqlx::query("UPDATE marketplace.skills SET description=$1, version=$2, author=$3, tags=$4, instructions=$5, updated_at=$6 WHERE id=$7")
                            .bind(description).bind(version).bind(author)
                            .bind(serde_json::json!(tags)).bind(&content).bind(now_t).bind(&eid)
                            .execute(pool).await
                } else {
                    sqlx::query("INSERT INTO marketplace.skills (id,name,description,version,author,category,tags,instructions,tools,source,installed,download_count,published_at,updated_at) VALUES ($1,$2,$3,$4,$5,'theme',$6,$7,'[]','community',false,0,$8,$8)")
                            .bind(uuid::Uuid::now_v7().to_string()).bind(name).bind(description)
                            .bind(version).bind(author).bind(serde_json::json!(tags)).bind(&content).bind(now_t)
                            .execute(pool).await
                };
                match r {
                    Ok(_) => {
                        if is_upd {
                            themes_updated += 1;
                        } else {
                            themes_added += 1;
                        }
                    }
                    Err(e) => errors.push(format!("theme {name}: {e}")),
                }
            }
        }
    }

    // ── Sync community personalities (.md with YAML frontmatter) ────
    let mut personalities_added = 0i64;
    let mut personalities_updated = 0i64;
    let personalities_dir = std::path::Path::new(&repo_path).join("personalities");
    if personalities_dir.exists() {
        fn find_personality_mds(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
            let mut files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        let md = p.join("personality.md");
                        if md.exists() {
                            files.push(md);
                        } else {
                            files.extend(find_personality_mds(&p));
                        }
                    }
                }
            }
            files
        }

        for md_path in find_personality_mds(&personalities_dir) {
            if let Ok(content) = std::fs::read_to_string(&md_path) {
                let parts: Vec<&str> = content.splitn(3, "---").collect();
                if parts.len() < 3 {
                    continue;
                }
                let fm = parts[1].trim();
                let mut name = String::new();
                let mut description = String::new();
                let mut author = String::new();
                let mut version = String::new();
                for line in fm.lines() {
                    let line = line.trim();
                    if let Some(v) = line.strip_prefix("name:") {
                        name = v.trim().trim_matches('"').to_string();
                    } else if let Some(v) = line.strip_prefix("description:") {
                        description = v.trim().trim_matches('"').to_string();
                    } else if let Some(v) = line.strip_prefix("author:") {
                        author = v.trim().trim_matches('"').to_string();
                    } else if let Some(v) = line.strip_prefix("version:") {
                        version = v.trim().trim_matches('"').to_string();
                    }
                }
                if name.is_empty() {
                    continue;
                }

                let category = md_path
                    .parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("community");
                let cat_label = format!("personality:{category}");
                let tags = serde_json::json!(["personality", "community-personality", category]);
                let now_t = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;

                let existing: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM marketplace.skills WHERE name = $1 AND source = 'community' AND category = $2"
                ).bind(&name).bind(&cat_label).fetch_optional(pool).await.unwrap_or(None);
                let is_upd = existing.is_some();

                let r = if let Some((eid,)) = existing {
                    sqlx::query("UPDATE marketplace.skills SET description=$1, version=$2, author=$3, tags=$4, instructions=$5, updated_at=$6 WHERE id=$7")
                        .bind(&description).bind(&version).bind(&author).bind(&tags).bind(&content).bind(now_t).bind(&eid)
                        .execute(pool).await
                } else {
                    sqlx::query("INSERT INTO marketplace.skills (id,name,description,version,author,category,tags,instructions,tools,source,installed,download_count,published_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'[]','community',false,0,$9,$9)")
                        .bind(uuid::Uuid::now_v7().to_string()).bind(&name).bind(&description)
                        .bind(&version).bind(&author).bind(&cat_label).bind(&tags).bind(&content).bind(now_t)
                        .execute(pool).await
                };
                match r {
                    Ok(_) => {
                        if is_upd {
                            personalities_updated += 1;
                        } else {
                            personalities_added += 1;
                        }
                    }
                    Err(e) => errors.push(format!("personality {name}: {e}")),
                }
            }
        }
    }

    result["added"] = serde_json::json!(added);
    result["updated"] = serde_json::json!(updated);
    result["skipped"] = serde_json::json!(skipped);
    result["errors"] = serde_json::json!(errors);
    result["workflowsAdded"] = serde_json::json!(workflows_added);
    result["workflowsUpdated"] = serde_json::json!(workflows_updated);
    result["swarmsAdded"] = serde_json::json!(swarms_added);
    result["swarmsUpdated"] = serde_json::json!(swarms_updated);
    result["councilsAdded"] = serde_json::json!(councils_added);
    result["councilsUpdated"] = serde_json::json!(councils_updated);
    result["themesAdded"] = serde_json::json!(themes_added);
    result["themesUpdated"] = serde_json::json!(themes_updated);
    result["personalitiesAdded"] = serde_json::json!(personalities_added);
    result["personalitiesUpdated"] = serde_json::json!(personalities_updated);

    Json(result).into_response()
}

#[cfg(test)]
mod tests {
    use super::{community_traits, frontmatter_value, split_frontmatter};

    const PERSONALITY: &str = "---\nname: \"Ares\"\ntraits: [warm, \"direct\"]\nsex: female\n# a comment: ignored\n---\nYou are Ares.\n\n- **humor**: dry\n- **warm**: very\n-**bad**: no space\n";

    #[test]
    fn frontmatter_splits_from_the_system_prompt() {
        let (frontmatter, body) = split_frontmatter(PERSONALITY).unwrap();
        assert_eq!(frontmatter_value(frontmatter, "name"), Some("Ares"));
        assert_eq!(frontmatter_value(frontmatter, "sex"), Some("female"));
        assert_eq!(frontmatter_value(frontmatter, "a comment"), None);
        assert!(body.starts_with("You are Ares."));
        let crlf = PERSONALITY.replace('\n', "\r\n");
        let (frontmatter, _) = split_frontmatter(&crlf).unwrap();
        assert_eq!(frontmatter_value(frontmatter, "sex"), Some("female"));
        assert!(split_frontmatter("no frontmatter").is_none());
    }

    #[test]
    fn traits_come_from_the_body_then_the_frontmatter() {
        let (frontmatter, _) = split_frontmatter(PERSONALITY).unwrap();
        let traits = community_traits(PERSONALITY, frontmatter);
        assert_eq!(traits["humor"], "dry");
        assert_eq!(traits["warm"], "very", "a body value wins");
        assert_eq!(traits["direct"], "direct", "a bare key maps to itself");
        assert!(!traits.contains_key("bad"));
    }
}
