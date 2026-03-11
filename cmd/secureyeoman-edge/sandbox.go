package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// SandboxConfig controls which commands may run and how output is bounded.
type SandboxConfig struct {
	WorkspaceDir    string   `json:"workspaceDir"`    // root directory for file access, default "."
	AllowedCommands []string `json:"allowedCommands"` // empty means allow all (subject to blocklist)
	BlockedCommands []string `json:"blockedCommands"` // always blocked regardless of allowlist
	MaxOutputBytes  int      `json:"maxOutputBytes"`  // default 1 MB
	TimeoutSeconds  int      `json:"timeoutSeconds"`  // default 30
	Enabled         bool     `json:"enabled"`
}

// ExecResult holds the outcome of a sandboxed command execution.
type ExecResult struct {
	Command   string `json:"command"`
	ExitCode  int    `json:"exitCode"`
	Stdout    string `json:"stdout"`
	Stderr    string `json:"stderr"`
	Duration  int64  `json:"durationMs"`
	Truncated bool   `json:"truncated,omitempty"`
}

// Sandbox enforces command allowlists and workspace path scoping.
type Sandbox struct {
	config SandboxConfig
	logger *Logger
}

var defaultAllowedCommands = []string{
	"ls", "cat", "head", "tail", "wc", "grep", "find",
	"df", "du", "uname", "hostname", "whoami", "date", "uptime",
	"ping", "curl", "wget", "ip", "ss", "ps", "top", "free",
	"lsblk", "lscpu", "sensors", "journalctl",
}

var defaultBlockedCommands = []string{
	"rm", "dd", "mkfs", "shutdown", "reboot", "poweroff", "halt",
	"init", "kill", "killall", "pkill", "mount", "umount",
	"fdisk", "parted", "iptables", "nft",
}

// NewSandbox creates a Sandbox with defaults applied for any zero-value fields.
func NewSandbox(config SandboxConfig, logger *Logger) *Sandbox {
	if config.WorkspaceDir == "" {
		config.WorkspaceDir = "."
	}
	if len(config.AllowedCommands) == 0 {
		config.AllowedCommands = defaultAllowedCommands
	}
	if len(config.BlockedCommands) == 0 {
		config.BlockedCommands = defaultBlockedCommands
	}
	if config.MaxOutputBytes <= 0 {
		config.MaxOutputBytes = 1 << 20 // 1 MB
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 30
	}
	return &Sandbox{config: config, logger: logger}
}

// ListAllowed returns the current allowlist of command binaries.
func (s *Sandbox) ListAllowed() []string {
	out := make([]string, len(s.config.AllowedCommands))
	copy(out, s.config.AllowedCommands)
	return out
}

// ValidateCommand checks whether a command string is permitted to run.
// It returns a non-nil error if the command is blocked, not on the allowlist,
// or contains path traversal outside the workspace.
func (s *Sandbox) ValidateCommand(command string) error {
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return fmt.Errorf("empty command")
	}

	binary := filepath.Base(fields[0])

	// Check blocklist first — these are always denied.
	for _, blocked := range s.config.BlockedCommands {
		if binary == blocked {
			return fmt.Errorf("command %q is blocked", binary)
		}
	}

	// Check allowlist when it is non-empty.
	if len(s.config.AllowedCommands) > 0 {
		allowed := false
		for _, a := range s.config.AllowedCommands {
			if binary == a {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("command %q is not in the allowlist", binary)
		}
	}

	// Reject path traversal in any argument.
	workspaceAbs, err := filepath.Abs(s.config.WorkspaceDir)
	if err != nil {
		return fmt.Errorf("cannot resolve workspace directory: %w", err)
	}
	for _, arg := range fields[1:] {
		if !s.isArgPathSafe(arg, workspaceAbs) {
			return fmt.Errorf("argument %q attempts path traversal outside workspace", arg)
		}
	}

	return nil
}

