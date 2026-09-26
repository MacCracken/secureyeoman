//! The RBAC matrix: how routes resolve to `resource:action`, what each
//! default role holds — the TS gateway's `DEFAULT_ROLES` and every deliberate
//! difference from them — and that the WebSocket channels and role grants
//! name resources the REST RBAC actually uses.

#[allow(dead_code)]
mod common;

use std::collections::HashSet;

use axum::http::{Method, StatusCode};
use common::{authed_request as req, send, test_app};
use sy_core::auth::middleware::SELF_SERVICE_ROUTES;
use sy_core::auth::permissions::{
    OVERRIDES, PREFIX_MAP, ResolvedPermission, check_permission, resolve_permission,
    role_permissions,
};
use sy_core::routes::ws_metrics::CHANNEL_PERMISSIONS;

const ROLES: &[&str] = &["admin", "operator", "auditor", "viewer", "service"];

fn resolved(method: &str, route: &str) -> Option<(&'static str, &'static str)> {
    let method = Method::from_bytes(method.as_bytes()).unwrap();
    resolve_permission(&method, route)
        .map(|ResolvedPermission { resource, action }| (resource, action))
}

#[test]
fn routes_resolve_like_the_ts_gateway() {
    for (method, route, want) in [
        // Convention: prefix → resource, method → action
        ("GET", "/api/v1/brain/memories", Some(("brain", "read"))),
        ("POST", "/api/v1/brain/memories", Some(("brain", "write"))),
        (
            "DELETE",
            "/api/v1/workflows/{id}",
            Some(("workflows", "write")),
        ),
        // Cross-domain prefixes use the TS resource names
        ("GET", "/api/v1/conversations", Some(("chat", "read"))),
        ("GET", "/api/v1/users", Some(("auth", "read"))),
        ("GET", "/api/v1/a2a/discover", Some(("agents", "read"))),
        ("GET", "/api/v1/provider-accounts", Some(("ai", "read"))),
        (
            "GET",
            "/api/v1/alerts/rules",
            Some(("notifications", "read")),
        ),
        (
            "PUT",
            "/api/v1/voice/profiles/{id}",
            Some(("multimodal", "write")),
        ),
        ("GET", "/api/v1/soul/personalities", Some(("soul", "read"))),
        ("GET", "/api/v1/brain/documents", Some(("brain", "read"))),
        (
            "GET",
            "/api/v1/security/events",
            Some(("security_events", "read")),
        ),
        ("GET", "/api/v1/security/policy", Some(("security", "read"))),
        ("GET", "/api/v1/browser/sessions", Some(("browser", "read"))),
        // Overrides, matched on the route template
        ("POST", "/api/v1/chat", Some(("chat", "execute"))),
        ("POST", "/api/v1/mcp/tools/call", Some(("mcp", "execute"))),
        ("POST", "/api/v1/auth/verify", Some(("auth", "verify"))),
        (
            "POST",
            "/api/v1/auth/oauth/reload",
            Some(("secrets", "write")),
        ),
        (
            "GET",
            "/api/v1/personalities/{id}/mood",
            Some(("simulation", "read")),
        ),
        (
            "POST",
            "/api/v1/personalities/{id}/mood/reset",
            Some(("simulation", "write")),
        ),
        (
            "POST",
            "/api/v1/voice/profiles/{id}/preview",
            Some(("multimodal", "execute")),
        ),
        (
            "POST",
            "/api/v1/desktop/capture",
            Some(("capture.screen", "capture")),
        ),
        (
            "POST",
            "/api/v1/video/stream/start",
            Some(("capture.screen", "stream")),
        ),
        (
            "POST",
            "/api/v1/capture/consent/{id}/grant",
            Some(("capture.screen", "configure")),
        ),
        (
            "DELETE",
            "/api/v1/terminal/worktrees/{id}",
            Some(("execution", "execute")),
        ),
        (
            "POST",
            "/api/v1/training/preferences/export",
            Some(("training", "read")),
        ),
        // Prefixes match whole segments only
        ("GET", "/api/v1/ai", Some(("ai", "read"))),
        ("GET", "/api/v1/aim", None),
        ("GET", "/api/v1/risk-assessment/assessments", None),
        ("GET", "/api/v1/authz", None),
        // Unmapped: admin-only
        ("GET", "/api/v1/trading/history", None),
        ("GET", "/api/v1/personalities/{id}", None),
    ] {
        assert_eq!(resolved(method, route), want, "{method} {route}");
    }
}

