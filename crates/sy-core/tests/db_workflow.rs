//! Database-backed workflow tests: definitions, versions, runs and
//! import/export against the shipped schema, in the dashboard's wire shapes.
//! Skipped unless `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sy_core::server::build_router;

fn unique(prefix: &str) -> String {
    format!("{prefix}-{}", uuid::Uuid::now_v7())
}

async fn call(
    app: &Router,
    token: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> (StatusCode, Value) {
    let (status, bytes) = send(app.clone(), req(method, path, token, body)).await;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        json(&bytes)
    };
    (status, value)
}

async fn create(app: &Router, token: &str, body: &str) -> Value {
    let (status, v) = call(app, token, "POST", "/api/v1/workflows", Some(body)).await;
    assert_eq!(status, StatusCode::CREATED, "{v}");
    v["definition"].clone()
}

#[tokio::test]
async fn definitions_follow_the_dashboard_contract() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    let name = unique("wf");
    let def = create(
        &app,
        &admin,
        &format!(r#"{{"name":"{name}","steps":[{{"id":"s1","type":"llm","name":"S1","config":{{}},"dependsOn":[],"onError":"fail"}}]}}"#),
    )
    .await;
    let id = def["id"].as_str().unwrap().to_string();
    assert_eq!(def["steps"][0]["id"], "s1");
    assert_eq!(def["edges"], serde_json::json!([]));
    assert_eq!(def["triggers"], serde_json::json!([]));
    assert_eq!(def["isEnabled"], true);
    assert_eq!(def["version"], 1);
    assert_eq!(def["autonomyLevel"], "L2");
    assert!(def.get("stepsJson").is_none());

    let (status, list) = call(&app, &admin, "GET", "/api/v1/workflows?limit=100", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(list["total"].as_i64().unwrap() >= 1);
    assert!(
        list["definitions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["id"] == id.as_str())
    );

    let path = format!("/api/v1/workflows/{id}");
    let (status, got) = call(&app, &admin, "GET", &path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["definition"]["name"], name.as_str());

    // Update: partial, and an autonomy escalation is flagged.
    let (status, updated) = call(
        &app,
        &admin,
        "PUT",
        &path,
        Some(r#"{"description":"now documented","autonomyLevel":"L4"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["definition"]["description"], "now documented");
    assert_eq!(updated["definition"]["name"], name.as_str());
    assert!(
        updated["warnings"][0]
            .as_str()
            .unwrap()
            .contains("L2 to L4")
    );
    let (status, _) = call(
        &app,
        &admin,
        "PUT",
        &path,
        Some(r#"{"autonomyLevel":"L9"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Delete.
    let (status, _) = call(&app, &admin, "DELETE", &path, None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(&app, &admin, "GET", &path, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, &admin, "PUT", &path, Some("{}")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn edits_are_versioned_tagged_diffed_and_rolled_back() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    let original = unique("original");
    let def = create(&app, &admin, &format!(r#"{{"name":"{original}"}}"#)).await;
    let id = def["id"].as_str().unwrap().to_string();
    let base = format!("/api/v1/workflows/{id}");

    // Tag the first release explicitly, then edit twice.
    let (status, v1) = call(
        &app,
        &admin,
        "POST",
        &format!("{base}/versions/tag"),
        Some(r#"{"tag":"v1"}"#),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{v1}");
    assert_eq!(v1["versionTag"], "v1");
    assert_eq!(v1["snapshot"]["name"], original.as_str());

    let renamed = unique("renamed");
    call(
        &app,
        &admin,
        "PUT",
        &base,
        Some(&format!(r#"{{"name":"{renamed}"}}"#)),
    )
    .await;
    let (_, _) = call(&app, &admin, "PUT", &base, Some(r#"{"isEnabled":false}"#)).await;

    let (status, list) = call(&app, &admin, "GET", &format!("{base}/versions"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list["total"], 3, "tag + two edits: {list}");
    let newest = &list["versions"][0];
    assert_eq!(newest["changedFields"], serde_json::json!(["isEnabled"]));
    assert!(
        newest["diffSummary"]
            .as_str()
            .unwrap()
            .contains("-  \"isEnabled\": true")
    );
    let rename_version = list["versions"][1]["id"].as_str().unwrap().to_string();

    // Drift since v1 reports the rename and the disable.
    let (status, drift) = call(&app, &admin, "GET", &format!("{base}/drift"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(drift["lastTaggedVersion"], "v1");
    assert_eq!(drift["uncommittedChanges"], 2, "{drift}");

    // Look up by tag; diff by id and tag.
    let (status, by_tag) = call(&app, &admin, "GET", &format!("{base}/versions/v1"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(by_tag["id"], v1["id"]);
    let (status, diff) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/versions/v1/diff/{rename_version}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let diff = diff["diff"].as_str().unwrap();
    assert!(diff.starts_with("--- v1\n+++ "), "{diff}");
    assert!(
        diff.contains(&format!("+  \"name\": \"{renamed}\"")),
        "{diff}"
    );

    // An automatic tag uses today's date.
    let (status, auto) = call(&app, &admin, "POST", &format!("{base}/versions/tag"), None).await;
    assert_eq!(status, StatusCode::CREATED);
    let today = chrono::Utc::now().format("%Y.%-m.%-d").to_string();
    assert!(auto["versionTag"].as_str().unwrap().starts_with(&today));

    // Roll back to v1: the definition is restored and the rollback recorded.
    let (status, rolled) = call(
        &app,
        &admin,
        "POST",
        &format!("{base}/versions/{}/rollback", v1["id"].as_str().unwrap()),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{rolled}");
    let (_, current) = call(&app, &admin, "GET", &base, None).await;
    assert_eq!(current["definition"]["name"], original.as_str());
    assert_eq!(current["definition"]["isEnabled"], true);

    // Export a version; unknown versions are 404s.
    let (status, export) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/versions/v1/export"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(export["versionTag"], "v1");
    assert_eq!(export["workflow"]["name"], original.as_str());
    for path in [
        format!("{base}/versions/nope"),
        format!("{base}/versions/nope/diff/v1"),
    ] {
        let (status, _) = call(&app, &admin, "GET", &path, None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn runs_and_import_export() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    // A disabled workflow cannot run.
    let disabled = create(
        &app,
        &admin,
        &format!(r#"{{"name":"{}","isEnabled":false}}"#, unique("off")),
    )
    .await;
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        &format!("/api/v1/workflows/{}/run", disabled["id"].as_str().unwrap()),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // An enabled one runs: 202 { run }, listed, fetchable with stepRuns.
    let name = unique("on");
    let def = create(&app, &admin, &format!(r#"{{"name":"{name}"}}"#)).await;
    let id = def["id"].as_str().unwrap().to_string();
    let (status, started) = call(
        &app,
        &admin,
        "POST",
        &format!("/api/v1/workflows/{id}/run"),
        Some(r#"{"input":{"q":1}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    let run = &started["run"];
    assert_eq!(run["workflowName"], name.as_str());
    assert_eq!(run["input"]["q"], 1);
    let run_id = run["id"].as_str().unwrap().to_string();

    let (_, runs) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/workflows/{id}/runs"),
        None,
    )
    .await;
    assert_eq!(runs["total"], 1);
    assert_eq!(runs["runs"][0]["id"], run_id.as_str());
    let (status, detail) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/workflows/runs/{run_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(detail["run"]["stepRuns"].is_array());
    let (status, cancelled) = call(
        &app,
        &admin,
        "DELETE",
        &format!("/api/v1/workflows/runs/{run_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let state = cancelled["run"]["status"].as_str().unwrap();
    assert!(
        ["cancelled", "completed", "failed"].contains(&state),
        "{state}"
    );

    // Export → import round trip, with requirements reported as gaps.
    let (status, export) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/workflows/{id}/export"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(export["workflow"]["name"], name.as_str());
    // Names are unique: importing it as-is conflicts; under a new name it lands.
    let body = serde_json::json!({ "workflow": export }).to_string();
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/workflows/import",
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let copy = unique("copy");
    let mut payload = export.clone();
    payload["workflow"]["name"] = serde_json::json!(copy);
    payload["requires"] = serde_json::json!({ "integrations": ["github"] });
    let body = serde_json::json!({ "workflow": payload }).to_string();
    let (status, imported) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/workflows/import",
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{imported}");
    assert_eq!(imported["definition"]["name"], copy.as_str());
    assert_eq!(imported["definition"]["createdBy"], "imported");
    assert_eq!(imported["compatibility"]["compatible"], false);
    assert_eq!(
        imported["compatibility"]["gaps"]["integrations"][0],
        "github"
    );
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        "/api/v1/workflows/import",
        Some(r#"{"workflow":{}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
