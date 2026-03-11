// secureyeoman-edge — Lightweight A2A agent runtime for edge/IoT devices.
//
// Features: health, A2A transport, capabilities, metrics, agent memory, LLM providers,
// sandboxed exec, webhook messaging, task scheduler, mDNS discovery, cert pinning,
// OTA self-update, parent registration.
// No brain, soul, spirit, marketplace, or dashboard.
//
// Usage:
//
//	secureyeoman-edge start [flags]
//	secureyeoman-edge register --parent URL [--token TOKEN]
//	secureyeoman-edge status
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Version is set at build time via -ldflags.
var Version = "dev"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(0)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "start":
		os.Exit(runStart(args))
	case "register":
		os.Exit(runRegister(args))
	case "status":
		os.Exit(runStatus())
	case "--version", "-v":
		fmt.Printf("secureyeoman-edge v%s\n", Version)
	case "--help", "-h":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Print(`
SecureYeoman Edge — Lightweight A2A Agent Runtime

Usage: secureyeoman-edge <command> [options]

Commands:
  start              Start the edge runtime
  register           Register with a parent SecureYeoman instance
  status             Show edge node capabilities

Start options:
  -p, --port <n>           Port for endpoints (default: 18891)
  -H, --host <addr>        Bind address (default: 0.0.0.0)
  -l, --log-level <level>  Log level: debug|info|warn|error (default: info)

Register options:
  --parent <url>           Parent SY instance URL (required)
  --token <token>          Registration token

Environment:
  SECUREYEOMAN_PARENT_URL       Default parent URL
  SECUREYEOMAN_EDGE_TOKEN       Default registration token
  SECUREYEOMAN_EDGE_API_TOKEN   Bearer token for API auth (recommended)
  SECUREYEOMAN_EDGE_TAGS        Comma-separated capability tags
  SECUREYEOMAN_EDGE_PORT        Default port (overridden by -p)

  OPENAI_API_KEY             OpenAI provider
  ANTHROPIC_API_KEY          Anthropic provider
  OLLAMA_URL                 Ollama provider (default: localhost:11434)
  OPENROUTER_API_KEY         OpenRouter provider

  SLACK_WEBHOOK_URL          Slack notifications
  DISCORD_WEBHOOK_URL        Discord notifications
  TELEGRAM_BOT_TOKEN         Telegram notifications (+ TELEGRAM_CHAT_ID)

API Endpoints:
  GET  /health                          Health check
  GET  /api/v1/metrics                  System metrics (JSON)
  GET  /api/v1/metrics/prometheus       Prometheus text format
  POST /api/v1/llm/complete             LLM completion
  POST /api/v1/exec                     Sandboxed command execution
  PUT  /api/v1/memory/{ns}/{key}        Agent memory store
  POST /api/v1/messaging/send           Send notification
  POST /api/v1/scheduler/tasks          Schedule recurring task
  GET  /api/v1/a2a/capabilities         A2A capability query
  POST /api/v1/a2a/receive              A2A message receive

`)
}

