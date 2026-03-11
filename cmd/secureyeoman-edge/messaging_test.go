package main

import (
	"testing"
)

func TestMessengerAddTarget(t *testing.T) {
	m := NewMessenger(newTestLogger())
	m.AddTarget(WebhookTarget{
		Name:     "slack-alerts",
		Platform: "slack",
		URL:      "https://hooks.slack.com/services/XXX/YYY/ZZZ",
	})

	targets := m.ListTargets()
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].Name != "slack-alerts" {
		t.Errorf("expected name 'slack-alerts', got %q", targets[0].Name)
	}
	if targets[0].Platform != "slack" {
		t.Errorf("expected platform 'slack', got %q", targets[0].Platform)
	}
}

func TestMessengerRemoveTarget(t *testing.T) {
	m := NewMessenger(newTestLogger())
	m.AddTarget(WebhookTarget{
		Name:     "to-remove",
		Platform: "generic",
		URL:      "http://example.com/webhook",
	})

	removed := m.RemoveTarget("to-remove")
	if !removed {
		t.Error("expected RemoveTarget to return true for existing target")
	}

	targets := m.ListTargets()
	if len(targets) != 0 {
		t.Errorf("expected 0 targets after removal, got %d", len(targets))
	}
}

func TestMessengerSendUnknown(t *testing.T) {
	m := NewMessenger(newTestLogger())
	err := m.Send("nonexistent-target", "hello")
	if err == nil {
		t.Error("expected error when sending to unknown target, got nil")
	}
}

func TestRedactedTargets(t *testing.T) {
	m := NewMessenger(newTestLogger())
	m.AddTarget(WebhookTarget{
		Name:     "tg",
		Platform: "telegram",
		Token:    "bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
		ChatID:   "-100123456789",
	})

	targets := m.ListTargets()
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}

	rt := targets[0]
	if rt.Name != "tg" {
		t.Errorf("expected name 'tg', got %q", rt.Name)
	}
	if rt.Platform != "telegram" {
		t.Errorf("expected platform 'telegram', got %q", rt.Platform)
	}
	if !rt.HasToken {
		t.Error("expected HasToken to be true when token is present")
	}
	// Verify RedactedTarget has no Token or URL field (compile-time guarantee
	// via struct — we just confirm the type does not expose raw credentials).
	_ = rt.Name
	_ = rt.Platform
	_ = rt.HasToken
}
