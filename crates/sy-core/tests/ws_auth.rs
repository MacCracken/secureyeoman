//! End-to-end WebSocket auth tests over a real socket (the upgrade needs a
//! live connection, so `oneshot` cannot exercise it). The handshake is written
//! by hand so the tests see exactly what a browser would.

#[allow(dead_code)]
mod common;

use std::net::SocketAddr;
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use sy_core::server::build_router;
use sy_core::state::AppState;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;

const DOC: &str = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

async fn serve(state: AppState) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = build_router(state);
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });
    addr
}

/// Perform a WebSocket handshake; returns the response head and the socket.
async fn handshake(addr: SocketAddr, path: &str, protocol: Option<&str>) -> (String, TcpStream) {
    let mut stream = TcpStream::connect(addr).await.unwrap();
    let mut req = format!(
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\nUser-Agent: sy-core-tests\r\n\
         Upgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n"
    );
    if let Some(p) = protocol {
        req.push_str(&format!("Sec-WebSocket-Protocol: {p}\r\n"));
    }
    req.push_str("\r\n");
    stream.write_all(req.as_bytes()).await.unwrap();

    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    timeout(Duration::from_secs(5), async {
        while !head.ends_with(b"\r\n\r\n") {
            stream.read_exact(&mut byte).await.unwrap();
            head.push(byte[0]);
        }
    })
    .await
    .expect("handshake response");
    (String::from_utf8(head).unwrap().to_lowercase(), stream)
}

/// Read one server frame: (opcode, payload). Server frames are unmasked.
async fn read_frame(stream: &mut TcpStream) -> (u8, Vec<u8>) {
    timeout(Duration::from_secs(5), async {
        let mut hdr = [0u8; 2];
        stream.read_exact(&mut hdr).await.unwrap();
        let len = match hdr[1] & 0x7f {
            126 => {
                let mut ext = [0u8; 2];
                stream.read_exact(&mut ext).await.unwrap();
                u16::from_be_bytes(ext) as usize
            }
            n => n as usize,
        };
        let mut payload = vec![0u8; len];
        stream.read_exact(&mut payload).await.unwrap();
        (hdr[0] & 0x0f, payload)
    })
    .await
    .expect("a frame")
}

async fn close_code(stream: &mut TcpStream) -> u16 {
    let (opcode, payload) = read_frame(stream).await;
    assert_eq!(opcode, 0x8, "expected a close frame");
    u16::from_be_bytes([payload[0], payload[1]])
}

fn protocol(token: &str) -> String {
    format!("token.{token}")
}

#[tokio::test]
async fn the_token_subprotocol_is_echoed_or_browsers_abort_the_handshake() {
    let addr = serve(common::test_state()).await;
    let p = protocol(&common::test_token("viewer"));
    let (head, _stream) = handshake(addr, "/ws/metrics", Some(&p)).await;
    assert!(head.starts_with("http/1.1 101"), "{head}");
    assert!(
        head.contains(&format!("sec-websocket-protocol: {}", p.to_lowercase())),
        "{head}"
    );
}

#[tokio::test]
async fn missing_invalid_and_refresh_tokens_are_refused_with_4401() {
    let addr = serve(common::test_state()).await;
    let refresh = protocol(&common::test_refresh_token_for("u-1", "admin"));
    for offered in [None, Some("token.not-a-jwt"), Some(refresh.as_str())] {
        let (head, mut stream) = handshake(addr, "/ws/metrics", offered).await;
        assert!(head.starts_with("http/1.1 101"), "{head}");
        assert_eq!(close_code(&mut stream).await, 4401, "{offered:?}");
    }
}

#[tokio::test]
async fn a_logged_out_token_is_refused() {
    let state = common::test_state();
    let addr = serve(state.clone()).await;
    let token = common::test_token("admin");
    let (status, _) = common::send(
        build_router(state),
        common::authed_post("/api/v1/auth/logout", &token, "{}"),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, mut stream) = handshake(addr, "/ws/metrics", Some(&protocol(&token))).await;
    assert_eq!(close_code(&mut stream).await, 4401);
}

#[tokio::test]
async fn video_streams_need_capture_permission() {
    let addr = serve(common::test_state()).await;
    let viewer = protocol(&common::test_token("viewer"));
    let (_, mut stream) = handshake(addr, "/ws/video/s1", Some(&viewer)).await;
    assert_eq!(close_code(&mut stream).await, 4403);

    let admin = protocol(&common::test_token("admin"));
    let (head, mut stream) = handshake(addr, "/ws/video/s1", Some(&admin)).await;
    assert!(head.starts_with("http/1.1 101"), "{head}");
    let (opcode, payload) = read_frame(&mut stream).await;
    assert_eq!(opcode, 0x1, "expected the session_started text frame");
    assert!(String::from_utf8_lossy(&payload).contains("session_started"));
}

#[tokio::test]
async fn collab_rooms_need_write_access_to_the_document() {
    let addr = serve(common::test_state()).await;
    let path = format!("/ws/collab/personality:{DOC}");

    let viewer = protocol(&common::test_token("viewer"));
    let (_, mut stream) = handshake(addr, &path, Some(&viewer)).await;
    assert_eq!(close_code(&mut stream).await, 4403);

    let operator = protocol(&common::test_token("operator"));
    let (head, mut stream) = handshake(addr, &path, Some(&operator)).await;
    assert!(head.starts_with("http/1.1 101"), "{head}");
    // Admitted: nothing is sent until a peer edits, so no close arrives.
    let mut byte = [0u8; 1];
    let idle = timeout(Duration::from_millis(300), stream.read(&mut byte)).await;
    assert!(idle.is_err(), "operator was disconnected");

    let admin = protocol(&common::test_token("admin"));
    let (_, mut stream) = handshake(addr, "/ws/collab/workflow:1", Some(&admin)).await;
    assert_eq!(close_code(&mut stream).await, 1008);
}

#[tokio::test]
async fn plain_http_requests_to_ws_routes_are_not_upgraded() {
    let req = Request::get("/ws/metrics").body(Body::empty()).unwrap();
    let (status, _) = common::send(common::test_app(), req).await;
    assert_ne!(status, StatusCode::SWITCHING_PROTOCOLS);
}
