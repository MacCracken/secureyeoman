//! Database-backed soul tests: agent name, soul config and the skills API,
//! against the shipped schema. Skipped unless `SY_TEST_DATABASE_URL` is set
//! (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use sy_core::server::build_router;

fn unique(prefix: &str) -> String {
    format!("{prefix}-{}", uuid::Uuid::now_v7())
}

#[tokio::test]
async fn agent_name_round_trips_through_soul_meta() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    let (status, body) = send(
        app.clone(),
        req(
            "PUT",
            "/api/v1/soul/agent-name",
            &admin,
            Some(r#"{"agentName":"  Jarvis  "}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    assert_eq!(json(&body)["agentName"], "Jarvis");

    let (status, body) = send(
        app.clone(),
        req("GET", "/api/v1/soul/agent-name", &admin, None),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["agentName"], "Jarvis");

    let (status, _) = send(
        app,
        req(
            "PUT",
            "/api/v1/soul/agent-name",
            &admin,
            Some(r#"{"agentName":"  "}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn soul_config_merges_validates_and_persists() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let patch = |body: &'static str| req("PATCH", "/api/v1/soul/config", &admin, Some(body));

    let (status, body) = send(
        app.clone(),
        patch(r#"{"maxSkills":150,"learningMode":["user_authored","ai_proposed"],"bogus":1}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let config = &json(&body)["config"];
    assert_eq!(config["maxSkills"], 150);
    assert_eq!(config["maxPromptTokens"], 64000); // default kept
    assert!(config.get("bogus").is_none(), "unknown keys are dropped");

    let (_, body) = send(app.clone(), req("GET", "/api/v1/soul/config", &admin, None)).await;
    assert_eq!(json(&body)["config"]["maxSkills"], 150);

    for invalid in [
        r#"{"maxSkills":500}"#,
        r#"{"learningMode":["telepathy"]}"#,
        r#"{"enabled":"yes"}"#,
    ] {
        let (status, _) = send(app.clone(), patch(invalid)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{invalid}");
    }
    let (_, body) = send(app.clone(), req("GET", "/api/v1/soul/config", &admin, None)).await;
    assert_eq!(
        json(&body)["config"]["maxSkills"],
        150,
        "a rejected patch changed nothing"
    );

    let (status, _) = send(
        app,
        patch(r#"{"maxSkills":100,"learningMode":["user_authored"]}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn skills_lifecycle_matches_the_dashboard_contract() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");

    // A personality to own the skill.
    let owner = unique("Owner");
    let (status, body) = send(
        app.clone(),
        req(
            "POST",
            "/api/v1/soul/personalities",
            &admin,
            Some(&format!(r#"{{"name":"{owner}"}}"#)),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&body)
    );
    let owner_id = json(&body)["personality"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Create (pending approval, owned by the personality).
    let name = unique("summarise");
    let create = format!(
        r#"{{"name":"{name}","instructions":"Summarise the text.","triggerPatterns":["summarise"],
            "tools":[{{"name":"fetch","description":"d","inputSchema":{{}}}}],
            "personalityId":"{owner_id}","status":"pending_approval","source":"ai_proposed"}}"#
    );
    let (status, body) = send(
        app.clone(),
        req("POST", "/api/v1/soul/skills", &admin, Some(&create)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&body)
    );
    let skill = json(&body)["skill"].clone();
    let id = skill["id"].as_str().unwrap().to_string();
    assert_eq!(skill["name"], name.as_str());
    assert_eq!(skill["status"], "pending_approval");
    assert_eq!(skill["routing"], "fuzzy");
    assert_eq!(skill["autonomyLevel"], "L1");
    assert_eq!(skill["triggerPatterns"][0], "summarise");
    assert_eq!(skill["tools"][0]["name"], "fetch");
    assert_eq!(skill["usageCount"], 0);

    // List: filtered by status, with the owner's name attached.
    let (status, body) = send(
        app.clone(),
        req(
            "GET",
            "/api/v1/soul/skills?status=pending_approval",
            &admin,
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let list = json(&body);
    assert!(list["total"].as_i64().unwrap() >= 1);
    let listed = list["skills"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == id.as_str())
        .expect("pending skill listed")
        .clone();
    assert_eq!(listed["personalityName"], owner.as_str());
    // A page past the end is empty but still reports the total.
    let (_, body) = send(
        app.clone(),
        req(
            "GET",
            "/api/v1/soul/skills?status=pending_approval&offset=1000000",
            &admin,
            None,
        ),
    )
    .await;
    let past_end = json(&body);
    assert_eq!(past_end["skills"], serde_json::json!([]));
    assert!(past_end["total"].as_i64().unwrap() >= 1, "{past_end}");

    // Approve; a second approve is refused.
    let path = |suffix: &str| format!("/api/v1/soul/skills/{id}{suffix}");
    let (status, body) = send(app.clone(), req("POST", &path("/approve"), &admin, None)).await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    assert_eq!(json(&body)["skill"]["status"], "active");
    let (status, _) = send(app.clone(), req("POST", &path("/approve"), &admin, None)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Partial update keeps untouched fields; outputSchema can be set and cleared.
    let (status, body) = send(
        app.clone(),
        req(
            "PUT",
            &path(""),
            &admin,
            Some(r#"{"autonomyLevel":"L2","outputSchema":{"type":"object"}}"#),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let updated = json(&body)["skill"].clone();
    assert_eq!(updated["autonomyLevel"], "L2");
    assert_eq!(updated["outputSchema"]["type"], "object");
    assert_eq!(updated["name"], name.as_str());
    let (_, body) = send(
        app.clone(),
        req("PUT", &path(""), &admin, Some(r#"{"outputSchema":null}"#)),
    )
    .await;
    assert!(json(&body)["skill"]["outputSchema"].is_null());
    let (status, _) = send(
        app.clone(),
        req("PUT", &path(""), &admin, Some(r#"{"routing":"random"}"#)),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Disable / enable.
    let (status, body) = send(app.clone(), req("POST", &path("/disable"), &admin, None)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["success"], true);
    let (_, body) = send(
        app.clone(),
        req(
            "GET",
            &format!("/api/v1/soul/skills?personalityId={owner_id}"),
            &admin,
            None,
        ),
    )
    .await;
    let found = json(&body)["skills"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == id.as_str())
        .cloned()
        .unwrap();
    assert_eq!(found["enabled"], false);
    let (status, _) = send(app.clone(), req("POST", &path("/enable"), &admin, None)).await;
    assert_eq!(status, StatusCode::OK);

    // Reject deletes a pending skill; a non-pending one cannot be rejected.
    let pending = format!(
        r#"{{"name":"{}","status":"pending_approval"}}"#,
        unique("draft")
    );
    let (_, body) = send(
        app.clone(),
        req("POST", "/api/v1/soul/skills", &admin, Some(&pending)),
    )
    .await;
    let draft = json(&body)["skill"]["id"].as_str().unwrap().to_string();
    let (status, body) = send(
        app.clone(),
        req(
            "POST",
            &format!("/api/v1/soul/skills/{draft}/reject"),
            &admin,
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["message"], "Skill rejected");
    let (status, _) = send(app.clone(), req("POST", &path("/reject"), &admin, None)).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "an active skill is not rejectable"
    );

    // Delete; then everything about it is a 404.
    let (status, _) = send(app.clone(), req("DELETE", &path(""), &admin, None)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    for (method, suffix) in [("DELETE", ""), ("POST", "/enable"), ("PUT", "")] {
        let body = (method == "PUT").then_some("{}");
        let (status, _) = send(app.clone(), req(method, &path(suffix), &admin, body)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {suffix}");
    }

    // Creating without a name is a validation error, not a 500.
    let (status, _) = send(app, req("POST", "/api/v1/soul/skills", &admin, Some("{}"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn personality_state_follows_the_ts_gateway() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let create = |name: String| {
        req(
            "POST",
            "/api/v1/soul/personalities",
            &admin,
            Some(&format!(r#"{{"name":"{name}"}}"#)),
        )
    };
    let (_, body) = send(app.clone(), create(unique("A"))).await;
    let a = json(&body)["personality"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (_, body) = send(app.clone(), create(unique("B"))).await;
    let b = json(&body)["personality"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let post = |path: String| req("POST", &path, &admin, None);
    let get = |id: &str| {
        req(
            "GET",
            &format!("/api/v1/soul/personalities/{id}"),
            &admin,
            None,
        )
    };

    // Activate (the dashboard POSTs): A becomes the default and only enabled one.
    let (status, _) = send(
        app.clone(),
        post(format!("/api/v1/soul/personalities/{b}/enable")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let (status, body) = send(
        app.clone(),
        post(format!("/api/v1/soul/personalities/{a}/activate")),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    assert_eq!(json(&body)["personality"]["id"], a.as_str());
    let (_, body) = send(app.clone(), get(&b)).await;
    let pb = json(&body);
    assert_eq!(pb["isActive"], false, "activation disables the others");
    assert_eq!(pb["isDefault"], false);

    // Activating an unknown id changes nothing (it used to disable everything).
    let (status, _) = send(
        app.clone(),
        post("/api/v1/soul/personalities/nope/activate".into()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, body) = send(app.clone(), get(&a)).await;
    assert_eq!(json(&body)["isActive"], true);
    assert_eq!(json(&body)["isDefault"], true);

    // set-default moves the default without touching which are enabled.
    let (status, body) = send(
        app.clone(),
        post(format!("/api/v1/soul/personalities/{b}/set-default")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["personality"]["id"], b.as_str());
    let (_, body) = send(app.clone(), get(&a)).await;
    assert_eq!(json(&body)["isActive"], true);
    assert_eq!(json(&body)["isDefault"], false);

    // disable / clear-default.
    let (status, body) = send(
        app.clone(),
        post(format!("/api/v1/soul/personalities/{a}/disable")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["success"], true);
    let (status, body) = send(
        app.clone(),
        post("/api/v1/soul/personalities/clear-default".into()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body)["success"], true);
    let (_, body) = send(app.clone(), get(&b)).await;
    assert_eq!(json(&body)["isDefault"], false);

    // The legacy PUT activate still works.
    let (status, _) = send(
        app,
        req(
            "PUT",
            &format!("/api/v1/soul/personalities/{a}/activate"),
            &admin,
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}
