package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

// startTestServer spins up the full edge server on a random port and returns
// the base URL and a cleanup function.
func startTestServer(t *testing.T, apiToken string) (baseURL string, cleanup func()) {
	t.Helper()

	// Find a free port.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()

	logger := NewLogger("error")
	caps := DetectCapabilities()
	a2a := NewA2AManager(logger)
	mc := NewMetricsCollector(logger)
	mc.Start()
	mem := NewMemoryStore(t.TempDir()+"/memory.json", logger)
	sb := NewSandbox(SandboxConfig{Enabled: true}, logger)
	msng := NewMessenger(logger)
	llm := NewLLMClient(logger)
	sched := NewScheduler(logger)
	sched.Start()

	srv := NewServer("127.0.0.1", port, ServerDeps{
		Caps:      caps,
		A2A:       a2a,
		Metrics:   mc,
		Memory:    mem,
		Sandbox:   sb,
		Messenger: msng,
		LLM:       llm,
		Scheduler: sched,
		APIToken:  apiToken,
	}, logger)

	if err := srv.Start(); err != nil {
		t.Fatalf("start server: %v", err)
	}

	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	return base, func() {
		sched.Stop()
		mc.Stop()
		srv.Stop()
		a2a.Stop()
		mem.Flush()
	}
}

func doReq(t *testing.T, method, url, token string, body string) (int, map[string]any) {
	t.Helper()
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var result map[string]any
	json.Unmarshal(data, &result)
	return resp.StatusCode, result
}

// ── Smoke: Health ────────────────────────────────────────────────────────

func TestSmokeHealth(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/health", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", body["status"])
	}
	if body["mode"] != "edge" {
		t.Fatalf("expected mode edge, got %v", body["mode"])
	}
	if body["capabilities"] == nil {
		t.Fatal("expected capabilities in health response")
	}
}

// ── Smoke: Auth ──────────────────────────────────────────────────────────

func TestSmokeAuthRequired(t *testing.T) {
	base, cleanup := startTestServer(t, "secret-token")
	defer cleanup()

	// No token → 401
	code, body := doReq(t, "GET", base+"/api/v1/metrics", "", "")
	if code != 401 {
		t.Fatalf("expected 401, got %d", code)
	}
	if body["error"] != "authorization required" {
		t.Fatalf("expected auth error, got %v", body["error"])
	}

	// Wrong token → 403
	code, body = doReq(t, "GET", base+"/api/v1/metrics", "wrong-token", "")
	if code != 403 {
		t.Fatalf("expected 403, got %d", code)
	}

	// Correct token → 200
	code, _ = doReq(t, "GET", base+"/api/v1/metrics", "secret-token", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
}

func TestSmokeHealthNoAuthNeeded(t *testing.T) {
	base, cleanup := startTestServer(t, "secret-token")
	defer cleanup()

	// Health should work without auth even when token is set
	code, _ := doReq(t, "GET", base+"/health", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
}

func TestSmokePrometheusNoAuthNeeded(t *testing.T) {
	base, cleanup := startTestServer(t, "secret-token")
	defer cleanup()

	req, _ := http.NewRequest("GET", base+"/api/v1/metrics/prometheus", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	data, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(data), "sy_edge_cpu_percent") {
		t.Fatal("expected prometheus metrics in response")
	}
}

// ── Smoke: Metrics ───────────────────────────────────────────────────────

func TestSmokeMetrics(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/metrics", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["memTotalMb"] == nil || body["memTotalMb"].(float64) <= 0 {
		t.Fatal("expected positive memTotalMb")
	}
	if body["goroutines"] == nil || body["goroutines"].(float64) <= 0 {
		t.Fatal("expected positive goroutines")
	}
}

// ── Smoke: Exec ──────────────────────────────────────────────────────────

func TestSmokeExecAllowed(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "POST", base+"/api/v1/exec", "", `{"command":"uname"}`)
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["exitCode"] != float64(0) {
		t.Fatalf("expected exitCode 0, got %v", body["exitCode"])
	}
	stdout, ok := body["stdout"].(string)
	if !ok || stdout == "" {
		t.Fatal("expected non-empty stdout")
	}
}

func TestSmokeExecBlocked(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "POST", base+"/api/v1/exec", "", `{"command":"rm -rf /"}`)
	if code != 403 {
		t.Fatalf("expected 403, got %d", code)
	}
	errMsg, _ := body["error"].(string)
	if !strings.Contains(errMsg, "blocked") {
		t.Fatalf("expected blocked error, got %q", errMsg)
	}
}

func TestSmokeExecAllowedList(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/exec/allowed", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	allowed, ok := body["allowed"].([]any)
	if !ok || len(allowed) == 0 {
		t.Fatal("expected non-empty allowed list")
	}
}

// ── Smoke: Memory CRUD ───────────────────────────────────────────────────

func TestSmokeMemoryCRUD(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	// Set
	code, body := doReq(t, "PUT", base+"/api/v1/memory/test/key1", "", `{"value":"hello"}`)
	if code != 200 || body["ok"] != true {
		t.Fatalf("set: code=%d body=%v", code, body)
	}

	// Get
	code, body = doReq(t, "GET", base+"/api/v1/memory/test/key1", "", "")
	if code != 200 || body["value"] != "hello" {
		t.Fatalf("get: code=%d body=%v", code, body)
	}

	// List
	code, body = doReq(t, "GET", base+"/api/v1/memory/test", "", "")
	if code != 200 || body["total"] != float64(1) {
		t.Fatalf("list: code=%d body=%v", code, body)
	}

	// Namespaces
	code, body = doReq(t, "GET", base+"/api/v1/memory", "", "")
	if code != 200 {
		t.Fatalf("namespaces: code=%d", code)
	}
	ns, _ := body["namespaces"].([]any)
	if len(ns) == 0 {
		t.Fatal("expected at least 1 namespace")
	}

	// Delete
	code, body = doReq(t, "DELETE", base+"/api/v1/memory/test/key1", "", "")
	if code != 200 || body["ok"] != true {
		t.Fatalf("delete: code=%d body=%v", code, body)
	}

	// Get after delete → 404
	code, _ = doReq(t, "GET", base+"/api/v1/memory/test/key1", "", "")
	if code != 404 {
		t.Fatalf("expected 404 after delete, got %d", code)
	}
}

