package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newSilentLogger() *Logger {
	return NewLogger("error")
}

func TestMemorySetAndGet(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("ns", "key1", "hello", 0)
	got, ok := ms.Get("ns", "key1")
	if !ok {
		t.Fatal("expected Get to return true")
	}
	if got != "hello" {
		t.Fatalf("expected 'hello', got %q", got)
	}
}

func TestMemoryGetMissing(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	_, ok := ms.Get("ns", "nonexistent")
	if ok {
		t.Fatal("expected Get to return false for missing key")
	}
}

func TestMemoryDelete(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("ns", "key1", "value", 0)
	deleted := ms.Delete("ns", "key1")
	if !deleted {
		t.Fatal("expected Delete to return true")
	}

	_, ok := ms.Get("ns", "key1")
	if ok {
		t.Fatal("expected Get to return false after Delete")
	}

	// Deleting again should return false
	deleted2 := ms.Delete("ns", "key1")
	if deleted2 {
		t.Fatal("expected second Delete to return false")
	}
}

func TestMemoryTTLExpiry(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("ns", "expiring", "value", 1) // 1-second TTL

	// Should still be present immediately
	_, ok := ms.Get("ns", "expiring")
	if !ok {
		t.Fatal("expected key to be present before TTL expiry")
	}

	time.Sleep(1100 * time.Millisecond)

	_, ok = ms.Get("ns", "expiring")
	if ok {
		t.Fatal("expected key to be expired after TTL")
	}
}

func TestMemoryListNamespaces(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("alpha", "k1", "v1", 0)
	ms.Set("beta", "k2", "v2", 0)
	ms.Set("gamma", "k3", "v3", 0)

	namespaces := ms.ListNamespaces()
	if len(namespaces) != 3 {
		t.Fatalf("expected 3 namespaces, got %d: %v", len(namespaces), namespaces)
	}

	// ListNamespaces returns alphabetical order
	want := []string{"alpha", "beta", "gamma"}
	for i, ns := range namespaces {
		if ns != want[i] {
			t.Errorf("namespace[%d]: expected %q, got %q", i, want[i], ns)
		}
	}
}

func TestMemoryList(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("myns", "a", "val-a", 0)
	ms.Set("myns", "b", "val-b", 0)
	ms.Set("myns", "c", "val-c", 0)
	// Entry in a different namespace — must not appear in List("myns")
	ms.Set("other", "x", "val-x", 0)

	entries := ms.List("myns")
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries in namespace 'myns', got %d", len(entries))
	}

	keys := make(map[string]bool)
	for _, e := range entries {
		keys[e.Key] = true
		if e.Namespace != "myns" {
			t.Errorf("entry has wrong namespace: %q", e.Namespace)
		}
	}
	for _, k := range []string{"a", "b", "c"} {
		if !keys[k] {
			t.Errorf("missing key %q in List result", k)
		}
	}
}

func TestMemorySearch(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	ms.Set("ns", "apple-key", "some value", 0)
	ms.Set("ns", "banana-key", "apple sauce", 0)
	ms.Set("ns", "cherry-key", "cherry pie", 0)
	// Different namespace — must not appear in results
	ms.Set("other", "apple-other", "irrelevant", 0)

	results := ms.Search("ns", "apple")
	if len(results) != 2 {
		t.Fatalf("expected 2 results for 'apple', got %d", len(results))
	}
	for _, e := range results {
		combined := strings.ToLower(e.Key) + strings.ToLower(e.Value)
		if !strings.Contains(combined, "apple") {
			t.Errorf("result key=%q value=%q does not contain 'apple'", e.Key, e.Value)
		}
		if e.Namespace != "ns" {
			t.Errorf("result has wrong namespace: %q", e.Namespace)
		}
	}

	// Search must be case-insensitive
	resultsUpper := ms.Search("ns", "CHERRY")
	if len(resultsUpper) != 1 {
		t.Fatalf("expected 1 result for 'CHERRY', got %d", len(resultsUpper))
	}
}

func TestMemoryPersistence(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "mem.json")

	ms1 := NewMemoryStore(filePath, newSilentLogger())
	ms1.Set("ns", "persistent", "I survive", 0)
	if err := ms1.Flush(); err != nil {
		t.Fatalf("Flush failed: %v", err)
	}

	// Create a second store from the same file — it must reload the persisted data.
	ms2 := NewMemoryStore(filePath, newSilentLogger())
	got, ok := ms2.Get("ns", "persistent")
	if !ok {
		t.Fatal("expected persisted key to be present after reload")
	}
	if got != "I survive" {
		t.Fatalf("expected 'I survive', got %q", got)
	}
}

func TestMemoryMaxValueSize(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	// Build a value that exceeds maxValueSize (1 MB)
	bigValue := strings.Repeat("x", maxValueSize+1)
	ms.Set("ns", "big", bigValue, 0)

	_, ok := ms.Get("ns", "big")
	if ok {
		t.Fatal("expected oversized value to be silently rejected")
	}
}

func TestMemoryMaxEntries(t *testing.T) {
	dir := t.TempDir()
	ms := NewMemoryStore(filepath.Join(dir, "mem.json"), newSilentLogger())

	// Directly populate ms.data to avoid 10 000 individual Flush() calls.
	now := time.Now().UnixMilli()
	ms.mu.Lock()
	for i := 0; i < maxStoreEntries; i++ {
		k := fmt.Sprintf("key-%d", i)
		ek := entryKey("ns", k)
		ms.data[ek] = &MemoryEntry{
			Key:       k,
			Value:     "v",
			Namespace: "ns",
			CreatedAt: now,
			UpdatedAt: now,
		}
	}
	ms.mu.Unlock()

	// Verify store is at capacity
	entries := ms.List("ns")
	if len(entries) != maxStoreEntries {
		t.Fatalf("expected %d entries, got %d", maxStoreEntries, len(entries))
	}

	// One more entry via the public API must be silently rejected
	ms.Set("ns", "overflow-key", "overflow-value", 0)
	_, ok := ms.Get("ns", "overflow-key")
	if ok {
		t.Fatal("expected entry beyond maxStoreEntries to be silently rejected")
	}
}
