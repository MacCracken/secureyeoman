//! Auth middleware — extracts identity from JWT Bearer token or X-API-Key.
//!
//! Mirrors the TS `auth-middleware.ts` hook chain:
//! 1. Check PUBLIC_ROUTES → skip auth
//! 2. Try Bearer token → validate JWT
//! 3. Try X-API-Key → validate API key hash
//! 4. Fail → 401

use axum::body::Body;
use axum::extract::{MatchedPath, State};
use axum::http::{Request, Response, StatusCode};
use axum::middleware::Next;
use axum::response::IntoResponse;
use serde_json::json;

use crate::auth::jwt::validate_token;
use crate::auth::permissions::{check_permission, check_permission_strings, resolve_permission};
use crate::state::AppState;

/// Routes that bypass authentication entirely.
const PUBLIC_ROUTES: &[&str] = &[
    "/health",
    "/health/live",
    "/health/ready",
    "/health/deep",
    "/metrics",
    "/prom/metrics",
    "/api/v1/auth/login",
    // Authenticated by the refresh token in the body: the caller's access token
    // has typically already expired, which is why it is refreshing.
    "/api/v1/auth/refresh",
    "/api/v1/auth/oauth/config",
    "/api/v1/auth/oauth/claim",
    "/api/v1/auth/sso/exchange", // OIDC login completion (pre-auth)
    "/api/v1/federation/knowledge/search",
    "/api/v1/federation/marketplace",
    "/api/v1/internal/mcp-bootstrap",
];

/// Parameterised routes that bypass auth, matched on the route *template*
/// (axum's `MatchedPath`) as the TS gateway did. A path prefix would also make
/// static siblings such as `/api/v1/auth/oauth/tokens` public.
const PUBLIC_TEMPLATES: &[&str] = &[
    "/api/v1/auth/oauth/{provider}",
    "/api/v1/auth/oauth/{provider}/callback",
];

/// Prefixes that bypass auth (dynamic pre-auth paths).
const PUBLIC_PREFIXES: &[&str] = &[
    "/api/v1/auth/sso/authorize/", // OIDC login initiation (pre-auth)
    "/api/v1/auth/sso/callback/",
    "/api/v1/auth/sso/saml/",
    "/api/v1/federation/marketplace/",
    "/ws/", // WebSocket auth is handled by the WS handler (token in Sec-WebSocket-Protocol)
];

/// Authenticated routes (by route template) that only touch the caller's own
/// account, so any valid principal may use them regardless of role (TS
/// `TOKEN_ONLY_ROUTES`). The notification preferences are scoped to the
/// caller in their handlers; TS put them under `auth`, which left every role
/// but admin unable to manage its own delivery channels.
pub const SELF_SERVICE_ROUTES: &[&str] = &[
    "/api/v1/auth/me",
    "/api/v1/auth/logout",
    "/api/v1/users/me/notification-prefs",
    "/api/v1/users/me/notification-prefs/{id}",
];

/// Authenticated user context — injected into request extensions.
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user_id: String,
    pub role: String,
    pub permissions: Vec<String>,
    pub auth_method: AuthMethod,
    pub jti: Option<String>,
    /// Token expiry (Unix seconds) for JWT principals; `None` for API keys.
    pub exp: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthMethod {
    Jwt,
    ApiKey,
    Certificate,
}

/// Auth middleware — runs as axum middleware via `axum::middleware::from_fn_with_state`.
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response<Body> {
    let path = req.uri().path();
    let template = req
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str);

    // 1. Public routes bypass
    if is_public(path) || template.is_some_and(|t| PUBLIC_TEMPLATES.contains(&t)) {
        return next.run(req).await;
    }

    // 2. Avatar GET bypass: browsers load personality avatars as <img src>,
    //    which cannot carry a bearer token.
    if req.method() == "GET" && template.is_some_and(is_avatar_template) {
        return next.run(req).await;
    }

    // 3. Try Bearer token
    if let Some(token) = extract_bearer(req.headers()) {
        let jwt_config = state.jwt_config();
        match validate_token(jwt_config, token) {
            Ok(claims) if claims.token_type == "access" => {
                // Check if token has been revoked
                if state.is_token_revoked(&claims.jti).await {
                    return (
                        StatusCode::UNAUTHORIZED,
                        axum::Json(json!({"error": "Token has been revoked", "statusCode": 401})),
                    )
                        .into_response();
                }
                req.extensions_mut().insert(AuthContext {
                    user_id: claims.sub,
                    role: claims.role,
                    permissions: claims.permissions,
                    auth_method: AuthMethod::Jwt,
                    jti: Some(claims.jti),
                    exp: Some(claims.exp),
                });
                return next.run(req).await;
            }
            _ => {}
        }
    }

    // 4. Try API key
    if let Some(api_key) = req.headers().get("x-api-key").and_then(|v| v.to_str().ok())
        && let Some(ctx) = state.validate_api_key(api_key).await
    {
        req.extensions_mut().insert(ctx);
        return next.run(req).await;
    }

    // 5. No valid auth
    (
        StatusCode::UNAUTHORIZED,
        axum::Json(json!({"error": "Missing authentication credentials", "statusCode": 401})),
    )
        .into_response()
}

