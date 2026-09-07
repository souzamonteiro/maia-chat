# Maia Chat Threat Model

## Scope

This document covers the public browser UI, the external `/v1/*` API, the Maia
Chat server, Ollama, and the private network between Nginx and the server. It
does not claim to protect a compromised host, browser extension, operating
system, or inference model.

## Assets

- Browser-local conversation history and supported text attachments.
- API bearer tokens and metrics token.
- Inference capacity, model availability, and model configuration.
- Private Ollama endpoint and the network path to it.
- Operational logs and Prometheus metrics.

## Browser UI

Threats include malicious model output, prompt injection from attachments,
browser storage loss, and unauthorized local access to an unlocked browser.

Controls:

- Markdown output is sanitized before insertion into the DOM.
- Attachments remain local until submitted and are enclosed as reference
  material in the model request.
- Conversation data and preferences are stored in browser-local IndexedDB.
- Export, deletion confirmation, and Undo let users retain or recover data.
- CSP restricts scripts, styles, connections, frames, and object embedding.

Residual risk: a model can still produce misleading content. A user must review
important output and protect their browser profile and device.

## External API

Threats include unauthorized inference use, key leakage, replay, brute-force
requests, and a single client exhausting capacity.

Controls:

- `/v1/*` accepts individually revocable SHA-256-hashed API-key records.
- Keys can have `models` and `chat` scopes and optional expiration.
- Hashes are compared with `timingSafeEqual`; raw keys are not stored in config
  records or application logs.
- Per-IP and per-key limits, bounded request size, output limits, concurrency
  limits, and a bounded FIFO generation queue constrain abuse.

Residual risk: API keys are bearer credentials. Clients must store them in a
secret manager or equivalent protected environment and use TLS at the public
ingress.

## Operations Endpoints

Threats include metrics exposure, configuration reconnaissance, and accidental
access to operational controls.

Controls:

- `/api/metrics` is separate from external API authentication and requires
  `MAIA_METRICS_TOKEN`; it returns `404` when disabled or unauthorized.
- Liveness is intentionally minimal. Readiness reports model availability for
  orchestration.
- Request IDs, structured logs, and metrics omit prompts, completions,
  attachment text, authorization headers, and bearer tokens.

Residual risk: health and public model metadata reveal service availability and
installed model identifiers. Deploy them only where that information is
acceptable to disclose. Canonical model IDs are intentionally public so API
clients, exports, and branches can reference a stable model; deployments that
cannot disclose their installed-model inventory must restrict these routes at
the ingress layer.

## Ollama and Private Network

Threats include direct Ollama exposure, proxy header spoofing, TLS termination
misconfiguration, and timeout mismatches that interrupt streams.

Controls:

- Ollama is intended to bind only to localhost or a private trusted address.
- Nginx is the public TLS ingress; WireGuard carries traffic to Maia Chat.
- `MAIA_TRUSTED_PROXY` must list only the Nginx address or trusted CIDR before
  forwarded client IPs are trusted for rate limits.
- Streaming responses disable buffering and use inactivity, not total-duration,
  upstream timeouts.

Residual risk: a trusted proxy or private-network host can still access the
service. Restrict firewall rules, WireGuard peers, and host administration.

## Review Triggers

Review this model before adding accounts, server-side history, binary uploads,
RAG, tools, external search, providers, sharing, or administrative write APIs.
Each change can introduce new data flows, authorization boundaries, retention
requirements, and prompt-injection paths.
