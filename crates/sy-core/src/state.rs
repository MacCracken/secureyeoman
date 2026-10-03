//! Application state shared across all handlers via axum State extractor.

use crate::types::CoreConfig;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::broadcast;

use crate::auth::jwt::JwtConfig;
use crate::auth::middleware::{AuthContext, AuthMethod};
use crate::auth::oidc::OidcRuntime;
use crate::brain::embedding::{
    EmbeddingProvider, NoopEmbeddingProvider, OllamaEmbeddingProvider, OpenAiEmbeddingProvider,
};
use crate::brain::manager::{BrainConfig, BrainManager};
use crate::brain::pg_vector::{DynVectorStore, PgVectorStore};
use crate::integrations::github::GitHubClient;
use crate::integrations::gmail::GmailClient;
use crate::integrations::google_calendar::GoogleCalendarClient;
use crate::integrations::jira::JiraClient;
use crate::integrations::linear::LinearClient;
use crate::integrations::notion::NotionClient;
use crate::integrations::todoist::TodoistClient;
use crate::integrations::twitter::TwitterClient;
use crate::middleware::backpressure::BackpressureState;
use crate::middleware::fingerprinting::FingerprintState;
use crate::middleware::ip_reputation::IpReputationState;
use crate::privacy::ClassificationEngine;
use webauthn_rs::Webauthn;
use webauthn_rs::prelude::{PasskeyAuthentication, PasskeyRegistration};

/// Type-erased brain manager for use in AppState.
/// Uses dynamic dispatch so AppState doesn't need generics.
/// Uses DynVectorStore which dispatches to InMemory or Postgres at runtime.
pub type DynBrainManager = BrainManager<DynEmbeddingProvider, DynVectorStore>;

/// Dynamic dispatch wrapper for embedding providers.
pub struct DynEmbeddingProvider(Box<dyn EmbeddingProviderDyn>);

trait EmbeddingProviderDyn: Send + Sync {
    fn embed_dyn<'a>(
        &'a self,
        texts: &'a [String],
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = crate::brain::embedding::EmbedResult> + Send + 'a>,
    >;
    fn dimensions_dyn(&self) -> usize;
    fn name_dyn(&self) -> &str;
}

impl<T: EmbeddingProvider + 'static> EmbeddingProviderDyn for T {
    fn embed_dyn<'a>(
        &'a self,
        texts: &'a [String],
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = crate::brain::embedding::EmbedResult> + Send + 'a>,
    > {
        Box::pin(self.embed(texts))
    }
    fn dimensions_dyn(&self) -> usize {
        self.dimensions()
    }
    fn name_dyn(&self) -> &str {
        self.name()
    }
}

impl EmbeddingProvider for DynEmbeddingProvider {
    async fn embed(&self, texts: &[String]) -> crate::brain::embedding::EmbedResult {
        self.0.embed_dyn(texts).await
    }
    fn dimensions(&self) -> usize {
        self.0.dimensions_dyn()
    }
    fn name(&self) -> &str {
        self.0.name_dyn()
    }
}

impl DynEmbeddingProvider {
    pub fn new<T: EmbeddingProvider + 'static>(provider: T) -> Self {
        Self(Box::new(provider))
    }
}

/// Shared application state — cloned into every request via `Arc`.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

/// Payload for the event bridge broadcast channel.
#[derive(Clone, Debug)]
pub struct BridgeEvent {
    pub event: String,
    pub data: String,
    pub source: String,
}

