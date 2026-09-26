//! RBAC permission resolution and the default role table.
//!
//! Mirrors the TS gateway — `route-permissions.ts` for resolving a route to a
//! `resource:action`, `rbac.ts` `DEFAULT_ROLES` for what each role holds — so
//! roles and TS-era scoped API keys keep their meaning. Resolution:
//! 1. an explicit override for the method and route template, else
//! 2. the method's conventional action (GET/HEAD/OPTIONS → `read`, others →
//!    `write`) on the resource of the first prefix that matches whole path
//!    segments;
//! 3. anything else is unmapped, which the middleware treats as admin-only.
//!
//! Every place the role table differs from TS carries a comment saying why;
//! `tests/rbac_matrix.rs` pins the effective access per role and route.

use axum::http::Method;

/// A resolved permission: (resource, action).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPermission {
    pub resource: &'static str,
    pub action: &'static str,
}

/// URL prefix → resource, most specific first; a prefix matches the path
/// itself or anything below it (`/api/v1/ai` does not match `/api/v1/aim`).
/// The TS map's entries in its order, then prefixes only this build serves.
pub const PREFIX_MAP: &[(&str, &str)] = &[
    // Sub-domain resources (before their parent prefix)
    ("/api/v1/security/athi", "security_athi"),
    ("/api/v1/security/sra", "security_sra"),
    ("/api/v1/security/dlp", "security"),
    ("/api/v1/security/tee", "security"),
    ("/api/v1/security/events", "security_events"),
    ("/api/v1/brain/logs", "audit"),
    // Cross-domain mappings (prefix ≠ resource)
    ("/api/v1/conversations", "chat"),
    ("/api/v1/replay-jobs", "chat"),
    ("/api/v1/terminal", "execution"),
    ("/api/v1/users", "auth"),
    ("/api/v1/gmail", "integrations"),
    ("/api/v1/twitter", "integrations"),
    ("/api/v1/github", "integrations"),
    ("/api/v1/webhooks", "integrations"),
    ("/api/v1/webhook-transforms", "integrations"),
    ("/api/v1/outbound-webhooks", "integrations"),
    ("/api/v1/internal", "integrations"),
    ("/api/v1/a2a", "agents"),
    ("/api/v1/desktop", "capture.screen"),
    ("/api/v1/video/stream", "capture.screen"),
    ("/api/v1/capture", "capture.screen"),
    ("/api/v1/gateway", "chat"),
    ("/api/v1/alerts", "notifications"),
    ("/api/v1/provider-accounts", "ai"),
    // One-to-one domains
    ("/api/v1/metrics", "metrics"),
    ("/api/v1/tasks", "tasks"),
    ("/api/v1/audit", "audit"),
    ("/api/v1/auth", "auth"),
    ("/api/v1/soul", "soul"),
    ("/api/v1/integrations", "integrations"),
    ("/api/v1/brain", "brain"),
    ("/api/v1/comms", "comms"),
    ("/api/v1/model", "model"),
    ("/api/v1/mcp", "mcp"),
    ("/api/v1/reports", "reports"),
    ("/api/v1/dashboards", "dashboards"),
    ("/api/v1/workspaces", "workspaces"),
    ("/api/v1/secrets", "secrets"),
    ("/api/v1/experiments", "experiments"),
    ("/api/v1/marketplace", "marketplace"),
    ("/api/v1/voice", "multimodal"),
    ("/api/v1/multimodal", "multimodal"),
    ("/api/v1/spirit", "spirit"),
    ("/api/v1/chat", "chat"),
    ("/api/v1/execution", "execution"),
    ("/api/v1/agents", "agents"),
    ("/api/v1/proactive", "proactive"),
    ("/api/v1/browser", "browser"),
    ("/api/v1/extensions", "extensions"),
    ("/api/v1/federation", "federation"),
    ("/api/v1/training", "training"),
    ("/api/v1/eval", "eval"),
    ("/api/v1/analytics", "analytics"),
    ("/api/v1/license", "license"),
    ("/api/v1/risk", "risk"),
    ("/api/v1/workflows", "workflows"),
    ("/api/v1/sandbox", "sandbox"),
    ("/api/v1/responsible-ai", "responsible_ai"),
    ("/api/v1/ai", "ai"),
    ("/api/v1/events", "events"),
    ("/api/v1/ecosystem", "integrations"),
    ("/api/v1/simulation", "simulation"),
    ("/api/v1/compliance", "compliance"),
    ("/api/v1/scim", "auth"),
    ("/api/v1/tenants", "tenants"),
    ("/api/v1/admin", "admin"),
    // Only this build serves these. No default role holds their resources,
    // so they stay admin-only, but a scoped key can name them.
    ("/api/v1/security", "security"),
    ("/api/v1/notifications", "notifications"),
    ("/api/v1/edge", "edge"),
    ("/api/v1/ifran", "ifran"),
    ("/api/v1/diagnostics", "diagnostics"),
];

