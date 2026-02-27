# ADR 151: LoRA/QLoRA Fine-Tuning via Docker Sidecar

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 64 — AI Training Pipeline

## Context

Local model quality can be further improved beyond distillation by fine-tuning the base model
weights with LoRA (Low-Rank Adaptation) or QLoRA (quantized LoRA). This requires GPU-accelerated
training code (Unsloth/PEFT/TRL) that is impractical to bundle in the main SecureYeoman binary.

## Decision

Add `FinetuneManager` backed by `training.finetune_jobs` (migration 061) that:

1. Writes a `config.json` to a per-job workspace directory
2. Launches `docker run --gpus all <image> /workspace` as a detached process
3. Watches container exit code via `docker wait`
4. On success: records `adapter_path` and marks job `complete`
5. On failure: records `error_message` and marks job `failed`
6. `streamLogs(jobId)` streams Docker log output via `docker logs --follow`
7. `registerWithOllama(jobId, baseUrl)` writes a Modelfile and runs `ollama create`

The sidecar image (`Dockerfile.unsloth-trainer`) is based on `pytorch/pytorch:2.4.0-cuda12.1` and
includes Unsloth, PEFT, TRL, and BitsAndBytes. The entrypoint `scripts/train.py` maps Ollama-style
model names to HuggingFace hub IDs (e.g. `llama3:8b` → `unsloth/llama-3.1-8b-bnb-4bit`).

REST routes at `/api/v1/training/finetune/jobs` support CRUD, log streaming (SSE), and Ollama
registration. Dashboard `TrainingTab` gains a **Fine-tune** sub-tab with a job creation form
(base model, adapter name, dataset path, LoRA rank/alpha, batch size, epochs, VRAM budget).

## Consequences

- Requires NVIDIA GPU + Docker with CUDA support (`docker run --gpus all`)
- Training is isolated in a container; the host is not affected by Python deps
- Adapter weights are written to the host filesystem via Docker volume mount
- Without GPU, jobs will fail; the Docker start error is returned in the 201 response body
  as `startError` and the job remains in `pending` state