// isArgPathSafe returns false when arg looks like a path that resolves outside
// workspaceAbs. Bare flags and non-path tokens are left unrestricted.
func (s *Sandbox) isArgPathSafe(arg, workspaceAbs string) bool {
	// Only scrutinise tokens that contain path separators or ".."
	if !strings.Contains(arg, "/") && !strings.Contains(arg, "..") {
		return true
	}
	if strings.Contains(arg, "..") {
		cleaned := filepath.Clean(arg)
		if filepath.IsAbs(cleaned) {
			// Absolute path — must be inside workspace.
			return strings.HasPrefix(cleaned, workspaceAbs+string(filepath.Separator)) ||
				cleaned == workspaceAbs
		}
		// Relative path with ".." — join with workspace and verify.
		joined := filepath.Clean(filepath.Join(workspaceAbs, cleaned))
		return strings.HasPrefix(joined, workspaceAbs+string(filepath.Separator)) ||
			joined == workspaceAbs
	}
	return true
}

// IsPathAllowed reports whether path (absolute or relative) falls within the
// configured WorkspaceDir. Symlinks are resolved before the prefix check so
// that a symlink pointing outside the workspace is correctly rejected.
func (s *Sandbox) IsPathAllowed(path string) bool {
	workspaceAbs, err := filepath.Abs(s.config.WorkspaceDir)
	if err != nil {
		return false
	}
	// Resolve symlinks on the workspace root itself.
	if resolved, err := filepath.EvalSymlinks(workspaceAbs); err == nil {
		workspaceAbs = resolved
	}

	var absPath string
	if filepath.IsAbs(path) {
		absPath = filepath.Clean(path)
	} else {
		absPath = filepath.Clean(filepath.Join(workspaceAbs, path))
	}
	// Resolve symlinks on the target path before checking the prefix.
	if resolved, err := filepath.EvalSymlinks(absPath); err == nil {
		absPath = resolved
	}
	return absPath == workspaceAbs ||
		strings.HasPrefix(absPath, workspaceAbs+string(filepath.Separator))
}

// Execute runs a shell command inside the sandbox and returns its result.
// The sandbox must be Enabled; otherwise an error is returned immediately.
func (s *Sandbox) Execute(command string) (*ExecResult, error) {
	if !s.config.Enabled {
		return nil, fmt.Errorf("sandbox is disabled")
	}

	if err := s.ValidateCommand(command); err != nil {
		return nil, fmt.Errorf("command validation failed: %w", err)
	}

	timeout := time.Duration(s.config.TimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Split the command into binary + args for exec.CommandContext to avoid
	// shell injection. We deliberately do NOT use "sh -c" here.
	fields := strings.Fields(command)
	binary := fields[0]
	args := fields[1:]

	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Dir = s.config.WorkspaceDir

	// Inherit the current environment but override HOME to the workspace root.
	env := inheritEnvWithOverride("HOME", s.config.WorkspaceDir)
	cmd.Env = env

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			exitCode = -1
		} else {
			return nil, fmt.Errorf("exec error: %w", runErr)
		}
	}

	stdoutBytes := stdoutBuf.Bytes()
	stderrBytes := stderrBuf.Bytes()
	truncated := false

	if len(stdoutBytes)+len(stderrBytes) > s.config.MaxOutputBytes {
		truncated = true
		remaining := s.config.MaxOutputBytes
		if len(stdoutBytes) > remaining {
			stdoutBytes = stdoutBytes[:remaining]
			remaining = 0
		} else {
			remaining -= len(stdoutBytes)
		}
		if len(stderrBytes) > remaining {
			stderrBytes = stderrBytes[:remaining]
		}
	}

	result := &ExecResult{
		Command:   command,
		ExitCode:  exitCode,
		Stdout:    string(stdoutBytes),
		Stderr:    string(stderrBytes),
		Duration:  durationMs,
		Truncated: truncated,
	}

	s.logger.Debug("sandbox exec",
		"command", command,
		"exitCode", exitCode,
		"durationMs", durationMs,
		"truncated", truncated,
	)

	return result, nil
}

// inheritEnvWithOverride returns os.Environ() with key set to value.
func inheritEnvWithOverride(key, value string) []string {
	prefix := key + "="
	base := make([]string, 0, 32)
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, prefix) {
			base = append(base, e)
		}
	}
	base = append(base, prefix+value)
	return base
}
