package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// Server is the HTTP server for health, A2A, capabilities, metrics, memory, exec, messaging, LLM, and scheduler endpoints.
type Server struct {
	httpSrv   *http.Server
	caps      EdgeCapabilities
	a2a       *A2AManager
	metrics   *MetricsCollector
	memory    *MemoryStore
	sandbox   *Sandbox
	messenger *Messenger
	llm       *LLMClient
	scheduler *Scheduler
	logger    *Logger
	started   time.Time
	apiToken  string
}

// ServerDeps holds all subsystems the server needs.
type ServerDeps struct {
	Caps      EdgeCapabilities
	A2A       *A2AManager
	Metrics   *MetricsCollector
	Memory    *MemoryStore
	Sandbox   *Sandbox
	Messenger *Messenger
	LLM       *LLMClient
	Scheduler *Scheduler
	APIToken  string
}

// NewServer creates an edge HTTP server.
func NewServer(host string, port int, deps ServerDeps, logger *Logger) *Server {
	s := &Server{
		caps:      deps.Caps,
		a2a:       deps.A2A,
		metrics:   deps.Metrics,
		memory:    deps.Memory,
		sandbox:   deps.Sandbox,
		messenger: deps.Messenger,
		llm:       deps.LLM,
		scheduler: deps.Scheduler,
		logger:    logger,
		apiToken:  deps.APIToken,
	}

	mux := http.NewServeMux()

	// Core — /health and /metrics/prometheus are open for monitoring
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/a2a/capabilities", s.requireAuth(s.handleCapabilities))
	mux.HandleFunc("POST /api/v1/a2a/receive", s.requireAuth(s.handleA2AReceive))
	mux.HandleFunc("GET /api/v1/a2a/peers", s.requireAuth(s.handleListPeers))

	// Metrics
	mux.HandleFunc("GET /api/v1/metrics", s.requireAuth(s.handleMetrics))
	mux.HandleFunc("GET /api/v1/metrics/prometheus", s.handleMetricsPrometheus) // open for scrapers
	mux.HandleFunc("GET /api/v1/metrics/history", s.requireAuth(s.handleMetricsHistory))

	// Memory
	mux.HandleFunc("GET /api/v1/memory/{namespace}", s.requireAuth(s.handleMemoryList))
	mux.HandleFunc("GET /api/v1/memory/{namespace}/{key}", s.requireAuth(s.handleMemoryGet))
	mux.HandleFunc("PUT /api/v1/memory/{namespace}/{key}", s.requireAuth(s.handleMemorySet))
	mux.HandleFunc("DELETE /api/v1/memory/{namespace}/{key}", s.requireAuth(s.handleMemoryDelete))
	mux.HandleFunc("GET /api/v1/memory", s.requireAuth(s.handleMemoryNamespaces))

	// Sandbox / exec
	mux.HandleFunc("POST /api/v1/exec", s.requireAuth(s.handleExec))
	mux.HandleFunc("GET /api/v1/exec/allowed", s.requireAuth(s.handleExecAllowed))

	// Messaging
	mux.HandleFunc("POST /api/v1/messaging/send", s.requireAuth(s.handleMessagingSend))
	mux.HandleFunc("POST /api/v1/messaging/broadcast", s.requireAuth(s.handleMessagingBroadcast))
	mux.HandleFunc("GET /api/v1/messaging/targets", s.requireAuth(s.handleMessagingTargets))

	// LLM
	mux.HandleFunc("POST /api/v1/llm/complete", s.requireAuth(s.handleLLMComplete))
	mux.HandleFunc("GET /api/v1/llm/providers", s.requireAuth(s.handleLLMProviders))

	// Scheduler
	mux.HandleFunc("GET /api/v1/scheduler/tasks", s.requireAuth(s.handleSchedulerList))
	mux.HandleFunc("POST /api/v1/scheduler/tasks", s.requireAuth(s.handleSchedulerAdd))
	mux.HandleFunc("DELETE /api/v1/scheduler/tasks/{id}", s.requireAuth(s.handleSchedulerRemove))

	// System
	mux.HandleFunc("GET /api/v1/update/check", s.requireAuth(s.handleUpdateCheck))

	// Rate limiter: 100 requests per second per IP, burst of 200
	rl := NewRateLimiter(100, time.Second, 200)

	s.httpSrv = &http.Server{
		Addr: fmt.Sprintf("%s:%d", host, port),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			for i := len(ip) - 1; i >= 0; i-- {
				if ip[i] == ':' {
					ip = ip[:i]
					break
				}
			}
			if !rl.Allow(ip) {
				w.Header().Set("Retry-After", "1")
				writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
				return
			}
			mux.ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	return s
}

// Start begins listening. Returns immediately after binding.
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", s.httpSrv.Addr)
	if err != nil {
		return err
	}
	s.started = time.Now()
	go func() {
		if err := s.httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
			s.logger.Error("server error", "error", err)
		}
	}()
	return nil
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.httpSrv.Shutdown(ctx)
}

// ── Auth Middleware ───────────────────────────────────────────────────────

