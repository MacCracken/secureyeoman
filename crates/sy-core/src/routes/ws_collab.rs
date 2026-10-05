//! Collaborative editing WebSocket — real-time CRDT document sync.
//!
//! GET /ws/collab/{docId} — WebSocket upgrade with JWT auth via Sec-WebSocket-Protocol
//! (see `ws_auth`); joining requires write access to the document.
//!
//! docId format: `personality:<uuid>` | `skill:<uuid>`
//!
//! Protocol: binary messages (Uint8Array CRDT operations).
//! Clients in the same room receive each other's binary messages (fan-out),
//! never their own. Messages are capped at 1 MiB, and a client that stops
//! reading is dropped once 4 MiB are queued for it.

use axum::Router;
use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::{RwLock, broadcast};
use tracing::{debug, warn};

use crate::routes::ws_auth;
use crate::state::AppState;

/// Largest CRDT message a client may send.
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
/// Bytes queued for a client that stops reading before it is dropped.
const MAX_QUEUED_BYTES: usize = 4 * 1024 * 1024;

/// An op on its way through a room: the sending client, and the op itself
/// (refcounted, so the fan-out does not copy it per receiver).
type RoomOp = (u64, Bytes);

/// Shared collab room state — maps docId → broadcast sender for binary CRDT ops.
type CollabRooms = Arc<RwLock<HashMap<String, broadcast::Sender<RoomOp>>>>;

/// Source of per-connection ids, so a client's own ops are not echoed back.
static NEXT_CLIENT: AtomicU64 = AtomicU64::new(1);

/// Lazy-init shared rooms via AppState extension or a module-level static.
/// Using a static here since AppState doesn't need to know about collab internals.
static ROOMS: std::sync::OnceLock<CollabRooms> = std::sync::OnceLock::new();

fn rooms() -> &'static CollabRooms {
    ROOMS.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/ws/collab/{docId}", get(ws_collab_upgrade))
}

/// The RBAC resource a collab document belongs to, if `doc_id` is well formed:
/// `personality:<uuid>` or `skill:<uuid>`. Both are managed under
/// `/api/v1/soul`, i.e. the `soul` resource.
fn doc_resource(doc_id: &str) -> Option<&'static str> {
    let (resource, id) = match doc_id.split_once(':')? {
        ("personality", id) => ("soul", id),
        ("skill", id) => ("soul", id),
        _ => return None,
    };
    // Simple UUID check: 36 chars, hex + dashes
    let is_uuid = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    is_uuid.then_some(resource)
}

async fn ws_collab_upgrade(
    State(state): State<AppState>,
    Path(doc_id): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let principal = match ws_auth::authenticate(&state, &headers).await {
        Ok(p) => p,
        Err(reason) => {
            return ws_auth::refuse(ws, &headers, ws_auth::CLOSE_UNAUTHENTICATED, reason);
        }
    };
    let Some(resource) = doc_resource(&doc_id) else {
        return ws_auth::refuse(ws, &headers, 1008, "Invalid document id");
    };
    // Joining a room means sending edits, so it takes write access to the
    // document — the same permission its REST update route requires.
    if !principal.can(resource, "write") {
        return ws_auth::refuse(
            ws,
            &headers,
            ws_auth::CLOSE_FORBIDDEN,
            "Insufficient permissions",
        );
    }

    ws.protocols([principal.protocol])
        .max_message_size(MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .max_write_buffer_size(MAX_QUEUED_BYTES)
        .on_upgrade(move |socket| handle_collab_client(socket, doc_id))
        .into_response()
}

async fn handle_collab_client(socket: WebSocket, doc_id: String) {
    let client_id = NEXT_CLIENT.fetch_add(1, Ordering::Relaxed);
    debug!(client_id = %client_id, doc_id = %doc_id, "Collab client connected");

    // Get or create the room's broadcast channel
    let (tx, mut rx) = {
        let mut rooms = rooms().write().await;
        let tx = rooms
            .entry(doc_id.clone())
            .or_insert_with(|| broadcast::channel(256).0)
            .clone();
        let rx = tx.subscribe();
        (tx, rx)
    };

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            // Incoming binary CRDT messages from this client → broadcast to room
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) => {
                        // Broadcast to all other clients in the room
                        let _ = tx.send((client_id, data));
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            // Messages from other clients in the room → forward to this client
            event = rx.recv() => {
                match event {
                    // The client already applied its own op.
                    Ok((from, _)) if from == client_id => {}
                    Ok((_, data)) => {
                        if sender.send(Message::Binary(data)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!(client_id = %client_id, lagged = n, "Collab client lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    debug!(client_id = %client_id, doc_id = %doc_id, "Collab client disconnected");

    // Clean up the room once its last client has left. Drop our own receiver
    // first (or the count never reaches zero and every room — with its buffered
    // ops — lives forever), and check-and-remove under one write lock so a
    // client joining in between keeps the room.
    drop(rx);
    let mut room_map = rooms().write().await;
    if room_map
        .get(&doc_id)
        .is_some_and(|tx| tx.receiver_count() == 0)
    {
        room_map.remove(&doc_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_ids_map_to_their_rbac_resource() {
        let id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
        assert_eq!(doc_resource(&format!("personality:{id}")), Some("soul"));
        assert_eq!(doc_resource(&format!("skill:{id}")), Some("soul"));
        assert_eq!(doc_resource(&format!("workflow:{id}")), None);
        assert_eq!(doc_resource("personality:not-a-uuid"), None);
        assert_eq!(doc_resource("personality:"), None);
    }
}