fn is_public(path: &str) -> bool {
    if PUBLIC_ROUTES.contains(&path) {
        return true;
    }
    PUBLIC_PREFIXES
        .iter()
        .any(|prefix| path.starts_with(prefix))
}

/// `GET /api/v1/soul/personalities/{id}/avatar` — matched on the route template
/// so no other path that merely ends in `/avatar` slips through.
fn is_avatar_template(template: &str) -> bool {
    template.starts_with("/api/v1/soul/personalities/") && template.ends_with("/avatar")
}

fn extract_bearer(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
}

/// RBAC enforcement middleware — checks permissions after auth.
///
/// Runs after `require_auth`. If no `AuthContext` is present (public route),
/// the request passes through. For authenticated requests, resolves the
/// required permission from the method and route template (the path when no
/// route matched) and checks it against the role and the principal's scope.
/// Unmapped routes are admin-only, and closed to scoped keys narrower than
/// `*:*`.
pub async fn enforce_rbac(req: Request<Body>, next: Next) -> Response<Body> {
    // Public routes have no AuthContext — skip RBAC
    let auth = match req.extensions().get::<AuthContext>() {
        Some(ctx) => ctx.clone(),
        None => return next.run(req).await,
    };

    let method = req.method().clone();
    let route = req
        .extensions()
        .get::<MatchedPath>()
        .map_or_else(|| req.uri().path(), MatchedPath::as_str)
        .to_string();

    if SELF_SERVICE_ROUTES.contains(&route.as_str()) {
        return next.run(req).await;
    }

    match resolve_permission(&method, &route) {
        Some(perm) => {
            // 1. The role must grant this resource:action.
            if !check_permission(&auth.role, perm.resource, perm.action) {
                return (
                    StatusCode::FORBIDDEN,
                    axum::Json(json!({
                        "error": "Insufficient permissions",
                        "statusCode": 403,
                        "resource": perm.resource,
                        "action": perm.action,
                        "role": auth.role,
                    })),
                )
                    .into_response();
            }
            // 2. Per-principal least privilege: when the token / API key carries an
            //    explicit permission scope, it must ALSO grant this action (a scope
            //    can restrict below the role, never expand it). An empty scope means
            //    "inherit the role" (backward compatible with unscoped tokens).
            if !auth.permissions.is_empty()
                && !check_permission_strings(&auth.permissions, perm.resource, perm.action)
            {
                return (
                    StatusCode::FORBIDDEN,
                    axum::Json(json!({
                        "error": "Outside token permission scope",
                        "statusCode": 403,
                        "resource": perm.resource,
                        "action": perm.action,
                    })),
                )
                    .into_response();
            }
        }
        None => {
            // Unmapped route: admin only. A scope cannot name an unmapped
            // route, so a scoped key needs the full `*:*` to reach one.
            if auth.role != "admin"
                || (!auth.permissions.is_empty()
                    && !check_permission_strings(&auth.permissions, "*", "*"))
            {
                return (
                    StatusCode::FORBIDDEN,
                    axum::Json(json!({
                        "error": "Access denied — unmapped route requires admin",
                        "statusCode": 403,
                    })),
                )
                    .into_response();
            }
        }
    }

    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_routes_detected() {
        assert!(is_public("/health"));
        assert!(is_public("/health/live"));
        assert!(is_public("/api/v1/auth/login"));
        assert!(is_public("/api/v1/auth/refresh"));
        assert!(!is_public("/api/v1/brain/memories"));
        assert!(!is_public("/api/v1/chat"));
        // OAuth provider routes are public by route template only (see
        // PUBLIC_TEMPLATES); no /oauth/ path is public by prefix.
        assert!(!is_public("/api/v1/auth/oauth/google"));
        assert!(!is_public("/api/v1/auth/oauth/tokens"));
        assert!(!is_public("/api/v1/auth/oauth/tokens/some-id"));
    }

    #[test]
    fn avatar_bypass_matches_only_the_soul_avatar_template() {
        assert!(is_avatar_template("/api/v1/soul/personalities/{id}/avatar"));
        assert!(!is_avatar_template(
            "/api/v1/marketplace/community/personalities/avatar/{path}"
        ));
        assert!(!is_avatar_template("/api/v1/soul/personalities/{id}"));
    }

    #[test]
    fn bearer_extraction() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("authorization", "Bearer my-token".parse().unwrap());
        assert_eq!(extract_bearer(&headers), Some("my-token"));

        headers.insert("authorization", "Bearer ".parse().unwrap());
        assert_eq!(extract_bearer(&headers), None);

        headers.insert("authorization", "Basic abc".parse().unwrap());
        assert_eq!(extract_bearer(&headers), None);
    }
}
