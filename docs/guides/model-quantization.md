# Model Quantization Guide

Quantization reduces the memory footprint of large language models by compressing weight precision from 32-bit floats down to 4–8 bits. This guide helps you choose the right quantization level for your hardware and get the best quality/performance trade-off with Ollama.

## Hardware Tiers

| RAM Available | Recommended Quant | Notes |
|---|---|---|
| < 8 GB | `Q2_K` | Minimum quality — last resort |
| 8–16 GB | `Q4_K_M` | Best balance (default recommendation) |
| 16–32 GB | `Q5_K_S` or `Q5_K_M` | Higher quality, still fast |
| 32+ GB | `Q8_0` | Near-lossless, best for production |

## Quantization Levels Explained

| Level | Bits | Quality | Speed | Typical VRAM |
|---|---|---|---|---|
| `Q2_K` | ~2.5b | Low | Fastest | ~2–3 GB / 7B model |
| `Q3_K_M` | ~3.3b | Moderate | Fast | ~3–4 GB / 7B model |
| `Q4_K_M` | ~4.8b | Good (recommended) | Balanced | ~4–5 GB / 7B model |
| `Q5_K_S` | ~5.5b | Very good | Moderate | ~5–6 GB / 7B model |
| `Q5_K_M` | ~5.7b | Very good | Moderate | ~5–6 GB / 7B model |
| `Q8_0` | 8b | Best | Slowest | ~8–9 GB / 7B model |

## Model Family VRAM Estimates

| Model | Size | Q4_K_M | Q5_K_M | Q8_0 |
|---|---|---|---|---|
| Llama 3 8B | 8B | ~4.9 GB | ~5.7 GB | ~8.5 GB |
| Llama 3 70B | 70B | ~39 GB | ~46 GB | ~74 GB |
| Mistral 7B v0.3 | 7B | ~4.4 GB | ~5.1 GB | ~7.7 GB |
| Phi-3.5 Mini | 3.8B | ~2.4 GB | ~2.8 GB | ~4.2 GB |
| Phi-3 Medium | 14B | ~8.9 GB | ~10.4 GB | ~15.6 GB |
| Gemma 2 9B | 9B | ~5.5 GB | ~6.4 GB | ~9.6 GB |
| Gemma 2 27B | 27B | ~16.6 GB | ~19.3 GB | ~29 GB |
| DeepSeek-R1 Distill 7B | 7B | ~4.4 GB | ~5.1 GB | ~7.7 GB |
| DeepSeek-R1 Distill 14B | 14B | ~8.9 GB | ~10.4 GB | ~15.6 GB |

> **Note**: These are rough estimates. Actual usage varies by context window size, prompt length, and system overhead (typically +1–2 GB for OS/framework).

## Choosing a Quantization in Ollama

Ollama model names include the quantization tag after a colon:

```bash
# Pull a specific quantization
ollama pull llama3:8b-instruct-q4_K_M
ollama pull mistral:7b-instruct-q5_K_M
ollama pull phi3:3.8b-mini-instruct-q4_K_M

# Check available tags on the Ollama library
# https://ollama.com/library/llama3/tags
```

To set a quantized model as the active model in SecureYeoman:

```bash
# Via CLI
secureyeoman model switch ollama llama3:8b-instruct-q4_K_M

# Via API
curl -X POST http://localhost:18789/api/v1/model/switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"ollama","model":"llama3:8b-instruct-q4_K_M"}'
```

## Memory Warning

SecureYeoman automatically checks at startup whether the configured Ollama model fits in available RAM. If the model file exceeds 80% of system RAM, a warning is logged:

```
WARN Ollama model "llama3:70b" (39.6 GB) may exceed available RAM (16.0 GB).
     Consider a lower quantization (e.g. Q4_K_M). See docs/guides/model-quantization.md
```

The same warning is included in `GET /api/v1/ai/health` as a `memoryWarning` field when applicable.

## Local-First Routing

If you have a local Ollama model and a cloud model configured as primary, enable **local-first mode** to try the local model before making cloud API calls:

```bash
# Enable local-first via API
curl -X PATCH http://localhost:18789/api/v1/model/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"localFirst":true}'
```

Or toggle it in the dashboard's **Model Selection** widget. The system falls back to the cloud primary automatically if the local model is unreachable.

## Tips

- **Start with Q4_K_M** unless you have a specific quality requirement — it offers the best balance across most use cases.
- **Upgrade to Q5_K_M** if you need better reasoning quality and have spare RAM.
- **Use Q8_0** only for production deployments with dedicated GPU/RAM resources.
- **Avoid Q2_K** for production — it noticeably degrades reasoning and instruction following.
- For coding tasks, higher quantization (Q5+ or Q8) produces measurably better code completion.