struct AppStateInner {
    pub config: CoreConfig,
    pub jwt_config: JwtConfig,
    pub db_pool: Option<PgPool>,
    pub started_at: Instant,
    pub version: String,
    pub allow_remote_access: bool,
    /// The proxies whose `X-Forwarded-For` names the client
    /// (`SECUREYEOMAN_TRUSTED_PROXIES`); empty by default, when the header is
    /// attacker-controlled and ignored.
    pub trusted_proxies: crate::middleware::client_ip::TrustedProxies,
    pub backpressure: BackpressureState,
    /// In-memory cache of revoked JTIs (avoids a DB hit per request), each mapped
    /// to the token's own expiry in Unix ms — past that the token is dead anyway,
    /// so the entry can be pruned.
    pub revoked_tokens: Arc<dashmap::DashMap<String, i64>>,
    pub fingerprint: FingerprintState,
    /// Heuristic bot scoring (feeds IP reputation). Opt-in: it scores every
    /// non-browser client — API-key scripts, MCP, sy-edge — as a bot.
    pub fingerprint_enabled: bool,
    pub ip_reputation: Option<IpReputationState>,
    /// DLP/PII classification engine — compiled once (regexes are not cheap).
    pub pii_engine: Arc<ClassificationEngine>,
    /// WebAuthn relying-party instance + in-flight ceremony state.
    pub webauthn: Arc<Webauthn>,
    pub webauthn_reg: Arc<WebauthnRegStore>,
    pub webauthn_auth: Arc<WebauthnAuthStore>,
    /// OIDC SSO runtime — `Some` only when `OIDC_*` env vars are configured.
    pub oidc: Option<Arc<OidcRuntime>>,
    pub bridge_tx: broadcast::Sender<BridgeEvent>,
    /// The persistent audit chain (set with the database).
    pub audit: Option<Arc<crate::audit::AuditTrail>>,
    /// The background audit writer's queue, started by the first event.
    audit_tx: std::sync::OnceLock<tokio::sync::mpsc::Sender<crate::db::audit::NewAuditEntry>>,
    /// Events dropped because the writer's queue was full.
    audit_dropped: std::sync::atomic::AtomicU64,
    pub brain: Option<Arc<DynBrainManager>>,
    pub github_client: Option<Arc<GitHubClient>>,
    pub gmail_client: Option<Arc<GmailClient>>,
    pub google_calendar_client: Option<Arc<GoogleCalendarClient>>,
    pub jira_client: Option<Arc<JiraClient>>,
    pub linear_client: Option<Arc<LinearClient>>,
    pub notion_client: Option<Arc<NotionClient>>,
    pub todoist_client: Option<Arc<TodoistClient>>,
    pub twitter_client: Option<Arc<TwitterClient>>,
}

/// The well-known development JWT secret that must never sign tokens in an
/// exposed deployment — anyone with it could forge admin tokens.
pub const DEV_JWT_PLACEHOLDER: &str = "dev-jwt-secret-change-in-production!!";

/// Whether a JWT signing secret is strong enough: at least 32 bytes and not the
/// well-known development placeholder.
pub fn is_strong_jwt_secret(secret: &str) -> bool {
    secret.len() >= 32 && secret != DEV_JWT_PLACEHOLDER
}

/// The rotation grace secret from `SECUREYEOMAN_JWT_SECRET_PREVIOUS`, if it
/// may be trusted. Tokens it signed keep validating, so a weak one (left blank
/// after a rotation, short, or the dev placeholder) would let anyone mint an
/// admin token; it is ignored with a warning instead.
fn previous_jwt_secret(current: &str) -> Option<String> {
    let previous = std::env::var("SECUREYEOMAN_JWT_SECRET_PREVIOUS").ok()?;
    if previous.is_empty() || previous == current {
        return None;
    }
    if !is_strong_jwt_secret(&previous) {
        tracing::warn!(
            "SECUREYEOMAN_JWT_SECRET_PREVIOUS is too weak (need >= 32 bytes and not the dev \
             placeholder); ignoring it, so tokens it signed are no longer accepted"
        );
        return None;
    }
    Some(previous)
}

/// Generate a cryptographically-random ephemeral JWT secret (48 bytes, base64).
fn generate_ephemeral_secret() -> String {
    use base64::Engine;
    use rand::RngCore;
    let mut bytes = [0u8; 48];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    base64::engine::general_purpose::STANDARD_NO_PAD.encode(bytes)
}

/// In-flight WebAuthn ceremony state, keyed by user id, with a creation instant
/// for TTL eviction (ceremonies are short-lived; ~60s challenge timeout).
pub type WebauthnRegStore = dashmap::DashMap<String, (PasskeyRegistration, Instant)>;
pub type WebauthnAuthStore = dashmap::DashMap<String, (PasskeyAuthentication, Instant)>;

/// Build the OIDC runtime from `OIDC_*` env vars, or `None` if unconfigured.
fn build_oidc() -> Option<Arc<OidcRuntime>> {
    let config = crate::auth::oidc::OidcConfig::from_env()?;
    match OidcRuntime::new(config) {
        Ok(rt) => {
            tracing::info!("OIDC SSO configured");
            Some(Arc::new(rt))
        }
        Err(e) => {
            tracing::warn!(error = %e, "OIDC configured but runtime init failed; SSO disabled");
            None
        }
    }
}

