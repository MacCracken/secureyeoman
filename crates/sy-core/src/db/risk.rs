//! Risk storage — assessments and departments in the `risk` schema, read the
//! way the TS `RiskAssessmentStorage` and `DepartmentRiskStorage` read them.

use serde::Serialize;
use serde_json::{Value, json};
use sqlx::PgPool;

/// An assessment without its rendered reports (the `report_*` columns),
/// serialized as the TS `RiskAssessment`: unset optionals are omitted.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentRow {
    pub id: String,
    pub name: String,
    pub status: String,
    pub assessment_types: Value,
    pub window_days: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composite_score: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_level: Option<String>,
    pub domain_scores: Value,
    pub findings: Value,
    pub findings_count: i32,
    pub options: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Newest-first assessments, optionally with one `status`, and the total.
pub async fn list_assessments(
    pool: &PgPool,
    status: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<AssessmentRow>, i64), sqlx::Error> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM risk.assessments WHERE ($1::text IS NULL OR status = $1)",
    )
    .bind(status)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, AssessmentRow>(
        "SELECT id, name, status, assessment_types, window_days, composite_score, risk_level,
                domain_scores, findings, findings_count, options, department_id, created_by,
                created_at, completed_at, error
         FROM risk.assessments WHERE ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(status)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

pub async fn get_assessment(pool: &PgPool, id: &str) -> Result<Option<AssessmentRow>, sqlx::Error> {
    sqlx::query_as::<_, AssessmentRow>(
        "SELECT id, name, status, assessment_types, window_days, composite_score, risk_level,
                domain_scores, findings, findings_count, options, department_id, created_by,
                created_at, completed_at, error
         FROM risk.assessments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn delete_assessment(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM risk.assessments WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DepartmentRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub mission: Option<String>,
    pub objectives: Option<Value>,
    pub parent_id: Option<String>,
    pub team_id: Option<String>,
    pub risk_appetite: Option<Value>,
    pub compliance_targets: Option<Value>,
    pub metadata: Option<Value>,
    pub tenant_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl DepartmentRow {
    /// The TS `Department` shape, with its defaults for NULL JSON columns.
    pub fn to_json(&self) -> Value {
        let array_or_empty = |v: &Option<Value>| match v {
            Some(Value::Array(items)) => Value::Array(items.clone()),
            _ => json!([]),
        };
        let mut department = json!({
            "id": self.id,
            "name": self.name,
            "objectives": array_or_empty(&self.objectives),
            "riskAppetite": self.risk_appetite.clone().unwrap_or_else(|| json!({
                "security": 50,
                "operational": 50,
                "financial": 50,
                "compliance": 50,
                "reputational": 50,
            })),
            "complianceTargets": array_or_empty(&self.compliance_targets),
            "metadata": self.metadata.clone().unwrap_or_else(|| json!({})),
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        });
        for (key, value) in [
            ("description", &self.description),
            ("mission", &self.mission),
            ("parentId", &self.parent_id),
            ("teamId", &self.team_id),
            ("tenantId", &self.tenant_id),
        ] {
            if let Some(value) = value {
                department[key] = Value::String(value.clone());
            }
        }
        department
    }
}

/// Which departments to list by parent.
#[derive(Debug, Clone, Copy)]
pub enum ParentFilter<'a> {
    Any,
    /// Top-level departments only.
    Root,
    Of(&'a str),
}

/// Departments by name, filtered by parent, and the total.
pub async fn list_departments(
    pool: &PgPool,
    parent: ParentFilter<'_>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<DepartmentRow>, i64), sqlx::Error> {
    let (roots_only, parent_id) = match parent {
        ParentFilter::Any => (false, None),
        ParentFilter::Root => (true, None),
        ParentFilter::Of(id) => (false, Some(id)),
    };
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM risk.departments
         WHERE (NOT $1 OR parent_id IS NULL) AND ($2::text IS NULL OR parent_id = $2)",
    )
    .bind(roots_only)
    .bind(parent_id)
    .fetch_one(pool)
    .await?;
    let rows = sqlx::query_as::<_, DepartmentRow>(
        "SELECT id, name, description, mission, objectives, parent_id, team_id, risk_appetite,
                compliance_targets, metadata, tenant_id, created_at, updated_at
         FROM risk.departments
         WHERE (NOT $1 OR parent_id IS NULL) AND ($2::text IS NULL OR parent_id = $2)
         ORDER BY name ASC, id ASC LIMIT $3 OFFSET $4",
    )
    .bind(roots_only)
    .bind(parent_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    Ok((rows, total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn departments_fill_the_ts_defaults() {
        let row = DepartmentRow {
            id: "d1".into(),
            name: "Ops".into(),
            description: None,
            mission: Some("keep it running".into()),
            objectives: None,
            parent_id: None,
            team_id: None,
            risk_appetite: None,
            compliance_targets: Some(json!({"not": "an array"})),
            metadata: None,
            tenant_id: None,
            created_at: 1,
            updated_at: 2,
        };
        let v = row.to_json();
        assert_eq!(v["objectives"], json!([]));
        assert_eq!(v["complianceTargets"], json!([]));
        assert_eq!(v["riskAppetite"]["security"], 50);
        assert_eq!(v["metadata"], json!({}));
        assert_eq!(v["mission"], "keep it running");
        assert!(v.get("description").is_none() && v.get("parentId").is_none());
    }
}