/// (method, route template) → (resource, action) for routes whose action is
/// not the method's convention or whose resource is not their prefix's. Keys
/// are axum route templates, so `{id}` stands for any segment.
pub const OVERRIDES: &[(&str, &str, &str, &str)] = &[
    // POST → execute: high-privilege operations
    ("POST", "/api/v1/chat", "chat", "execute"),
    // This build's streaming twin of POST /api/v1/chat.
    ("POST", "/api/v1/chat/stream", "chat", "execute"),
    ("POST", "/api/v1/gateway", "chat", "execute"),
    ("POST", "/api/v1/execution/run", "execution", "execute"),
    ("POST", "/api/v1/terminal/execute", "execution", "execute"),
    ("POST", "/api/v1/terminal/worktrees", "execution", "execute"),
    (
        "DELETE",
        "/api/v1/terminal/worktrees/{id}",
        "execution",
        "execute",
    ),
    ("POST", "/api/v1/mcp/tools/call", "mcp", "execute"),
    ("POST", "/api/v1/sandbox/scan", "sandbox", "execute"),
    (
        "POST",
        "/api/v1/voice/profiles/{id}/preview",
        "multimodal",
        "execute",
    ),
    (
        "POST",
        "/api/v1/voice/profiles/clone",
        "multimodal",
        "execute",
    ),
    // POST → read: read-only operations that take a body
    ("POST", "/api/v1/extensions/discover", "extensions", "read"),
    (
        "POST",
        "/api/v1/federation/peers/{id}/health",
        "federation",
        "read",
    ),
    (
        "POST",
        "/api/v1/training/preferences/export",
        "training",
        "read",
    ),
    (
        "POST",
        "/api/v1/training/curated-datasets/preview",
        "training",
        "read",
    ),
    // Custom actions and cross-resource routes
    ("POST", "/api/v1/audit/verify", "audit", "verify"),
    // TS resolved this to auth:read. Verifying a token is all the MCP service
    // calls under /auth, and its own action keeps the service role from
    // reading users, API keys and roles.
    ("POST", "/api/v1/auth/verify", "auth", "verify"),
    ("POST", "/api/v1/auth/oauth/reload", "secrets", "write"),
    // Simulation mood, nested under personalities
    (
        "GET",
        "/api/v1/personalities/{id}/mood",
        "simulation",
        "read",
    ),
    (
        "POST",
        "/api/v1/personalities/{id}/mood/event",
        "simulation",
        "write",
    ),
    (
        "GET",
        "/api/v1/personalities/{id}/mood/history",
        "simulation",
        "read",
    ),
    (
        "POST",
        "/api/v1/personalities/{id}/mood/reset",
        "simulation",
        "write",
    ),
    // Screen capture: capture (look) / configure (control) / stream (record)
    // instead of read / write. The desktop status and session routes exist
    // only in this build and follow the same split.
    ("GET", "/api/v1/desktop/status", "capture.screen", "capture"),
    (
        "GET",
        "/api/v1/desktop/windows",
        "capture.screen",
        "capture",
    ),
    (
        "POST",
        "/api/v1/desktop/capture",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/desktop/recording/active",
        "capture.screen",
        "capture",
    ),
    (
        "POST",
        "/api/v1/desktop/recording/stop",
        "capture.screen",
        "configure",
    ),
    (
        "GET",
        "/api/v1/desktop/sessions",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/desktop/sessions/{id}",
        "capture.screen",
        "capture",
    ),
    (
        "POST",
        "/api/v1/desktop/sessions",
        "capture.screen",
        "configure",
    ),
    (
        "DELETE",
        "/api/v1/desktop/sessions/{id}",
        "capture.screen",
        "configure",
    ),
    (
        "POST",
        "/api/v1/capture/consent/request",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/capture/consent/pending",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/capture/consent/{id}",
        "capture.screen",
        "capture",
    ),
    (
        "POST",
        "/api/v1/capture/consent/{id}/grant",
        "capture.screen",
        "configure",
    ),
    (
        "POST",
        "/api/v1/capture/consent/{id}/deny",
        "capture.screen",
        "configure",
    ),
    (
        "POST",
        "/api/v1/capture/consent/{id}/revoke",
        "capture.screen",
        "configure",
    ),
    (
        "POST",
        "/api/v1/video/stream/start",
        "capture.screen",
        "stream",
    ),
    (
        "GET",
        "/api/v1/video/stream/sessions",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/video/stream/sources",
        "capture.screen",
        "capture",
    ),
    (
        "GET",
        "/api/v1/video/stream/{id}",
        "capture.screen",
        "capture",
    ),
    (
        "POST",
        "/api/v1/video/stream/{id}/stop",
        "capture.screen",
        "configure",
    ),
];

