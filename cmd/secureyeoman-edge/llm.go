package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// isPrivateIP returns true when rawURL's host resolves to a private, loopback,
// or link-local address. Unparseable URLs are treated as private (blocked).
func isPrivateIP(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return true // block unparseable URLs
	}
	host := u.Hostname()
	// Block obvious private hosts
	if host == "localhost" || host == "metadata.google.internal" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		// Could be a hostname — resolve it
		addrs, err := net.LookupHost(host)
		if err != nil || len(addrs) == 0 {
			return false // let it fail at HTTP level
		}
		ip = net.ParseIP(addrs[0])
		if ip == nil {
			return false
		}
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

// LLMProvider holds configuration for a single LLM provider.
type LLMProvider struct {
	Name    string
	BaseURL string
	APIKey  string
	Model   string
}

// LLMMessage is a single chat message.
type LLMMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// LLMRequest is the unified request structure.
type LLMRequest struct {
	Messages    []LLMMessage `json:"messages"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
	Temperature float64      `json:"temperature,omitempty"`
	Stream      bool         `json:"stream,omitempty"`
}

// LLMResponse is the unified response structure.
type LLMResponse struct {
	Content   string `json:"content"`
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	TokensIn  int    `json:"tokens_in"`
	TokensOut int    `json:"tokens_out"`
}

// LLMClient manages multiple LLM providers.
type LLMClient struct {
	providers map[string]*LLMProvider
	http      *http.Client
	logger    *Logger
}

// NewLLMClient creates a new LLMClient with a 30-second timeout.
func NewLLMClient(logger *Logger) *LLMClient {
	return &LLMClient{
		providers: make(map[string]*LLMProvider),
		http:      &http.Client{Timeout: 30 * time.Second},
		logger:    logger,
	}
}

// AddProvider registers a provider by name.
func (c *LLMClient) AddProvider(name, baseURL, apiKey, model string) {
	c.providers[name] = &LLMProvider{
		Name:    name,
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Model:   model,
	}
	c.logger.Debug("LLM provider registered", "provider", name, "model", model)
}

// ListProviders returns the names of all registered providers.
func (c *LLMClient) ListProviders() []string {
	names := make([]string, 0, len(c.providers))
	for name := range c.providers {
		names = append(names, name)
	}
	return names
}

// Complete routes a request to the named provider and returns a unified response.
func (c *LLMClient) Complete(providerName string, req LLMRequest) (*LLMResponse, error) {
	provider, ok := c.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("LLM provider %q not registered", providerName)
	}

	lowerName := strings.ToLower(provider.Name)
	lowerURL := strings.ToLower(provider.BaseURL)

	var providerType string
	switch {
	case strings.Contains(lowerName, "ollama") || strings.Contains(lowerURL, ":11434"):
		providerType = "ollama"
	case strings.Contains(lowerName, "anthropic") || strings.Contains(lowerURL, "anthropic"):
		providerType = "anthropic"
	default:
		providerType = "openai"
	}

	// Allow localhost only for Ollama (local inference)
	if isPrivateIP(provider.BaseURL) && providerType != "ollama" {
		return nil, fmt.Errorf("provider URL points to private network")
	}

	switch providerType {
	case "ollama":
		return c.completeOllama(provider, req)
	case "anthropic":
		return c.completeAnthropic(provider, req)
	default:
		return c.completeOpenAI(provider, req)
	}
}

// ── OpenAI (and OpenAI-compatible) ──────────────────────────────────────────

type openAIRequest struct {
	Model       string       `json:"model"`
	Messages    []LLMMessage `json:"messages"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
	Temperature float64      `json:"temperature,omitempty"`
}

type openAIResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

func (c *LLMClient) completeOpenAI(provider *LLMProvider, req LLMRequest) (*LLMResponse, error) {
	payload := openAIRequest{
		Model:       provider.Model,
		Messages:    req.Messages,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("openai marshal: %w", err)
	}

	url := provider.BaseURL + "/chat/completions"
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("openai new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if provider.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	}
	// OpenRouter requires a referrer header.
	if strings.Contains(strings.ToLower(provider.BaseURL), "openrouter") {
		httpReq.Header.Set("HTTP-Referer", "https://secureyeoman.ai")
	}

	c.logger.Debug("OpenAI request", "provider", provider.Name, "url", url, "model", provider.Model)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("openai read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider request failed (status %d)", resp.StatusCode)
	}

	var parsed openAIResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("openai parse response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("openai: no choices in response")
	}

	model := parsed.Model
	if model == "" {
		model = provider.Model
	}

	return &LLMResponse{
		Content:   parsed.Choices[0].Message.Content,
		Model:     model,
		Provider:  provider.Name,
		TokensIn:  parsed.Usage.PromptTokens,
		TokensOut: parsed.Usage.CompletionTokens,
	}, nil
}

// ── Anthropic Messages API ───────────────────────────────────────────────────

