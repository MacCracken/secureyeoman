package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCertPinnerNotPinned(t *testing.T) {
	dir := t.TempDir()
	p := NewCertPinner(dir, newTestLogger())
	if p.IsPinned() {
		t.Error("expected new pinner to not be pinned")
	}
}

func TestCertPinnerPinnedHash(t *testing.T) {
	dir := t.TempDir()
	p := NewCertPinner(dir, newTestLogger())
	if hash := p.PinnedHash(); hash != "" {
		t.Errorf("expected empty hash when not pinned, got %q", hash)
	}
}

func TestCertPinnerClearPin(t *testing.T) {
	dir := t.TempDir()
	p := NewCertPinner(dir, newTestLogger())

	// ClearPin on an unpinned pinner should succeed with no error.
	if err := p.ClearPin(); err != nil {
		t.Errorf("expected no error clearing unpinned pinner, got: %v", err)
	}
	if p.IsPinned() {
		t.Error("expected pinner to still be unpinned after ClearPin")
	}
}

func TestCertPinnerLoadsExistingPin(t *testing.T) {
	dir := t.TempDir()
	// Write a valid 64-char hex pin file.
	validHash := "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
	pinPath := filepath.Join(dir, pinFileName)
	if err := os.WriteFile(pinPath, []byte(validHash), 0o600); err != nil {
		t.Fatalf("failed to write pin file: %v", err)
	}

	p := NewCertPinner(dir, newTestLogger())
	if !p.IsPinned() {
		t.Error("expected pinner to be pinned after loading existing pin file")
	}
	if p.PinnedHash() != validHash {
		t.Errorf("expected hash %q, got %q", validHash, p.PinnedHash())
	}
}
