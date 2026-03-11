package main

import (
	"io"
	"os"
	"strings"
	"testing"
)

// captureStderr runs f and returns everything written to os.Stderr during its execution.
func captureStderr(f func()) string {
	origStderr := os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		panic("captureStderr: os.Pipe: " + err.Error())
	}
	os.Stderr = w

	f()

	w.Close()
	os.Stderr = origStderr

	data, _ := io.ReadAll(r)
	r.Close()
	return string(data)
}

func TestNewLoggerLevels(t *testing.T) {
	cases := []struct {
		input string
		want  int
	}{
		{"debug", levelDebug},
		{"trace", levelDebug},
		{"DEBUG", levelDebug},
		{"TRACE", levelDebug},
		{"info", levelInfo},
		{"INFO", levelInfo},
		{"warn", levelWarn},
		{"WARN", levelWarn},
		{"error", levelError},
		{"ERROR", levelError},
		{"unknown", levelInfo}, // defaults to info
		{"", levelInfo},        // empty defaults to info
	}

	for _, tc := range cases {
		l := NewLogger(tc.input)
		if l.level != tc.want {
			t.Errorf("NewLogger(%q).level = %d, want %d", tc.input, l.level, tc.want)
		}
	}
}

func TestLoggerFiltering(t *testing.T) {
	l := NewLogger("warn")

	// Debug must be suppressed
	out := captureStderr(func() {
		l.Debug("debug message")
	})
	if strings.Contains(out, "debug message") {
		t.Error("warn-level logger must not output debug messages")
	}

	// Info must be suppressed
	out = captureStderr(func() {
		l.Info("info message")
	})
	if strings.Contains(out, "info message") {
		t.Error("warn-level logger must not output info messages")
	}

	// Warn must pass through
	out = captureStderr(func() {
		l.Warn("warn message")
	})
	if !strings.Contains(out, "warn message") {
		t.Error("warn-level logger must output warn messages")
	}
	if !strings.Contains(out, "WRN") {
		t.Error("warn output must contain label 'WRN'")
	}

	// Error must pass through
	out = captureStderr(func() {
		l.Error("error message")
	})
	if !strings.Contains(out, "error message") {
		t.Error("warn-level logger must output error messages")
	}
	if !strings.Contains(out, "ERR") {
		t.Error("error output must contain label 'ERR'")
	}
}
