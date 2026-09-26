//! Database-backed personality mood tests: the simulation mood model on
//! `simulation.mood_states` / `simulation.mood_events`, in the TS wire shapes.
//! Skipped unless `SY_TEST_DATABASE_URL` is set (see `common::db_state`).

#[allow(dead_code)]
mod common;

use axum::Router;
use axum::http::StatusCode;
use common::{authed_request as req, json, send};
use serde_json::Value;
use sy_core::server::build_router;

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

fn close(actual: &Value, expected: f64) -> bool {
    (actual.as_f64().unwrap() - expected).abs() < 1e-9
}

#[tokio::test]
async fn events_move_label_log_and_reset_the_mood() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let base = format!("/api/v1/personalities/{}/mood", uuid::Uuid::now_v7());

    // No mood until the first event.
    let (status, _) = call(&app, &admin, "GET", &base, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, &admin, "POST", &format!("{base}/reset"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // The first event initialises at the neutral baseline, then applies.
    let (status, mood) = call(
        &app,
        &admin,
        "POST",
        &format!("{base}/event"),
        Some(
            r#"{"eventType":"praise","valenceDelta":0.5,"arousalDelta":0.7,"source":"dashboard"}"#,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{mood}");
    assert!(
        close(&mood["valence"], 0.5) && close(&mood["arousal"], 0.7),
        "{mood}"
    );
    assert_eq!(mood["label"], "excited");
    assert!(close(&mood["dominance"], 0.5) && close(&mood["decayRate"], 0.05));
    assert!(close(&mood["baselineValence"], 0.0) && close(&mood["baselineArousal"], 0.0));

    // Deltas clamp to the circumplex.
    let (_, mood) = call(
        &app,
        &admin,
        "POST",
        &format!("{base}/event"),
        Some(r#"{"eventType":"triumph","valenceDelta":2,"metadata":{"why":"shipped"}}"#),
    )
    .await;
    assert!(close(&mood["valence"], 1.0), "{mood}");
    assert_eq!(mood["label"], "ecstatic");
    let (status, current) = call(&app, &admin, "GET", &base, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(current, mood);

    // History is newest first, limited, and filtered by `since`.
    let (status, history) = call(&app, &admin, "GET", &format!("{base}/history"), None).await;
    assert_eq!(status, StatusCode::OK);
    let items = history["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["eventType"], "triumph");
    assert_eq!(items[0]["source"], "system");
    assert_eq!(items[0]["metadata"]["why"], "shipped");
    assert_eq!(items[1]["source"], "dashboard");
    let (_, one) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/history?limit=1"),
        None,
    )
    .await;
    assert_eq!(one["items"].as_array().unwrap().len(), 1);
    let future = chrono::Utc::now().timestamp_millis() + 60_000;
    let (_, none) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/history?since={future}"),
        None,
    )
    .await;
    assert_eq!(none["items"], serde_json::json!([]));

    // Reset returns to the baseline and logs the deltas that did it.
    let (status, reset) = call(&app, &admin, "POST", &format!("{base}/reset"), None).await;
    assert_eq!(status, StatusCode::OK, "{reset}");
    assert!(
        close(&reset["valence"], 0.0) && close(&reset["arousal"], 0.0),
        "{reset}"
    );
    assert_eq!(reset["label"], "calm");
    let (_, history) = call(
        &app,
        &admin,
        "GET",
        &format!("{base}/history?limit=1"),
        None,
    )
    .await;
    let last = &history["items"][0];
    assert_eq!(last["eventType"], "reset");
    assert_eq!(last["metadata"]["reason"], "manual reset");
    assert!(
        close(&last["valenceDelta"], -1.0) && close(&last["arousalDelta"], -0.7),
        "{last}"
    );

    for bad in [
        r#"{"valenceDelta":0.1}"#,
        r#"{"eventType":"x","valenceDelta":3}"#,
    ] {
        let (status, _) = call(&app, &admin, "POST", &format!("{base}/event"), Some(bad)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }
}

#[tokio::test]
async fn concurrent_events_are_not_lost() {
    let Some(state) = common::db_state().await else {
        return;
    };
    let app = build_router(state);
    let admin = common::test_token("admin");
    let base = format!("/api/v1/personalities/{}/mood", uuid::Uuid::now_v7());

    let event_path = format!("{base}/event");
    let events = (0..8).map(|_| {
        call(
            &app,
            &admin,
            "POST",
            &event_path,
            Some(r#"{"eventType":"nudge","valenceDelta":0.05}"#),
        )
    });
    for (status, _) in futures::future::join_all(events).await {
        assert_eq!(status, StatusCode::OK);
    }
    let (_, mood) = call(&app, &admin, "GET", &base, None).await;
    assert!(
        close(&mood["valence"], 0.4),
        "every event applied once: {mood}"
    );
    let (_, history) = call(&app, &admin, "GET", &format!("{base}/history"), None).await;
    assert_eq!(history["items"].as_array().unwrap().len(), 8);
}
