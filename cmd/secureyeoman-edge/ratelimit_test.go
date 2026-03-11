package main

import (
	"testing"
	"time"
)

func TestRateLimiterAllow(t *testing.T) {
	// burst of 5, so first 5 requests must be allowed.
	rl := NewRateLimiter(1, time.Second, 5)

	for i := 0; i < 5; i++ {
		if !rl.Allow("client-1") {
			t.Fatalf("request %d should have been allowed (within burst of 5)", i+1)
		}
	}
}

func TestRateLimiterExhaust(t *testing.T) {
	// burst of 3: first 3 allowed, 4th denied.
	rl := NewRateLimiter(1, time.Second, 3)

	for i := 0; i < 3; i++ {
		if !rl.Allow("client-exhaust") {
			t.Fatalf("request %d should have been allowed", i+1)
		}
	}

	if rl.Allow("client-exhaust") {
		t.Fatal("expected 4th request to be denied after burst exhausted")
	}
}

func TestRateLimiterRefill(t *testing.T) {
	// 1 token per 100ms interval, burst of 1.
	interval := 100 * time.Millisecond
	rl := NewRateLimiter(1, interval, 1)

	// Exhaust the single token.
	if !rl.Allow("client-refill") {
		t.Fatal("first request should have been allowed")
	}
	if rl.Allow("client-refill") {
		t.Fatal("second request should have been denied (burst exhausted)")
	}

	// Wait for one full refill interval plus a small buffer.
	time.Sleep(interval + 20*time.Millisecond)

	if !rl.Allow("client-refill") {
		t.Fatal("request after refill interval should have been allowed")
	}
}
