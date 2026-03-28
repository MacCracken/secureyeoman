//! Application state shared across all handlers via axum State extractor.

use std::sync::Arc;
use std::time::Instant;
use sy_types::CoreConfig;

/// Shared application state — cloned into every request via `Arc`.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pub config: CoreConfig,
    pub started_at: Instant,
    pub version: String,
}

impl AppState {
    pub fn new(config: CoreConfig) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                config,
                started_at: Instant::now(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            }),
        }
    }

    pub fn config(&self) -> &CoreConfig {
        &self.inner.config
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
}
