package main

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestDetectCapabilities(t *testing.T) {
	caps := DetectCapabilities()

	if caps.NodeID == "" {
		t.Error("expected non-empty NodeID")
	}
	if caps.Hostname == "" {
		t.Error("expected non-empty Hostname")
	}
	if caps.Arch == "" {
		t.Error("expected non-empty Arch")
	}
	if caps.Platform == "" {
		t.Error("expected non-empty Platform")
	}
	if caps.CPUCores <= 0 {
		t.Errorf("expected positive CPUCores, got %d", caps.CPUCores)
	}
}

func TestGenerateNodeID(t *testing.T) {
	hostname, err := os.Hostname()
	if err != nil {
		t.Skipf("cannot determine hostname: %v", err)
	}

	id1 := generateNodeID(hostname)
	id2 := generateNodeID(hostname)

	if id1 == "" {
		t.Fatal("expected non-empty node ID")
	}
	if id1 != id2 {
		t.Errorf("generateNodeID must be deterministic: got %q then %q", id1, id2)
	}

	// IDs for different hostnames must differ.
	idOther := generateNodeID("completely-different-host-xyz")
	if id1 == idOther {
		t.Error("expected different IDs for different hostnames")
	}

	// Result should be a 16-character hex string (8 bytes → 16 hex chars).
	if len(id1) != 16 {
		t.Errorf("expected 16-char hex node ID, got %d chars: %q", len(id1), id1)
	}
}

func TestBuildTags(t *testing.T) {
	t.Run("GPU tag present when hasGPU=true", func(t *testing.T) {
		tags := buildTags(true, 1024)
		if !containsTag(tags, "gpu") {
			t.Errorf("expected 'gpu' tag, got %v", tags)
		}
	})

	t.Run("GPU tag absent when hasGPU=false", func(t *testing.T) {
		tags := buildTags(false, 1024)
		if containsTag(tags, "gpu") {
			t.Errorf("expected no 'gpu' tag, got %v", tags)
		}
	})

	t.Run("high-memory tag when totalMemMB > 4096", func(t *testing.T) {
		tags := buildTags(false, 8192)
		if !containsTag(tags, "high-memory") {
			t.Errorf("expected 'high-memory' tag for 8192 MB, got %v", tags)
		}
	})

	t.Run("no high-memory tag when totalMemMB <= 4096", func(t *testing.T) {
		tags := buildTags(false, 4096)
		if containsTag(tags, "high-memory") {
			t.Errorf("expected no 'high-memory' tag for exactly 4096 MB, got %v", tags)
		}
	})

	t.Run("multi-core tag when NumCPU >= 4", func(t *testing.T) {
		if runtime.NumCPU() >= 4 {
			tags := buildTags(false, 1024)
			if !containsTag(tags, "multi-core") {
				t.Errorf("expected 'multi-core' tag on %d-core machine, got %v", runtime.NumCPU(), tags)
			}
		} else {
			t.Skipf("skipping multi-core test: only %d CPU(s) available", runtime.NumCPU())
		}
	})

	t.Run("arch tag always present", func(t *testing.T) {
		tags := buildTags(false, 1024)
		if !containsTag(tags, runtime.GOARCH) {
			t.Errorf("expected arch tag %q, got %v", runtime.GOARCH, tags)
		}
	})

	t.Run("custom env tags appended", func(t *testing.T) {
		t.Setenv("SECUREYEOMAN_EDGE_TAGS", "custom-a, custom-b")
		tags := buildTags(false, 1024)
		if !containsTag(tags, "custom-a") {
			t.Errorf("expected 'custom-a' tag, got %v", tags)
		}
		if !containsTag(tags, "custom-b") {
			t.Errorf("expected 'custom-b' tag, got %v", tags)
		}
	})
}

// containsTag is a helper that reports whether tags contains target (case-sensitive).
func containsTag(tags []string, target string) bool {
	for _, tag := range tags {
		if strings.EqualFold(tag, target) {
			return true
		}
	}
	return false
}