// requireAuth wraps a handler with bearer token authentication.
// If no token is configured the request is passed through (dev mode).
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.apiToken == "" {
			next(w, r) // no token configured = open access (dev mode)
			return
		}
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authorization required"})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.apiToken)) != 1 {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid token"})
			return
		}
		next(w, r)
	}
}

// ── Handlers ──────────────────────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	resp := map[string]any{
		"status":       "ok",
		"mode":         "edge",
		"version":      Version,
		"uptime_ms":    time.Since(s.started).Milliseconds(),
		"capabilities": s.caps,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleCapabilities(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"capabilities": s.caps})
}

func (s *Server) handleA2AReceive(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB limit
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "failed to read body"})
		return
	}

	var msg A2AMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	s.logger.Debug("A2A message received", "type", msg.Type, "from", msg.FromPeerID)

	result := s.a2a.HandleMessage(msg)
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleListPeers(w http.ResponseWriter, _ *http.Request) {
	peers := s.a2a.ListPeers()
	writeJSON(w, http.StatusOK, map[string]any{"peers": peers, "total": len(peers)})
}

// ── Metrics Handlers ─────────────────────────────────────────────────────

func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.metrics.Current())
}

func (s *Server) handleMetricsPrometheus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, s.metrics.PrometheusText())
}

func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	minutes := 10
	if v := r.URL.Query().Get("minutes"); v != "" {
		if n, err := fmt.Sscanf(v, "%d", &minutes); n == 0 || err != nil {
			minutes = 10
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"metrics": s.metrics.History(minutes)})
}

// ── Memory Handlers ──────────────────────────────────────────────────────

func (s *Server) handleMemoryNamespaces(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"namespaces": s.memory.ListNamespaces()})
}

func (s *Server) handleMemoryList(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	query := r.URL.Query().Get("q")
	var entries []MemoryEntry
	if query != "" {
		entries = s.memory.Search(ns, query)
	} else {
		entries = s.memory.List(ns)
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "total": len(entries)})
}

func (s *Server) handleMemoryGet(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	key := r.PathValue("key")
	val, ok := s.memory.Get(ns, key)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "namespace": ns, "value": val})
}

func (s *Server) handleMemorySet(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	key := r.PathValue("key")

	var body struct {
		Value string `json:"value"`
		TTL   int    `json:"ttl"` // seconds, 0 = permanent
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	s.memory.Set(ns, key, body.Value, body.TTL)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMemoryDelete(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	key := r.PathValue("key")
	if s.memory.Delete(ns, key) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	} else {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

// ── Exec Handlers ────────────────────────────────────────────────────────

func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Command string `json:"command"`
	}
	if err := readJSON(r, &body); err != nil || body.Command == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "command required"})
		return
	}
	result, err := s.sandbox.Execute(body.Command)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleExecAllowed(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"allowed": s.sandbox.ListAllowed(),
		"workspace": s.sandbox.config.WorkspaceDir,
	})
}

// ── Messaging Handlers ───────────────────────────────────────────────────

func (s *Server) handleMessagingSend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Target  string `json:"target"`
		Message string `json:"message"`
	}
	if err := readJSON(r, &body); err != nil || body.Target == "" || body.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "target and message required"})
		return
	}
	if err := s.messenger.Send(body.Target, body.Message); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMessagingBroadcast(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string `json:"message"`
	}
	if err := readJSON(r, &body); err != nil || body.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message required"})
		return
	}
	errs := s.messenger.Broadcast(body.Message)
	failures := 0
	for _, e := range errs {
		if e != nil {
			failures++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": failures == 0, "failures": failures})
}

func (s *Server) handleMessagingTargets(w http.ResponseWriter, _ *http.Request) {
	targets := s.messenger.ListTargets()
	writeJSON(w, http.StatusOK, map[string]any{"targets": targets, "total": len(targets)})
}

// ── LLM Handlers ─────────────────────────────────────────────────────────

func (s *Server) handleLLMComplete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider    string       `json:"provider"`
		Messages    []LLMMessage `json:"messages"`
		MaxTokens   int          `json:"max_tokens,omitempty"`
		Temperature float64      `json:"temperature,omitempty"`
	}
	if err := readJSON(r, &body); err != nil || body.Provider == "" || len(body.Messages) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "provider and messages required"})
		return
	}
	resp, err := s.llm.Complete(body.Provider, LLMRequest{
		Messages:    body.Messages,
		MaxTokens:   body.MaxTokens,
		Temperature: body.Temperature,
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleLLMProviders(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"providers": s.llm.ListProviders()})
}

// ── Scheduler Handlers ───────────────────────────────────────────────────

func (s *Server) handleSchedulerList(w http.ResponseWriter, _ *http.Request) {
	tasks := s.scheduler.List()
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks, "total": len(tasks)})
}

func (s *Server) handleSchedulerAdd(w http.ResponseWriter, r *http.Request) {
	var task ScheduledTask
	if err := readJSON(r, &task); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	if err := s.scheduler.Add(task); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "id": task.ID})
}

func (s *Server) handleSchedulerRemove(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.scheduler.Remove(id) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	} else {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "task not found"})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────

func readJSON(r *http.Request, v any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
