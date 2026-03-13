package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Updater handles OTA self-update of the edge binary.
type Updater struct {
	currentVersion string
	binaryPath     string
	client         *http.Client
	logger         *Logger
}

// UpdateInfo describes the result of an update check.
type UpdateInfo struct {
	Available        bool   `json:"available"`
	CurrentVersion   string `json:"currentVersion"`
	LatestVersion    string `json:"latestVersion,omitempty"`
	DownloadURL      string `json:"downloadURL,omitempty"`
	Size             int64  `json:"size,omitempty"`
	SHA256           string `json:"sha256,omitempty"`
	Ed25519Signature string `json:"ed25519Signature,omitempty"` // hex-encoded Ed25519 signature (Phase 14C)
	Ed25519PublicKey string `json:"ed25519PublicKey,omitempty"` // hex-encoded Ed25519 public key
}

// NewUpdater creates an Updater for the currently running binary.
// binaryPath is resolved via os.Executable(); symlinks are followed.
func NewUpdater(currentVersion string, logger *Logger) *Updater {
	exe, err := os.Executable()
	if err != nil {
		logger.Warn("updater: could not resolve executable path", "error", err)
		exe = os.Args[0]
	}
	// Follow symlinks so we replace the real file, not a symlink target stub.
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return &Updater{
		currentVersion: currentVersion,
		binaryPath:     exe,
		client:         &http.Client{Timeout: 30 * time.Second},
		logger:         logger,
	}
}

// CheckUpdate queries the parent SY instance for a newer edge binary.
// Endpoint: GET {parentURL}/api/v1/edge/updates/check?version=X&arch=Y&os=Z
func (u *Updater) CheckUpdate(parentURL, token string) (*UpdateInfo, error) {
	parentURL = strings.TrimRight(parentURL, "/")
	url := fmt.Sprintf(
		"%s/api/v1/edge/updates/check?version=%s&arch=%s&os=%s",
		parentURL,
		u.currentVersion,
		runtime.GOARCH,
		runtime.GOOS,
	)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("updater: build request: %w", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := u.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("updater: check request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("updater: check returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var info UpdateInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("updater: decode response: %w", err)
	}
	info.CurrentVersion = u.currentVersion
	return &info, nil
}

// DownloadAndApply downloads the new binary described by info, verifies its
// SHA256 checksum, and atomically replaces the running binary.
//
// Swap sequence:
//  1. Download to <binaryPath>.new
//  2. Verify SHA256 (if info.SHA256 is non-empty)
//  3. Rename current binary to <binaryPath>.old
//  4. Rename <binaryPath>.new to <binaryPath>
//  5. chmod 0755
//
// On any failure after step 1, temp files are removed and the running binary
// is left untouched.  The process is NOT restarted — the supervisor (systemd,
// argonaut, etc.) is expected to detect the replaced binary and restart.
func (u *Updater) DownloadAndApply(info *UpdateInfo, token string) error {
	if !info.Available || info.DownloadURL == "" {
		return fmt.Errorf("updater: no update available")
	}

	dir := filepath.Dir(u.binaryPath)
	base := filepath.Base(u.binaryPath)
	tmpPath := filepath.Join(dir, base+".new")
	oldPath := filepath.Join(dir, base+".old")

	// Clean up any leftover temp file from a previous failed attempt.
	_ = os.Remove(tmpPath)

	if err := u.downloadTo(info.DownloadURL, token, tmpPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}

	if info.SHA256 != "" {
		if err := verifySHA256(tmpPath, info.SHA256); err != nil {
			_ = os.Remove(tmpPath)
			return fmt.Errorf("updater: checksum mismatch: %w", err)
		}
		u.logger.Info("updater: SHA256 verified", "hash", info.SHA256)
	} else {
		u.logger.Warn("updater: no SHA256 provided — skipping integrity check")
	}

	// Ed25519 signature verification (Phase 14C)
	if info.Ed25519Signature != "" && info.Ed25519PublicKey != "" {
		if err := verifyEd25519(tmpPath, info.Ed25519Signature, info.Ed25519PublicKey); err != nil {
			_ = os.Remove(tmpPath)
			return fmt.Errorf("updater: Ed25519 signature invalid: %w", err)
		}
		u.logger.Info("updater: Ed25519 signature verified")
	}

	// Set executable permissions on the new binary before swapping.
	if err := os.Chmod(tmpPath, 0755); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("updater: chmod new binary: %w", err)
	}

	// Backup the current binary.
	if err := os.Rename(u.binaryPath, oldPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("updater: backup current binary: %w", err)
	}

	// Atomic replace.
	if err := os.Rename(tmpPath, u.binaryPath); err != nil {
		// Attempt to roll back.
		if rbErr := os.Rename(oldPath, u.binaryPath); rbErr != nil {
			u.logger.Error("updater: CRITICAL — rollback failed; binary may be missing",
				"rollback_error", rbErr, "backup", oldPath)
		}
		return fmt.Errorf("updater: replace binary: %w", err)
	}

	u.logger.Info("updater: update applied — awaiting supervisor restart",
		"from", u.currentVersion,
		"to", info.LatestVersion,
		"binary", u.binaryPath,
		"backup", oldPath,
	)
	return nil
}

