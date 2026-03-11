package main

import (
	"strings"
	"testing"
	"time"
)

func TestMetricsCurrent(t *testing.T) {
	mc := NewMetricsCollector(newTestLogger())
	snap := mc.Current()

	if snap.CPUPercent < 0 {
		t.Errorf("expected CPUPercent >= 0, got %f", snap.CPUPercent)
	}
	if snap.MemTotalMB <= 0 {
		t.Errorf("expected MemTotalMB > 0, got %d", snap.MemTotalMB)
	}
	if snap.GoRoutines <= 0 {
		t.Errorf("expected GoRoutines > 0, got %d", snap.GoRoutines)
	}
}

func TestMetricsHistory(t *testing.T) {
	mc := NewMetricsCollector(newTestLogger())
	mc.Start()
	defer mc.Stop()

	// Wait long enough for at least one 10-second tick to fire.
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if len(mc.History(0)) >= 1 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	history := mc.History(0)
	if len(history) < 1 {
		t.Errorf("expected at least 1 history entry after waiting, got %d", len(history))
	}
}

func TestPrometheusText(t *testing.T) {
	mc := NewMetricsCollector(newTestLogger())
	text := mc.PrometheusText()

	requiredSubstrings := []string{
		"sy_edge_cpu_percent",
		"# HELP",
		"# TYPE",
	}
	for _, s := range requiredSubstrings {
		if !strings.Contains(text, s) {
			t.Errorf("expected PrometheusText to contain %q, but it did not\nFull output:\n%s", s, text)
		}
	}
}
