package main

import (
	"testing"
)

func newA2AManager() *A2AManager {
	m := &A2AManager{
		peers:  make(map[string]*PeerAgent),
		logger: newTestLogger(),
		stopCh: make(chan struct{}),
	}
	// Do NOT start the background heartbeat goroutine in tests.
	return m
}

func TestA2AHandleHeartbeat(t *testing.T) {
	m := newA2AManager()
	msg := A2AMessage{
		ID:         "msg-1",
		Type:       "a2a:heartbeat",
		FromPeerID: "peer-abc",
		ToPeerID:   "self",
	}

	resp := m.HandleMessage(msg)

	if ok, _ := resp["ok"].(bool); !ok {
		t.Errorf("expected ok=true, got %v", resp["ok"])
	}
	if typ, _ := resp["type"].(string); typ != "a2a:heartbeat-ack" {
		t.Errorf("expected type 'a2a:heartbeat-ack', got %q", typ)
	}
}

func TestA2AHandleCapabilityQuery(t *testing.T) {
	m := newA2AManager()
	msg := A2AMessage{
		ID:   "msg-2",
		Type: "a2a:capability-query",
	}

	resp := m.HandleMessage(msg)

	if ok, _ := resp["ok"].(bool); !ok {
		t.Errorf("expected ok=true, got %v", resp["ok"])
	}
	if typ, _ := resp["type"].(string); typ != "a2a:capability-response" {
		t.Errorf("expected type 'a2a:capability-response', got %q", typ)
	}

	caps, ok := resp["capabilities"].([]map[string]string)
	if !ok || len(caps) == 0 {
		t.Errorf("expected non-empty capabilities slice, got %v", resp["capabilities"])
	}
}

func TestA2AHandleDelegate(t *testing.T) {
	m := newA2AManager()
	msg := A2AMessage{
		ID:         "msg-3",
		Type:       "a2a:delegate",
		FromPeerID: "peer-xyz",
		Payload:    map[string]string{"task": "run-inference"},
	}

	resp := m.HandleMessage(msg)

	if ok, _ := resp["ok"].(bool); !ok {
		t.Errorf("expected ok=true, got %v", resp["ok"])
	}
	if typ, _ := resp["type"].(string); typ != "a2a:delegate-response" {
		t.Errorf("expected type 'a2a:delegate-response', got %q", typ)
	}
	if status, _ := resp["status"].(string); status != "accepted" {
		t.Errorf("expected status 'accepted', got %q", status)
	}
}

func TestA2AHandleDiscover(t *testing.T) {
	m := newA2AManager()
	msg := A2AMessage{
		ID:   "msg-4",
		Type: "a2a:discover",
	}

	resp := m.HandleMessage(msg)

	if ok, _ := resp["ok"].(bool); !ok {
		t.Errorf("expected ok=true, got %v", resp["ok"])
	}
	if typ, _ := resp["type"].(string); typ != "a2a:announce" {
		t.Errorf("expected type 'a2a:announce', got %q", typ)
	}
	if mode, _ := resp["mode"].(string); mode != "edge" {
		t.Errorf("expected mode 'edge', got %q", mode)
	}
}

func TestA2AHandleUnknown(t *testing.T) {
	m := newA2AManager()
	msg := A2AMessage{
		ID:   "msg-5",
		Type: "a2a:something-unknown",
	}

	resp := m.HandleMessage(msg)

	if ok, _ := resp["ok"].(bool); !ok {
		t.Errorf("expected ok=true for unknown message type, got %v", resp["ok"])
	}
}

func TestAddAndListPeers(t *testing.T) {
	m := newA2AManager()
	m.AddPeer(PeerAgent{ID: "peer-1", Name: "Agent One", URL: "http://agent1.local:8080"})
	m.AddPeer(PeerAgent{ID: "peer-2", Name: "Agent Two", URL: "http://agent2.local:8080"})

	peers := m.ListPeers()
	if len(peers) != 2 {
		t.Fatalf("expected 2 peers, got %d", len(peers))
	}

	ids := map[string]bool{}
	for _, p := range peers {
		ids[p.ID] = true
	}
	if !ids["peer-1"] || !ids["peer-2"] {
		t.Errorf("expected peer-1 and peer-2 in list, got %v", peers)
	}
}

func TestPeerDefaultTrustLevel(t *testing.T) {
	m := newA2AManager()
	m.AddPeer(PeerAgent{ID: "peer-norust", Name: "No Trust", URL: "http://notrust.local"})

	peers := m.ListPeers()
	if len(peers) != 1 {
		t.Fatalf("expected 1 peer, got %d", len(peers))
	}
	if peers[0].TrustLevel != "untrusted" {
		t.Errorf("expected TrustLevel 'untrusted', got %q", peers[0].TrustLevel)
	}
}
