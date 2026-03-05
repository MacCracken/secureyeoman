#!/usr/bin/env python3
"""
DPO Trainer — Direct Preference Optimization via TRL DPOTrainer.

Reads /workspace/config.json for parameters and loads preference JSONL
(prompt/chosen/rejected) from the specified dataset path.

Usage:
    docker run --gpus all -v $WORKSPACE:/workspace ghcr.io/secureyeoman/dpo-trainer:latest
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

    base_model = config.get("base_model", "meta-llama/Llama-3.1-8B")
    dataset_path = config.get("dataset_path", "/workspace/train.jsonl")
    output_dir = config.get("output_dir", "/workspace/adapter")
    lora_rank = config.get("lora_rank", 16)
    lora_alpha = config.get("lora_alpha", 32)
    batch_size = config.get("batch_size", 4)
    epochs = config.get("epochs", 3)
    learning_rate = config.get("learning_rate", 5e-5)
    warmup_steps = config.get("warmup_steps", 100)
    checkpoint_steps = config.get("checkpoint_steps", 500)
    resume_from = config.get("resume_from_checkpoint")

    print(f"=== DPO Training ===")
    print(f"Base model: {base_model}")
    print(f"Dataset: {dataset_path}")
    print(f"Output: {output_dir}")
    print(f"LoRA rank={lora_rank}, alpha={lora_alpha}")
    print(f"Batch size={batch_size}, epochs={epochs}")
    print(f"Learning rate={learning_rate}, warmup={warmup_steps}")

    try:
        from datasets import load_dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
        from peft import LoraConfig
        from trl import DPOTrainer

        # Load preference pairs
        dataset = load_dataset("json", data_files=dataset_path, split="train")

        # Load model and tokenizer
        tokenizer = AutoTokenizer.from_pretrained(base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype="auto",
            device_map="auto",
        )

        # LoRA config
        peft_config = LoraConfig(
            r=lora_rank,
            lora_alpha=lora_alpha,
            target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            learning_rate=learning_rate,
            warmup_steps=warmup_steps,
            save_steps=checkpoint_steps,
            logging_steps=10,
            gradient_accumulation_steps=4,
            bf16=True,
            remove_unused_columns=False,
            report_to="none",
        )

        if resume_from:
            training_args.resume_from_checkpoint = resume_from

        # DPO Trainer
        trainer = DPOTrainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            tokenizer=tokenizer,
            peft_config=peft_config,
            beta=0.1,
        )

        trainer.train()
        trainer.save_model(output_dir)
        print(f"DPO training complete. Adapter saved to {output_dir}")

    except ImportError as e:
        print(f"WARNING: ML libraries not installed ({e}). Running in dry-run mode.")
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        (Path(output_dir) / "adapter_config.json").write_text(json.dumps({
            "method": "dpo",
            "base_model": base_model,
            "lora_rank": lora_rank,
            "dry_run": True,
        }))
        print(f"Dry-run complete. Placeholder adapter saved to {output_dir}")


if __name__ == "__main__":
    main()
