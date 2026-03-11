package main

import (
	"crypto/sha256"
	"fmt"
	"net"
	"os"
	"runtime"
	"strings"

	"github.com/shirou/gopsutil/v4/mem"
)

// EdgeCapabilities describes the hardware and software capabilities of this edge node.
type EdgeCapabilities struct {
	NodeID        string   `json:"nodeId"`
	Hostname      string   `json:"hostname"`
	Arch          string   `json:"arch"`
	Platform      string   `json:"platform"`
	TotalMemoryMB int      `json:"totalMemoryMb"`
	CPUCores      int      `json:"cpuCores"`
	HasGPU        bool     `json:"hasGpu"`
	Tags          []string `json:"tags"`
}

// DetectCapabilities gathers system information for this edge node.
func DetectCapabilities() EdgeCapabilities {
	hostname, _ := os.Hostname()

	totalMem := uint64(0)
	if v, err := mem.VirtualMemory(); err == nil {
		totalMem = v.Total
	}
	totalMemMB := int(totalMem / (1024 * 1024))

	hasGPU := detectGPU()
	tags := buildTags(hasGPU, totalMemMB)

	return EdgeCapabilities{
		NodeID:        generateNodeID(hostname),
		Hostname:      hostname,
		Arch:          runtime.GOARCH,
		Platform:      runtime.GOOS,
		TotalMemoryMB: totalMemMB,
		CPUCores:      runtime.NumCPU(),
		HasGPU:        hasGPU,
		Tags:          tags,
	}
}

// generateNodeID creates a stable 16-char hex ID from hostname + first non-loopback MAC.
func generateNodeID(hostname string) string {
	mac := firstMAC()
	h := sha256.Sum256([]byte(hostname + ":" + mac))
	return fmt.Sprintf("%x", h[:8])
}

func firstMAC() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		hw := iface.HardwareAddr.String()
		if hw != "" && hw != "00:00:00:00:00:00" {
			return hw
		}
	}
	return ""
}

func detectGPU() bool {
	// Check NVIDIA
	if _, err := os.Stat("/dev/nvidia0"); err == nil {
		return true
	}
	// Check AMD/Intel DRI
	if _, err := os.Stat("/dev/dri/renderD128"); err == nil {
		return true
	}
	return false
}

func buildTags(hasGPU bool, totalMemMB int) []string {
	var tags []string

	tags = append(tags, runtime.GOARCH)
	if hasGPU {
		tags = append(tags, "gpu")
	}
	if totalMemMB > 4096 {
		tags = append(tags, "high-memory")
	}
	if runtime.NumCPU() >= 4 {
		tags = append(tags, "multi-core")
	}

	// Custom tags from environment
	if custom := os.Getenv("SECUREYEOMAN_EDGE_TAGS"); custom != "" {
		for _, t := range strings.Split(custom, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	return tags
}