// StartUpdateLoop periodically checks for updates and applies them automatically.
// It runs in its own goroutine and does not block the caller.
// If parentURL or token are empty the loop exits immediately.
func (u *Updater) StartUpdateLoop(parentURL, token string, interval time.Duration) {
	if parentURL == "" {
		u.logger.Debug("updater: no parent URL configured — update loop disabled")
		return
	}
	if interval <= 0 {
		interval = time.Hour
	}
	go func() {
		u.logger.Info("updater: update loop started", "interval", interval.String(), "parent", parentURL)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			info, err := u.CheckUpdate(parentURL, token)
			if err != nil {
				u.logger.Warn("updater: check failed", "error", err)
				continue
			}
			if !info.Available {
				u.logger.Debug("updater: already up to date", "version", u.currentVersion)
				continue
			}
			u.logger.Info("updater: new version available",
				"current", info.CurrentVersion,
				"latest", info.LatestVersion,
			)
			if err := u.DownloadAndApply(info, token); err != nil {
				u.logger.Error("updater: apply failed", "error", err)
			}
		}
	}()
}

// downloadTo streams the binary at url into destPath using a temp write pattern.
func (u *Updater) downloadTo(url, token, destPath string) error {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("updater: build download request: %w", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	// Use a longer timeout for potentially large binaries.
	dlClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := dlClient.Do(req)
	if err != nil {
		return fmt.Errorf("updater: download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("updater: download returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	f, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("updater: create temp file: %w", err)
	}
	defer f.Close()

	written, err := io.Copy(f, resp.Body)
	if err != nil {
		return fmt.Errorf("updater: write download: %w", err)
	}
	u.logger.Info("updater: download complete", "bytes", written, "dest", destPath)
	return nil
}

// verifySHA256 reads the file at path and checks its SHA-256 against expected
// (hex-encoded, case-insensitive).
func verifySHA256(path, expected string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return fmt.Errorf("hash: %w", err)
	}
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, expected) {
		return fmt.Errorf("got %s, want %s", got, expected)
	}
	return nil
}

// verifyEd25519 reads the file at path and verifies its Ed25519 signature.
// Both signature and publicKey are hex-encoded strings.
func verifyEd25519(path, signatureHex, publicKeyHex string) error {
	pubKeyBytes, err := hex.DecodeString(publicKeyHex)
	if err != nil {
		return fmt.Errorf("decode public key: %w", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: got %d, want %d", len(pubKeyBytes), ed25519.PublicKeySize)
	}

	sigBytes, err := hex.DecodeString(signatureHex)
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}
	if len(sigBytes) != ed25519.SignatureSize {
		return fmt.Errorf("invalid signature size: got %d, want %d", len(sigBytes), ed25519.SignatureSize)
	}

	// Read file and verify signature over raw bytes
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	content, err := io.ReadAll(f)
	if err != nil {
		return fmt.Errorf("read: %w", err)
	}

	if !ed25519.Verify(ed25519.PublicKey(pubKeyBytes), content, sigBytes) {
		return fmt.Errorf("signature verification failed")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Server handler
// ---------------------------------------------------------------------------

// handleUpdateCheck returns the current edge version and confirms that the
// update endpoint is reachable.  It does not perform a live update check
// (that requires parent URL context available only at startup).
func (s *Server) handleUpdateCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"version":         Version,
		"updateSupported": true,
	})
}