/// Build the WebAuthn relying-party instance from `SECUREYEOMAN_RP_ID` /
/// `SECUREYEOMAN_RP_ORIGIN` (defaults: localhost). `rp_id` is the registrable
/// domain (no scheme/port); `rp_origin` must match the browser's `window.origin`.
/// Falls back to a valid localhost config (with a warning) if the env values are
/// invalid, so the server always has a usable instance.
fn build_webauthn() -> Webauthn {
    use webauthn_rs::WebauthnBuilder;
    use webauthn_rs::prelude::Url;

    let rp_id = std::env::var("SECUREYEOMAN_RP_ID").unwrap_or_else(|_| "localhost".to_string());
    let rp_origin_str = std::env::var("SECUREYEOMAN_RP_ORIGIN")
        .unwrap_or_else(|_| "http://localhost:18789".to_string());

    let built = Url::parse(&rp_origin_str).ok().and_then(|origin| {
        WebauthnBuilder::new(&rp_id, &origin)
            .and_then(|b| b.rp_name("SecureYeoman").build())
            .ok()
    });

    match built {
        Some(w) => w,
        None => {
            tracing::warn!(
                rp_id = %rp_id,
                rp_origin = %rp_origin_str,
                "invalid WebAuthn RP config; falling back to http://localhost"
            );
            let origin = Url::parse("http://localhost").expect("static localhost url");
            WebauthnBuilder::new("localhost", &origin)
                .and_then(|b| b.build())
                .expect("localhost WebAuthn config is always valid")
        }
    }
}

/// How many audit events may wait for the writer.
pub const AUDIT_QUEUE: usize = 4096;
/// The most events the writer appends in one transaction.
const AUDIT_BATCH: usize = 256;

/// Append queued audit events until every sender is gone.
async fn audit_writer(
    mut rx: tokio::sync::mpsc::Receiver<crate::db::audit::NewAuditEntry>,
    pool: PgPool,
    trail: Arc<crate::audit::AuditTrail>,
) {
    let mut batch = Vec::with_capacity(AUDIT_BATCH);
    while rx.recv_many(&mut batch, AUDIT_BATCH).await > 0 {
        if let Err(e) = crate::db::audit::append_batch(&pool, trail.signing_key(), &batch).await {
            tracing::error!(error = %e, events = batch.len(), "could not record audit events");
        }
        batch.clear();
    }
}

