package main

import (
	"os"
	"testing"
)

func newTestLogger() *Logger {
	return NewLogger("error")
}

func TestLLMClientAddProvider(t *testing.T) {
	client := NewLLMClient(newTestLogger())
	client.AddProvider("myprovider", "http://example.com", "key123", "gpt-4")

	providers := client.ListProviders()
	for _, p := range providers {
		if p == "myprovider" {
			return
		}
	}
	t.Errorf("expected 'myprovider' in ListProviders, got %v", providers)
}

func TestLLMClientListEmpty(t *testing.T) {
	client := NewLLMClient(newTestLogger())
	providers := client.ListProviders()
	if len(providers) != 0 {
		t.Errorf("expected empty provider list, got %v", providers)
	}
}

func TestLLMClientUnknownProvider(t *testing.T) {
	client := NewLLMClient(newTestLogger())
	_, err := client.Complete("nonexistent", LLMRequest{
		Messages: []LLMMessage{{Role: "user", Content: "hello"}},
	})
	if err == nil {
		t.Error("expected error for unknown provider, got nil")
	}
}

func TestLLMAutoConfigOllama(t *testing.T) {
	client := AutoConfigProviders(newTestLogger())
	providers := client.ListProviders()
	for _, p := range providers {
		if p == "ollama" {
			return
		}
	}
	t.Errorf("expected 'ollama' in ListProviders, got %v", providers)
}

func TestLLMAutoConfigOpenAI(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key-abc123")
	client := AutoConfigProviders(newTestLogger())
	providers := client.ListProviders()
	for _, p := range providers {
		if p == "openai" {
			return
		}
	}
	t.Errorf("expected 'openai' in ListProviders after setting OPENAI_API_KEY, got %v", providers)
}

func TestIsPrivateIP(t *testing.T) {
	// Ensure the test is not confused by any proxy env vars.
	os.Unsetenv("HTTP_PROXY")
	os.Unsetenv("HTTPS_PROXY")

	cases := []struct {
		url     string
		private bool
	}{
		{"http://localhost:8080", true},
		{"http://127.0.0.1:8080", true},
		{"http://169.254.1.1", true},
		{"http://10.0.0.1", true},
		{"http://192.168.1.1", true},
		{"http://api.openai.com", false},
	}

	for _, tc := range cases {
		got := isPrivateIP(tc.url)
		if got != tc.private {
			t.Errorf("isPrivateIP(%q) = %v, want %v", tc.url, got, tc.private)
		}
	}
}
