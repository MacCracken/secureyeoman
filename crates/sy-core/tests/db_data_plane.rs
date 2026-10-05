//! Database-backed tests of data-plane guards: workspace membership changes
//! need a workspace admin and never remove the last one, and terminating an
//! execution session keeps its history. Skipped unless `SY_TEST_DATABASE_URL`
//! is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, send};
use sy_core::server::build_router;

async fn delete(app: &Router, token: &str, path: &str) -> StatusCode {
    send(app.clone(), req("DELETE", path, token, None)).await.0
}

#[tokio::test]
async fn workspace_members_are_removed_only_by_workspace_admins() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);

    let ws = format!("ws-{}", uuid::Uuid::now_v7());
    let owner = format!("owner-{ws}");
    let member = format!("member-{ws}");
    let outsider = format!("outsider-{ws}");
    sqlx::query(
        "INSERT INTO workspace.workspaces (id, name, created_at, updated_at) VALUES ($1, $1, 0, 0)",
    )
    .bind(&ws)
    .execute(&pool)
    .await
    .unwrap();
    for (user, role) in [
        (&owner, "owner"),
        (&member, "member"),
        (&outsider, "member"),
    ] {
        sqlx::query(
            "INSERT INTO workspace.members (workspace_id, user_id, role, joined_at)
             VALUES ($1, $2, $3, 0)",
        )
        .bind(&ws)
        .bind(user)
        .bind(role)
        .execute(&pool)
        .await
        .unwrap();
    }
    let path = |user: &str| format!("/api/v1/workspaces/{ws}/members/{user}");

    // An operator (who holds workspaces:write) who is not this workspace's
    // admin cannot remove anyone — including its owner.
    let outsider_token = common::test_token_for(&outsider, "operator");
    assert_eq!(
        delete(&app, &outsider_token, &path(&owner)).await,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        delete(&app, &outsider_token, &path(&member)).await,
        StatusCode::FORBIDDEN
    );

    // The workspace's owner can.
    let owner_token = common::test_token_for(&owner, "operator");
    assert_eq!(
        delete(&app, &owner_token, &path(&member)).await,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        delete(&app, &owner_token, &path(&member)).await,
        StatusCode::NOT_FOUND
    );

    // Nobody, a global admin included, removes the last owner/admin.
    let admin = common::test_token("admin");
    assert_eq!(
        delete(&app, &admin, &path(&owner)).await,
        StatusCode::BAD_REQUEST
    );
    let still_there: (i64,) = sqlx::query_as(
        "SELECT count(*) FROM workspace.members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(&ws)
    .bind(&owner)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(still_there.0, 1);
    // A global admin needs no membership to remove a member.
    assert_eq!(
        delete(&app, &admin, &path(&outsider)).await,
        StatusCode::NO_CONTENT
    );
}

#[tokio::test]
async fn terminating_an_execution_session_keeps_its_history() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let session = format!("sess-{}", uuid::Uuid::now_v7());
    sqlx::query("INSERT INTO execution.sessions (id, runtime) VALUES ($1, 'shell')")
        .bind(&session)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO execution.history (id, session_id, code) VALUES ($1, $2, 'ls')")
        .bind(format!("hist-{session}"))
        .bind(&session)
        .execute(&pool)
        .await
        .unwrap();

    let path = format!("/api/v1/execution/sessions/{session}");
    assert_eq!(delete(&app, &admin, &path).await, StatusCode::NO_CONTENT);
    let (status,): (String,) =
        sqlx::query_as("SELECT status FROM execution.sessions WHERE id = $1")
            .bind(&session)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(status, "terminated");
    let (history,): (i64,) =
        sqlx::query_as("SELECT count(*) FROM execution.history WHERE session_id = $1")
            .bind(&session)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(history, 1, "the history survives");
    // Only an active session can be terminated.
    assert_eq!(delete(&app, &admin, &path).await, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn active_and_manually_guarded_personalities_are_not_deleted() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let tag = uuid::Uuid::now_v7();
    let insert = |id: String, active: bool, body: serde_json::Value| {
        let pool = pool.clone();
        async move {
            sqlx::query(
                "INSERT INTO soul.personalities (id, name, is_active, body, created_at, updated_at)
                 VALUES ($1, $1, $2, $3, 0, 0)",
            )
            .bind(&id)
            .bind(active)
            .bind(body)
            .execute(&pool)
            .await
            .unwrap();
            format!("/api/v1/soul/personalities/{id}")
        }
    };
    // Only one personality is active at a time; this test's active row is
    // switched off again before it ends.
    let active = insert(format!("active-{tag}"), true, serde_json::json!({})).await;
    let manual = insert(
        format!("manual-{tag}"),
        false,
        serde_json::json!({ "resourcePolicy": { "deletionMode": "manual" } }),
    )
    .await;
    let plain = insert(
        format!("plain-{tag}"),
        false,
        serde_json::json!({ "resourcePolicy": { "deletionMode": "request" } }),
    )
    .await;

    assert_eq!(delete(&app, &admin, &active).await, StatusCode::BAD_REQUEST);
    assert_eq!(delete(&app, &admin, &manual).await, StatusCode::BAD_REQUEST);
    assert_eq!(delete(&app, &admin, &plain).await, StatusCode::NO_CONTENT);
    assert_eq!(delete(&app, &admin, &plain).await, StatusCode::NOT_FOUND);

    sqlx::query("DELETE FROM soul.personalities WHERE id = ANY($1)")
        .bind(vec![format!("active-{tag}"), format!("manual-{tag}")])
        .execute(&pool)
        .await
        .unwrap();
}
