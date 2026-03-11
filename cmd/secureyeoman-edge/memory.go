package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxValueSize = 1 << 20   // 1 MB per value
const maxStoreEntries = 10_000 // max entries across all namespaces

// MemoryEntry is a single key-value record held in the store.
type MemoryEntry struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Namespace string `json:"namespace"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	TTL       int64  `json:"ttl,omitempty"` // 0 = no expiry, else unix millis deadline
}

// isExpired reports whether the entry has passed its TTL deadline.
func (e *MemoryEntry) isExpired() bool {
	return e.TTL != 0 && time.Now().UnixMilli() > e.TTL
}

// entryKey returns the internal map key for a namespace + key pair.
func entryKey(namespace, key string) string {
	return namespace + "\x00" + key
}

// MemoryStore is a thread-safe, persistent key-value store backed by a JSON file.
type MemoryStore struct {
	mu       sync.RWMutex
	data     map[string]*MemoryEntry
	filePath string
	logger   *Logger
}

// NewMemoryStore creates (or loads) a MemoryStore at filePath.
// If filePath is empty it defaults to ~/.secureyeoman-edge/memory.json.
func NewMemoryStore(filePath string, logger *Logger) *MemoryStore {
	if filePath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "/tmp"
		}
		dir := filepath.Join(home, ".secureyeoman-edge")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			// Home not writable (e.g. container) — fall back to /tmp
			dir = filepath.Join("/tmp", ".secureyeoman-edge")
			_ = os.MkdirAll(dir, 0o700)
		}
		filePath = filepath.Join(dir, "memory.json")
	}

	ms := &MemoryStore{
		data:     make(map[string]*MemoryEntry),
		filePath: filePath,
		logger:   logger,
	}

	if err := os.MkdirAll(filepath.Dir(filePath), 0o700); err != nil {
		logger.Warn("memory: could not create directory", "path", filepath.Dir(filePath), "err", err)
	}

	if err := ms.load(); err != nil && !os.IsNotExist(err) {
		logger.Warn("memory: could not load from disk", "path", filePath, "err", err)
	}

	ms.cleanup()
	ms.startCleanupLoop(5 * time.Minute)
	return ms
}

// load reads the JSON file into ms.data. Caller must NOT hold the lock.
func (ms *MemoryStore) load() error {
	f, err := os.Open(ms.filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	var entries []*MemoryEntry
	if err := json.NewDecoder(f).Decode(&entries); err != nil {
		return err
	}

	ms.mu.Lock()
	defer ms.mu.Unlock()
	ms.data = make(map[string]*MemoryEntry, len(entries))
	for _, e := range entries {
		ms.data[entryKey(e.Namespace, e.Key)] = e
	}
	return nil
}

// Flush writes the current in-memory state to disk atomically.
func (ms *MemoryStore) Flush() error {
	ms.mu.RLock()
	entries := make([]*MemoryEntry, 0, len(ms.data))
	for _, e := range ms.data {
		entries = append(entries, e)
	}
	ms.mu.RUnlock()

	tmp := ms.filePath + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(entries); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, ms.filePath)
}

// Set stores a value under namespace/key with an optional TTL in seconds.
// A ttlSeconds of 0 means the entry never expires.
// Values exceeding maxValueSize are silently rejected. New entries are
// rejected when the store already holds maxStoreEntries entries.
func (ms *MemoryStore) Set(namespace, key, value string, ttlSeconds int) {
	if len(value) > maxValueSize {
		return // silently reject oversized values
	}

	now := time.Now().UnixMilli()
	var ttlDeadline int64
	if ttlSeconds > 0 {
		ttlDeadline = now + int64(ttlSeconds)*1000
	}

	k := entryKey(namespace, key)

	ms.mu.Lock()
	if existing, ok := ms.data[k]; ok {
		existing.Value = value
		existing.UpdatedAt = now
		existing.TTL = ttlDeadline
	} else {
		if len(ms.data) >= maxStoreEntries {
			ms.mu.Unlock()
			return // silently reject when store is at capacity
		}
		ms.data[k] = &MemoryEntry{
			Key:       key,
			Value:     value,
			Namespace: namespace,
			CreatedAt: now,
			UpdatedAt: now,
			TTL:       ttlDeadline,
		}
	}
	ms.mu.Unlock()

	if err := ms.Flush(); err != nil {
		ms.logger.Warn("memory: flush after Set failed", "err", err)
	}
}

// Get retrieves a value by namespace and key, honouring TTL expiry.
func (ms *MemoryStore) Get(namespace, key string) (string, bool) {
	ms.mu.RLock()
	e, ok := ms.data[entryKey(namespace, key)]
	ms.mu.RUnlock()

	if !ok || e.isExpired() {
		return "", false
	}
	return e.Value, true
}

// Delete removes an entry. Returns true if an entry was present and removed.
func (ms *MemoryStore) Delete(namespace, key string) bool {
	k := entryKey(namespace, key)

	ms.mu.Lock()
	_, ok := ms.data[k]
	if ok {
		delete(ms.data, k)
	}
	ms.mu.Unlock()

	if ok {
		if err := ms.Flush(); err != nil {
			ms.logger.Warn("memory: flush after Delete failed", "err", err)
		}
	}
	return ok
}

// List returns all non-expired entries in the given namespace.
func (ms *MemoryStore) List(namespace string) []MemoryEntry {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	var out []MemoryEntry
	for _, e := range ms.data {
		if e.Namespace == namespace && !e.isExpired() {
			out = append(out, *e)
		}
	}
	return out
}

// ListNamespaces returns a deduplicated, sorted list of all known namespaces
// that contain at least one non-expired entry.
func (ms *MemoryStore) ListNamespaces() []string {
	ms.mu.RLock()
	seen := make(map[string]struct{})
	for _, e := range ms.data {
		if !e.isExpired() {
			seen[e.Namespace] = struct{}{}
		}
	}
	ms.mu.RUnlock()

	ns := make([]string, 0, len(seen))
	for k := range seen {
		ns = append(ns, k)
	}
	// stable alphabetical order
	sortStrings(ns)
	return ns
}

// Search returns all non-expired entries in namespace whose key or value
// contains query as a case-insensitive substring.
func (ms *MemoryStore) Search(namespace, query string) []MemoryEntry {
	lower := strings.ToLower(query)

	ms.mu.RLock()
	defer ms.mu.RUnlock()

	var out []MemoryEntry
	for _, e := range ms.data {
		if e.Namespace != namespace || e.isExpired() {
			continue
		}
		if strings.Contains(strings.ToLower(e.Key), lower) ||
			strings.Contains(strings.ToLower(e.Value), lower) {
			out = append(out, *e)
		}
	}
	return out
}

// cleanup removes all expired entries from the in-memory map.
// It does NOT flush to disk — the caller decides whether to flush.
func (ms *MemoryStore) cleanup() {
	ms.mu.Lock()
	for k, e := range ms.data {
		if e.isExpired() {
			delete(ms.data, k)
		}
	}
	ms.mu.Unlock()
}

// startCleanupLoop launches a background goroutine that calls cleanup and
// Flush at the given interval.
func (ms *MemoryStore) startCleanupLoop(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			ms.cleanup()
			if err := ms.Flush(); err != nil {
				ms.logger.Warn("memory: periodic flush failed", "err", err)
			}
		}
	}()
}

// sortStrings sorts a string slice in-place (insertion sort — stdlib sort
// is available but this avoids an import just for the convenience wrapper).
func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		key := s[i]
		j := i - 1
		for j >= 0 && s[j] > key {
			s[j+1] = s[j]
			j--
		}
		s[j+1] = key
	}
}
