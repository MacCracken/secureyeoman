//! WebSocket authentication shared by the `/ws/*` routes.
//!
//! Browsers cannot attach an `Authorization` header to a WebSocket, so clients
//! offer the access token as a `token.<jwt>` subprotocol. The auth middleware
//! lets `/ws/` through untouched; every upgrade handler authenticates here, to
//! the same standard as the REST middleware (a valid, unrevoked *access* token).

use axum::extract::ws::{CloseFrame, Message, WebSocketUpgrade};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};

use crate::auth::jwt;
use crate::auth::permissions::{check_permission, check_permission_strings};
use crate::state::AppState;

/// Close code for a refused WebSocket: missing, invalid or revoked token
/// (the application range mirrors HTTP 401, as the TS gateway did).
pub const CLOSE_UNAUTHENTICATED: u16 = 4401;
/// Close code for a refused WebSocket: authenticated but not permitted.
pub const CLOSE_FORBIDDEN: u16 = 4403;

const TOKEN_PROTOCOL_PREFIX: &str = "token.";

/// An authenticated WebSocket principal.
#[derive(Debug, Clone)]
pub struct WsPrincipal {
    pub user_id: String,
    pub role: String,
    /// Token scope; empty means "inherit the role".
    pub permissions: Vec<String>,
    /// The `token.<jwt>` subprotocol the client offered. It must be echoed in
    /// the handshake response: browsers fail an upgrade whose requested
    /// subprotocols were all ignored.
    pub protocol: String,
}

impl WsPrincipal {
    /// Whether the role — and the token scope, when it carries one — grants
    /// `resource:action` (the same two checks as the REST RBAC middleware).
    pub fn can(&self, resource: &str, action: &str) -> bool {
        check_permission(&self.role, resource, action)
            && (self.permissions.is_empty()
                || check_permission_strings(&self.permissions, resource, action))
    }
}

/// The `token.<jwt>` subprotocol offered in the handshake, if any.
pub fn offered_token_protocol(headers: &HeaderMap) -> Option<&str> {
    headers
        .get_all("sec-websocket-protocol")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .map(str::trim)
        .find(|p| p.len() > TOKEN_PROTOCOL_PREFIX.len() && p.starts_with(TOKEN_PROTOCOL_PREFIX))
}

/// Authenticate a WebSocket upgrade. On failure, returns the close reason.
pub async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<WsPrincipal, &'static str> {
    let protocol = offered_token_protocol(headers).ok_or("Missing authentication token")?;
    let token = &protocol[TOKEN_PROTOCOL_PREFIX.len()..];
    let claims = jwt::validate_token(state.jwt_config(), token)
        .map_err(|_| "Invalid authentication token")?;
    if claims.token_type != "access" {
        return Err("Invalid authentication token");
    }
    if state.is_token_revoked(&claims.jti).await {
        return Err("Token has been revoked");
    }
    Ok(WsPrincipal {
        user_id: claims.sub,
        role: claims.role,
        permissions: claims.permissions,
        protocol: protocol.to_string(),
    })
}

/// Accept the upgrade only to close it straight away with `code`, so the
/// client sees an application close code instead of an opaque handshake failure.
pub fn refuse(
    ws: WebSocketUpgrade,
    headers: &HeaderMap,
    code: u16,
    reason: &'static str,
) -> Response {
    let ws = match offered_token_protocol(headers) {
        Some(p) => ws.protocols([p.to_string()]),
        None => ws,
    };
    ws.on_upgrade(move |mut socket| async move {
        let frame = CloseFrame {
            code,
            reason: reason.into(),
        };
        let _ = socket.send(Message::Close(Some(frame))).await;
    })
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(protocols: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("sec-websocket-protocol", protocols.parse().unwrap());
        h
    }

    #[test]
    fn finds_the_token_protocol_among_others() {
        assert_eq!(
            offered_token_protocol(&headers("chat, token.abc.def")),
            Some("token.abc.def")
        );
        assert_eq!(offered_token_protocol(&headers("token.")), None);
        assert_eq!(offered_token_protocol(&headers("chat")), None);
        assert_eq!(offered_token_protocol(&HeaderMap::new()), None);
    }

    #[test]
    fn scope_narrows_the_role() {
        let p = WsPrincipal {
            user_id: "u".into(),
            role: "admin".into(),
            permissions: vec!["brain:read".into()],
            protocol: String::new(),
        };
        assert!(p.can("brain", "read"));
        assert!(!p.can("capture.video", "read"));
        let viewer = WsPrincipal {
            role: "viewer".into(),
            permissions: vec![],
            ..p
        };
        assert!(!viewer.can("capture.video", "read"));
        assert!(!viewer.can("personality", "write"));
    }
}
