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

/// Poll a run until it leaves pending/running (or `want` when given).
async fn wait_for_run(app: &Router, token: &str, run_id: &str, want: Option<&str>) -> Value {
    for _ in 0..200 {
        let (status, detail) = call(
            app,
            token,
            "GET",
            &format!("/api/v1/workflows/runs/{run_id}"),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{detail}");
        let state = detail["run"]["status"].as_str().unwrap_or_default();
        let done = match want {
            Some(want) => state == want,
            None => !["pending", "running"].contains(&state),
        };
        if done {
            return detail["run"].clone();
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("run {run_id} did not finish");
}

/// Delete the workflows a test created — with their runs, which the delete
/// has to take along (`runs.workflow_id` does not cascade).
async fn delete_created(app: &Router, token: &str, created: &[String]) {
    for id in created {
        let path = format!("/api/v1/workflows/{id}");
        let (status, body) = call(app, token, "DELETE", &path, None).await;
        assert_eq!(status, StatusCode::NO_CONTENT, "{path}: {body}");
        let (status, _) = call(app, token, "GET", &path, None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
    }
}

/// Create a workflow of `steps` (recorded in `created`) and start a run.
async fn start_run(
    app: &Router,
    token: &str,
    created: &mut Vec<String>,
    steps: Value,
    input: Value,
) -> String {
    let body = serde_json::json!({ "name": unique("exec"), "steps": steps }).to_string();
    let def = create(app, token, &body).await;
    let id = def["id"].as_str().unwrap();
    created.push(id.to_string());
    let (status, started) = call(
        app,
        token,
        "POST",
        &format!("/api/v1/workflows/{id}/run"),
        Some(&serde_json::json!({ "input": input }).to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{started}");
    started["run"]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn runs_execute_what_the_definition_says() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let mut created = Vec::new();

    // The kill switch starts off (the default); restore whatever was set.
    let (_, policy) = call(&app, &admin, "GET", "/api/v1/security/policy", None).await;
    let sub_agents_before = policy["allowSubAgents"].as_bool().unwrap_or(false);
    let (status, _) = call(
        &app,
        &admin,
        "PATCH",
        "/api/v1/security/policy",
        Some(r#"{"allowSubAgents":false}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // TS-style steps (`type`), a false and a true condition, and an agent
    // step the kill switch refuses (onError: continue).
    let run_id = start_run(
        &app,
        &admin,
        &mut created,
        serde_json::json!([
            {"id": "a", "type": "transform", "config": {"outputTemplate": "q={{input.q}}"}},
            {"id": "gated", "type": "transform", "dependsOn": ["a"],
             "condition": "input.q > 5", "config": {"outputTemplate": "no"}},
            {"id": "b", "type": "transform", "dependsOn": ["a"],
             "condition": "steps.a.status == 'completed'", "config": {"outputTemplate": "yes"}},
            {"id": "agent", "type": "agent", "dependsOn": ["b"], "onError": "continue",
             "config": {"taskTemplate": "summarize"}},
        ]),
        serde_json::json!({"q": 1}),
    )
    .await;
    let run = wait_for_run(&app, &admin, &run_id, None).await;
    assert_eq!(run["status"], "completed", "{run}");
    let steps: std::collections::HashMap<String, Value> = run["stepRuns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| (s["stepId"].as_str().unwrap().to_string(), s.clone()))
        .collect();
    assert_eq!(steps["a"]["status"], "completed");
    assert_eq!(steps["a"]["output"], "q=1");
    assert_eq!(steps["gated"]["status"], "skipped");
    assert_eq!(steps["b"]["status"], "completed");
    assert_eq!(steps["agent"]["status"], "failed");
    assert!(
        steps["agent"]["error"]
            .as_str()
            .unwrap()
            .contains("allowSubAgents"),
        "{}",
        steps["agent"]
    );

    // A step type this server cannot run fails the run: a human_approval
    // gate is never waved through.
    let run_id = start_run(
        &app,
        &admin,
        &mut created,
        serde_json::json!([
            {"id": "a", "type": "transform", "config": {"outputTemplate": "x"}},
            {"id": "approve", "type": "human_approval", "dependsOn": ["a"]},
            {"id": "deploy", "type": "transform", "dependsOn": ["approve"],
             "config": {"outputTemplate": "deployed"}},
        ]),
        serde_json::json!({}),
    )
    .await;
    let run = wait_for_run(&app, &admin, &run_id, None).await;
    assert_eq!(run["status"], "failed", "{run}");
    assert!(run["error"].as_str().unwrap().contains("human_approval"));
    assert!(
        !run["stepRuns"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["stepId"] == "deploy")
    );

    // A definition the engine cannot read fails; it used to "complete" as
    // an empty workflow.
    let run_id = start_run(
        &app,
        &admin,
        &mut created,
        serde_json::json!([{"id": "x", "type": "teleport"}]),
        serde_json::json!({}),
    )
    .await;
    let run = wait_for_run(&app, &admin, &run_id, None).await;
    assert_eq!(run["status"], "failed", "{run}");
    assert!(
        run["error"]
            .as_str()
            .unwrap()
            .contains("Invalid workflow definition")
    );

    // Cancelling stops the run: had it run on, both steps would be recorded
    // well within the wait below.
    let run_id = start_run(
        &app,
        &admin,
        &mut created,
        serde_json::json!([
            {"id": "wait", "type": "delay", "config": {"durationMs": 800}},
            {"id": "after", "type": "transform", "dependsOn": ["wait"],
             "config": {"outputTemplate": "too late"}},
        ]),
        serde_json::json!({}),
    )
    .await;
    wait_for_run(&app, &admin, &run_id, Some("running")).await;
    let (status, cancelled) = call(
        &app,
        &admin,
        "DELETE",
        &format!("/api/v1/workflows/runs/{run_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cancelled["run"]["status"], "cancelled");
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    let run = wait_for_run(&app, &admin, &run_id, None).await;
    assert_eq!(run["status"], "cancelled");
    assert_eq!(run["stepRuns"], serde_json::json!([]));

    delete_created(&app, &admin, &created).await;

    let restore = serde_json::json!({ "allowSubAgents": sub_agents_before }).to_string();
    let (status, _) = call(
        &app,
        &admin,
        "PATCH",
        "/api/v1/security/policy",
        Some(&restore),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn emergency_stop_disables_and_cancels() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");
    let mut created = Vec::new();

    // A workflow mid-run: stopped, disabled, and its run cancelled.
    let run_id = start_run(
        &app,
        &admin,
        &mut created,
        serde_json::json!([
            {"id": "wait", "type": "delay", "config": {"durationMs": 800}},
            {"id": "after", "type": "transform", "dependsOn": ["wait"],
             "config": {"outputTemplate": "too late"}},
        ]),
        serde_json::json!({}),
    )
    .await;
    let run = wait_for_run(&app, &admin, &run_id, Some("running")).await;
    let workflow_id = run["workflowId"].as_str().unwrap().to_string();

    // Not for operators (the route is unmapped in RBAC: admin only).
    let operator = common::test_token("operator");
    let (status, _) = call(
        &app,
        &operator,
        "POST",
        &format!("/api/v1/autonomy/emergency-stop/workflow/{workflow_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, body) = call(
        &app,
        &admin,
        "POST",
        &format!("/api/v1/autonomy/emergency-stop/workflow/{workflow_id}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["success"], true);
    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
    let run = wait_for_run(&app, &admin, &run_id, None).await;
    assert_eq!(run["status"], "cancelled", "{run}");
    assert_eq!(
        run["stepRuns"],
        serde_json::json!([]),
        "the run was stopped"
    );
    let (_, def) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/workflows/{workflow_id}"),
        None,
    )
    .await;
    assert_eq!(def["definition"]["isEnabled"], false);

    // A skill: disabled.
    let skill = unique("skill");
    sqlx::query("INSERT INTO soul.skills (id, name, created_at, updated_at) VALUES ($1, $1, 0, 0)")
        .bind(&skill)
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = call(
        &app,
        &admin,
        "POST",
        &format!("/api/v1/autonomy/emergency-stop/skill/{skill}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (enabled,): (bool,) = sqlx::query_as("SELECT enabled FROM soul.skills WHERE id = $1")
        .bind(&skill)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(!enabled);

    // Unknown targets and types.
    for (path, want) in [
        (
            "/api/v1/autonomy/emergency-stop/skill/no-such-skill".to_string(),
            StatusCode::NOT_FOUND,
        ),
        (
            format!("/api/v1/autonomy/emergency-stop/agent/{skill}"),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        let (status, _) = call(&app, &admin, "POST", &path, None).await;
        assert_eq!(status, want, "{path}");
    }
    sqlx::query("DELETE FROM soul.skills WHERE id = $1")
        .bind(&skill)
        .execute(&pool)
        .await
        .unwrap();
    delete_created(&app, &admin, &created).await;
}
