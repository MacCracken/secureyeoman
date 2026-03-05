# ADR 203: Advanced Training (Phase 131)

## Status

Accepted

## Context

The existing training pipeline (ADR 006) supports SFT via LoRA/QLoRA and preference annotation for DPO, but does not execute DPO or RLHF training directly. Operators need alignment fine-tuning (DPO, RLHF with reward models), automated hyperparameter search to reduce manual experimentation, multi-GPU support for larger models, and checkpoint management for resumable training and rollback to intermediate states.

## Decisions

### Training Method Selector

The `FinetuneManager.createJob()` method field is extended from `'sft'` to a union: `'sft' | 'dpo' | 'rlhf' | 'reward' | 'pretrain'`. Each method maps to a different training script inside the Docker sidecar container. The REST API and CLI accept the method parameter; MCP tools expose it as a string enum.

### DPO Training

DPO jobs use TRL's `DPOTrainer` inside the existing Docker sidecar. The manager writes a DPO config file referencing the preference dataset (JSONL with `chosen`/`rejected` pairs), beta parameter (default 0.1), and LoRA settings. The container loads the base model, applies LoRA adapters, and trains against the preference loss. Output adapters are registered with Ollama on success, identical to the SFT flow.

### RLHF Training

RLHF jobs use TRL's `PPOTrainer` with a separately trained reward model. A two-stage workflow is expected: first train a reward model (`method: 'reward'`) on preference data, then run PPO (`method: 'rlhf'`) referencing the reward adapter path. The PPO config includes KL penalty coefficient, mini-batch size, and PPO epochs. The reward model runs as a second process inside the same container.

### Hyperparameter Search

A new `HyperparameterSearchManager` accepts a search space definition (parameter ranges or discrete sets) and a strategy (`'grid' | 'random'`). It expands the space into candidate configurations and launches child finetune jobs for each. Results are tracked in the experiment registry with a `search_id` foreign key. On completion, the best run is selected by lowest eval loss or highest judge score.

### Multi-GPU Support

The Docker launch command accepts a `gpus` field that maps to `--gpus device=0,1,...`. The training scripts detect multiple GPUs via `torch.cuda.device_count()` and use `accelerate` for data-parallel training. The finetune job record stores the GPU count for reproducibility.

### Checkpoint Management

A `training.checkpoints` table stores step number, training loss, validation loss, adapter path, and timestamp per job. The training script writes checkpoints at a configurable interval (default every 500 steps). The API exposes endpoints to list checkpoints, resume from a checkpoint, and promote a checkpoint to a final adapter. Interrupted jobs can be resumed by passing the checkpoint path to the container.

## Consequences

### Positive

- Alignment fine-tuning (DPO, RLHF) is available without leaving the platform.
- Automated hyperparameter search reduces manual experimentation and improves model quality.
- Checkpoint management enables resumable training and selection of optimal intermediate states.
- Multi-GPU support unlocks training of larger models that do not fit in single-GPU VRAM.

### Negative

- RLHF requires training a reward model first, adding complexity and compute cost.
- Hyperparameter search multiplies GPU hours by the number of candidates; operators must budget accordingly.
- Multi-GPU requires matching hardware; misconfigured GPU indices cause container startup failures.
- Checkpoint storage can be significant for large models (hundreds of MB per checkpoint).
