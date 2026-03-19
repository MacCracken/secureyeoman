//! A2A (Agent-to-Agent) manager — peer discovery, heartbeat, delegation.

use crate::capabilities::EdgeCapabilities;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
pub struct PeerInfo {
    pub id: String,
    pub url: String,
    pub last_seen: String,
    pub online: bool,
}

pub struct A2AManager {
    capabilities: EdgeCapabilities,
    peers: Mutex<HashMap<String, PeerState>>,
}

struct PeerState {
    id: String,
    url: String,
    last_seen: Instant,
}

impl A2AManager {
    pub fn new(capabilities: EdgeCapabilities) -> Self {
        Self {
            capabilities,
            peers: Mutex::new(HashMap::new()),
        }
    }

    pub async fn register_with_parent(
        &self,
        parent_url: &str,
        token: Option<&str>,
    ) -> Result<String, String> {
        let port = std::env::var("SECUREYEOMAN_EDGE_PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(18891);
        let host = std::env::var("SECUREYEOMAN_EDGE_HOST")
            .unwrap_or_else(|_| "0.0.0.0".to_string());

        let body = serde_json::json!({
            "url": format!("http://{host}:{port}"),
            "name": self.capabilities.hostname,
            "capabilities": self.capabilities,
            "mode": "edge",
        });

        let client = reqwest::Client::new();
        let mut req = client
            .post(format!("{parent_url}/api/v1/a2a/peers/local"))
            .json(&body)
            .timeout(std::time::Duration::from_secs(10));

        if let Some(tok) = token {
            req = req.bearer_auth(tok);
        }

        let resp = req.send().await.map_err(|e| format!("Request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Registration failed ({status}): {text}"));
        }

        #[derive(Deserialize)]
        struct RegResponse {
            peer: Option<PeerRef>,
        }
        #[derive(Deserialize)]
        struct PeerRef {
            id: String,
        }

        let data: RegResponse = resp.json().await.map_err(|e| format!("Parse failed: {e}"))?;
        Ok(data.peer.map(|p| p.id).unwrap_or_else(|| "unknown".into()))
    }

    pub fn handle_message(&self, msg: &serde_json::Value) {
        if let (Some(msg_type), Some(from)) = (
            msg.get("type").and_then(|v| v.as_str()),
            msg.get("fromPeerId").and_then(|v| v.as_str()),
        ) {
            if msg_type == "heartbeat" {
                let url = msg
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let mut peers = self.peers.lock().unwrap();
                peers.insert(
                    from.to_string(),
                    PeerState {
                        id: from.to_string(),
                        url,
                        last_seen: Instant::now(),
                    },
                );
            }
        }
    }

    pub fn list_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().unwrap();
        let offline_threshold = std::time::Duration::from_secs(180);

        peers
            .values()
            .map(|p| {
                let elapsed = p.last_seen.elapsed();
                PeerInfo {
                    id: p.id.clone(),
                    url: p.url.clone(),
                    last_seen: format!("{}s ago", elapsed.as_secs()),
                    online: elapsed < offline_threshold,
                }
            })
            .collect()
    }
}
