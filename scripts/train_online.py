#!/usr/bin/env python3
"""
Online LoRA Update — lightweight continual learning with replay buffer mixing.

Reads /workspace/config.json and fine-tunes a small LoRA adapter
using new conversation data mixed with a replay buffer of previous samples.
"""

import json
import sys
from pathlib import Path

def main():
    config_path = Path("/workspace/config.json")
    if not config_path.exists():
        print("ERROR: /workspace/config.json not found", file=sys.stderr)
        sys.exit(1)

    config = json.loads(config_path.read_text())

    adapter_name = config.get("adapter_name", "online-update")
    dataset_path = config.get("dataset_path", "/workspace/train.jsonl")
    output_dir = config.get("output_dir", "/workspace/adapter")
    gradient_accumulation = config.get("gradient_accumulation_steps", 4)
    replay_buffer_size = config.get("replay_buffer_size", 100)
    epochs = config.get("epochs", 1)

    print(f"=== Online LoRA Update ===")
    print(f"Adapter: {adapter_name}")
    print(f"Dataset: {dataset_path}")
    print(f"Output: {output_dir}")
    print(f"Gradient accumulation: {gradient_accumulation}")
    print(f"Replay buffer size: {replay_buffer_size}")

    try:
        from datasets import load_dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
        from peft import LoraConfig, get_peft_model

        dataset = load_dataset("json", data_files=dataset_path, split="train")

        # Limit to replay buffer size if dataset is larger
        if len(dataset) > replay_buffer_size:
            dataset = dataset.shuffle(seed=42).select(range(replay_buffer_size))

        base_model = config.get("base_model", "meta-llama/Llama-3.1-8B")
        tokenizer = AutoTokenizer.from_pretrained(base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype="auto",
            device_map="auto",
        )

        peft_config = LoraConfig(
            r=8,  # Small rank for online updates
            lora_alpha=16,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.0,
            bias="none",
            task_type="CAUSAL_LM",
        )

        model = get_peft_model(model, peft_config)

        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=gradient_accumulation,
            learning_rate=2e-5,
            logging_steps=5,
            save_strategy="no",
            bf16=True,
            report_to="none",
        )

        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            tokenizer=tokenizer,
        )

        trainer.train()
        model.save_pretrained(output_dir)
        print(f"Online update complete. Adapter saved to {output_dir}")

    except ImportError as e:
        print(f"WARNING: ML libraries not installed ({e}). Running in dry-run mode.")
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        (Path(output_dir) / "adapter_config.json").write_text(json.dumps({
            "method": "online_update",
            "adapter_name": adapter_name,
            "dry_run": True,
        }))
        print(f"Dry-run complete. Placeholder adapter saved to {output_dir}")


if __name__ == "__main__":
    main()