func runStart(args []string) int {
	cfg := parseStartFlags(args)

	logger := NewLogger(cfg.LogLevel)
	logger.Info("SecureYeoman Edge starting", "version", Version)

	caps := DetectCapabilities()
	logger.Info("capabilities detected",
		"nodeId", caps.NodeID,
		"arch", caps.Arch,
		"memory_mb", caps.TotalMemoryMB,
		"cores", caps.CPUCores,
		"gpu", caps.HasGPU,
	)

	// Initialize subsystems
	a2a := NewA2AManager(logger)

	metricsCollector := NewMetricsCollector(logger)
	metricsCollector.Start()

	memory := NewMemoryStore("", logger) // default ~/.secureyeoman-edge/memory.json

	sandbox := NewSandbox(SandboxConfig{Enabled: true}, logger) // defaults: allowlist, 30s timeout, 1MB output

	messenger := AutoConfigMessaging(logger)

	llm := AutoConfigProviders(logger)
	providerCount := len(llm.ListProviders())
	if providerCount > 0 {
		logger.Info("LLM providers configured", "count", providerCount)
	}

	sched := NewScheduler(logger)
	sched.SetExecutor(func(task *ScheduledTask) {
		switch task.Type {
		case "command":
			result, err := sandbox.Execute(task.Payload)
			if err != nil {
				logger.Warn("scheduled task failed", "id", task.ID, "error", err)
			} else {
				logger.Debug("scheduled task completed", "id", task.ID, "exit", result.ExitCode)
			}
		case "webhook":
			messenger.Broadcast(task.Payload)
		case "llm":
			if providerCount > 0 {
				providers := llm.ListProviders()
				resp, err := llm.Complete(providers[0], LLMRequest{
					Messages:  []LLMMessage{{Role: "user", Content: task.Payload}},
					MaxTokens: 256,
				})
				if err != nil {
					logger.Warn("scheduled LLM task failed", "id", task.ID, "error", err)
				} else {
					logger.Info("scheduled LLM task completed", "id", task.ID, "tokens", resp.TokensOut)
				}
			}
		}
	})
	sched.Start()

	// API token for authentication (required in production)
	apiToken := os.Getenv("SECUREYEOMAN_EDGE_API_TOKEN")
	if apiToken == "" {
		logger.Warn("SECUREYEOMAN_EDGE_API_TOKEN not set — API endpoints are unauthenticated")
	}

	// Start HTTP server
	srv := NewServer(cfg.Host, cfg.Port, ServerDeps{
		Caps:      caps,
		A2A:       a2a,
		Metrics:   metricsCollector,
		Memory:    memory,
		Sandbox:   sandbox,
		Messenger: messenger,
		LLM:       llm,
		Scheduler: sched,
		APIToken:  apiToken,
	}, logger)
	if err := srv.Start(); err != nil {
		logger.Error("failed to start server", "error", err)
		return 1
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	printBanner(addr)

	// mDNS service advertisement + peer discovery
	mdnsSvc := NewMDNSService(caps.NodeID, caps.Hostname, cfg.Port, logger)
	if err := mdnsSvc.Start(); err != nil {
		logger.Warn("mDNS advertisement failed", "error", err)
	} else {
		logger.Info("mDNS advertising", "service", "_secureyeoman._tcp")
		mdnsSvc.StartDiscoveryLoop(a2a, 30*time.Second)
	}

	// Certificate pinning
	certPinner := NewCertPinner("", logger)

	// Auto-register with parent if configured
	parentURL := cfg.ParentURL
	if parentURL == "" {
		parentURL = os.Getenv("SECUREYEOMAN_PARENT_URL")
	}
	if parentURL != "" {
		// Pin parent cert on first registration (TOFU)
		if !certPinner.IsPinned() {
			if err := certPinner.Pin(parentURL); err != nil {
				logger.Warn("cert pinning failed (non-TLS parent?)", "error", err)
			} else {
				logger.Info("parent cert pinned", "hash", certPinner.PinnedHash()[:16]+"...")
			}
		}

		token := os.Getenv("SECUREYEOMAN_EDGE_TOKEN")
		peerID, err := RegisterWithParent(parentURL, token, caps, addr, logger)
		if err != nil {
			logger.Warn("failed to register with parent", "url", parentURL, "error", err)
		} else {
			logger.Info("registered with parent", "url", parentURL, "peerId", peerID)
		}

		// OTA self-update loop (check every hour)
		updater := NewUpdater(Version, logger)
		updater.StartUpdateLoop(parentURL, os.Getenv("SECUREYEOMAN_EDGE_TOKEN"), 1*time.Hour)
	}

	// Block until shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh

	logger.Info("shutting down", "signal", sig.String())
	sched.Stop()
	metricsCollector.Stop()
	mdnsSvc.Stop()
	if err := srv.Stop(); err != nil {
		logger.Error("shutdown error", "error", err)
		return 1
	}
	a2a.Stop()
	if err := memory.Flush(); err != nil {
		logger.Warn("memory flush error", "error", err)
	}
	logger.Info("shutdown complete")
	return 0
}

func runRegister(args []string) int {
	parentURL, token := parseRegisterFlags(args)
	if parentURL == "" {
		parentURL = os.Getenv("SECUREYEOMAN_PARENT_URL")
	}
	if token == "" {
		token = os.Getenv("SECUREYEOMAN_EDGE_TOKEN")
	}
	if parentURL == "" {
		fmt.Fprintln(os.Stderr, "Error: --parent <url> is required (or set SECUREYEOMAN_PARENT_URL)")
		return 1
	}

	logger := NewLogger("info")
	caps := DetectCapabilities()

	peerID, err := RegisterWithParent(parentURL, token, caps, "", logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Registration failed: %v\n", err)
		return 1
	}

	fmt.Printf("✓ Registered with %s\n  Peer ID: %s\n", parentURL, peerID)
	return 0
}

func runStatus() int {
	caps := DetectCapabilities()

	fmt.Println()
	fmt.Println("  SecureYeoman Edge Node")
	fmt.Println()
	fmt.Printf("  Node ID:    %s\n", caps.NodeID)
	fmt.Printf("  Hostname:   %s\n", caps.Hostname)
	fmt.Printf("  Arch:       %s\n", caps.Arch)
	fmt.Printf("  Platform:   %s\n", caps.Platform)
	fmt.Printf("  Memory:     %d MB\n", caps.TotalMemoryMB)
	fmt.Printf("  CPU Cores:  %d\n", caps.CPUCores)
	fmt.Printf("  GPU:        %v\n", formatBool(caps.HasGPU, "detected", "none"))
	fmt.Printf("  Tags:       %s\n", formatTags(caps.Tags))
	fmt.Printf("  Version:    %s\n", Version)
	fmt.Println()
	return 0
}

func printBanner(addr string) {
	fmt.Printf(`
  ╔═══════════════════════════════════════════════╗
  ║       SecureYeoman Edge %-17s      ║
  ║   Lightweight A2A Agent Runtime (Go)         ║
  ╚═══════════════════════════════════════════════╝

  Health:     http://%s/health
  Metrics:    http://%s/api/v1/metrics
  A2A:        http://%s/api/v1/a2a/receive
  LLM:        http://%s/api/v1/llm/complete
  Exec:       http://%s/api/v1/exec
  Memory:     http://%s/api/v1/memory
  Scheduler:  http://%s/api/v1/scheduler/tasks

`, "v"+Version, addr, addr, addr, addr, addr, addr, addr)
}

func formatBool(v bool, t, f string) string {
	if v {
		return t
	}
	return f
}

func formatTags(tags []string) string {
	if len(tags) == 0 {
		return "(none)"
	}
	s := ""
	for i, t := range tags {
		if i > 0 {
			s += ", "
		}
		s += t
	}
	return s
}
