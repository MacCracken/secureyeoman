//! pgvector-backed vector store over the shipped schema.
//!
//! Embeddings live in the `embedding vector(384)` column of the row they
//! index — a memory (`brain.memories`) or a knowledge entry
//! (`brain.knowledge`) — as the TS storage kept them; there is no separate
//! vector table. An id is a memory or knowledge id, so the entry must exist
//! before it is indexed, and deleting the entry drops its vector with it.
//!
//! The columns are fixed-width: a vector must have [`EMBEDDING_DIMENSIONS`]
//! components. An embedding provider of another width cannot index, and
//! recall then falls back to full-text search.

use sqlx::PgPool;

use super::vector::{VectorError, VectorResult, VectorStore, VectorStoreResult};

/// Width of the schema's `embedding vector(384)` columns.
pub const EMBEDDING_DIMENSIONS: usize = 384;

/// PostgreSQL vector store backed by the pgvector columns of the brain tables.
pub struct PgVectorStore {
    pool: PgPool,
    tenant_id: String,
}

impl PgVectorStore {
    pub fn new(pool: PgPool, tenant_id: String) -> Self {
        Self { pool, tenant_id }
    }
}

fn check_dimensions(vector: &[f32]) -> VectorStoreResult<()> {
    if vector.len() == EMBEDDING_DIMENSIONS {
        Ok(())
    } else {
        Err(VectorError::DimensionMismatch {
            expected: EMBEDDING_DIMENSIONS,
            got: vector.len(),
        })
    }
}

/// A zero vector carries no meaning (the no-op embedding provider returns
/// them) and has no cosine similarity: it is never stored or searched.
fn is_zero(vector: &[f32]) -> bool {
    vector.iter().all(|x| *x == 0.0)
}

fn store_error(e: sqlx::Error) -> VectorError {
    VectorError::Store(e.to_string())
}

/// Set the embedding of memory or knowledge entry `id`; false when neither
/// exists. The `real[]` parameter is cast to `vector` (pgvector's cast).
async fn set_embedding<'c, E>(
    executor: E,
    id: &str,
    tenant_id: &str,
    vector: &[f32],
) -> Result<bool, sqlx::Error>
where
    E: sqlx::Executor<'c, Database = sqlx::Postgres>,
{
    let updated: i64 = sqlx::query_scalar(
        "WITH memory AS (
           UPDATE brain.memories SET embedding = $2::vector
           WHERE id = $1 AND tenant_id = $3 RETURNING 1
         ), knowledge AS (
           UPDATE brain.knowledge SET embedding = $2::vector
           WHERE id = $1 AND tenant_id = $3 RETURNING 1
         )
         SELECT (SELECT COUNT(*) FROM memory) + (SELECT COUNT(*) FROM knowledge)",
    )
    .bind(id)
    .bind(vector)
    .bind(tenant_id)
    .fetch_one(executor)
    .await?;
    Ok(updated > 0)
}

impl VectorStore for PgVectorStore {
    async fn insert(
        &self,
        id: &str,
        vector: &[f32],
        _metadata: serde_json::Value,
    ) -> VectorStoreResult<()> {
        check_dimensions(vector)?;
        if is_zero(vector) {
            return Ok(());
        }
        if set_embedding(&self.pool, id, &self.tenant_id, vector)
            .await
            .map_err(store_error)?
        {
            Ok(())
        } else {
            Err(VectorError::Store(format!(
                "no memory or knowledge entry {id} to index"
            )))
        }
    }

    async fn insert_batch(
        &self,
        items: &[(String, Vec<f32>, serde_json::Value)],
    ) -> VectorStoreResult<()> {
        for (_, vector, _) in items {
            check_dimensions(vector)?;
        }
        let mut tx = self.pool.begin().await.map_err(store_error)?;
        for (id, vector, _) in items.iter().filter(|(_, v, _)| !is_zero(v)) {
            if !set_embedding(&mut *tx, id, &self.tenant_id, vector)
                .await
                .map_err(store_error)?
            {
                return Err(VectorError::Store(format!(
                    "no memory or knowledge entry {id} to index"
                )));
            }
        }
        tx.commit().await.map_err(store_error)
    }

