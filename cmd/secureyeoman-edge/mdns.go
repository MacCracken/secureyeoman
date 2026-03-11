package main

import (
	"fmt"
	"net"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/mdns"
)

const mdnsService = "_secureyeoman._tcp"

// DiscoveredPeer holds information about a peer found via mDNS.
type DiscoveredPeer struct {
	Name   string
	Host   string
	Port   int
	NodeID string
	Mode   string
	Addr   net.IP
}

// MDNSService handles mDNS advertisement and peer discovery.
type MDNSService struct {
	server   *mdns.Server
	mu       sync.Mutex
	logger   *Logger
	nodeID   string
	hostname string
	port     int
	stopCh   chan struct{}
}

// NewMDNSService creates an MDNSService that will advertise on the given port.
func NewMDNSService(nodeID string, hostname string, port int, logger *Logger) *MDNSService {
	return &MDNSService{
		logger:   logger,
		nodeID:   nodeID,
		hostname: hostname,
		port:     port,
		stopCh:   make(chan struct{}),
	}
}

// Start begins advertising this node on the local network via mDNS.
func (m *MDNSService) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server != nil {
		return nil // already running
	}

	info := []string{
		fmt.Sprintf("nodeId=%s", m.nodeID),
		fmt.Sprintf("version=%s", Version),
		"mode=edge",
		fmt.Sprintf("arch=%s", runtime.GOARCH),
	}

	svc, err := mdns.NewMDNSService(
		m.hostname,  // instance name
		mdnsService, // service type
		"",          // domain — empty = .local.
		"",          // host — empty = system hostname
		m.port,
		nil, // IPs — nil = auto-detect
		info,
	)
	if err != nil {
		return fmt.Errorf("mdns: create service: %w", err)
	}

	srv, err := mdns.NewServer(&mdns.Config{Zone: svc})
	if err != nil {
		return fmt.Errorf("mdns: start server: %w", err)
	}

	m.server = srv
	m.logger.Info("mDNS advertising started",
		"service", mdnsService,
		"hostname", m.hostname,
		"port", m.port,
		"nodeId", m.nodeID,
	)
	return nil
}

// Stop shuts down the mDNS advertisement.
func (m *MDNSService) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server != nil {
		if err := m.server.Shutdown(); err != nil {
			m.logger.Warn("mdns shutdown error", "error", err)
		}
		m.server = nil
		m.logger.Info("mDNS advertising stopped")
	}

	// Signal any running discovery loop to exit.
	select {
	case <-m.stopCh:
		// already closed
	default:
		close(m.stopCh)
	}
}

// Discover performs a one-shot scan of the LAN for _secureyeoman._tcp services.
// It blocks for up to 3 seconds and returns all peers found.
func (m *MDNSService) Discover() []DiscoveredPeer {
	entryCh := make(chan *mdns.ServiceEntry, 16)

	params := mdns.DefaultParams(mdnsService)
	params.Entries = entryCh
	params.Timeout = 3 * time.Second
	params.DisableIPv6 = false

	var (
		wg    sync.WaitGroup
		mu    sync.Mutex
		peers []DiscoveredPeer
	)

	wg.Add(1)
	go func() {
		defer wg.Done()
		for entry := range entryCh {
			peer := entryToPeer(entry)
			// Skip ourselves.
			if peer.NodeID == m.nodeID {
				continue
			}
			m.logger.Debug("mDNS peer discovered",
				"name", peer.Name,
				"host", peer.Host,
				"port", peer.Port,
				"nodeId", peer.NodeID,
				"mode", peer.Mode,
			)
			mu.Lock()
			peers = append(peers, peer)
			mu.Unlock()
		}
	}()

	if err := mdns.Query(params); err != nil {
		m.logger.Warn("mDNS discovery error", "error", err)
	}
	close(entryCh)
	wg.Wait()

	return peers
}

// StartDiscoveryLoop runs Discover on the given interval and calls a2a.AddPeer
// for each newly found peer. It returns immediately and runs in the background.
// The loop exits when Stop() is called.
func (m *MDNSService) StartDiscoveryLoop(a2a *A2AManager, interval time.Duration) {
	if interval <= 0 {
		interval = 30 * time.Second
	}

	go func() {
		m.logger.Info("mDNS discovery loop started", "interval", interval)
		// Run once immediately, then on the ticker.
		m.discoverAndRegister(a2a)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-m.stopCh:
				m.logger.Info("mDNS discovery loop stopped")
				return
			case <-ticker.C:
				m.discoverAndRegister(a2a)
			}
		}
	}()
}

// discoverAndRegister runs a single discovery scan and registers any new peers.
func (m *MDNSService) discoverAndRegister(a2a *A2AManager) {
	peers := m.Discover()
	for _, p := range peers {
		url := peerURL(p)
		a2a.AddPeer(PeerAgent{
			ID:         p.NodeID,
			Name:       p.Name,
			URL:        url,
			TrustLevel: "untrusted",
			Status:     "online",
		})
		m.logger.Info("mDNS peer registered", "name", p.Name, "url", url)
	}
}

// entryToPeer converts a raw mdns.ServiceEntry into a DiscoveredPeer.
func entryToPeer(entry *mdns.ServiceEntry) DiscoveredPeer {
	peer := DiscoveredPeer{
		Name: entry.Name,
		Host: entry.Host,
		Port: entry.Port,
	}

	// Prefer IPv4; fall back to IPv6.
	if entry.AddrV4 != nil {
		peer.Addr = entry.AddrV4
	} else if entry.AddrV6 != nil {
		peer.Addr = entry.AddrV6
	}

	for _, field := range entry.InfoFields {
		k, v, ok := strings.Cut(field, "=")
		if !ok {
			continue
		}
		switch k {
		case "nodeId":
			peer.NodeID = v
		case "mode":
			peer.Mode = v
		}
	}

	return peer
}

// peerURL builds the base HTTP URL for a discovered peer.
func peerURL(p DiscoveredPeer) string {
	if p.Addr != nil {
		return fmt.Sprintf("http://%s:%d", p.Addr.String(), p.Port)
	}
	// Strip trailing dot from mDNS hostname if present.
	host := strings.TrimSuffix(p.Host, ".")
	return fmt.Sprintf("http://%s:%d", host, p.Port)
}
