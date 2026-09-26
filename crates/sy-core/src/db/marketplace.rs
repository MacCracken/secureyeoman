//! Marketplace storage — community skills via PostgreSQL.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkillRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub category: Option<String>,
    #[serde(serialize_with = "empty_if_null")]
    pub tags: Option<serde_json::Value>,
    pub download_count: Option<i32>,
    pub rating: Option<f64>,
    pub instructions: Option<String>,
    #[serde(serialize_with = "empty_if_null")]
    pub tools: Option<serde_json::Value>,
    pub installed: Option<bool>,
    pub published_at: i64,
    pub updated_at: i64,
    pub source: String,
}

/// A NULL `tags` or `tools` column reads as an empty list, as the TS storage
/// mapped it.
fn empty_if_null<S: serde::Serializer>(
    value: &Option<serde_json::Value>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match value {
        Some(value) => value.serialize(serializer),
        None => [(); 0].serialize(serializer),
    }
}

pub async fn list_skills(
    pool: &PgPool,
    category: Option<&str>,
    installed: Option<bool>,
    source: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<MarketplaceSkillRow>, sqlx::Error> {
    // Handle combined source + category filters
    match (source, category) {
        (Some("community"), Some("personality")) => {
            return sqlx::query_as::<_, MarketplaceSkillRow>(
                "SELECT * FROM marketplace.skills WHERE source = 'community' AND category LIKE 'personality%' ORDER BY name ASC LIMIT $1 OFFSET $2"
            ).bind(limit).bind(offset).fetch_all(pool).await;
        }
        (Some("community"), Some(cat)) => {
            return sqlx::query_as::<_, MarketplaceSkillRow>(
                "SELECT * FROM marketplace.skills WHERE source = 'community' AND category = $1 ORDER BY name ASC LIMIT $2 OFFSET $3"
            ).bind(cat).bind(limit).bind(offset).fetch_all(pool).await;
        }
        (Some("community"), None) => {
            return sqlx::query_as::<_, MarketplaceSkillRow>(
                "SELECT * FROM marketplace.skills WHERE source = 'community' ORDER BY name ASC LIMIT $1 OFFSET $2"
            ).bind(limit).bind(offset).fetch_all(pool).await;
        }
        (Some("marketplace"), Some(cat)) => {
            return sqlx::query_as::<_, MarketplaceSkillRow>(
                "SELECT * FROM marketplace.skills WHERE source != 'community' AND category = $1 ORDER BY download_count DESC LIMIT $2 OFFSET $3"
            ).bind(cat).bind(limit).bind(offset).fetch_all(pool).await;
        }
        (Some("marketplace"), None) => {
            return sqlx::query_as::<_, MarketplaceSkillRow>(
                "SELECT * FROM marketplace.skills WHERE source != 'community' ORDER BY download_count DESC LIMIT $1 OFFSET $2"
            ).bind(limit).bind(offset).fetch_all(pool).await;
        }
        _ => {}
    }

    if let Some(cat) = category {
        sqlx::query_as::<_, MarketplaceSkillRow>(
            "SELECT * FROM marketplace.skills WHERE category = $1 ORDER BY download_count DESC LIMIT $2 OFFSET $3",
        )
        .bind(cat).bind(limit).bind(offset)
        .fetch_all(pool).await
    } else if let Some(inst) = installed {
        sqlx::query_as::<_, MarketplaceSkillRow>(
            "SELECT * FROM marketplace.skills WHERE installed = $1 ORDER BY download_count DESC LIMIT $2 OFFSET $3",
        )
        .bind(inst).bind(limit).bind(offset)
        .fetch_all(pool).await
    } else {
        sqlx::query_as::<_, MarketplaceSkillRow>(
            "SELECT * FROM marketplace.skills ORDER BY download_count DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }
}

pub async fn get_skill(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceSkillRow>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceSkillRow>("SELECT * FROM marketplace.skills WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn get_marketplace_item(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceSkillRow>, sqlx::Error> {
    sqlx::query_as::<_, MarketplaceSkillRow>("SELECT * FROM marketplace.skills WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn install_item(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceSkillRow>, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, MarketplaceSkillRow>(
        "UPDATE marketplace.skills SET installed = true, updated_at = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(now)
    .fetch_optional(pool)
    .await
}

pub async fn uninstall_item(
    pool: &PgPool,
    id: &str,
) -> Result<Option<MarketplaceSkillRow>, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, MarketplaceSkillRow>(
        "UPDATE marketplace.skills SET installed = false, updated_at = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(now)
    .fetch_optional(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn publish_item(
    pool: &PgPool,
    id: &str,
    name: &str,
    description: Option<&str>,
    version: Option<&str>,
    category: Option<&str>,
    tools: &serde_json::Value,
    instructions: Option<&str>,
) -> Result<MarketplaceSkillRow, sqlx::Error> {
    let now = now_ms();
    sqlx::query_as::<_, MarketplaceSkillRow>(
        "INSERT INTO marketplace.skills (id, name, description, version, category, tags, tools, instructions, source, published_at, updated_at) VALUES ($1, $2, $3, $4, $5, '[]', $6, $7, 'local', $8, $8) RETURNING *",
    )
    .bind(id).bind(name).bind(description).bind(version).bind(category)
    .bind(tools).bind(instructions).bind(now)
    .fetch_one(pool).await
}

/// Community skills synced into the marketplace (themes and personalities
/// excluded), and when a sync last ran: every sync rewrites the community
/// rows' `updated_at`, so the newest one is that time.
pub async fn community_status(pool: &PgPool) -> Result<(i64, Option<i64>), sqlx::Error> {
    sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE category IS DISTINCT FROM 'theme'
                                 AND NOT starts_with(COALESCE(category, ''), 'personality:')),
                MAX(updated_at)
         FROM marketplace.skills WHERE source = 'community'",
    )
    .fetch_one(pool)
    .await
}

/// A community personality as the sync stored it: a community row whose
/// category is `personality:{category}` and whose instructions hold the
/// personality's markdown (frontmatter and system prompt).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CommunityPersonalityRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub category: Option<String>,
    pub instructions: Option<String>,
}

pub async fn list_community_personalities(
    pool: &PgPool,
) -> Result<Vec<CommunityPersonalityRow>, sqlx::Error> {
    sqlx::query_as::<_, CommunityPersonalityRow>(
        "SELECT id, name, description, author, version, category, instructions
         FROM marketplace.skills
         WHERE source = 'community' AND starts_with(category, 'personality:')
         ORDER BY category, name",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_community_personality(
    pool: &PgPool,
    id: &str,
) -> Result<Option<CommunityPersonalityRow>, sqlx::Error> {
    sqlx::query_as::<_, CommunityPersonalityRow>(
        "SELECT id, name, description, author, version, category, instructions
         FROM marketplace.skills
         WHERE id = $1 AND source = 'community' AND starts_with(category, 'personality:')",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
