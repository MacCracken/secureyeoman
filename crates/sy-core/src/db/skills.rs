//! Skills storage — `brain.skills`.
//!
//! This is the table the TS gateway's skill API used in production: its
//! `SoulManager` delegated every skill operation to the `BrainManager`
//! (`soul.skills` was only the brain-less fallback). The wire shape
//! ([`SkillRow::to_json`]) and the validation limits mirror the TS
//! `SkillSchema`, which is what the dashboard consumes.

use serde::Deserialize;
use sqlx::PgPool;

/// A row of `brain.skills`.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SkillRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools: serde_json::Value,
    pub trigger_patterns: serde_json::Value,
    pub enabled: bool,
    pub source: String,
    pub status: String,
    pub usage_count: i32,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub personality_id: Option<String>,
    pub use_when: String,
    pub do_not_use_when: String,
    pub success_criteria: String,
    pub routing: String,
    pub autonomy_level: String,
    pub mcp_tools_allowed: serde_json::Value,
    pub output_schema: Option<serde_json::Value>,
}

fn array_or_empty(v: &serde_json::Value) -> serde_json::Value {
    if v.is_array() {
        v.clone()
    } else {
        serde_json::json!([])
    }
}

impl SkillRow {
    /// The wire shape of a skill (the TS `Skill`). Fields `brain.skills` does
    /// not store (actions, triggers, dependencies, invocation count, …) take
    /// the TS defaults, as they did in the TS gateway.
    pub fn to_json(&self, personality_name: Option<&str>) -> serde_json::Value {
        let mut skill = serde_json::json!({
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "instructions": self.instructions,
            "tools": array_or_empty(&self.tools),
            "triggerPatterns": array_or_empty(&self.trigger_patterns),
            "useWhen": self.use_when,
            "doNotUseWhen": self.do_not_use_when,
            "successCriteria": self.success_criteria,
            "mcpToolsAllowed": array_or_empty(&self.mcp_tools_allowed),
            "routing": self.routing,
            "linkedWorkflowId": null,
            "autonomyLevel": self.autonomy_level,
            "outputSchema": self.output_schema,
            "actions": [],
            "triggers": [],
            "dependencies": [],
            "provides": [],
            "requireApproval": false,
            "allowedPermissions": [],
            "enabled": self.enabled,
            "source": self.source,
            "status": self.status,
            "usageCount": self.usage_count,
            "invokedCount": 0,
            "lastUsedAt": self.last_used_at,
            "personalityId": self.personality_id,
            "version": 1,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        });
        if self.personality_id.is_some() {
            skill["personalityName"] = serde_json::json!(personality_name);
        }
        skill
    }
}

/// Body of a skill create or update (the TS `SkillCreate` / `SkillUpdate`).
/// On update every field is optional and absent fields keep their value.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub instructions: Option<String>,
    pub tools: Option<Vec<serde_json::Value>>,
    pub trigger_patterns: Option<Vec<String>>,
    pub use_when: Option<String>,
    pub do_not_use_when: Option<String>,
    pub success_criteria: Option<String>,
    pub mcp_tools_allowed: Option<Vec<String>>,
    pub routing: Option<String>,
    pub autonomy_level: Option<String>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub output_schema: Option<Option<serde_json::Value>>,
    pub enabled: Option<bool>,
    pub source: Option<String>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "super::explicit_null")]
    pub personality_id: Option<Option<String>>,
}

const SOURCES: &[&str] = &[
    "user",
    "ai_proposed",
    "ai_learned",
    "marketplace",
    "community",
];
const STATUSES: &[&str] = &["active", "pending_approval", "disabled"];
const AUTONOMY_LEVELS: &[&str] = &["L1", "L2", "L3", "L4", "L5"];

fn check_len(field: &str, value: Option<&str>, max: usize) -> Result<(), String> {
    match value {
        Some(v) if v.chars().count() > max => {
            Err(format!("{field} must be at most {max} characters"))
        }
        _ => Ok(()),
    }
}

fn check_enum(field: &str, value: Option<&str>, allowed: &[&str]) -> Result<(), String> {
    match value {
        Some(v) if !allowed.contains(&v) => {
            Err(format!("{field} must be one of: {}", allowed.join(", ")))
        }
        _ => Ok(()),
    }
}