type anthropicRequest struct {
	Model       string       `json:"model"`
	Messages    []LLMMessage `json:"messages"`
	MaxTokens   int          `json:"max_tokens"`
	Temperature float64      `json:"temperature,omitempty"`
}

type anthropicResponse struct {
	Model   string `json:"model"`
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (c *LLMClient) completeAnthropic(provider *LLMProvider, req LLMRequest) (*LLMResponse, error) {
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 4096
	}

	payload := anthropicRequest{
		Model:       provider.Model,
		Messages:    req.Messages,
		MaxTokens:   maxTokens,
		Temperature: req.Temperature,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("anthropic marshal: %w", err)
	}

	// Always use the canonical Anthropic endpoint regardless of the stored base URL
	// (the base URL is used only for provider detection).
	url := "https://api.anthropic.com/v1/messages"
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("anthropic new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", provider.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	c.logger.Debug("Anthropic request", "provider", provider.Name, "model", provider.Model)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("anthropic read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider request failed (status %d)", resp.StatusCode)
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("anthropic parse response: %w", err)
	}
	if len(parsed.Content) == 0 {
		return nil, fmt.Errorf("anthropic: no content in response")
	}

	model := parsed.Model
	if model == "" {
		model = provider.Model
	}

	return &LLMResponse{
		Content:   parsed.Content[0].Text,
		Model:     model,
		Provider:  provider.Name,
		TokensIn:  parsed.Usage.InputTokens,
		TokensOut: parsed.Usage.OutputTokens,
	}, nil
}

// ── Ollama ───────────────────────────────────────────────────────────────────

type ollamaRequest struct {
	Model    string       `json:"model"`
	Messages []LLMMessage `json:"messages"`
	Stream   bool         `json:"stream"`
}

type ollamaResponse struct {
	Message struct {
		Content string `json:"content"`
	} `json:"message"`
	Model           string `json:"model"`
	EvalCount       int    `json:"eval_count"`
	PromptEvalCount int    `json:"prompt_eval_count"`
}

func (c *LLMClient) completeOllama(provider *LLMProvider, req LLMRequest) (*LLMResponse, error) {
	payload := ollamaRequest{
		Model:    provider.Model,
		Messages: req.Messages,
		Stream:   false, // always non-streaming for the unified interface
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("ollama marshal: %w", err)
	}

	url := provider.BaseURL + "/api/chat"
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("ollama new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	c.logger.Debug("Ollama request", "provider", provider.Name, "url", url, "model", provider.Model)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ollama read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider request failed (status %d)", resp.StatusCode)
	}

	var parsed ollamaResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("ollama parse response: %w", err)
	}

	model := parsed.Model
	if model == "" {
		model = provider.Model
	}

	return &LLMResponse{
		Content:   parsed.Message.Content,
		Model:     model,
		Provider:  provider.Name,
		TokensIn:  parsed.PromptEvalCount,
		TokensOut: parsed.EvalCount,
	}, nil
}

// ── Auto-configuration ───────────────────────────────────────────────────────

// AutoConfigProviders reads well-known environment variables and registers
// any providers whose credentials are present.
//
// Supported variables:
//
//	OpenAI:      OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
//	Anthropic:   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
//	Ollama:      OLLAMA_URL, OLLAMA_MODEL
//	OpenRouter:  OPENROUTER_API_KEY, OPENROUTER_MODEL
func AutoConfigProviders(logger *Logger) *LLMClient {
	client := NewLLMClient(logger)

	// OpenAI
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		baseURL := os.Getenv("OPENAI_BASE_URL")
		if baseURL == "" {
			baseURL = "https://api.openai.com/v1"
		}
		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			model = "gpt-4o"
		}
		client.AddProvider("openai", baseURL, key, model)
	}

	// Anthropic
	if key := os.Getenv("ANTHROPIC_API_KEY"); key != "" {
		model := os.Getenv("ANTHROPIC_MODEL")
		if model == "" {
			model = "claude-sonnet-4-20250514"
		}
		client.AddProvider("anthropic", "https://api.anthropic.com/v1", key, model)
	}

	// Ollama (no API key required)
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	ollamaModel := os.Getenv("OLLAMA_MODEL")
	if ollamaModel == "" {
		ollamaModel = "llama3.2"
	}
	// Only register Ollama if the URL was explicitly set or we can assume local presence.
	// Register unconditionally so callers can attempt it; failures surface at call time.
	client.AddProvider("ollama", ollamaURL, "", ollamaModel)

	// OpenRouter
	if key := os.Getenv("OPENROUTER_API_KEY"); key != "" {
		model := os.Getenv("OPENROUTER_MODEL")
		if model == "" {
			model = "anthropic/claude-sonnet-4-20250514"
		}
		client.AddProvider("openrouter", "https://openrouter.ai/api/v1", key, model)
	}

	logger.Info("LLM auto-config complete", "providers", strings.Join(client.ListProviders(), ","))
	return client
}