#[test]
fn every_override_is_distinct_and_template_shaped() {
    let mut seen = HashSet::new();
    for &(method, route, _, _) in OVERRIDES {
        assert!(
            seen.insert((method, route)),
            "duplicate override {method} {route}"
        );
        assert!(route.starts_with("/api/v1/"), "{route}");
        assert!(
            !route.contains(':'),
            "TS-style parameter in {route}: use {{name}}"
        );
    }
}

/// The TS `DEFAULT_ROLES` grants and the deliberate differences, as
/// (role, resource, action, allowed).
#[test]
fn roles_hold_the_ts_grants_and_the_documented_differences() {
    for (role, resource, action, allowed) in [
        // admin holds everything
        ("admin", "anything", "whatever", true),
        // operator: as TS …
        ("operator", "tasks", "cancel", true),
        ("operator", "chat", "execute", true),
        ("operator", "mcp", "execute", true),
        ("operator", "execution", "execute", true),
        ("operator", "multimodal", "write", true),
        ("operator", "responsible_ai", "write", true),
        ("operator", "integrations", "write", true),
        ("operator", "ai", "read", false),
        ("operator", "secrets", "read", false),
        ("operator", "simulation", "read", false),
        // … without identity administration (TS: auth:read) …
        ("operator", "auth", "read", false),
        ("operator", "auth", "write", false),
        // … with workflows (TS: admin-only) …
        ("operator", "workflows", "write", true),
        // … and without capture until durations are enforced.
        ("operator", "capture.screen", "capture", false),
        ("operator", "capture.screen", "stream", false),
        ("operator", "capture.camera", "capture", false),
        // auditor: as TS, plus risk:read, without the old security:read
        ("auditor", "audit", "verify", true),
        ("auditor", "security_events", "read", true),
        ("auditor", "reports", "write", true),
        ("auditor", "risk", "read", true),
        ("auditor", "risk", "write", false),
        ("auditor", "security", "read", false),
        ("auditor", "analytics", "read", false),
        ("auditor", "brain", "read", false),
        ("auditor", "capture.screen", "capture", false),
        // viewer: as TS, without mcp:read (server env holds credentials)
        ("viewer", "chat", "read", true),
        ("viewer", "reports", "read", true),
        ("viewer", "marketplace", "read", true),
        ("viewer", "mcp", "read", false),
        ("viewer", "chat", "execute", false),
        ("viewer", "brain", "write", false),
        ("viewer", "auth", "read", false),
        // service: token verification only under auth (TS: auth:read)
        ("service", "auth", "verify", true),
        ("service", "auth", "read", false),
        ("service", "mcp", "execute", true),
        ("service", "integrations", "write", true),
        ("service", "chat", "write", false),
        // unknown roles hold nothing
        ("intruder", "brain", "read", false),
    ] {
        assert_eq!(
            check_permission(role, resource, action),
            allowed,
            "{role} {resource}:{action}"
        );
    }
}

/// Resources some route, override or WebSocket channel resolves to.
fn used_resources() -> HashSet<&'static str> {
    PREFIX_MAP
        .iter()
        .map(|&(_, resource)| resource)
        .chain(OVERRIDES.iter().map(|&(_, _, resource, _)| resource))
        .chain(CHANNEL_PERMISSIONS.iter().map(|&(_, resource, _)| resource))
        .collect()
}

#[test]
fn websocket_channels_use_rest_resource_names() {
    let rest: HashSet<&str> = PREFIX_MAP
        .iter()
        .map(|&(_, resource)| resource)
        .chain(OVERRIDES.iter().map(|&(_, _, resource, _)| resource))
        .collect();
    for &(channel, resource, _) in CHANNEL_PERMISSIONS {
        assert!(
            rest.contains(resource),
            "channel {channel} needs {resource}, which no route uses"
        );
    }
}

