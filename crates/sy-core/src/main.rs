//! SecureYeoman Core Server — axum-based REST/WS API.
//!
//! Phase 7 migration: replaces the Bun/Fastify TypeScript server with a Rust
//! binary. During migration, unimplemented routes are forwarded to the existing
//! Fastify server via a built-in reverse proxy.

mod middleware;
mod proxy;
mod routes;
mod server;
mod state;

use std::net::SocketAddr;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sy_core=info,tower_http=info".into()),
        )
        .with_target(false)
        .init();

    let config = sy_types::CoreConfig::default();
    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;

    let app_state = state::AppState::new(config);
    let app = server::build_router(app_state);

    info!("sy-core listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
