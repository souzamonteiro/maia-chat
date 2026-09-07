# Changelog

All notable changes to Maia Chat are documented in this file.

## [Unreleased]

### Added

- Release policy and deployment checklist.
- Server-side model blacklist for hiding and rejecting selected canonical IDs.
- Separate token protection for detailed operational readiness.
- Local document parsing and semantic chunking for text attachments.
- Local attachment retrieval with source chunk citations in chat prompts.
- Browser-local document collections with explicit document and collection removal.
- OpenAI-compatible embeddings endpoint backed by Ollama with an explicit API scope.
- Operator allowlist for OpenAI-style tool calls forwarded to Ollama without server execution.
- Configurable OpenAI-compatible inference adapter for llama.cpp and vLLM.
- Optional private SearXNG web search with selected source attribution in chat history.

## [0.1.0] - 2026-09-07

### Added

- Local streaming chat UI backed by Ollama.
- OpenAI-compatible model and chat-completion endpoints.
- Browser-local IndexedDB conversation history, export/import, attachments, and
  recovery actions.
- Sanitized Markdown, local syntax highlighting, context estimates, and
  generation controls.
- API keys, request limits, queueing, structured logs, and Prometheus metrics.
- Model metadata, readiness checks, privacy notices, and deployment guidance.
