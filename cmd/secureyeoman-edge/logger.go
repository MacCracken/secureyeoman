package main

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

// Logger is a minimal structured logger for the edge runtime.
type Logger struct {
	mu    sync.Mutex
	level int
}

const (
	levelDebug = 0
	levelInfo  = 1
	levelWarn  = 2
	levelError = 3
)

// NewLogger creates a logger at the given level (debug, info, warn, error).
func NewLogger(level string) *Logger {
	l := levelInfo
	switch strings.ToLower(level) {
	case "debug", "trace":
		l = levelDebug
	case "info":
		l = levelInfo
	case "warn":
		l = levelWarn
	case "error":
		l = levelError
	}
	return &Logger{level: l}
}

func (l *Logger) log(level int, label, msg string, kvs ...any) {
	if level < l.level {
		return
	}
	ts := time.Now().UTC().Format(time.RFC3339)
	l.mu.Lock()
	fmt.Fprintf(os.Stderr, "%s [%s] %s", ts, label, msg)
	for i := 0; i+1 < len(kvs); i += 2 {
		fmt.Fprintf(os.Stderr, " %v=%v", kvs[i], kvs[i+1])
	}
	fmt.Fprintln(os.Stderr)
	l.mu.Unlock()
}

// Debug logs a debug message.
func (l *Logger) Debug(msg string, kvs ...any) { l.log(levelDebug, "DBG", msg, kvs...) }

// Info logs an info message.
func (l *Logger) Info(msg string, kvs ...any) { l.log(levelInfo, "INF", msg, kvs...) }

// Warn logs a warning message.
func (l *Logger) Warn(msg string, kvs ...any) { l.log(levelWarn, "WRN", msg, kvs...) }

// Error logs an error message.
func (l *Logger) Error(msg string, kvs ...any) { l.log(levelError, "ERR", msg, kvs...) }