impl AppState {
    pub fn new(config: CoreConfig) -> Self {
        // Resolve the JWT signing secret. We NEVER fall back to a known/guessable
        // value — a hardcoded secret would let anyone forge admin tokens. When the
        // env secret is absent or weak we synthesize a random ephemeral secret
        // (tokens then don't survive a restart). main() additionally REFUSES to
        // boot exposed (non-loopback / remote-access) without a strong secret.
        let jwt_secret = match std::env::var("SECUREYEOMAN_JWT_SECRET") {
            Ok(s) if is_strong_jwt_secret(&s) => s,
            Ok(_) => {
                tracing::warn!(
                    "SECUREYEOMAN_JWT_SECRET is too weak (need >= 32 bytes and not the dev \
                     placeholder); using a random ephemeral secret for this run"
                );
                generate_ephemeral_secret()
            }
            Err(_) => {
                tracing::warn!(
                    "SECUREYEOMAN_JWT_SECRET not set; using a random ephemeral secret for this \
                     run — issued tokens will not survive a restart. Set SECUREYEOMAN_JWT_SECRET \
                     in any persistent or exposed deployment."
                );
                generate_ephemeral_secret()
            }
        };

        let previous_secret = previous_jwt_secret(&jwt_secret);
        let jwt_config = JwtConfig {
            secret: jwt_secret,
            previous_secret,
            ..Default::default()
        };

        let (bridge_tx, _) = broadcast::channel(1024);

        // Initialize integration clients from environment variables.
        // These don't require a database connection.
        let github_client = std::env::var("GITHUB_TOKEN").ok().map(|token| {
            tracing::info!("GitHub integration client initialized from GITHUB_TOKEN");
            Arc::new(GitHubClient::new(token))
        });

        let jira_client = match (
            std::env::var("JIRA_BASE_URL"),
            std::env::var("JIRA_EMAIL"),
            std::env::var("JIRA_API_TOKEN"),
        ) {
            (Ok(base_url), Ok(email), Ok(api_token)) => {
                tracing::info!("Jira integration client initialized from env vars");
                Some(Arc::new(JiraClient::new(base_url, email, api_token)))
            }
            _ => None,
        };

        let notion_client = std::env::var("NOTION_API_KEY").ok().map(|token| {
            tracing::info!("Notion integration client initialized from NOTION_API_KEY");
            Arc::new(NotionClient::new(token))
        });

        let todoist_client = std::env::var("TODOIST_API_KEY").ok().map(|token| {
            tracing::info!("Todoist integration client initialized from TODOIST_API_KEY");
            Arc::new(TodoistClient::new(token))
        });

        let gmail_client = std::env::var("GMAIL_OAUTH_TOKEN").ok().map(|token| {
            tracing::info!("Gmail integration client initialized from GMAIL_OAUTH_TOKEN");
            Arc::new(GmailClient::new(token))
        });

        let google_calendar_client =
            std::env::var("GOOGLE_CALENDAR_OAUTH_TOKEN").ok().map(|token| {
                tracing::info!(
                    "Google Calendar integration client initialized from GOOGLE_CALENDAR_OAUTH_TOKEN"
                );
                Arc::new(GoogleCalendarClient::new(token))
            });

        let twitter_client = std::env::var("TWITTER_BEARER_TOKEN").ok().map(|token| {
            tracing::info!("Twitter integration client initialized from TWITTER_BEARER_TOKEN");
            Arc::new(TwitterClient::new(token))
        });

        let linear_client = std::env::var("LINEAR_API_KEY").ok().map(|key| {
            tracing::info!("Linear integration client initialized from LINEAR_API_KEY");
            Arc::new(LinearClient::new(key))
        });

        Self {
            inner: Arc::new(AppStateInner {
                config,
                jwt_config,
                db_pool: None,
                started_at: Instant::now(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                allow_remote_access: std::env::var("SECUREYEOMAN_ALLOW_REMOTE_ACCESS")
                    .ok()
                    .is_some_and(|v| v == "true" || v == "1"),
                trusted_proxies: crate::middleware::client_ip::TrustedProxies::from_env(),
                backpressure: BackpressureState::new(),
                revoked_tokens: Arc::new(dashmap::DashMap::new()),
                fingerprint: FingerprintState::new(),
                fingerprint_enabled: std::env::var("SECUREYEOMAN_FINGERPRINT_ENABLED")
                    .ok()
                    .is_some_and(|v| v == "true" || v == "1"),
                ip_reputation: Some(IpReputationState::default()),
                pii_engine: Arc::new(ClassificationEngine::new()),
                webauthn: Arc::new(build_webauthn()),
                webauthn_reg: Arc::new(WebauthnRegStore::new()),
                webauthn_auth: Arc::new(WebauthnAuthStore::new()),
                oidc: build_oidc(),
                bridge_tx,
                audit: None,
                audit_tx: std::sync::OnceLock::new(),
                audit_dropped: std::sync::atomic::AtomicU64::new(0),
                brain: None,
                github_client,
                gmail_client,
                google_calendar_client,
                jira_client,
                linear_client,
                notion_client,
                todoist_client,
                twitter_client,
            }),
        }
    }

    /// Set the database pool and initialize managers.
    pub fn with_db(mut self, pool: PgPool) -> Self {
        // Initialize brain manager with appropriate embedding provider
        let embedding = Self::create_embedding_provider();

        // Use PgVectorStore when database is available, otherwise InMemory
        let vector_store =
            DynVectorStore::Postgres(PgVectorStore::new(pool.clone(), "default".to_string()));

        let brain = BrainManager::new(
            pool.clone(),
            "default".to_string(),
            BrainConfig::default(),
            embedding,
            vector_store,
        );

        let inner = Arc::get_mut(&mut self.inner).unwrap();
        // Read here, after main() has loaded persisted secrets from the DB.
        inner.audit = Some(Arc::new(crate::audit::AuditTrail::from_env(
            &inner.jwt_config.secret,
        )));
        inner.db_pool = Some(pool);
        inner.brain = Some(Arc::new(brain));
        self
    }

    /// The persistent audit chain, when a database is configured.
    pub fn audit(&self) -> Option<&Arc<crate::audit::AuditTrail>> {
        self.inner.audit.as_ref()
    }

    /// Record an audit event in the background. Request handling never
    /// waits on the chain: one writer task appends queued events in order, in
    /// batches, on one connection at a time, so a burst of events (failed
    /// logins, RBAC denials) cannot tie up the pool waiting on the chain lock.
    /// Past [`AUDIT_QUEUE`] queued events, new ones are dropped and counted.
    pub fn audit_event(&self, entry: crate::db::audit::NewAuditEntry) {
        let (Some(pool), Some(trail)) = (self.db(), self.audit()) else {
            return;
        };
        let tx = self.inner.audit_tx.get_or_init(|| {
            let (tx, rx) = tokio::sync::mpsc::channel(AUDIT_QUEUE);
            tokio::spawn(audit_writer(rx, pool.clone(), trail.clone()));
            tx
        });
        match tx.try_send(entry) {
            Ok(()) => {}
            Err(tokio::sync::mpsc::error::TrySendError::Full(entry)) => {
                let dropped = self
                    .inner
                    .audit_dropped
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if dropped.is_multiple_of(1000) {
                    tracing::warn!(
                        event = %entry.event,
                        dropped_total = dropped + 1,
                        "audit queue full; dropping audit events"
                    );
                }
            }
            Err(tokio::sync::mpsc::error::TrySendError::Closed(entry)) => {
                tracing::error!(event = %entry.event, "audit writer stopped; event not recorded");
            }
        }
    }

    /// Audit events dropped because the writer's queue was full.
    pub fn audit_events_dropped(&self) -> u64 {
        self.inner
            .audit_dropped
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn db(&self) -> Option<&PgPool> {
        self.inner.db_pool.as_ref()
    }

    pub fn allow_remote_access(&self) -> bool {
        self.inner.allow_remote_access
    }

    /// The proxies trusted to report the client address in `X-Forwarded-For`.
    pub fn trusted_proxies(&self) -> &crate::middleware::client_ip::TrustedProxies {
        &self.inner.trusted_proxies
    }

    pub fn backpressure(&self) -> &BackpressureState {
        &self.inner.backpressure
    }

    pub fn fingerprint(&self) -> &FingerprintState {
        &self.inner.fingerprint
    }

    /// Whether heuristic bot fingerprinting is on (`SECUREYEOMAN_FINGERPRINT_ENABLED`).
    pub fn fingerprint_enabled(&self) -> bool {
        self.inner.fingerprint_enabled
    }

    pub fn ip_reputation(&self) -> Option<&IpReputationState> {
        self.inner.ip_reputation.as_ref()
    }

    /// The shared DLP/PII classification engine.
    pub fn pii_engine(&self) -> &ClassificationEngine {
        &self.inner.pii_engine
    }

    /// The WebAuthn relying-party instance.
    pub fn webauthn(&self) -> &Webauthn {
        &self.inner.webauthn
    }

    /// In-flight WebAuthn registration ceremony state (keyed by user id).
    pub fn webauthn_reg(&self) -> &WebauthnRegStore {
        &self.inner.webauthn_reg
    }

    /// In-flight WebAuthn authentication ceremony state (keyed by user id).
    pub fn webauthn_auth(&self) -> &WebauthnAuthStore {
        &self.inner.webauthn_auth
    }

    /// The OIDC SSO runtime, if configured via `OIDC_*` env vars.
    pub fn oidc(&self) -> Option<&Arc<OidcRuntime>> {
        self.inner.oidc.as_ref()
    }

    /// Whether a token JTI has been revoked (cache → DB fallback).
    ///
    /// `Err` means the database could not answer. Callers must then refuse
    /// the token: the cache only holds this instance's revocations since it
    /// started, so a logged-out token would otherwise pass during a DB fault.
    pub async fn is_token_revoked(&self, jti: &str) -> Result<bool, sqlx::Error> {
        if self.inner.revoked_tokens.contains_key(jti) {
            return Ok(true);
        }
        let Some(pool) = self.db() else {
            return Ok(false);
        };
        match crate::db::auth::token_revocation_expiry(pool, jti).await {
            Ok(Some(expires_at)) => {
                self.cache_revocation(jti, expires_at);
                Ok(true)
            }
            Ok(None) => Ok(false),
            Err(e) => {
                tracing::error!(error = %e, "token revocation lookup failed; refusing the token");
                Err(e)
            }
        }
    }

    /// Revoke a token by JTI until `expires_at` (Unix ms — the token's own
    /// expiry), in the cache and the DB. `false` when the DB write failed: the
    /// token is then dead on this instance only, until it expires or restarts.
    pub async fn revoke_token(&self, jti: &str, user_id: &str, expires_at: i64) -> bool {
        self.cache_revocation(jti, expires_at);
        let Some(pool) = self.db() else {
            return true;
        };
        match crate::db::auth::revoke_token(pool, jti, user_id, expires_at).await {
            Ok(()) => true,
            Err(e) => {
                tracing::error!(error = %e, "could not persist a token revocation");
                false
            }
        }
    }

    /// Single-use redemption: atomically revoke `jti` and report whether *this*
    /// call did so. `false` means it was already revoked (a replay, or a token
    /// ended by logout) — or, fail-closed, that the DB could not record it.
    pub async fn consume_token(&self, jti: &str, user_id: &str, expires_at: i64) -> bool {
        use dashmap::mapref::entry::Entry;
        let first_use = match self.inner.revoked_tokens.entry(jti.to_string()) {
            Entry::Occupied(_) => false,
            Entry::Vacant(v) => {
                v.insert(expires_at);
                true
            }
        };
        if !first_use {
            return false;
        }
        match self.db() {
            // The DB is authoritative across instances and restarts.
            Some(pool) => {
                match crate::db::auth::revoke_token_once(pool, jti, user_id, expires_at).await {
                    Ok(first) => first,
                    Err(_) => {
                        // Could not record the redemption: refuse it, but don't
                        // burn the token so a retry can succeed once the DB is back.
                        self.inner.revoked_tokens.remove(jti);
                        false
                    }
                }
            }
            None => true,
        }
    }

    fn cache_revocation(&self, jti: &str, expires_at: i64) {
        let cache = &self.inner.revoked_tokens;
        cache.insert(jti.to_string(), expires_at);
        // Amortised pruning: tokens past their expiry fail validation anyway.
        if cache.len() > 1024 && cache.len().is_power_of_two() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
            cache.retain(|_, exp| *exp > now);
        }
    }

    /// Override the remote access setting (useful for testing).
    pub fn with_allow_remote_access(mut self, allow: bool) -> Self {
        let inner = Arc::get_mut(&mut self.inner).unwrap();
        inner.allow_remote_access = allow;
        self
    }

    /// Override the fingerprinting opt-in (useful for testing).
    pub fn with_fingerprint_enabled(mut self, enabled: bool) -> Self {
        let inner = Arc::get_mut(&mut self.inner).unwrap();
        inner.fingerprint_enabled = enabled;
        self
    }

    /// Override the trusted proxies (useful for testing).
    pub fn with_trusted_proxies(
        mut self,
        proxies: crate::middleware::client_ip::TrustedProxies,
    ) -> Self {
        let inner = Arc::get_mut(&mut self.inner).unwrap();
        inner.trusted_proxies = proxies;
        self
    }

    /// Override the JWT signing secret (useful for tests, which need a known,
    /// strong secret that matches the tokens they issue).
    pub fn with_jwt_secret(mut self, secret: impl Into<String>) -> Self {
        let inner = Arc::get_mut(&mut self.inner).unwrap();
        inner.jwt_config.secret = secret.into();
        self
    }

    /// Get the brain manager (memory, knowledge, RAG).
    pub fn brain(&self) -> Option<&Arc<DynBrainManager>> {
        self.inner.brain.as_ref()
    }

    /// Get the GitHub typed client (initialized from `GITHUB_TOKEN` env var).
    pub fn github(&self) -> Option<&Arc<GitHubClient>> {
        self.inner.github_client.as_ref()
    }

    /// Get the Jira typed client (initialized from `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN`).
    pub fn jira(&self) -> Option<&Arc<JiraClient>> {
        self.inner.jira_client.as_ref()
    }

    /// Get the Notion typed client (initialized from `NOTION_API_KEY` env var).
    pub fn notion(&self) -> Option<&Arc<NotionClient>> {
        self.inner.notion_client.as_ref()
    }

    /// Get the Todoist typed client (initialized from `TODOIST_API_KEY` env var).
    pub fn todoist(&self) -> Option<&Arc<TodoistClient>> {
        self.inner.todoist_client.as_ref()
    }

    /// Get the Gmail typed client (initialized from `GMAIL_OAUTH_TOKEN` env var).
    pub fn gmail(&self) -> Option<&Arc<GmailClient>> {
        self.inner.gmail_client.as_ref()
    }

    /// Get the Google Calendar typed client (initialized from `GOOGLE_CALENDAR_OAUTH_TOKEN` env var).
    pub fn google_calendar(&self) -> Option<&Arc<GoogleCalendarClient>> {
        self.inner.google_calendar_client.as_ref()
    }

    /// Get the Twitter typed client (initialized from `TWITTER_BEARER_TOKEN` env var).
    pub fn twitter(&self) -> Option<&Arc<TwitterClient>> {
        self.inner.twitter_client.as_ref()
    }

    /// Get the Linear typed client (initialized from `LINEAR_API_KEY` env var).
    pub fn linear(&self) -> Option<&Arc<LinearClient>> {
        self.inner.linear_client.as_ref()
    }

    /// Create the embedding provider based on environment configuration.
    fn create_embedding_provider() -> DynEmbeddingProvider {
        // Priority: OPENAI_API_KEY → OLLAMA_HOST → HOOSH_URL → noop
        if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
            let model = std::env::var("EMBEDDING_MODEL").ok();
            tracing::info!(provider = "openai", "embedding provider initialized");
            return DynEmbeddingProvider::new(OpenAiEmbeddingProvider::openai(
                &api_key,
                model.as_deref(),
            ));
        }

        if std::env::var("OLLAMA_HOST").is_ok() || std::env::var("OLLAMA_URL").is_ok() {
            let config = crate::brain::embedding::OllamaEmbeddingConfig {
                base_url: std::env::var("OLLAMA_HOST")
                    .or_else(|_| std::env::var("OLLAMA_URL"))
                    .unwrap_or_else(|_| "http://localhost:11434".to_string()),
                model: std::env::var("OLLAMA_EMBED_MODEL")
                    .unwrap_or_else(|_| "nomic-embed-text".to_string()),
            };
            tracing::info!(
                provider = "ollama",
                model = config.model,
                "embedding provider initialized"
            );
            return DynEmbeddingProvider::new(OllamaEmbeddingProvider::new(config));
        }

        let hoosh_url = std::env::var("HOOSH_URL")
            .or_else(|_| std::env::var("AGNOS_GATEWAY_URL"))
            .ok();
        if hoosh_url.is_some() {
            let api_key = std::env::var("AGNOS_GATEWAY_API_KEY").ok();
            tracing::info!(provider = "hoosh", "embedding provider initialized");
            return DynEmbeddingProvider::new(OpenAiEmbeddingProvider::hoosh(
                hoosh_url.as_deref(),
                api_key,
            ));
        }

        tracing::warn!("no embedding provider configured — using noop (no vector search)");
        DynEmbeddingProvider::new(NoopEmbeddingProvider)
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

    /// Get a new receiver for the event bridge broadcast channel.
    pub fn bridge_subscribe(&self) -> broadcast::Receiver<BridgeEvent> {
        self.inner.bridge_tx.subscribe()
    }

    /// How many event bridge SSE clients are connected.
    pub fn bridge_subscriber_count(&self) -> usize {
        self.inner.bridge_tx.receiver_count()
    }

    /// Broadcast an event to all connected event bridge SSE clients.
    pub fn bridge_broadcast(&self, event: BridgeEvent) -> usize {
        self.inner.bridge_tx.send(event).unwrap_or(0)
    }

    /// Validate an API key by SHA-256 hash lookup against the database.
    pub async fn validate_api_key(&self, api_key: &str) -> Option<AuthContext> {
        let pool = self.db()?;

        // SHA-256 hash the incoming key
        let hash = crate::crypto::sha256(api_key.as_bytes());

        // Look up the hash in the database
        let row = crate::db::auth::find_api_key_by_hash(pool, &hash)
            .await
            .ok()??;

        // The key acts as its owner, with the role it was minted for. Keys carry
        // no narrower permission scope of their own, so they inherit the role.
        let role = row.role.clone();
        let permissions = Vec::new();

        // Update last_used_at in background (don't block auth)
        let pool_clone = pool.clone();
        let key_id = row.id.clone();
        tokio::spawn(async move {
            let _ = crate::db::auth::touch_api_key(&pool_clone, &key_id).await;
        });

        Some(AuthContext {
            user_id: row.user_id,
            role,
            permissions,
            auth_method: AuthMethod::ApiKey,
            jti: None,
            exp: None,
        })
    }
}