    async fn search(
        &self,
        vector: &[f32],
        limit: usize,
        threshold: f32,
    ) -> VectorStoreResult<Vec<VectorResult>> {
        check_dimensions(vector)?;
        if is_zero(vector) {
            return Ok(Vec::new());
        }
        // pgvector's `<=>` is cosine distance in [0, 2]; similarity = 1 - distance.
        // Each table takes its nearest `limit` by distance, the shape its HNSW
        // index serves; the threshold then applies to the merged hits.
        // A zero vector stored earlier scores NaN, which sorts above every
        // number in PostgreSQL, so NaN is excluded explicitly.
        let rows: Vec<(String, f64, String, Option<String>)> = sqlx::query_as(
            "SELECT id, score, kind, personality_id FROM (
               (SELECT id, 1 - (embedding <=> $1::vector) AS score, 'memory' AS kind, personality_id
                FROM brain.memories WHERE tenant_id = $2 AND embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector LIMIT $4)
               UNION ALL
               (SELECT id, 1 - (embedding <=> $1::vector) AS score, 'knowledge' AS kind, personality_id
                FROM brain.knowledge WHERE tenant_id = $2 AND embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector LIMIT $4)
             ) hits
             WHERE score >= $3 AND score <> 'NaN'::float8
             ORDER BY score DESC, id
             LIMIT $4",
        )
        .bind(vector)
        .bind(&self.tenant_id)
        .bind(f64::from(threshold))
        .bind(i64::try_from(limit).unwrap_or(i64::MAX))
        .fetch_all(&self.pool)
        .await
        .map_err(store_error)?;

        Ok(rows
            .into_iter()
            .map(|(id, score, kind, personality_id)| VectorResult {
                id,
                score: score as f32,
                metadata: serde_json::json!({
                    "kind": kind,
                    "personalityId": personality_id,
                    "tenantId": self.tenant_id,
                }),
            })
            .collect())
    }

    async fn delete(&self, id: &str) -> VectorStoreResult<bool> {
        let cleared: i64 = sqlx::query_scalar(
            "WITH memory AS (
               UPDATE brain.memories SET embedding = NULL
               WHERE id = $1 AND tenant_id = $2 AND embedding IS NOT NULL RETURNING 1
             ), knowledge AS (
               UPDATE brain.knowledge SET embedding = NULL
               WHERE id = $1 AND tenant_id = $2 AND embedding IS NOT NULL RETURNING 1
             )
             SELECT (SELECT COUNT(*) FROM memory) + (SELECT COUNT(*) FROM knowledge)",
        )
        .bind(id)
        .bind(&self.tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(store_error)?;
        Ok(cleared > 0)
    }

    async fn count(&self) -> VectorStoreResult<usize> {
        let count: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM brain.memories WHERE tenant_id = $1 AND embedding IS NOT NULL)
                  + (SELECT COUNT(*) FROM brain.knowledge WHERE tenant_id = $1 AND embedding IS NOT NULL)",
        )
        .bind(&self.tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(store_error)?;
        Ok(usize::try_from(count).unwrap_or(0))
    }
}

/// Enum-based vector store that dispatches to either in-memory or pgvector.
/// Used to avoid generic proliferation in AppState.
pub enum DynVectorStore {
    InMemory(super::vector::InMemoryVectorStore),
    Postgres(PgVectorStore),
}

impl VectorStore for DynVectorStore {
    async fn insert(
        &self,
        id: &str,
        vector: &[f32],
        metadata: serde_json::Value,
    ) -> VectorStoreResult<()> {
        match self {
            Self::InMemory(s) => s.insert(id, vector, metadata).await,
            Self::Postgres(s) => s.insert(id, vector, metadata).await,
        }
    }

    async fn insert_batch(
        &self,
        items: &[(String, Vec<f32>, serde_json::Value)],
    ) -> VectorStoreResult<()> {
        match self {
            Self::InMemory(s) => s.insert_batch(items).await,
            Self::Postgres(s) => s.insert_batch(items).await,
        }
    }

    async fn search(
        &self,
        vector: &[f32],
        limit: usize,
        threshold: f32,
    ) -> VectorStoreResult<Vec<VectorResult>> {
        match self {
            Self::InMemory(s) => s.search(vector, limit, threshold).await,
            Self::Postgres(s) => s.search(vector, limit, threshold).await,
        }
    }

    async fn delete(&self, id: &str) -> VectorStoreResult<bool> {
        match self {
            Self::InMemory(s) => s.delete(id).await,
            Self::Postgres(s) => s.delete(id).await,
        }
    }

    async fn count(&self) -> VectorStoreResult<usize> {
        match self {
            Self::InMemory(s) => s.count().await,
            Self::Postgres(s) => s.count().await,
        }
    }
}
