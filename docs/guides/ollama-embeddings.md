# Ollama Embedding Provider Guide

Use a locally-running Ollama instance as the vector embedding provider for SecureYeoman's memory and knowledge systems — no API key, no external service, no data leaving your machine.

---

## Overview

SecureYeoman's vector memory system converts text into dense embeddings for semantic search and retrieval. By default this can use an external provider (OpenAI, a remote API, etc.), but you can point it at a local Ollama instance instead.

Benefits of using Ollama as the embedding provider:

- **Privacy:** Embeddings are computed locally; no text is sent to external services.
- **No cost:** No API usage charges for embedding calls.
- **Custom models:** You can use fine-tuned embedding models you have trained yourself (see the [Training & ML Guide](./training-ml.md)).
- **Offline operation:** Works without internet access once the model is pulled.

---

## Prerequisites

1. **Install Ollama.** Download and install from [ollama.com](https://ollama.com) or via your package manager.

2. **Pull an embedding model.** The recommended starting model is `nomic-embed-text`:

   ```bash
   ollama pull nomic-embed-text
   ```

   Verify it is available:

   ```bash
   ollama list
   ```

3. **Ensure Ollama is running.** Ollama starts automatically on most platforms after installation. You can verify it is reachable:

   ```bash
   curl http://localhost:11434/api/tags
   ```

   A JSON response listing your models confirms it is running.

---

## Configuration

1. Open **Settings** in the SecureYeoman dashboard.
2. Navigate to **Brain → Vector Memory**.
3. Under **API Provider**, select **Ollama**.
4. Set the **Base URL** to your Ollama instance (default: `http://localhost:11434`).
5. Set the **Model** field to the model name you pulled (e.g., `nomic-embed-text`).
6. Click **Save**.

SecureYeoman will immediately start using Ollama for all new embedding operations. Existing indexed vectors are not re-embedded automatically — use the **Re-index** button in the Vector Memory Explorer if you want to reprocess existing entries with the new model.

---

## Supported Models

The following models are tested and known to work well. Dimension sizes matter because they determine the vector index schema — changing the model after indexing data requires re-indexing.

| Model | Dimensions | Notes |
|---|---|---|
| `nomic-embed-text` | 768 | Recommended starting point. Strong retrieval, small size. |
| `mxbai-embed-large` | 1024 | Higher-quality embeddings, more VRAM required. |
| `all-minilm` | 384 | Compact and fast; lower recall on complex queries. |
| Any other model | 768 (default) | Dimension is assumed 768 if the model is not in the known list. |

To pull any of these:

```bash
ollama pull mxbai-embed-large
ollama pull all-minilm
```

---

## Using Custom (Fine-Tuned) Models

If you have trained a custom embedding model using sentence-transformers (see the [Training & ML Guide](./training-ml.md)), you can convert and serve it via Ollama.

### Convert to GGUF

Use `llama.cpp`'s conversion script:

```bash
python convert_hf_to_gguf.py ./my-embedding-model \
  --outfile my-embedding-model.gguf \
  --outtype f16
```

### Create an Ollama Modelfile

```
# EmbeddingModelfile
FROM ./my-embedding-model.gguf
```

### Register with Ollama

```bash
ollama create my-embedding-model -f EmbeddingModelfile
```

### Set in SecureYeoman

In **Settings → Brain → Vector Memory**, set the Model field to `my-embedding-model`.

Your domain-specific embedding model will now be used for all memory indexing and retrieval.

---

## API Reference

The Ollama embedding provider is configured via the `VectorConfig` schema extension. The relevant fields when configuring via the API directly:

```json
{
  "api": {
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "nomic-embed-text"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `api.provider` | `"ollama"` | Selects the Ollama embedding backend |
| `api.baseUrl` | `string` | Base URL of the Ollama instance. Default: `http://localhost:11434` |
| `api.model` | `string` | The Ollama model name to use for embeddings |

The system calls Ollama's `/api/embeddings` endpoint for each text to be indexed or queried.

---

## Troubleshooting

### Ollama is not reachable

The dashboard shows an offline banner or embedding calls fail with a connection error.

**Check:** Is Ollama running?

```bash
ollama serve
# or on macOS/Linux with launchd/systemd, restart the service
```

**Check:** Is the Base URL correct? If Ollama is running inside Docker, `localhost` from the container's perspective is the container itself, not the host. Use your host's Docker bridge IP (commonly `172.17.0.1`) or `host.docker.internal` on Docker Desktop.

```
http://host.docker.internal:11434
```

### Model not found

Embedding calls fail with a `model not found` or `404` error.

**Fix:** Pull the model:

```bash
ollama pull nomic-embed-text
```

Then verify it appears in the list:

```bash
ollama list
```

### Dimension mismatch after changing models

If you switch from one embedding model to another with different dimensions (e.g., from `all-minilm` at 384d to `mxbai-embed-large` at 1024d), existing vectors in the index are incompatible with new query vectors.

**Fix:** After updating the model in settings, go to **Settings → Brain → Vector Memory** and click **Re-index All**. This reprocesses all existing memories and knowledge entries through the new model. Depending on dataset size this may take several minutes.

### Slow embedding performance

If embedding calls are taking more than a few seconds per request, the model may be too large for available VRAM and is running on CPU.

**Options:**
- Switch to a smaller model (`all-minilm` or `nomic-embed-text`)
- Ensure Ollama has access to your GPU (check `ollama ps` during a request)
- Increase Ollama's GPU layers with `OLLAMA_NUM_GPU` environment variable
