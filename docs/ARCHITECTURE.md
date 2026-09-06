# Maia Chat Architecture

## Goals

Maia Chat provides a stable public interface for language-model inference while keeping the underlying runtime replaceable.

The browser must never depend directly on Ollama-specific API semantics.

## Components

### Browser client

Responsibilities:

- Render conversations.
- Persist early-stage conversation history locally.
- Stream assistant output.
- Select exposed models.
- Cancel an in-progress generation.

### Maia Chat server

Responsibilities:

- Serve the static web application.
- Present a stable Maia/OpenAI-compatible API.
- Translate requests to the active inference provider.
- Enforce future authentication, limits, logging and policy.
- Keep Ollama private.

### Ollama provider

The first provider maps Maia/OpenAI-style requests into Ollama `/api/chat` requests.

Provider code is intentionally isolated under:

```text
server/providers/
```

Future runtimes can be added without redesigning the browser application.

## Network topology

```text
                              PUBLIC
                                |
                                v
                  maia.maiaplatform.org:443
                                |
                         Nginx on VPS
                                |
                          WireGuard wg0
                                |
             +------------------+------------------+
             |                                     |
             v                                     |
       Maia Chat :3080                             |
             |                                     |
             v                                     |
       Ollama :11434                               |
             |                                     |
       Local GPU / CPU                             |
                                                   |
                  OFFICE / ON-PREM ----------------+
```

## API boundary

The primary public inference boundary is:

```text
/v1/*
```

Initial compatibility surface:

```text
GET  /v1/models
POST /v1/chat/completions
```

The internal operational surface is:

```text
/api/*
```

Initial endpoints:

```text
GET /api/config
GET /api/health
```

## Streaming

Ollama returns newline-delimited JSON.

Maia Chat converts it to Server-Sent Events compatible with common OpenAI clients:

```text
Ollama NDJSON
      |
      v
Maia provider adapter
      |
      v
SSE chat.completion.chunk
      |
      v
Browser
```

Nginx proxy buffering must be disabled for this route.

## Security

Ollama should bind only to localhost or another trusted internal address.

The recommended trust boundary is:

```text
Internet
  |
  v
TLS/Nginx
  |
  v
WireGuard
  |
  v
Maia Chat
  |
  v
Ollama
```

API authentication is intentionally implemented at the Maia Chat layer rather than at Ollama.

## Storage

Version 0.1 keeps conversation data in the browser.

This avoids collecting user conversations centrally while the project is experimental.

A later release may add:

- IndexedDB for larger browser-side history.
- Optional server-side persistence.
- User accounts.
- Explicit retention policies.

## Future MaiaLLM deployment

The UI is model-independent.

Once a Maia model becomes available:

```text
ollama create maia-small ...
```

and:

```env
MAIA_DEFAULT_MODEL=maia-small
```

No browser architecture change is required.
