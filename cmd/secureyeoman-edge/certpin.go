package main

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const pinFileName = "parent-cert-pin.hex"

// CertPinner implements trust-on-first-use (TOFU) certificate pinning for
// outbound TLS connections to the parent SecureYeoman instance.
type CertPinner struct {
	pinnedHash string // hex-encoded SHA-256 of parent's DER-encoded leaf cert
	pinFile    string // absolute path to the on-disk pin file
	logger     *Logger
}

// NewCertPinner creates a CertPinner rooted at pinDir. If a pin file already
// exists it is loaded; the pinner is considered pinned immediately.
func NewCertPinner(pinDir string, logger *Logger) *CertPinner {
	if pinDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "/tmp"
		}
		pinDir = filepath.Join(home, ".secureyeoman-edge")
		if err := os.MkdirAll(pinDir, 0o700); err != nil {
			pinDir = filepath.Join("/tmp", ".secureyeoman-edge")
			_ = os.MkdirAll(pinDir, 0o700)
		}
	}
	p := &CertPinner{
		pinFile: filepath.Join(pinDir, pinFileName),
		logger:  logger,
	}

	if data, err := os.ReadFile(p.pinFile); err == nil {
		hash := strings.TrimSpace(string(data))
		if len(hash) == 64 { // 32 bytes × 2 hex chars
			p.pinnedHash = hash
			logger.Info("certpin: loaded existing pin %s", hash[:16]+"…")
		} else {
			logger.Warn("certpin: pin file contains unexpected data, ignoring")
		}
	}

	return p
}

// IsPinned reports whether a certificate hash has been recorded.
func (c *CertPinner) IsPinned() bool {
	return c.pinnedHash != ""
}

// PinnedHash returns the current pin (hex string) or an empty string if not
// yet pinned.
func (c *CertPinner) PinnedHash() string {
	return c.pinnedHash
}

// ClearPin removes the on-disk pin file and resets the in-memory hash. Use
// this before re-registering the edge node with a new parent.
func (c *CertPinner) ClearPin() error {
	if err := os.Remove(c.pinFile); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("certpin: remove pin file: %w", err)
	}
	c.pinnedHash = ""
	c.logger.Info("certpin: pin cleared")
	return nil
}

// Verify checks whether any certificate in chain matches the stored pin. It
// returns an error if the pinner is not yet pinned or if no certificate
// matches.
func (c *CertPinner) Verify(certs []*x509.Certificate) error {
	if !c.IsPinned() {
		return fmt.Errorf("certpin: no pin stored; call Pin() first")
	}
	for _, cert := range certs {
		digest := sha256.Sum256(cert.Raw)
		if hex.EncodeToString(digest[:]) == c.pinnedHash {
			return nil
		}
	}
	return fmt.Errorf("certpin: certificate does not match pinned hash %s", c.pinnedHash[:16]+"…")
}

// Pin connects to parentURL, captures the SHA-256 hash of the leaf
// certificate, and persists it to disk. On a first-time call (TOFU) the hash
// is accepted unconditionally. If a pin already exists and the remote cert
// does not match, an error is returned — the existing pin is preserved.
func (c *CertPinner) Pin(parentURL string) error {
	var captured string

	// Build a one-shot client that captures the leaf cert hash but does NOT
	// enforce pinning (we are establishing the pin here).
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				//nolint:gosec // InsecureSkipVerify is intentional during pin capture;
				// we authenticate via the hash we record, not the CA chain.
				InsecureSkipVerify: true,
				VerifyPeerCertificate: func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
					if len(rawCerts) == 0 {
						return fmt.Errorf("certpin: server presented no certificates")
					}
					digest := sha256.Sum256(rawCerts[0])
					captured = hex.EncodeToString(digest[:])
					return nil
				},
			},
		},
	}

	resp, err := client.Get(parentURL)
	if err != nil {
		return fmt.Errorf("certpin: connect to parent for pinning: %w", err)
	}
	resp.Body.Close()

	if captured == "" {
		return fmt.Errorf("certpin: failed to capture certificate hash")
	}

	// TOFU: if already pinned, the new hash must match.
	if c.IsPinned() {
		if c.pinnedHash != captured {
			return fmt.Errorf(
				"certpin: remote certificate hash %s does not match stored pin %s; call ClearPin() to re-pin",
				captured[:16]+"…", c.pinnedHash[:16]+"…",
			)
		}
		c.logger.Info("certpin: certificate matches existing pin")
		return nil
	}

	// First-time pin: persist to disk then update memory.
	if err := os.MkdirAll(filepath.Dir(c.pinFile), 0o700); err != nil {
		return fmt.Errorf("certpin: create pin directory: %w", err)
	}
	if err := os.WriteFile(c.pinFile, []byte(captured), 0o600); err != nil {
		return fmt.Errorf("certpin: write pin file: %w", err)
	}

	c.pinnedHash = captured
	c.logger.Info("certpin: pinned certificate hash %s (TOFU)", captured[:16]+"…")
	return nil
}

// PinnedClient returns an *http.Client configured to verify the parent's TLS
// certificate against the stored pin on every request. The returned client has
// a 10-second timeout. PinnedClient panics if the pinner is not yet pinned;
// call Pin() first.
func (c *CertPinner) PinnedClient() *http.Client {
	if !c.IsPinned() {
		panic("certpin: PinnedClient called before a pin was established")
	}

	pin := c.pinnedHash // capture for closure

	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				VerifyPeerCertificate: func(rawCerts [][]byte, _ [][]*x509.Certificate) error {
					if len(rawCerts) == 0 {
						return fmt.Errorf("certpin: server presented no certificates")
					}
					digest := sha256.Sum256(rawCerts[0])
					got := hex.EncodeToString(digest[:])
					if got != pin {
						return fmt.Errorf(
							"certpin: certificate pin mismatch (got %s, want %s)",
							got[:16]+"…", pin[:16]+"…",
						)
					}
					return nil
				},
			},
		},
	}
}
