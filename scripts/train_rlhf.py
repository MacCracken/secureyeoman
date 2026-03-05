#!/usr/bin/env python3
"""
RLHF Trainer — PPO training using TRL PPOTrainer + reward model.

Reads /workspace/config.json and uses a pre-trained reward model
to optimize the policy model via PPO.
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
    reward_model_path = config.get("reward_model_path", "/workspace/reward_model")
    dataset_path = config.get("dataset_path", "/workspace/train.jsonl")
    output_dir = config.get("output_dir", "/workspace/adapter")
    epochs = config.get("epochs", 1)
    batch_size = config.get("batch_size", 4)
    learning_rate = config.get("learning_rate", 1e-5)
    lora_rank = config.get("lora_rank", 16)
    lora_alpha = config.get("lora_alpha", 32)

    print(f"=== RLHF (PPO) Training ===")
    print(f"Base model: {base_model}")
    print(f"Reward model: {reward_model_path}")
    print(f"Dataset: {dataset_path}")
    print(f"Output: {output_dir}")

    try:
        from datasets import load_dataset
        from transformers import AutoModelForCausalLM, AutoModelForSequenceClassification, AutoTokenizer
        from peft import LoraConfig
        from trl import PPOConfig, PPOTrainer, AutoModelForCausalLMWithValueHead

        tokenizer = AutoTokenizer.from_pretrained(base_model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Load policy model with LoRA
        peft_config = LoraConfig(
            r=lora_rank,
            lora_alpha=lora_alpha,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        )

        model = AutoModelForCausalLMWithValueHead.from_pretrained(
            base_model,
            torch_dtype="auto",
            device_map="auto",
            peft_config=peft_config,
        )

        # Load reward model
        reward_model = AutoModelForSequenceClassification.from_pretrained(
            reward_model_path,
            num_labels=1,
            torch_dtype="auto",
            device_map="auto",
        )

        # Load prompts
        dataset = load_dataset("json", data_files=dataset_path, split="train")

        ppo_config = PPOConfig(
            learning_rate=learning_rate,
            batch_size=batch_size,
            mini_batch_size=min(batch_size, 4),
            ppo_epochs=epochs,
            log_with="none",
        )

        ppo_trainer = PPOTrainer(
            config=ppo_config,
            model=model,
            tokenizer=tokenizer,
        )

        # Training loop
        for _epoch in range(epochs):
            for batch in dataset.iter(batch_size=batch_size):
                queries = [tokenizer.encode(p, return_tensors="pt").squeeze() for p in batch["prompt"]]
                responses = ppo_trainer.generate(queries, max_new_tokens=256)
                rewards = []  # Score responses with reward model
                for resp in responses:
                    text = tokenizer.decode(resp, skip_special_tokens=True)
                    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
                    score = reward_model(**inputs.to(reward_model.device)).logits.item()
                    rewards.append(score)
                import torch
                reward_tensors = [torch.tensor(r) for r in rewards]
                ppo_trainer.step(queries, responses, reward_tensors)

        model.save_pretrained(output_dir)
        print(f"RLHF training complete. Adapter saved to {output_dir}")

    except ImportError as e:
        print(f"WARNING: ML libraries not installed ({e}). Running in dry-run mode.")
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        (Path(output_dir) / "adapter_config.json").write_text(json.dumps({
            "method": "rlhf",
            "base_model": base_model,
            "reward_model_path": reward_model_path,
            "dry_run": True,
        }))
        print(f"Dry-run complete. Placeholder adapter saved to {output_dir}")


if __name__ == "__main__":
    main()
