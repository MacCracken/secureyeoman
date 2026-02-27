"""
train.py — LoRA/QLoRA fine-tuning script for SecureYeoman unsloth-trainer Docker image.

Reads /workspace/config.json, trains a LoRA adapter, saves weights to /workspace/adapter/.

Config schema:
  base_model     str   Ollama-style model name (or HuggingFace hub ID)
  adapter_name   str   Output adapter name
  dataset_path   str   Path to JSONL training file (sharegpt or instruction format)
  output_dir     str   Where to write adapter weights (default: /workspace/adapter)
  lora_rank      int   LoRA rank (default: 16)
  lora_alpha     int   LoRA alpha (default: 32)
  batch_size     int   Per-device batch size (default: 4)
  epochs         int   Number of training epochs (default: 3)
  vram_budget_gb int   Available VRAM in GB — determines 4-bit vs 8-bit quantization
"""

import json
import os
import sys
from pathlib import Path

CONFIG_PATH = "/workspace/config.json"


def load_config():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    return {
        "base_model": cfg.get("base_model", "unsloth/llama-3.1-8b-bnb-4bit"),
        "adapter_name": cfg.get("adapter_name", "lora-adapter"),
        "dataset_path": cfg.get("dataset_path", "/workspace/dataset.jsonl"),
        "output_dir": cfg.get("output_dir", "/workspace/adapter"),
        "lora_rank": int(cfg.get("lora_rank", 16)),
        "lora_alpha": int(cfg.get("lora_alpha", 32)),
        "batch_size": int(cfg.get("batch_size", 4)),
        "epochs": int(cfg.get("epochs", 3)),
        "vram_budget_gb": int(cfg.get("vram_budget_gb", 12)),
    }


def resolve_model_id(model_name: str) -> str:
    """Map Ollama-style names to HuggingFace hub IDs."""
    mapping = {
        "llama3:8b": "unsloth/llama-3.1-8b-bnb-4bit",
        "llama3:8b-instruct": "unsloth/llama-3.1-8b-Instruct-bnb-4bit",
        "llama3:70b": "unsloth/llama-3.1-70b-bnb-4bit",
        "mistral:7b": "unsloth/mistral-7b-v0.3-bnb-4bit",
        "phi3:mini": "unsloth/Phi-3-mini-4k-instruct",
        "gemma2:9b": "unsloth/gemma-2-9b-bnb-4bit",
        "deepseek-r1:8b": "unsloth/DeepSeek-R1-Distill-Llama-8B",
    }
    return mapping.get(model_name, model_name)


def load_dataset_sharegpt(path: str):
    """Load ShareGPT-format JSONL."""
    from datasets import Dataset

    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if "conversations" in obj:
                # ShareGPT format
                text_parts = []
                for turn in obj["conversations"]:
                    role = "Human" if turn.get("from") == "human" else "Assistant"
                    text_parts.append(f"{role}: {turn.get('value', '')}")
                records.append({"text": "\n".join(text_parts)})
            elif "instruction" in obj:
                # Instruction format
                records.append(
                    {
                        "text": f"Human: {obj['instruction']}\nAssistant: {obj.get('output', '')}"
                    }
                )

    return Dataset.from_list(records)


def main():
    print("[train.py] Loading config...", flush=True)
    cfg = load_config()
    model_id = resolve_model_id(cfg["base_model"])
    load_in_4bit = cfg["vram_budget_gb"] < 24

    print(f"[train.py] Base model: {model_id}", flush=True)
    print(f"[train.py] 4-bit quantization: {load_in_4bit}", flush=True)
    print(f"[train.py] LoRA rank={cfg['lora_rank']}, alpha={cfg['lora_alpha']}", flush=True)

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("[train.py] ERROR: unsloth not installed", flush=True)
        sys.exit(1)

    # Load base model
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_id,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=load_in_4bit,
    )

    # Attach LoRA adapter
    model = FastLanguageModel.get_peft_model(
        model,
        r=cfg["lora_rank"],
        lora_alpha=cfg["lora_alpha"],
        lora_dropout=0.0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
    )

    # Load dataset
    print(f"[train.py] Loading dataset from {cfg['dataset_path']}...", flush=True)
    dataset = load_dataset_sharegpt(cfg["dataset_path"])
    print(f"[train.py] Dataset size: {len(dataset)} examples", flush=True)

    # Train
    from trl import SFTTrainer
    from transformers import TrainingArguments

    output_dir = cfg["output_dir"]
    os.makedirs(output_dir, exist_ok=True)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        args=TrainingArguments(
            per_device_train_batch_size=cfg["batch_size"],
            gradient_accumulation_steps=max(1, 8 // cfg["batch_size"]),
            warmup_steps=10,
            num_train_epochs=cfg["epochs"],
            learning_rate=2e-4,
            fp16=not load_in_4bit,
            bf16=False,
            logging_steps=10,
            optim="adamw_8bit",
            output_dir=output_dir,
            save_strategy="no",
        ),
    )

    print("[train.py] Starting training...", flush=True)
    trainer.train()

    # Save adapter weights
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"[train.py] Adapter saved to {output_dir}", flush=True)


if __name__ == "__main__":
    main()
