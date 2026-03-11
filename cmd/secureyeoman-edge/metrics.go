package main

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/mem"
)

const (
	metricsInterval  = 10 * time.Second
	metricsMaxHistory = 360 // 1 hour at 10s interval
)

// SystemMetrics holds a single point-in-time snapshot of system resource usage.
type SystemMetrics struct {
	Timestamp   int64   `json:"timestamp"`
	CPUPercent  float64 `json:"cpuPercent"`
	MemUsedMB   int     `json:"memUsedMb"`
	MemTotalMB  int     `json:"memTotalMb"`
	MemPercent  float64 `json:"memPercent"`
	DiskUsedGB  float64 `json:"diskUsedGb,omitempty"`
	DiskTotalGB float64 `json:"diskTotalGb,omitempty"`
	DiskPercent float64 `json:"diskPercent,omitempty"`
	Uptime      int64   `json:"uptimeMs"`
	GoRoutines  int     `json:"goroutines"`
}

// MetricsCollector gathers system metrics on a fixed interval and maintains a
// bounded ring-buffer of historical snapshots.
type MetricsCollector struct {
	mu      sync.RWMutex
	history []SystemMetrics
	started time.Time
	stopCh  chan struct{}
	logger  *Logger
}

// NewMetricsCollector creates a MetricsCollector. Call Start() to begin collection.
func NewMetricsCollector(logger *Logger) *MetricsCollector {
	return &MetricsCollector{
		history: make([]SystemMetrics, 0, metricsMaxHistory),
		started: time.Now(),
		stopCh:  make(chan struct{}),
		logger:  logger,
	}
}

// Start launches the background collection goroutine. Safe to call once.
func (mc *MetricsCollector) Start() {
	go func() {
		ticker := time.NewTicker(metricsInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				snap := mc.Current()
				mc.mu.Lock()
				if len(mc.history) >= metricsMaxHistory {
					// Drop oldest entry (shift left).
					copy(mc.history, mc.history[1:])
					mc.history = mc.history[:len(mc.history)-1]
				}
				mc.history = append(mc.history, snap)
				mc.mu.Unlock()
			case <-mc.stopCh:
				return
			}
		}
	}()
	mc.logger.Debug("metrics collector started", "interval", metricsInterval)
}

// Stop signals the collection goroutine to exit.
func (mc *MetricsCollector) Stop() {
	close(mc.stopCh)
	mc.logger.Debug("metrics collector stopped")
}

// Current collects and returns a fresh metrics snapshot. The CPU measurement
// blocks for 1 second to obtain a meaningful percentage.
func (mc *MetricsCollector) Current() SystemMetrics {
	snap := SystemMetrics{
		Timestamp:  time.Now().UnixMilli(),
		GoRoutines: runtime.NumGoroutine(),
		Uptime:     time.Since(mc.started).Milliseconds(),
	}

	// CPU — 1-second blocking sample.
	if percents, err := cpu.PercentWithContext(context.Background(), time.Second, false); err == nil && len(percents) > 0 {
		snap.CPUPercent = percents[0]
	}

	// Memory.
	if v, err := mem.VirtualMemoryWithContext(context.Background()); err == nil {
		snap.MemUsedMB = int(v.Used / (1024 * 1024))
		snap.MemTotalMB = int(v.Total / (1024 * 1024))
		snap.MemPercent = v.UsedPercent
	}

	// Disk — root filesystem.
	if d, err := disk.UsageWithContext(context.Background(), "/"); err == nil {
		snap.DiskUsedGB = float64(d.Used) / (1024 * 1024 * 1024)
		snap.DiskTotalGB = float64(d.Total) / (1024 * 1024 * 1024)
		snap.DiskPercent = d.UsedPercent
	}

	return snap
}

// History returns all snapshots from the last `minutes` minutes. Passing 0 or
// a negative value returns the full history buffer.
func (mc *MetricsCollector) History(minutes int) []SystemMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	if minutes <= 0 || len(mc.history) == 0 {
		out := make([]SystemMetrics, len(mc.history))
		copy(out, mc.history)
		return out
	}

	cutoff := time.Now().Add(-time.Duration(minutes) * time.Minute).UnixMilli()
	start := 0
	for start < len(mc.history) && mc.history[start].Timestamp < cutoff {
		start++
	}

	out := make([]SystemMetrics, len(mc.history)-start)
	copy(out, mc.history[start:])
	return out
}

// PrometheusText returns the current metrics snapshot formatted as Prometheus
// text exposition (Content-Type: text/plain; version=0.0.4).
func (mc *MetricsCollector) PrometheusText() string {
	s := mc.Current()

	var b strings.Builder

	writeLine := func(help, typ, name string, value float64) {
		fmt.Fprintf(&b, "# HELP %s %s\n", name, help)
		fmt.Fprintf(&b, "# TYPE %s %s\n", name, typ)
		fmt.Fprintf(&b, "%s %g\n", name, value)
	}

	writeLine("CPU usage percentage", "gauge",
		"sy_edge_cpu_percent", s.CPUPercent)

	writeLine("Memory used in bytes", "gauge",
		"sy_edge_memory_used_bytes", float64(s.MemUsedMB)*1024*1024)

	writeLine("Total memory in bytes", "gauge",
		"sy_edge_memory_total_bytes", float64(s.MemTotalMB)*1024*1024)

	writeLine("Memory usage percentage", "gauge",
		"sy_edge_memory_percent", s.MemPercent)

	if s.DiskTotalGB > 0 {
		writeLine("Disk space used in bytes", "gauge",
			"sy_edge_disk_used_bytes", s.DiskUsedGB*1024*1024*1024)

		writeLine("Total disk space in bytes", "gauge",
			"sy_edge_disk_total_bytes", s.DiskTotalGB*1024*1024*1024)

		writeLine("Disk usage percentage", "gauge",
			"sy_edge_disk_percent", s.DiskPercent)
	}

	writeLine("Process uptime in milliseconds", "gauge",
		"sy_edge_uptime_ms", float64(s.Uptime))

	writeLine("Number of live goroutines", "gauge",
		"sy_edge_goroutines", float64(s.GoRoutines))

	return b.String()
}
