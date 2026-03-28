//! Application state shared across all handlers via axum State extractor.

use std::sync::Arc;
use std::time::Instant;
use sy_types::CoreConfig;

use crate::auth::jwt::JwtConfig;
use crate::auth::middleware::AuthContext;

/// Shared application state — cloned into every request via `Arc`.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pub config: CoreConfig,
    pub jwt_config: JwtConfig,
    pub started_at: Instant,
    pub version: String,
}

impl AppState {
    pub fn new(config: CoreConfig) -> Self {
        let jwt_secret = std::env::var("SECUREYEOMAN_JWT_SECRET")
            .unwrap_or_else(|_| "dev-jwt-secret-change-in-production!!".to_string());

        let jwt_config = JwtConfig {
            secret: jwt_secret,
            previous_secret: std::env::var("SECUREYEOMAN_JWT_SECRET_PREVIOUS").ok(),
            ..Default::default()
        };

        Self {
            inner: Arc::new(AppStateInner {
                config,
                jwt_config,
                started_at: Instant::now(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            }),
        }
    }

    pub fn config(&self) -> &CoreConfig {
        &self.inner.config
    }

    pub fn jwt_config(&self) -> &JwtConfig {
        &self.inner.jwt_config
    }

    pub fn uptime_seconds(&self) -> f64 {
        self.inner.started_at.elapsed().as_secs_f64()
    }

    pub fn version(&self) -> &str {
        &self.inner.version
    }

    /// Fastify fallback URL for the reverse proxy (during migration).
    pub fn fastify_url(&self) -> Option<String> {
        self.inner
            .config
            .fastify_fallback_port
            .map(|port| format!("http://127.0.0.1:{port}"))
    }

    /// Validate an API key — stub for Phase 7.1.
    /// TODO: Implement SHA-256 hash lookup against database.
    pub fn validate_api_key(&self, _api_key: &str) -> Option<AuthContext> {
        // Will be implemented when database layer is added
        None
    }
}
