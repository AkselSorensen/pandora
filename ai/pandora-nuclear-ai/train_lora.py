"""LoRA/QLoRA training entrypoint for Pandora Nuclear AI.

This script fine-tunes an instruct model on ChatML/OpenAI-compatible JSONL
examples. It is intentionally domain-safe: the bundled dataset trains strategic
OSINT, civil nuclear safety, escalation analysis and refusals for dangerous
requests. It does not generate or validate operational nuclear weapon content.

Example:
    python train_lora.py --model Qwen/Qwen2.5-7B-Instruct --train train.jsonl --eval eval.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
from pathlib import Path
from typing import Any


# Keep HuggingFace output quieter on Windows where symlink support often needs
# Developer Mode/admin. This warning is harmless but noisy during downloads.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# Windows fix: some TRL releases call Path.read_text() without an explicit
# encoding while loading bundled Jinja chat templates. On French/Western Windows
# this can default to cp1252 and crash on UTF-8 template bytes before training
# even starts. Force UTF-8 for implicit pathlib reads inside this process.
_ORIGINAL_PATH_READ_TEXT = pathlib.Path.read_text


def _read_text_utf8_default(self: pathlib.Path, *args: Any, **kwargs: Any) -> str:
    if not args and kwargs.get("encoding") is None:
        kwargs["encoding"] = "utf-8"
    return _ORIGINAL_PATH_READ_TEXT(self, *args, **kwargs)


pathlib.Path.read_text = _read_text_utf8_default

import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
from trl import SFTConfig, SFTTrainer


DEFAULT_SYSTEM = (
    "Tu es Pandora Nuclear AI, analyste OSINT defensif specialise en stabilite strategique "
    "nucleaire, surete nucleaire civile et risques d'escalade."
)


def load_chat_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            messages = item.get("messages")
            if not isinstance(messages, list):
                raise ValueError(f"{path}:{line_no} missing messages[]")
            rows.append({"messages": messages})
    return rows


def to_text(tokenizer: AutoTokenizer, messages: list[dict[str, str]]) -> str:
    if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    chunks: list[str] = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content", "")
        chunks.append(f"<{role}>\n{content}\n</{role}>")
    return "\n".join(chunks)


def build_dataset(tokenizer: AutoTokenizer, path: Path) -> Dataset:
    rows = load_chat_jsonl(path)
    texts = []
    for row in rows:
        messages = row["messages"]
        if messages and messages[0].get("role") != "system":
            messages = [{"role": "system", "content": DEFAULT_SYSTEM}, *messages]
        texts.append({"text": to_text(tokenizer, messages)})
    return Dataset.from_list(texts)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune Pandora Nuclear AI with LoRA/QLoRA")
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct", help="Base instruct model. Use 1.5B/3B locally, 7B+ on a GPU with enough VRAM.")
    parser.add_argument("--train", default="train.jsonl", help="Training JSONL path")
    parser.add_argument("--eval", default="", help="Optional eval JSONL with messages[]; benchmark eval.jsonl is not used for loss")
    parser.add_argument("--output", default="outputs/pandora-nuclear-ai-lora", help="Output adapter directory")
    parser.add_argument("--max-seq-length", type=int, default=4096)
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--no-4bit", action="store_true", help="Disable QLoRA 4-bit loading")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train_path = Path(args.train)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    has_cuda = torch.cuda.is_available()
    use_4bit = bool(not args.no_4bit and has_cuda)
    if not has_cuda and not args.no_4bit:
        print(
            "[Pandora Nuclear AI] No CUDA accelerator detected: disabling 4-bit/bitsandbytes training "
            "for this run. For GPU QLoRA, install CUDA PyTorch and run on an NVIDIA GPU."
        )

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization_config = None
    if use_4bit:
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False

    train_dataset = build_dataset(tokenizer, train_path)

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    training_kwargs = dict(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        logging_steps=5,
        save_strategy="epoch",
        bf16=has_cuda,
        fp16=False,
        optim="paged_adamw_8bit" if use_4bit else "adamw_torch",
        warmup_ratio=0.03,
        lr_scheduler_type="cosine",
        report_to="none",
        dataloader_pin_memory=has_cuda,
    )

    try:
        training_args = SFTConfig(
            **training_kwargs,
            dataset_text_field="text",
            max_length=args.max_seq_length,
            packing=False,
        )
        trainer = SFTTrainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            peft_config=peft_config,
            processing_class=tokenizer,
        )
    except TypeError:
        # Backward compatibility with older TRL releases where SFTTrainer
        # accepted tokenizer/dataset_text_field/max_seq_length directly.
        training_args = TrainingArguments(**training_kwargs)
        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            args=training_args,
            train_dataset=train_dataset,
            peft_config=peft_config,
            dataset_text_field="text",
            max_seq_length=args.max_seq_length,
            packing=False,
        )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    print(f"Saved LoRA adapter to {output_dir}")
    print("Next steps: merge adapter with the base model, export GGUF with llama.cpp, then create Ollama model with Modelfile.gguf.example.")


if __name__ == "__main__":
    main()