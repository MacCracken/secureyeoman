#!/usr/bin/env python3
"""
Reward Model Trainer — binary cross-entropy classifier on preference pairs.

Reads /workspace/config.json and trains a reward model that scores
chosen responses higher than rejected ones.
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
    epochs = config.get("epochs", 1)
    batch_size = config.get("batch_size", 4)
    learning_rate = config.get("learning_rate", 1e-5)

    print(f"=== Reward Model Training ===")
    print(f"Base model: {base_model}")
    print(f"Dataset: {dataset_path}")
    print(f"Output: {output_dir}")

    try:
        from datasets import load_dataset
        from transformers import AutoModelForSequenceClassification, AutoTokenizer, TrainingArguments
        from trl import RewardTrainer

        dataset = load_dataset("json", data_files=dataset_path, split="train")
        tokenizer = AutoTokenizer.from_pretrained(base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForSequenceClassification.from_pretrained(
            base_model,
            num_labels=1,
            torch_dtype="auto",
            device_map="auto",
        )

        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            learning_rate=learning_rate,
            logging_steps=10,
            bf16=True,
            report_to="none",
        )

        trainer = RewardTrainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            tokenizer=tokenizer,
        )

        trainer.train()
        trainer.save_model(output_dir)
        print(f"Reward model training complete. Saved to {output_dir}")

    except ImportError as e:
        print(f"WARNING: ML libraries not installed ({e}). Running in dry-run mode.")
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        (Path(output_dir) / "reward_model_config.json").write_text(json.dumps({
            "method": "reward",
            "base_model": base_model,
            "dry_run": True,
        }))
        print(f"Dry-run complete. Placeholder saved to {output_dir}")


if __name__ == "__main__":
    main()
