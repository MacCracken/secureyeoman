package main

import (
	"os"
	"strings"
	"testing"
)

func newTestSandbox(cfg SandboxConfig) *Sandbox {
	return NewSandbox(cfg, NewLogger("error"))
}

func TestSandboxAllowedCommand(t *testing.T) {
	sb := newTestSandbox(SandboxConfig{Enabled: true})

	result, err := sb.Execute("uname")
	if err != nil {
		t.Fatalf("expected uname to execute successfully, got error: %v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d (stderr: %s)", result.ExitCode, result.Stderr)
	}
	if strings.TrimSpace(result.Stdout) == "" {
		t.Error("expected non-empty stdout from uname")
	}
}

func TestSandboxBlockedCommand(t *testing.T) {
	sb := newTestSandbox(SandboxConfig{Enabled: true})

	_, err := sb.Execute("rm -rf /tmp/whatever")
	if err == nil {
		t.Fatal("expected rm to be blocked, but got no error")
	}
	if !strings.Contains(err.Error(), "blocked") {
		t.Errorf("expected error message to mention 'blocked', got: %v", err)
	}
}

func TestSandboxDisabled(t *testing.T) {
	sb := newTestSandbox(SandboxConfig{Enabled: false})

	_, err := sb.Execute("uname")
	if err == nil {
		t.Fatal("expected disabled sandbox to reject all commands, but got no error")
	}
	if !strings.Contains(err.Error(), "disabled") {
		t.Errorf("expected 'disabled' in error, got: %v", err)
	}
}

func TestSandboxUnknownCommand(t *testing.T) {
	sb := newTestSandbox(SandboxConfig{Enabled: true})

	// "git" is not in the default allowlist
	_, err := sb.Execute("git status")
	if err == nil {
		t.Fatal("expected unknown command to be rejected, but got no error")
	}
	if !strings.Contains(err.Error(), "allowlist") {
		t.Errorf("expected 'allowlist' in error, got: %v", err)
	}
}

func TestSandboxTimeout(t *testing.T) {
	sb := newTestSandbox(SandboxConfig{
		Enabled:         true,
		TimeoutSeconds:  1,
		AllowedCommands: []string{"sleep"},
		BlockedCommands: []string{},
	})

	result, err := sb.Execute("sleep 10")
	// Execute may return an error or a result with non-zero exit code when the
	// context deadline is exceeded — both are acceptable outcomes.
	if err == nil {
		if result.ExitCode == 0 {
			t.Fatal("expected sleep 10 to be killed by 1s timeout, but it succeeded")
		}
	}
	// Either a returned error or a non-zero exit code confirms the timeout fired.
}

func TestIsPathAllowed(t *testing.T) {
	dir, err := os.MkdirTemp("", "sandbox-ws-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(dir)

	sb := newTestSandbox(SandboxConfig{WorkspaceDir: dir, Enabled: true})

	// Path inside workspace should be allowed.
	inside := dir + "/subdir/file.txt"
	if !sb.IsPathAllowed(inside) {
		t.Errorf("expected path inside workspace to be allowed: %s", inside)
	}

	// Workspace root itself should be allowed.
	if !sb.IsPathAllowed(dir) {
		t.Errorf("expected workspace root to be allowed: %s", dir)
	}

	// Path outside workspace should be rejected.
	outside := "/etc/passwd"
	if sb.IsPathAllowed(outside) {
		t.Errorf("expected path outside workspace to be rejected: %s", outside)
	}
}

func TestIsPathAllowedTraversal(t *testing.T) {
	dir, err := os.MkdirTemp("", "sandbox-ws-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(dir)

	sb := newTestSandbox(SandboxConfig{WorkspaceDir: dir, Enabled: true})

	// Traversal path should be rejected.
	traversal := "../../../etc/passwd"
	if sb.IsPathAllowed(traversal) {
		t.Errorf("expected traversal path %q to be rejected", traversal)
	}
}

func TestSandboxOutputTruncation(t *testing.T) {
	// Use a command that produces a predictable large output.
	// We generate large stdout via "head -c <N> /dev/zero" which is in neither
	// default blocked list, but may not be on the default allowlist either.
	// Instead, use a custom sandbox with "cat" allowed and pipe via a file.
	dir, err := os.MkdirTemp("", "sandbox-trunc-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(dir)

	// Write a file with 2 MB of 'A' characters.
	bigFile := dir + "/big.txt"
	data := strings.Repeat("A", 2*1024*1024)
	if writeErr := os.WriteFile(bigFile, []byte(data), 0644); writeErr != nil {
		t.Fatalf("failed to write big file: %v", writeErr)
	}

	maxBytes := 512 * 1024 // 512 KB cap
	sb := newTestSandbox(SandboxConfig{
		Enabled:         true,
		WorkspaceDir:    dir,
		AllowedCommands: []string{"cat"},
		BlockedCommands: []string{},
		MaxOutputBytes:  maxBytes,
	})

	result, err := sb.Execute("cat big.txt")
	if err != nil {
		t.Fatalf("unexpected error executing cat: %v", err)
	}
	if !result.Truncated {
		t.Error("expected Truncated=true for output exceeding MaxOutputBytes")
	}
	totalOut := len(result.Stdout) + len(result.Stderr)
	if totalOut > maxBytes {
		t.Errorf("combined output (%d bytes) exceeds MaxOutputBytes (%d)", totalOut, maxBytes)
	}
}
