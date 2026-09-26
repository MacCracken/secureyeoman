//! Database-backed event subscription tests: subscriptions and webhook
//! deliveries read from the shipped `events` schema in the TS shapes, with
//! the signing secret never echoed. Skipped unless `SY_TEST_DATABASE_URL` is
//! set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sy_core::server::build_router;
use uuid::Uuid;

async fn call(app: &Router, token: &str, method: &str, path: &str) -> (StatusCode, Value) {
    let (status, bytes) = send(app.clone(), req(method, path, token, None)).await;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        json(&bytes)
    };
    (status, value)
}

#[tokio::test]
async fn subscriptions_and_deliveries_follow_the_ts_contract() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let pool = state.db().unwrap().clone();
    let app = build_router(state);
    let admin = common::test_token("admin");

    let id = Uuid::now_v7();
    let tenant = format!("tenant-{id}");
    sqlx::query(
        "INSERT INTO events.subscriptions (id, name, event_types, webhook_url, secret, headers, tenant_id)
         VALUES ($1, 'ops hook', ARRAY['tool.failed','dlp.blocked'], 'https://example.com/hook',
                 'whsec-do-not-echo', '{\"X-Team\":\"ops\"}', $2)",
    )
    .bind(id)
    .bind(&tenant)
    .execute(&pool)
    .await
    .unwrap();
    for (n, status) in [(1_i64, "failed"), (2, "delivered")] {
        sqlx::query(
            "INSERT INTO events.deliveries (subscription_id, event_type, payload, status, attempts, response_status, created_at, tenant_id)
             VALUES ($1, 'tool.failed', '{\"n\":1}', $2, $3, 200, $4, $5)",
        )
        .bind(id)
        .bind(status)
        .bind(n as i32)
        .bind(n * 1000)
        .bind(&tenant)
        .execute(&pool)
        .await
        .unwrap();
    }

    // List, filtered by tenant: `{ subscriptions, total }`.
    let (status, list) = call(
        &app,
        &admin,
        "GET",
        &format!("/api/v1/events/subscriptions?tenantId={tenant}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list["total"], 1);
    let listed = &list["subscriptions"][0];
    assert_eq!(listed["id"], id.to_string());
    assert_eq!(
        listed["eventTypes"],
        serde_json::json!(["tool.failed", "dlp.blocked"])
    );
    assert_eq!(listed["enabled"], true);
    assert_eq!(listed["headers"]["X-Team"], "ops");
    assert_eq!(listed["retryPolicy"]["backoffMs"], 1000);

    // Get: the secret is reported, never returned.
    let base = format!("/api/v1/events/subscriptions/{id}");
    let (status, got) = call(&app, &admin, "GET", &base).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["subscription"]["hasSecret"], true);
    assert!(!got.to_string().contains("whsec-do-not-echo"), "{got}");
    assert!(!list.to_string().contains("whsec-do-not-echo"));

    // Deliveries: newest first, `{ deliveries, total }`.
    let (status, deliveries) = call(&app, &admin, "GET", &format!("{base}/deliveries")).await;
    assert_eq!(status, StatusCode::OK, "{deliveries}");
    assert_eq!(deliveries["total"], 2);
    assert_eq!(deliveries["deliveries"][0]["status"], "delivered");
    assert_eq!(deliveries["deliveries"][0]["attempts"], 2);
    assert_eq!(deliveries["deliveries"][0]["maxAttempts"], 4);
    assert_eq!(deliveries["deliveries"][0]["responseStatus"], 200);
    assert_eq!(deliveries["deliveries"][1]["payload"]["n"], 1);
    let (_, page) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/deliveries?limit=1&offset=1"),
    )
    .await;
    assert_eq!(page["deliveries"].as_array().unwrap().len(), 1);
    assert_eq!(page["deliveries"][0]["status"], "failed");

    // Sending a test event is not ported: 501 for a real subscription.
    let (status, _) = call(&app, &admin, "POST", &format!("{base}/test")).await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);

    // Unknown and malformed ids are 404s everywhere.
    for missing in [Uuid::now_v7().to_string(), "not-a-uuid".to_string()] {
        let base = format!("/api/v1/events/subscriptions/{missing}");
        for (method, path) in [
            ("GET", base.clone()),
            ("GET", format!("{base}/deliveries")),
            ("POST", format!("{base}/test")),
        ] {
            let (status, _) = call(&app, &admin, method, &path).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{method} {path}");
        }
    }

    sqlx::query("DELETE FROM events.subscriptions WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
}
