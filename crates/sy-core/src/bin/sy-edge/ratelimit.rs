//! Per-IP token bucket rate limiter.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

/// Most peer addresses tracked at once.
const MAX_TRACKED: usize = 10_000;

struct Bucket {
    tokens: f64,
    last_refill: Instant,
}

pub struct RateLimiter {
    rate: f64,
    burst: usize,
    buckets: Mutex<HashMap<String, Bucket>>,
}

impl RateLimiter {
    pub fn new(rate: f64, burst: usize) -> Self {
        Self {
            rate,
            burst,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: &str) -> bool {
        let mut buckets = self.buckets.lock().unwrap();
        let now = Instant::now();

        // The limiter runs before auth, keyed by peer address, so a flood
        // from many addresses would grow the map without bound. A bucket that
        // has refilled to its burst is the same as no bucket: drop those, and
        // past the cap refuse addresses not already tracked.
        if !buckets.contains_key(key) && buckets.len() >= MAX_TRACKED {
            let (rate, burst) = (self.rate, self.burst as f64);
            buckets.retain(|_, b| {
                b.tokens + now.duration_since(b.last_refill).as_secs_f64() * rate < burst
            });
            if buckets.len() >= MAX_TRACKED {
                return false;
            }
        }

        let bucket = buckets.entry(key.to_string()).or_insert(Bucket {
            tokens: self.burst as f64,
            last_refill: now,
        });

        // Refill tokens
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.rate).min(self.burst as f64);
        bucket.last_refill = now;

        // Check and consume
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_map_stays_bounded_under_a_flood_of_addresses() {
        // No refill: every bucket that was used stays live.
        let rl = RateLimiter::new(0.0, 5);
        for i in 0..MAX_TRACKED {
            assert!(rl.check(&format!("10.0.{}.{}", i / 256, i % 256)));
        }
        assert!(!rl.check("203.0.113.1"), "a new address past the cap waits");
        assert!(rl.check("10.0.0.0"), "tracked addresses keep their buckets");
        assert_eq!(rl.buckets.lock().unwrap().len(), MAX_TRACKED);

        // Buckets that have refilled are forgotten to make room.
        let rl = RateLimiter::new(1_000_000.0, 1);
        for i in 0..MAX_TRACKED {
            rl.check(&format!("k{i}"));
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
        assert!(rl.check("new-peer"));
        assert!(rl.buckets.lock().unwrap().len() <= 2);
    }

    #[test]
    fn first_request_allowed() {
        let rl = RateLimiter::new(10.0, 5);
        assert!(rl.check("client1"));
    }

    #[test]
    fn burst_exhaustion() {
        let rl = RateLimiter::new(0.0, 3); // 0 rate = no refill
        assert!(rl.check("c1")); // token 3 -> 2
        assert!(rl.check("c1")); // 2 -> 1
        assert!(rl.check("c1")); // 1 -> 0
        assert!(!rl.check("c1")); // exhausted
    }

    #[test]
    fn independent_keys() {
        let rl = RateLimiter::new(0.0, 2);
        assert!(rl.check("a"));
        assert!(rl.check("a"));
        assert!(!rl.check("a"));

        // Different key should still have tokens
        assert!(rl.check("b"));
        assert!(rl.check("b"));
        assert!(!rl.check("b"));
    }

    #[test]
    fn tokens_capped_at_burst() {
        let rl = RateLimiter::new(1000.0, 5); // Very fast refill
        // Even with fast refill, can't exceed burst
        assert!(rl.check("c"));
        std::thread::sleep(std::time::Duration::from_millis(10));
        // Should have refilled but capped at 5
        for _ in 0..5 {
            assert!(rl.check("c"));
        }
        // 6th should fail (burst=5)
        assert!(!rl.check("c"));
    }

    #[test]
    fn refill_over_time() {
        let rl = RateLimiter::new(1000.0, 2);
        assert!(rl.check("c"));
        assert!(rl.check("c"));
        assert!(!rl.check("c")); // exhausted

        // Wait for refill
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(rl.check("c")); // should have refilled
    }
}