impl SkillInput {
    /// Validate against the TS `SkillSchema` limits. `creating` requires a name.
    pub fn validate(&self, creating: bool) -> Result<(), String> {
        match self.name.as_deref().map(str::trim) {
            None if creating => return Err("name is required".into()),
            Some("") => return Err("name must not be empty".into()),
            _ => {}
        }
        check_len("name", self.name.as_deref(), 200)?;
        check_len("description", self.description.as_deref(), 2000)?;
        check_len("instructions", self.instructions.as_deref(), 8000)?;
        check_len("useWhen", self.use_when.as_deref(), 500)?;
        check_len("doNotUseWhen", self.do_not_use_when.as_deref(), 500)?;
        check_len("successCriteria", self.success_criteria.as_deref(), 300)?;
        for pattern in self.trigger_patterns.iter().flatten() {
            check_len("each trigger pattern", Some(pattern), 500)?;
        }
        if self
            .tools
            .iter()
            .flatten()
            .any(|t| !t.get("name").is_some_and(serde_json::Value::is_string))
        {
            return Err("each tool must be an object with a string name".into());
        }
        if let Some(Some(schema)) = &self.output_schema
            && !schema.is_object()
        {
            return Err("outputSchema must be an object or null".into());
        }
        check_enum("routing", self.routing.as_deref(), &["fuzzy", "explicit"])?;
        check_enum(
            "autonomyLevel",
            self.autonomy_level.as_deref(),
            AUTONOMY_LEVELS,
        )?;
        check_enum("source", self.source.as_deref(), SOURCES)?;
        check_enum("status", self.status.as_deref(), STATUSES)?;
        Ok(())
    }
}

fn json_list<T: serde::Serialize>(v: &Option<Vec<T>>) -> Option<serde_json::Value> {
    v.as_ref().map(|items| serde_json::json!(items))
}

/// Filters for [`list_skills`].
#[derive(Debug, Default)]
pub struct SkillFilter<'a> {
    pub status: Option<&'a str>,
    pub source: Option<&'a str>,
    /// Skills of this personality plus the global ones (no personality).
    pub for_personality_id: Option<&'a str>,
}

