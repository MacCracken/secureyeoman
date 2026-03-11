package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// WebhookTarget describes a single outbound notification destination.
type WebhookTarget struct {
	Name     string `json:"name"`
	Platform string `json:"platform"` // "slack", "discord", "telegram", "generic"
	URL      string `json:"url"`      // webhook URL or Telegram bot API URL
	Token    string `json:"token,omitempty"`  // for Telegram bot token
	ChatID   string `json:"chatId,omitempty"` // for Telegram
}

// Messenger manages a set of WebhookTargets and delivers outbound notifications.
type Messenger struct {
	mu      sync.RWMutex
	targets map[string]*WebhookTarget
	client  *http.Client
	logger  *Logger
}

// NewMessenger creates a Messenger with a 10-second HTTP timeout.
func NewMessenger(logger *Logger) *Messenger {
	return &Messenger{
		targets: make(map[string]*WebhookTarget),
		client:  &http.Client{Timeout: 10 * time.Second},
		logger:  logger,
	}
}

// AddTarget registers or replaces a webhook target by name.
func (m *Messenger) AddTarget(target WebhookTarget) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.targets[target.Name] = &target
	m.logger.Info("messaging: target added", "name", target.Name, "platform", target.Platform)
}

// RemoveTarget deletes a target by name. Returns true if it existed.
func (m *Messenger) RemoveTarget(name string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.targets[name]
	if ok {
		delete(m.targets, name)
		m.logger.Info("messaging: target removed", "name", name)
	}
	return ok
}

// RedactedTarget is a safe, public view of a WebhookTarget that omits
// sensitive fields such as URL, Token, and ChatID.
type RedactedTarget struct {
	Name     string `json:"name"`
	Platform string `json:"platform"`
	HasToken bool   `json:"hasToken"`
}

// ListTargets returns a redacted snapshot of all registered targets.
// Sensitive fields (URL, Token, ChatID) are never included in the output.
func (m *Messenger) ListTargets() []RedactedTarget {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]RedactedTarget, 0, len(m.targets))
	for _, t := range m.targets {
		out = append(out, RedactedTarget{
			Name:     t.Name,
			Platform: t.Platform,
			HasToken: t.Token != "",
		})
	}
	return out
}

// Send delivers a message to the named target.
func (m *Messenger) Send(targetName, message string) error {
	m.mu.RLock()
	t, ok := m.targets[targetName]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("messaging: target %q not found", targetName)
	}
	return m.dispatch(t, message)
}

// Broadcast sends a message to every registered target and returns any errors.
func (m *Messenger) Broadcast(message string) []error {
	m.mu.RLock()
	snapshot := make([]*WebhookTarget, 0, len(m.targets))
	for _, t := range m.targets {
		snapshot = append(snapshot, t)
	}
	m.mu.RUnlock()

	var errs []error
	for _, t := range snapshot {
		if err := m.dispatch(t, message); err != nil {
			m.logger.Error("messaging: broadcast error", "target", t.Name, "err", err)
			errs = append(errs, err)
		}
	}
	return errs
}

// dispatch routes a message to the correct platform handler.
func (m *Messenger) dispatch(t *WebhookTarget, message string) error {
	switch t.Platform {
	case "slack":
		return m.sendSlack(t, message)
	case "discord":
		return m.sendDiscord(t, message)
	case "telegram":
		return m.sendTelegram(t, message)
	default:
		return m.sendGeneric(t, message)
	}
}

func (m *Messenger) post(url string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("messaging: marshal error: %w", err)
	}
	resp, err := m.client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("messaging: HTTP error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("messaging: unexpected status %d from %s", resp.StatusCode, url)
	}
	return nil
}

func (m *Messenger) sendSlack(t *WebhookTarget, message string) error {
	return m.post(t.URL, map[string]string{"text": message})
}

func (m *Messenger) sendDiscord(t *WebhookTarget, message string) error {
	return m.post(t.URL, map[string]string{"content": message})
}

func (m *Messenger) sendTelegram(t *WebhookTarget, message string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.Token)
	payload := map[string]string{
		"chat_id":    t.ChatID,
		"text":       message,
		"parse_mode": "Markdown",
	}
	return m.post(url, payload)
}

func (m *Messenger) sendGeneric(t *WebhookTarget, message string) error {
	payload := map[string]any{
		"message":   message,
		"source":    "secureyeoman-edge",
		"timestamp": time.Now().UnixMilli(),
	}
	return m.post(t.URL, payload)
}

// AutoConfigMessaging builds a Messenger pre-populated from environment variables:
//   - SLACK_WEBHOOK_URL    → slack target
//   - DISCORD_WEBHOOK_URL  → discord target
//   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID → telegram target
func AutoConfigMessaging(logger *Logger) *Messenger {
	m := NewMessenger(logger)

	if url := os.Getenv("SLACK_WEBHOOK_URL"); url != "" {
		m.AddTarget(WebhookTarget{
			Name:     "slack",
			Platform: "slack",
			URL:      url,
		})
	}

	if url := os.Getenv("DISCORD_WEBHOOK_URL"); url != "" {
		m.AddTarget(WebhookTarget{
			Name:     "discord",
			Platform: "discord",
			URL:      url,
		})
	}

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")
	if token != "" && chatID != "" {
		m.AddTarget(WebhookTarget{
			Name:     "telegram",
			Platform: "telegram",
			Token:    token,
			ChatID:   chatID,
		})
	}

	return m
}
