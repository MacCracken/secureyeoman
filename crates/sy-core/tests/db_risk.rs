//! Database-backed risk tests: assessments and departments read from the
//! shipped `risk` schema, at the TS paths and in its wire shapes. Skipped
//! unless `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sy_core::server::build_router;

async fn get(app: &Router, token: &str, path: &str) -> (StatusCode, Value) {
    let (status, bytes) = send(app.clone(), req("GET", path, token, None)).await;
    (status, json(&bytes))
}

fn find<'a>(list: &'a Value, id: &str) -> Option<&'a Value> {
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == id)
}

#[tokio::test]
async fn assessments_and_departments_follow_the_ts_contract() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");
    let tag = uuid::Uuid::now_v7().to_string();

    let (root, child) = (format!("root-{tag}"), format!("child-{tag}"));
    for (id, parent) in [(&root, None), (&child, Some(&root))] {
        sqlx::query("INSERT INTO risk.departments (id, name, parent_id, objectives) VALUES ($1, $1, $2, NULL)")
            .bind(id)
            .bind(parent)
            .execute(&pool)
            .await
            .unwrap();
    }
    let (done, pending) = (format!("done-{tag}"), format!("pending-{tag}"));
    sqlx::query(
        "INSERT INTO risk.assessments
           (id, name, status, composite_score, risk_level, findings_count, department_id, created_at, completed_at)
         VALUES ($1, 'Q3 review', 'completed', 72, 'high', 3, $2, 1000, 2000),
                ($3, 'Q4 review', 'pending', NULL, NULL, 0, NULL, 3000, NULL)",
    )
    .bind(&done)
    .bind(&root)
    .bind(&pending)
    .execute(&pool)
    .await
    .unwrap();

    // Assessments: `{ items, total }`, filtered by status, unset optionals omitted.
    let (status, list) = get(
        &app,
        &admin,
        "/api/v1/risk/assessments?status=completed&limit=100",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert!(list["total"].as_i64().unwrap() >= 1);
    let completed = find(&list, &done).expect("completed assessment listed");
    assert_eq!(completed["compositeScore"], 72);
    assert_eq!(completed["riskLevel"], "high");
    assert_eq!(completed["findingsCount"], 3);
    assert_eq!(completed["departmentId"], root.as_str());
    assert_eq!(completed["completedAt"], 2000);
    assert_eq!(completed["assessmentTypes"], serde_json::json!([]));
    assert!(find(&list, &pending).is_none());

    let (status, one) = get(&app, &admin, &format!("/api/v1/risk/assessments/{pending}")).await;
    assert_eq!(status, StatusCode::OK);
    let assessment = &one["assessment"];
    assert_eq!(assessment["status"], "pending");
    for absent in [
        "compositeScore",
        "riskLevel",
        "completedAt",
        "departmentId",
        "error",
    ] {
        assert!(
            assessment.get(absent).is_none(),
            "{absent} should be omitted: {assessment}"
        );
    }
    let (status, _) = get(&app, &admin, "/api/v1/risk/assessments/no-such-assessment").await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Departments: top level with `parentId=null`, children by parent id.
    let (status, roots) = get(
        &app,
        &admin,
        "/api/v1/risk/departments?parentId=null&limit=100",
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let root_dept = find(&roots, &root).expect("root department listed");
    assert_eq!(root_dept["objectives"], serde_json::json!([]));
    assert_eq!(root_dept["riskAppetite"]["compliance"], 50);
    assert!(find(&roots, &child).is_none());
    let (_, children) = get(
        &app,
        &admin,
        &format!("/api/v1/risk/departments?parentId={root}"),
    )
    .await;
    assert_eq!(children["total"], 1);
    assert_eq!(children["items"][0]["parentId"], root.as_str());

    // Running an assessment is not ported: an explicit 501, not a 500.
    let (status, _) = send(
        app.clone(),
        req(
            "POST",
            "/api/v1/risk/assessments",
            &admin,
            Some(r#"{"name":"x"}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);

    // Delete: 204, then 404.
    for id in [&done, &pending] {
        let path = format!("/api/v1/risk/assessments/{id}");
        let (status, _) = send(app.clone(), req("DELETE", &path, &admin, None)).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        let (status, _) = send(app.clone(), req("DELETE", &path, &admin, None)).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
    sqlx::query("DELETE FROM risk.departments WHERE id = ANY($1)")
        .bind(vec![child, root])
        .execute(&pool)
        .await
        .unwrap();
}
