//! Centralized, spoofing-resistant client-IP extraction.
//!
//! `X-Forwarded-For` is attacker-controlled: any client can send an arbitrary
//! value. It is therefore honored **only** on a request whose TCP peer (from
//! `ConnectInfo`, populated by serving with `into_make_service_with_connect_info`)
//! is a trusted proxy — `SECUREYEOMAN_TRUSTED_PROXIES`, a list of addresses
//! and CIDR ranges. `SECUREYEOMAN_TRUST_PROXY_HEADERS=true` without a list
//! trusts proxies on loopback and private networks. The chain is read from the
//! right, skipping trusted hops, so a client cannot prepend its own entries.
//!
//! Behind a proxy that is *not* trusted every client shares the proxy's
//! address, so the local-network gate, rate limiter, IP-reputation blocker and
//! fingerprinter would all see one client; trusting the proxy is what keeps
//! them per client.

use axum::extract::ConnectInfo;
use axum::http::Request;
use std::net::{IpAddr, SocketAddr};

/// One trusted address range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct IpNet {
    addr: IpAddr,
    prefix: u8,
}

impl IpNet {
    fn parse(s: &str) -> Option<Self> {
        let (addr, prefix) = match s.split_once('/') {
            Some((addr, prefix)) => (addr.trim(), Some(prefix.trim().parse::<u8>().ok()?)),
            None => (s.trim(), None),
        };
        let addr = canonical(addr.parse().ok()?);
        let max = if addr.is_ipv4() { 32 } else { 128 };
        let prefix = prefix.unwrap_or(max);
        (prefix <= max).then_some(Self { addr, prefix })
    }

    fn contains(&self, ip: IpAddr) -> bool {
        match (self.addr, canonical(ip)) {
            (IpAddr::V4(net), IpAddr::V4(ip)) => {
                let mask = u32::MAX
                    .checked_shl(32 - u32::from(self.prefix))
                    .unwrap_or(0);
                u32::from(net) & mask == u32::from(ip) & mask
            }
            (IpAddr::V6(net), IpAddr::V6(ip)) => {
                let mask = u128::MAX
                    .checked_shl(128 - u32::from(self.prefix))
                    .unwrap_or(0);
                u128::from(net) & mask == u128::from(ip) & mask
            }
            _ => false,
        }
    }
}

/// An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`, how a dual-stack listener
/// reports IPv4 peers) as the IPv4 address it is.
fn canonical(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6.to_canonical(),
        v4 => v4,
    }
}

/// The peers allowed to report a client address in `X-Forwarded-For`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TrustedProxies {
    nets: Vec<IpNet>,
}

impl TrustedProxies {
    /// Trust no proxy: the TCP peer is always the client.
    pub fn none() -> Self {
        Self::default()
    }

    /// Proxies on loopback or a private network — where a reverse proxy in
    /// front of this server lives. What `SECUREYEOMAN_TRUST_PROXY_HEADERS=true`
    /// means when no explicit list is given.
    pub fn private_networks() -> Self {
        Self::parse_list("127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7").0
    }

    /// Parse a comma-separated list of addresses and CIDR ranges; also returns
    /// the entries that did not parse.
    pub fn parse_list(list: &str) -> (Self, Vec<String>) {
        let mut nets = Vec::new();
        let mut rejected = Vec::new();
        for entry in list.split(',').map(str::trim).filter(|e| !e.is_empty()) {
            match IpNet::parse(entry) {
                Some(net) => nets.push(net),
                None => rejected.push(entry.to_string()),
            }
        }
        (Self { nets }, rejected)
    }

    /// From `SECUREYEOMAN_TRUSTED_PROXIES`, else the legacy
    /// `SECUREYEOMAN_TRUST_PROXY_HEADERS=true` (private networks), else none.
    pub fn from_env() -> Self {
        if let Ok(list) = std::env::var("SECUREYEOMAN_TRUSTED_PROXIES")
            && !list.trim().is_empty()
        {
            let (proxies, rejected) = Self::parse_list(&list);
            for entry in rejected {
                tracing::warn!(
                    entry,
                    "SECUREYEOMAN_TRUSTED_PROXIES: ignoring an invalid entry"
                );
            }
            return proxies;
        }
        if std::env::var("SECUREYEOMAN_TRUST_PROXY_HEADERS").is_ok_and(|v| v == "true" || v == "1")
        {
            return Self::private_networks();
        }
        Self::none()
    }

    pub fn is_empty(&self) -> bool {
        self.nets.is_empty()
    }

    pub fn contains(&self, ip: IpAddr) -> bool {
        self.nets.iter().any(|net| net.contains(ip))
    }
}

/// One `X-Forwarded-For` hop as an address. Some proxies append a port.
fn parse_hop(hop: &str) -> Option<IpAddr> {
    let hop = hop.trim();
    hop.parse::<IpAddr>()
        .ok()
        .or_else(|| hop.parse::<SocketAddr>().ok().map(|s| s.ip()))
        .map(canonical)
}

