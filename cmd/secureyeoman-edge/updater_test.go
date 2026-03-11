package main

import (
	"testing"
)

func TestNewUpdater(t *testing.T) {
	u := NewUpdater("1.2.3", newTestLogger())
	if u.currentVersion != "1.2.3" {
		t.Errorf("expected currentVersion '1.2.3', got %q", u.currentVersion)
	}
}

func TestUpdateInfoNotAvailable(t *testing.T) {
	u := NewUpdater("0.0.1", newTestLogger())
	// Point at a server that doesn't exist; expect a connection error.
	_, err := u.CheckUpdate("http://127.0.0.1:19999", "")
	if err == nil {
		t.Error("expected error when checking update against non-existent server, got nil")
	}
}