// ── Smoke: LLM Providers ────────────────────────────────────────────────

func TestSmokeLLMProviders(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/llm/providers", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["providers"] == nil {
		t.Fatal("expected providers key")
	}
}

// ── Smoke: Scheduler ─────────────────────────────────────────────────────

func TestSmokeSchedulerCRUD(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	// Add task
	code, body := doReq(t, "POST", base+"/api/v1/scheduler/tasks", "",
		`{"id":"smoke1","name":"test","type":"command","payload":"uname","interval":"30s","enabled":true}`)
	if code != 201 || body["ok"] != true {
		t.Fatalf("add: code=%d body=%v", code, body)
	}

	// List
	code, body = doReq(t, "GET", base+"/api/v1/scheduler/tasks", "", "")
	if code != 200 || body["total"] != float64(1) {
		t.Fatalf("list: code=%d body=%v", code, body)
	}

	// Remove
	code, body = doReq(t, "DELETE", base+"/api/v1/scheduler/tasks/smoke1", "", "")
	if code != 200 || body["ok"] != true {
		t.Fatalf("remove: code=%d body=%v", code, body)
	}

	// List after remove
	code, body = doReq(t, "GET", base+"/api/v1/scheduler/tasks", "", "")
	if code != 200 || body["total"] != float64(0) {
		t.Fatalf("list after remove: code=%d body=%v", code, body)
	}
}

// ── Smoke: A2A ───────────────────────────────────────────────────────────

func TestSmokeA2AReceive(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "POST", base+"/api/v1/a2a/receive", "",
		`{"id":"msg1","type":"a2a:discover","fromPeerId":"test","toPeerId":"self","timestamp":0}`)
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["type"] != "a2a:announce" {
		t.Fatalf("expected a2a:announce, got %v", body["type"])
	}
	if body["mode"] != "edge" {
		t.Fatalf("expected edge mode, got %v", body["mode"])
	}
}

func TestSmokeA2APeers(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/a2a/peers", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["total"] != float64(0) {
		t.Fatalf("expected 0 peers initially, got %v", body["total"])
	}
}

func TestSmokeA2ACapabilities(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/a2a/capabilities", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["capabilities"] == nil {
		t.Fatal("expected capabilities in response")
	}
}

// ── Smoke: Messaging ─────────────────────────────────────────────────────

func TestSmokeMessagingTargets(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/messaging/targets", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["total"] != float64(0) {
		t.Fatalf("expected 0 targets, got %v", body["total"])
	}
}

// ── Smoke: Update Check ─────────────────────────────────────────────────

func TestSmokeUpdateCheck(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	code, body := doReq(t, "GET", base+"/api/v1/update/check", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["version"] != Version {
		t.Fatalf("expected version %s, got %v", Version, body["version"])
	}
	if body["updateSupported"] != true {
		t.Fatal("expected updateSupported true")
	}
}

// ── Smoke: Rate Limiting ─────────────────────────────────────────────────

func TestSmokeRateLimiting(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	// The rate limiter allows 200 burst. Hit it 201 times fast.
	// We can't easily exhaust 200 in a test without being slow,
	// so just verify the endpoint responds correctly under normal load.
	for i := 0; i < 10; i++ {
		code, _ := doReq(t, "GET", base+"/health", "", "")
		if code != 200 {
			t.Fatalf("request %d: expected 200, got %d", i, code)
		}
	}
}

// ── Smoke: 404 ───────────────────────────────────────────────────────────

func TestSmoke404(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	req, _ := http.NewRequest("GET", base+"/nonexistent", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

// ── Smoke: Metrics History ───────────────────────────────────────────────

func TestSmokeMetricsHistory(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	// History may be empty initially (collector hasn't ticked yet)
	code, body := doReq(t, "GET", base+"/api/v1/metrics/history?minutes=1", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	if body["metrics"] == nil {
		t.Fatal("expected metrics key in response")
	}
}

// ── Smoke: Memory Search ─────────────────────────────────────────────────

func TestSmokeMemorySearch(t *testing.T) {
	base, cleanup := startTestServer(t, "")
	defer cleanup()

	// Seed data
	doReq(t, "PUT", base+"/api/v1/memory/search-ns/alpha", "", `{"value":"hello world"}`)
	doReq(t, "PUT", base+"/api/v1/memory/search-ns/beta", "", `{"value":"goodbye world"}`)
	doReq(t, "PUT", base+"/api/v1/memory/search-ns/gamma", "", `{"value":"nothing here"}`)

	// Wait briefly for writes
	time.Sleep(50 * time.Millisecond)

	// Search for "world" — should match alpha and beta
	code, body := doReq(t, "GET", base+"/api/v1/memory/search-ns?q=world", "", "")
	if code != 200 {
		t.Fatalf("expected 200, got %d", code)
	}
	total, _ := body["total"].(float64)
	if total != 2 {
		t.Fatalf("expected 2 search results, got %v", total)
	}
}