#[test]
fn role_grants_name_resources_in_use() {
    // TS grants kept for parity that no route in this build resolves to yet.
    let reserved = ["logs", "voice", "internal", "capture.camera"];
    let used = used_resources();
    for role in ROLES {
        for &(resource, _) in role_permissions(role) {
            assert!(
                resource == "*" || used.contains(resource) || reserved.contains(&resource),
                "{role} grants {resource}, which nothing checks — a typo?"
            );
        }
    }
}

/// Whether the RBAC middleware (not a handler) refused the request.
async fn rbac_denied(method: &str, path: &str, token: &str, body: Option<&str>) -> bool {
    let (status, bytes) = send(test_app(), req(method, path, token, body)).await;
    let text = String::from_utf8_lossy(&bytes);
    status == StatusCode::FORBIDDEN
        && (text.contains("Insufficient permissions")
            || text.contains("unmapped route requires admin")
            || text.contains("Outside token permission scope"))
}

#[tokio::test]
async fn the_middleware_enforces_the_matrix_on_real_routes() {
    let id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    let mood = format!("/api/v1/personalities/{id}/mood");
    let token = common::test_token;
    for (role, method, path, denied) in [
        // Template overrides apply to concrete paths: by its path alone a
        // preview is multimodal:write, which operators hold; its override
        // makes it multimodal:execute, which they do not.
        (
            "operator",
            "POST",
            "/api/v1/voice/profiles/p1/preview",
            true,
        ),
        ("operator", "POST", "/api/v1/voice/profiles", false),
        ("viewer", "GET", mood.as_str(), true),
        ("operator", "GET", mood.as_str(), true),
        ("admin", "GET", mood.as_str(), false),
        // Identity administration stays with admins …
        ("operator", "GET", "/api/v1/auth/api-keys", true),
        ("operator", "GET", "/api/v1/users", true),
        // … while notification preferences are self-service for everyone.
        (
            "viewer",
            "GET",
            "/api/v1/users/me/notification-prefs",
            false,
        ),
        (
            "auditor",
            "PUT",
            "/api/v1/users/me/notification-prefs/x",
            false,
        ),
        (
            "operator",
            "DELETE",
            "/api/v1/users/me/notification-prefs/x",
            false,
        ),
        // The service role verifies tokens but reads no identities.
        ("service", "POST", "/api/v1/auth/verify", false),
        ("service", "GET", "/api/v1/auth/users", true),
        // Capture is not an operator's.
        ("operator", "POST", "/api/v1/desktop/capture", true),
        ("operator", "GET", "/api/v1/video/stream/sessions", true),
        // TS-named resources reach the roles that hold them.
        ("viewer", "GET", "/api/v1/conversations", false),
        ("viewer", "GET", "/api/v1/mcp/servers", true),
        ("operator", "GET", "/api/v1/mcp/servers", false),
        ("operator", "POST", "/api/v1/workflows", false),
        ("auditor", "GET", "/api/v1/risk/assessments", false),
        ("auditor", "GET", "/api/v1/security/policy", true),
        ("auditor", "GET", "/api/v1/security/events", false),
        // Unmapped routes are admin-only.
        ("operator", "GET", "/api/v1/trading/history", true),
    ] {
        let body = matches!(method, "POST" | "PUT").then_some("{}");
        assert_eq!(
            rbac_denied(method, path, &token(role), body).await,
            denied,
            "{role} {method} {path}"
        );
    }
}

#[tokio::test]
async fn scoped_keys_reach_unmapped_routes_only_with_full_scope() {
    let narrow = common::test_token_scoped("admin", &["brain:read"]);
    assert!(rbac_denied("GET", "/api/v1/trading/history", &narrow, None).await);
    let full = common::test_token_scoped("admin", &["*:*"]);
    assert!(!rbac_denied("GET", "/api/v1/trading/history", &full, None).await);
    let unscoped = common::test_token("admin");
    assert!(!rbac_denied("GET", "/api/v1/trading/history", &unscoped, None).await);
}

#[test]
fn self_service_routes_are_the_callers_own() {
    for route in SELF_SERVICE_ROUTES {
        assert!(
            route.starts_with("/api/v1/auth/") || route.starts_with("/api/v1/users/me/"),
            "{route} is not about the caller's own account"
        );
    }
}