/// Resolve the client IP for a request.
///
/// The TCP peer, unless it is a trusted proxy: then the rightmost
/// `X-Forwarded-For` hop that is not itself a trusted proxy (every header line,
/// in order). A hop that is not an address ends the walk at the last trusted
/// one. Falls back to `"unknown"` without `ConnectInfo` (unit tests that drive
/// the router with `oneshot`).
pub fn client_ip<B>(req: &Request<B>, proxies: &TrustedProxies) -> String {
    let peer = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(peer)| *peer);
    client_ip_from(peer, req.headers(), proxies)
}

/// [`client_ip`] from a request's parts, for handlers that extract them.
pub fn client_ip_from(
    peer: Option<SocketAddr>,
    headers: &axum::http::HeaderMap,
    proxies: &TrustedProxies,
) -> String {
    let Some(peer) = peer else {
        return "unknown".to_string();
    };
    let peer = canonical(peer.ip());
    if !proxies.contains(peer) {
        return peer.to_string();
    }

    let hops: Vec<&str> = headers
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .collect();
    let mut client = peer;
    for hop in hops.iter().rev() {
        match parse_hop(hop) {
            Some(ip) if proxies.contains(ip) => client = ip,
            Some(ip) => return ip.to_string(),
            None => break,
        }
    }
    client.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;

    fn req(peer: Option<&str>, xff: &[&str]) -> Request<Body> {
        let mut builder = Request::get("/");
        for line in xff {
            builder = builder.header("x-forwarded-for", *line);
        }
        let mut req = builder.body(Body::empty()).unwrap();
        if let Some(peer) = peer {
            req.extensions_mut()
                .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
        }
        req
    }

    fn proxies(list: &str) -> TrustedProxies {
        let (p, rejected) = TrustedProxies::parse_list(list);
        assert!(rejected.is_empty(), "{rejected:?}");
        p
    }

    #[test]
    fn ignores_xff_from_an_untrusted_peer() {
        // Default posture: a forged header is never honored.
        let r = req(Some("203.0.113.9:4444"), &["127.0.0.1"]);
        assert_eq!(client_ip(&r, &TrustedProxies::none()), "203.0.113.9");
        // Nor when proxies are trusted but this peer is not one of them —
        // e.g. a client reaching the published port directly.
        assert_eq!(client_ip(&r, &proxies("127.0.0.1")), "203.0.113.9");
    }

    #[test]
    fn a_trusted_proxy_speaks_for_its_client() {
        let r = req(Some("127.0.0.1:5555"), &["198.51.100.7"]);
        assert_eq!(client_ip(&r, &proxies("127.0.0.1, ::1")), "198.51.100.7");
    }

    #[test]
    fn the_chain_is_read_from_the_right() {
        // An appending proxy keeps whatever the client sent on the left.
        let r = req(Some("10.0.0.2:5555"), &["127.0.0.1, 198.51.100.7"]);
        assert_eq!(client_ip(&r, &proxies("10.0.0.0/8")), "198.51.100.7");
        // Trusted hops (a proxy chain) are skipped, across header lines too.
        let r = req(Some("10.0.0.2:5555"), &["198.51.100.7", "10.0.0.9"]);
        assert_eq!(client_ip(&r, &proxies("10.0.0.0/8")), "198.51.100.7");
        // A local client behind the proxy is itself.
        let r = req(Some("127.0.0.1:5555"), &["127.0.0.1"]);
        assert_eq!(client_ip(&r, &proxies("127.0.0.1")), "127.0.0.1");
    }

    #[test]
    fn garbage_hops_do_not_become_rate_limit_keys() {
        let r = req(Some("127.0.0.1:5555"), &["not-an-ip"]);
        assert_eq!(client_ip(&r, &proxies("127.0.0.1")), "127.0.0.1");
        let r = req(Some("127.0.0.1:5555"), &["198.51.100.7:1234"]);
        assert_eq!(client_ip(&r, &proxies("127.0.0.1")), "198.51.100.7");
    }

    #[test]
    fn ipv4_mapped_peers_match_ipv4_ranges() {
        let r = req(Some("[::ffff:127.0.0.1]:5555"), &["198.51.100.7"]);
        assert_eq!(client_ip(&r, &proxies("127.0.0.1")), "198.51.100.7");
        let r = req(Some("[::ffff:203.0.113.9]:5555"), &[]);
        assert_eq!(client_ip(&r, &TrustedProxies::none()), "203.0.113.9");
    }

    #[test]
    fn falls_back_to_unknown_without_connectinfo() {
        let r = req(None, &["9.9.9.9"]);
        assert_eq!(client_ip(&r, &proxies("0.0.0.0/0")), "unknown");
    }

    #[test]
    fn parses_addresses_and_ranges() {
        let p = proxies("192.168.0.0/16, ::1, fd00::/8");
        assert!(p.contains("192.168.4.5".parse().unwrap()));
        assert!(!p.contains("192.169.0.1".parse().unwrap()));
        assert!(p.contains("::1".parse().unwrap()));
        assert!(p.contains("fd12::3".parse().unwrap()));
        assert!(!p.contains("fe80::1".parse().unwrap()));
        let (_, rejected) = TrustedProxies::parse_list("10.0.0.0/33, banana, 10.0.0.1");
        assert_eq!(rejected, vec!["10.0.0.0/33", "banana"]);
        assert!(TrustedProxies::private_networks().contains("172.17.0.1".parse().unwrap()));
        assert!(!TrustedProxies::private_networks().contains("8.8.8.8".parse().unwrap()));
    }
}