/// Whether `prefix` covers `path`: the path itself or anything below it.
fn covers(prefix: &str, path: &str) -> bool {
    path.strip_prefix(prefix)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
}

/// Resolve the permission a request needs, from its method and its route
/// template (`MatchedPath`) or, for unrouted requests, its path. `None` for
/// unmapped routes, which are admin-only.
pub fn resolve_permission(method: &Method, route: &str) -> Option<ResolvedPermission> {
    let method_str = method.as_str();
    if let Some(&(_, _, resource, action)) = OVERRIDES
        .iter()
        .find(|(m, template, _, _)| *m == method_str && *template == route)
    {
        return Some(ResolvedPermission { resource, action });
    }
    let action = match *method {
        Method::GET | Method::HEAD | Method::OPTIONS => "read",
        _ => "write",
    };
    PREFIX_MAP
        .iter()
        .find(|(prefix, _)| covers(prefix, route))
        .map(|&(_, resource)| ResolvedPermission { resource, action })
}

/// The default roles' grants: `(resource pattern, actions)`. The TS
/// `DEFAULT_ROLES`, with each difference commented. Grants on resources no
/// route resolves to yet (such as `logs`) are kept as TS had them, for the
/// routes that will.
pub fn role_permissions(role: &str) -> &'static [(&'static str, &'static [&'static str])] {
    match role {
        "admin" => &[("*", &["*"])],
        "operator" => &[
            ("tasks", &["read", "write", "execute", "cancel"]),
            ("integrations", &["read", "write", "delete", "test"]),
            ("metrics", &["read"]),
            ("logs", &["read"]),
            ("reports", &["read", "write"]),
            ("soul", &["read", "write"]),
            ("spirit", &["read", "write"]),
            ("brain", &["read", "write"]),
            ("comms", &["read", "write"]),
            ("model", &["read", "write"]),
            ("mcp", &["read", "write", "execute"]),
            ("dashboards", &["read", "write"]),
            ("workspaces", &["read", "write"]),
            ("experiments", &["read", "write"]),
            ("marketplace", &["read", "write"]),
            ("multimodal", &["read", "write"]),
            ("chat", &["read", "write", "execute"]),
            ("execution", &["read", "write", "execute"]),
            ("agents", &["read", "write"]),
            ("proactive", &["read", "write"]),
            ("browser", &["read", "write"]),
            ("extensions", &["read", "write"]),
            ("responsible_ai", &["read", "write"]),
            ("voice", &["listen", "tts"]),
            // Not in TS, which left workflows admin-only although operators
            // run tasks, agents and code: workflows add no reach beyond
            // `execution:execute`, which operators hold.
            ("workflows", &["read", "write"]),
            // TS also granted:
            // - `auth:read` — withheld: `auth` is identity administration
            //   (users, API keys and their usage, roles and assignments, SSO,
            //   OAuth tokens, SCIM). An operator's own session and
            //   notification preferences are self-service routes instead.
            // - `capture.screen` capture/configure/review and
            //   `capture.camera` capture — withheld: TS granted them only
            //   under duration limits (5 min screen, 1 min camera) that this
            //   RBAC cannot express and the capture routes do not enforce.
        ],
        "auditor" => &[
            ("logs", &["read", "export"]),
            ("audit", &["read", "export", "verify"]),
            ("metrics", &["read"]),
            ("security_events", &["read"]),
            ("reports", &["read", "write"]),
            ("tasks", &["read"]),
            ("execution", &["read"]),
            ("agents", &["read"]),
            ("proactive", &["read"]),
            ("browser", &["read"]),
            ("capture.screen", &["review"]),
            ("capture.camera", &["review"]),
            ("responsible_ai", &["read"]),
            // Not in TS: reviewing risk assessments and the risk register is
            // audit work, and reading them changes nothing.
            ("risk", &["read"]),
        ],
        "viewer" => &[
            ("metrics", &["read"]),
            ("tasks", &["read"]),
            ("integrations", &["read"]),
            ("soul", &["read"]),
            ("spirit", &["read"]),
            ("brain", &["read"]),
            ("model", &["read"]),
            ("marketplace", &["read"]),
            ("dashboards", &["read"]),
            ("workspaces", &["read"]),
            ("reports", &["read"]),
            ("chat", &["read"]),
            // TS also granted `mcp:read` — withheld: MCP server listings
            // carry each server's `env`, which holds its credentials.
        ],
        "service" => &[
            // TS granted `auth:read` for token verification; see the
            // POST /api/v1/auth/verify override.
            ("auth", &["verify"]),
            ("mcp", &["execute", "read", "write"]),
            ("brain", &["read", "write"]),
            ("soul", &["read"]),
            ("internal", &["read"]),
            ("integrations", &["read", "write"]),
        ],
        _ => &[],
    }
}