/// List skills, most used first. Returns the page and the total match count.
pub async fn list_skills(
    pool: &PgPool,
    filter: &SkillFilter<'_>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<SkillRow>, i64), sqlx::Error> {
    // Counted separately so a page past the end still reports the total.
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM brain.skills
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR source = $2)
           AND ($3::text IS NULL OR personality_id = $3 OR personality_id IS NULL)",
    )
    .bind(filter.status)
    .bind(filter.source)
    .bind(filter.for_personality_id)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, SkillRow>(
        "SELECT * FROM brain.skills
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR source = $2)
           AND ($3::text IS NULL OR personality_id = $3 OR personality_id IS NULL)
         ORDER BY usage_count DESC, created_at DESC
         LIMIT $4 OFFSET $5",
    )
    .bind(filter.status)
    .bind(filter.source)
    .bind(filter.for_personality_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

/// Names of the given personalities, as `(id, name)` pairs.
pub async fn personality_names(
    pool: &PgPool,
    ids: &[String],
) -> Result<Vec<(String, String)>, sqlx::Error> {
    sqlx::query_as("SELECT id, name FROM soul.personalities WHERE id = ANY($1)")
        .bind(ids)
        .fetch_all(pool)
        .await
}

pub async fn get_skill(pool: &PgPool, id: &str) -> Result<Option<SkillRow>, sqlx::Error> {
    sqlx::query_as::<_, SkillRow>("SELECT * FROM brain.skills WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Create a skill; `input` must already be validated with `creating = true`.
pub async fn create_skill(
    pool: &PgPool,
    id: &str,
    input: &SkillInput,
) -> Result<SkillRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, SkillRow>(
        "INSERT INTO brain.skills (id, name, description, instructions, tools, trigger_patterns,
             use_when, do_not_use_when, success_criteria, mcp_tools_allowed, routing,
             autonomy_level, output_schema, enabled, source, status, personality_id,
             usage_count, last_used_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 0, NULL, $18, $18)
         RETURNING *",
    )
    .bind(id)
    .bind(input.name.as_deref().map(str::trim).unwrap_or_default())
    .bind(input.description.as_deref().unwrap_or_default())
    .bind(input.instructions.as_deref().unwrap_or_default())
    .bind(json_list(&input.tools).unwrap_or_else(|| serde_json::json!([])))
    .bind(json_list(&input.trigger_patterns).unwrap_or_else(|| serde_json::json!([])))
    .bind(input.use_when.as_deref().unwrap_or_default())
    .bind(input.do_not_use_when.as_deref().unwrap_or_default())
    .bind(input.success_criteria.as_deref().unwrap_or_default())
    .bind(json_list(&input.mcp_tools_allowed).unwrap_or_else(|| serde_json::json!([])))
    .bind(input.routing.as_deref().unwrap_or("fuzzy"))
    .bind(input.autonomy_level.as_deref().unwrap_or("L1"))
    .bind(input.output_schema.clone().flatten())
    .bind(input.enabled.unwrap_or(true))
    .bind(input.source.as_deref().unwrap_or("user"))
    .bind(input.status.as_deref().unwrap_or("active"))
    .bind(input.personality_id.clone().flatten())
    .bind(now)
    .fetch_one(pool)
    .await
}

/// Update a skill; absent fields keep their value (the owning personality is
/// fixed at creation, as in the TS gateway). `None` if it does not exist.
pub async fn update_skill(
    pool: &PgPool,
    id: &str,
    input: &SkillInput,
) -> Result<Option<SkillRow>, sqlx::Error> {
    sqlx::query_as::<_, SkillRow>(
        "UPDATE brain.skills SET
             name = COALESCE($2, name),
             description = COALESCE($3, description),
             instructions = COALESCE($4, instructions),
             tools = COALESCE($5, tools),
             trigger_patterns = COALESCE($6, trigger_patterns),
             use_when = COALESCE($7, use_when),
             do_not_use_when = COALESCE($8, do_not_use_when),
             success_criteria = COALESCE($9, success_criteria),
             mcp_tools_allowed = COALESCE($10, mcp_tools_allowed),
             routing = COALESCE($11, routing),
             autonomy_level = COALESCE($12, autonomy_level),
             output_schema = CASE WHEN $13 THEN $14 ELSE output_schema END,
             enabled = COALESCE($15, enabled),
             source = COALESCE($16, source),
             status = COALESCE($17, status),
             updated_at = $18
         WHERE id = $1
         RETURNING *",
    )
    .bind(id)
    .bind(input.name.as_deref().map(str::trim))
    .bind(input.description.as_deref())
    .bind(input.instructions.as_deref())
    .bind(json_list(&input.tools))
    .bind(json_list(&input.trigger_patterns))
    .bind(input.use_when.as_deref())
    .bind(input.do_not_use_when.as_deref())
    .bind(input.success_criteria.as_deref())
    .bind(json_list(&input.mcp_tools_allowed))
    .bind(input.routing.as_deref())
    .bind(input.autonomy_level.as_deref())
    .bind(input.output_schema.is_some())
    .bind(input.output_schema.clone().flatten())
    .bind(input.enabled)
    .bind(input.source.as_deref())
    .bind(input.status.as_deref())
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

/// Enable or disable a skill. `None` if it does not exist.
pub async fn set_enabled(
    pool: &PgPool,
    id: &str,
    enabled: bool,
) -> Result<Option<SkillRow>, sqlx::Error> {
    sqlx::query_as::<_, SkillRow>(
        "UPDATE brain.skills SET enabled = $2, updated_at = $3 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(enabled)
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

/// Approve a skill that is pending approval. `None` if there is no such
/// pending skill.
pub async fn approve_skill(pool: &PgPool, id: &str) -> Result<Option<SkillRow>, sqlx::Error> {
    sqlx::query_as::<_, SkillRow>(
        "UPDATE brain.skills SET status = 'active', updated_at = $2
         WHERE id = $1 AND status = 'pending_approval'
         RETURNING *",
    )
    .bind(id)
    .bind(now_ms())
    .fetch_optional(pool)
    .await
}

/// Reject (delete) a skill that is pending approval. `false` if there is no
/// such pending skill.
pub async fn reject_skill(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result =
        sqlx::query("DELETE FROM brain.skills WHERE id = $1 AND status = 'pending_approval'")
            .bind(id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete_skill(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM brain.skills WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(json: &str) -> SkillInput {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn create_requires_a_name_update_does_not() {
        assert!(input("{}").validate(true).is_err());
        assert!(input(r#"{"name":"  "}"#).validate(true).is_err());
        assert!(input("{}").validate(false).is_ok());
        assert!(input(r#"{"name":"Summarise"}"#).validate(true).is_ok());
    }

    #[test]
    fn limits_and_enums_follow_the_ts_schema() {
        let long = "x".repeat(201);
        assert!(
            input(&format!(r#"{{"name":"{long}"}}"#))
                .validate(false)
                .is_err()
        );
        assert!(input(r#"{"routing":"random"}"#).validate(false).is_err());
        assert!(input(r#"{"autonomyLevel":"L6"}"#).validate(false).is_err());
        assert!(input(r#"{"status":"archived"}"#).validate(false).is_err());
        assert!(
            input(r#"{"tools":[{"description":"no name"}]}"#)
                .validate(false)
                .is_err()
        );
        assert!(input(r#"{"outputSchema":[1]}"#).validate(false).is_err());
        assert!(
            input(r#"{"outputSchema":null,"autonomyLevel":"L3"}"#)
                .validate(false)
                .is_ok()
        );
    }

    #[test]
    fn explicit_null_is_distinguished_from_absent() {
        assert!(input("{}").output_schema.is_none());
        assert_eq!(input(r#"{"outputSchema":null}"#).output_schema, Some(None));
        assert_eq!(
            input(r#"{"personalityId":null}"#).personality_id,
            Some(None)
        );
    }
}
