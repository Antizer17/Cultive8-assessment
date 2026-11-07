# AI Usage Log & Token Budget Planning

This document tracks all AI assistants, coding prompts, local model prompting strategies, prompt revisions, token budget math, and AI mistakes identified and corrected during development.

## 1. Tools & Coding Assistants Used
- Google Antigravity (Gemini 3.8 Flash)
- Local AI Model Engine: Ollama (`qwen2.5:1.5b` and `qwen2.5:0.5b`)

## 2. Token Budget Math (2,048 Limit)
- System Prompt & Schema: 250 tokens
- Rolling Memory / Carryover State: 350 tokens
- Log Chunk Text: 950 tokens
- Output Reservation: 498 tokens
- Total: 2,048 tokens