/// Whether a `resource` pattern (`*`, exact, or `prefix.*`) matches `resource`.
fn resource_matches(res_pattern: &str, resource: &str) -> bool {
    res_pattern == "*"
        || res_pattern == resource
        || (res_pattern.ends_with(".*")
            && resource.starts_with(&res_pattern[..res_pattern.len() - 2]))
}

/// Check if a role has a specific permission.
pub fn check_permission(role: &str, resource: &str, action: &str) -> bool {
    for &(res_pattern, actions) in role_permissions(role) {
        if resource_matches(res_pattern, resource)
            && (actions.contains(&"*") || actions.contains(&action))
        {
            return true;
        }
    }
    false
}

/// Check whether a set of principal permission strings grants `action` on
/// `resource`. Each string is `"resource:action1,action2"` (e.g. `"*:*"`,
/// `"*:read"`, `"brain:read,write"`, `"capture.*:read"`) — the same wildcard
/// semantics as role permissions. Used to let a token/API-key carry its own
/// least-privilege scope that further restricts (never expands) its role.
pub fn check_permission_strings(perms: &[String], resource: &str, action: &str) -> bool {
    for p in perms {
        let Some((res_pattern, actions_csv)) = p.split_once(':') else {
            continue;
        };
        if resource_matches(res_pattern.trim(), resource)
            && actions_csv
                .split(',')
                .map(str::trim)
                .any(|a| a == "*" || a == action)
        {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_has_everything() {
        assert!(check_permission("admin", "brain", "write"));
        assert!(check_permission("admin", "anything", "whatever"));
    }

    #[test]
    fn viewer_read_only() {
        assert!(check_permission("viewer", "brain", "read"));
        assert!(!check_permission("viewer", "brain", "write"));
        assert!(!check_permission("viewer", "chat", "execute"));
    }

    #[test]
    fn operator_can_execute_chat() {
        assert!(check_permission("operator", "chat", "execute"));
        assert!(check_permission("operator", "execution", "execute"));
    }

    #[test]
    fn auditor_read_only_security() {
        assert!(check_permission("auditor", "audit", "read"));
        assert!(!check_permission("auditor", "audit", "write"));
        assert!(!check_permission("auditor", "brain", "read"));
    }

    #[test]
    fn unknown_role_denied() {
        assert!(!check_permission("hacker", "brain", "read"));
    }

    #[test]
    fn resolve_convention_get() {
        let perm = resolve_permission(&Method::GET, "/api/v1/brain/memories").unwrap();
        assert_eq!(perm.resource, "brain");
        assert_eq!(perm.action, "read");
    }

    #[test]
    fn resolve_convention_post() {
        let perm = resolve_permission(&Method::POST, "/api/v1/integrations/slack").unwrap();
        assert_eq!(perm.resource, "integrations");
        assert_eq!(perm.action, "write");
    }

    #[test]
    fn resolve_override() {
        let perm = resolve_permission(&Method::POST, "/api/v1/chat").unwrap();
        assert_eq!(perm.resource, "chat");
        assert_eq!(perm.action, "execute");
    }

    #[test]
    fn resolve_unmapped() {
        let perm = resolve_permission(&Method::GET, "/api/v1/unknown/route");
        assert!(perm.is_none());
    }

    #[test]
    fn permission_strings_wildcards() {
        let all = vec!["*:*".to_string()];
        assert!(check_permission_strings(&all, "brain", "write"));
        assert!(check_permission_strings(&all, "anything", "whatever"));
    }

    #[test]
    fn permission_strings_scoped() {
        let scope = vec!["brain:read,write".to_string(), "chat:execute".to_string()];
        assert!(check_permission_strings(&scope, "brain", "read"));
        assert!(check_permission_strings(&scope, "brain", "write"));
        assert!(check_permission_strings(&scope, "chat", "execute"));
        // Outside the scope:
        assert!(!check_permission_strings(&scope, "brain", "execute"));
        assert!(!check_permission_strings(&scope, "audit", "read"));
    }

    #[test]
    fn permission_strings_action_and_resource_wildcards() {
        assert!(check_permission_strings(
            &["*:read".to_string()],
            "brain",
            "read"
        ));
        assert!(!check_permission_strings(
            &["*:read".to_string()],
            "brain",
            "write"
        ));
        assert!(check_permission_strings(
            &["capture.*:read".to_string()],
            "capture.screen",
            "read"
        ));
    }

    #[test]
    fn permission_strings_empty_denies() {
        assert!(!check_permission_strings(&[], "brain", "read"));
    }
}
