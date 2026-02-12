/**
 * AI Module - Public Exports
 */

export { AIClient, type AIClientConfig, type AIClientDeps } from './client.js';
export { type AIProvider, BaseProvider, type ProviderConfig } from './providers/base.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { GeminiProvider } from './providers/gemini.js';
export { OllamaProvider } from './providers/ollama.js';
export { OpenCodeProvider } from './providers/opencode.js';
export { RetryManager, type RetryConfig } from './retry-manager.js';
export { CostCalculator } from './cost-calculator.js';
export { CostOptimizer, type CostOptimizerDeps } from './cost-optimizer.js';
export { UsageTracker, type UsageStats, type UsageRecord } from './usage-tracker.js';
export {
  AIProviderError,
  RateLimitError,
  TokenLimitError,
  InvalidResponseError,
  ProviderUnavailableError,
  AuthenticationError,
} from './errors.js';
