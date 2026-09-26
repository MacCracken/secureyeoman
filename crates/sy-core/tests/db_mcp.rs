//! Database-backed MCP tests: server rows with NULL `args`/`env` read as the
//! TS storage mapped them, and resources are live-connection state, never a
//! table. Skipped unless `SY_TEST_DATABASE_URL` is set (see
//! `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use sy_core::server::build_router;

#[tokio::test]
async fn servers_with_null_json_columns_decode_and_resources_are_empty() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let id = format!("mcp-{}", uuid::Uuid::now_v7());
    sqlx::query(
        "INSERT INTO mcp.servers (id, name, args, env, created_at, updated_at)
         VALUES ($1, $1, NULL, NULL, 1, 1)",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .unwrap();

    let (status, body) = send(app.clone(), req("GET", "/api/v1/mcp/servers", &admin, None)).await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let list = json(&body);
    let server = list["servers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == id.as_str())
        .expect("server listed")
        .clone();
    assert_eq!(server["args"], serde_json::json!([]));
    assert_eq!(server["env"], serde_json::json!({}));

    let (status, body) = send(
        app.clone(),
        req("GET", &format!("/api/v1/mcp/servers/{id}"), &admin, None),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json(&body), server);
    let (status, _) = send(
        app.clone(),
        req(
            "GET",
            &format!("/api/v1/mcp/servers/{id}/health"),
            &admin,
            None,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = send(
        app.clone(),
        req("GET", "/api/v1/mcp/resources", &admin, None),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        json(&body),
        serde_json::json!({ "resources": [], "total": 0 })
    );

    sqlx::query("DELETE FROM mcp.servers WHERE id = $1")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
}
