package main

import (
	"os"
	"testing"
)

func TestParseStartFlagsDefaults(t *testing.T) {
	// Ensure the env-var override is absent so we get the compiled default.
	t.Setenv("SECUREYEOMAN_EDGE_PORT", "")

	cfg := parseStartFlags([]string{})

	if cfg.Port != 18891 {
		t.Errorf("default Port: expected 18891, got %d", cfg.Port)
	}
	if cfg.Host != "0.0.0.0" {
		t.Errorf("default Host: expected '0.0.0.0', got %q", cfg.Host)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("default LogLevel: expected 'info', got %q", cfg.LogLevel)
	}
	if cfg.ParentURL != "" {
		t.Errorf("default ParentURL: expected '', got %q", cfg.ParentURL)
	}
}

func TestParseStartFlagsAll(t *testing.T) {
	// Prevent env var from interfering.
	os.Unsetenv("SECUREYEOMAN_EDGE_PORT")

	args := []string{
		"--port", "9090",
		"--host", "127.0.0.1",
		"--log-level", "debug",
		"--parent", "http://parent.example.com",
	}
	cfg := parseStartFlags(args)

	if cfg.Port != 9090 {
		t.Errorf("Port: expected 9090, got %d", cfg.Port)
	}
	if cfg.Host != "127.0.0.1" {
		t.Errorf("Host: expected '127.0.0.1', got %q", cfg.Host)
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel: expected 'debug', got %q", cfg.LogLevel)
	}
	if cfg.ParentURL != "http://parent.example.com" {
		t.Errorf("ParentURL: expected 'http://parent.example.com', got %q", cfg.ParentURL)
	}
}

func TestParseStartFlagsShortForms(t *testing.T) {
	os.Unsetenv("SECUREYEOMAN_EDGE_PORT")

	args := []string{"-p", "7777", "-H", "localhost", "-l", "warn"}
	cfg := parseStartFlags(args)

	if cfg.Port != 7777 {
		t.Errorf("Port: expected 7777, got %d", cfg.Port)
	}
	if cfg.Host != "localhost" {
		t.Errorf("Host: expected 'localhost', got %q", cfg.Host)
	}
	if cfg.LogLevel != "warn" {
		t.Errorf("LogLevel: expected 'warn', got %q", cfg.LogLevel)
	}
}

func TestParseRegisterFlags(t *testing.T) {
	args := []string{
		"--parent", "http://secureyeoman.example.com",
		"--token", "super-secret-token",
	}
	parentURL, token := parseRegisterFlags(args)

	if parentURL != "http://secureyeoman.example.com" {
		t.Errorf("parentURL: expected 'http://secureyeoman.example.com', got %q", parentURL)
	}
	if token != "super-secret-token" {
		t.Errorf("token: expected 'super-secret-token', got %q", token)
	}
}

func TestParseRegisterFlagsEmpty(t *testing.T) {
	parentURL, token := parseRegisterFlags([]string{})

	if parentURL != "" {
		t.Errorf("parentURL: expected '', got %q", parentURL)
	}
	if token != "" {
		t.Errorf("token: expected '', got %q", token)
	}
}
