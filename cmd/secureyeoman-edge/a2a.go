package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// A2AMessage is the wire format for Agent-to-Agent protocol messages.
// Matches the TypeScript A2AMessage type in packages/core/src/a2a/types.ts.
type A2AMessage struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	FromPeerID string `json:"fromPeerId"`
	ToPeerID   string `json:"toPeerId"`
	Payload    any    `json:"payload"`
	Timestamp  int64  `json:"timestamp"`
}

// PeerAgent represents a known A2A peer.
type PeerAgent struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	TrustLevel string `json:"trustLevel"`
	Status     string `json:"status"`
	LastSeen   int64  `json:"lastSeen"`
}

// A2AManager handles peer tracking and message processing.
type A2AManager struct {
	mu     sync.RWMutex
	peers  map[string]*PeerAgent
	logger *Logger
	stopCh chan struct{}
}

// NewA2AManager creates a new A2A manager.
func NewA2AManager(logger *Logger) *A2AManager {
	m := &A2AManager{
		peers:  make(map[string]*PeerAgent),
		logger: logger,
		stopCh: make(chan struct{}),
	}
	go m.heartbeatLoop()
	return m
}

// HandleMessage processes an incoming A2A message and returns a response.
func (m *A2AManager) HandleMessage(msg A2AMessage) map[string]any {
	switch msg.Type {
	case "a2a:heartbeat":
		m.mu.Lock()
		if p, ok := m.peers[msg.FromPeerID]; ok {
			p.LastSeen = time.Now().UnixMilli()
			p.Status = "online"
		}
		m.mu.Unlock()
		return map[string]any{"ok": true, "type": "a2a:heartbeat-ack"}

	case "a2a:capability-query":
		return map[string]any{
			"ok":   true,
			"type": "a2a:capability-response",
			"capabilities": []map[string]string{
				{"name": "task-execution", "description": "Execute delegated tasks", "version": "1.0"},
				{"name": "edge-compute", "description": "Edge/IoT compute node", "version": "1.0"},
			},
		}

	case "a2a:delegate":
		m.logger.Info("delegation received", "from", msg.FromPeerID, "payload_type", fmt.Sprintf("%T", msg.Payload))
		return map[string]any{
			"ok":   true,
			"type": "a2a:delegate-response",
			"status": "accepted",
		}

	case "a2a:discover":
		return map[string]any{
			"ok":   true,
			"type": "a2a:announce",
			"mode": "edge",
		}

	default:
		m.logger.Debug("unhandled A2A message type", "type", msg.Type)
		return map[string]any{"ok": true, "received": msg.Type}
	}
}

// AddPeer adds or updates a known peer.
func (m *A2AManager) AddPeer(peer PeerAgent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	peer.LastSeen = time.Now().UnixMilli()
	if peer.Status == "" {
		peer.Status = "online"
	}
	if peer.TrustLevel == "" {
		peer.TrustLevel = "untrusted"
	}
	m.peers[peer.ID] = &peer
}

// ListPeers returns all known peers.
func (m *A2AManager) ListPeers() []PeerAgent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]PeerAgent, 0, len(m.peers))
	for _, p := range m.peers {
		result = append(result, *p)
	}
	return result
}

// Stop shuts down the heartbeat loop.
func (m *A2AManager) Stop() {
	close(m.stopCh)
}

// heartbeatLoop periodically pings peers and marks unresponsive ones offline.
func (m *A2AManager) heartbeatLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.runHeartbeats()
		}
	}
}

func (m *A2AManager) runHeartbeats() {
	m.mu.RLock()
	peers := make([]*PeerAgent, 0, len(m.peers))
	for _, p := range m.peers {
		peers = append(peers, p)
	}
	m.mu.RUnlock()

	for _, p := range peers {
		if err := sendHeartbeat(p.URL); err != nil {
			m.mu.Lock()
			// Mark offline if missed 3+ heartbeats (3 minutes)
			if time.Now().UnixMilli()-p.LastSeen > 180_000 {
				p.Status = "offline"
				m.logger.Warn("peer offline", "id", p.ID, "name", p.Name)
			}
			m.mu.Unlock()
		} else {
			m.mu.Lock()
			p.LastSeen = time.Now().UnixMilli()
			p.Status = "online"
			m.mu.Unlock()
		}
	}
}

func sendHeartbeat(peerURL string) error {
	msg := A2AMessage{
		Type:       "a2a:heartbeat",
		FromPeerID: "self",
		Timestamp:  time.Now().UnixMilli(),
	}
	body, _ := json.Marshal(msg)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(peerURL+"/api/v1/a2a/receive", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("heartbeat failed: %d", resp.StatusCode)
	}
	return nil
}

// RegisterWithParent registers this edge node with a parent SY instance.
func RegisterWithParent(parentURL, token string, caps EdgeCapabilities, localAddr string, logger *Logger) (string, error) {
	payload := map[string]any{
		"url":          fmt.Sprintf("http://%s", localAddr),
		"name":         caps.Hostname,
		"capabilities": caps,
		"mode":         "edge",
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, parentURL+"/api/v1/a2a/peers/local", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := json.Marshal(map[string]string{})
		return "", fmt.Errorf("registration failed (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Peer struct {
			ID string `json:"id"`
		} `json:"peer"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	peerID := result.Peer.ID
	if peerID == "" {
		peerID = "unknown"
	}
	return peerID, nil
}
