# Maia Chat

Maia Chat is the public web interface and OpenAI-compatible gateway for Maia language models.

The default provider is **Ollama**. The web application does not talk directly
to an inference provider; it talks to Maia Chat, which supports Ollama and
OpenAI-compatible servers such as `llama.cpp` and vLLM.

## Architecture

```text
Browser
   |
   | HTTPS
   v
maia.maiaplatform.org
   |
   v
Nginx / Maia Edge VPS
   |
   | WireGuard
   v
Maia Chat (Node.js)
   |
   | localhost / private network
   v
Ollama
   |
   +-- qwen2.5:3b
   +-- future Maia models
```

## Current features

- Responsive web chat interface
- Streaming responses
- Local conversation history
- Local text-file attachments in chat messages
- Rename, delete with undo, and message recovery actions
- Markdown and versioned JSON conversation export/import
- Model selection from Ollama
- Stop generation
- Sanitized Markdown and local syntax highlighting
- Production favicon, manifest, and page metadata
- Health endpoint
- OpenAI-style `GET /v1/models`
- OpenAI-style `POST /v1/chat/completions`
- Optional bearer-token API authentication
- Nginx deployment example for Maia Edge
- systemd service

## Requirements

- Ubuntu 24.04 LTS or compatible Linux
- Node.js 20+
- Ollama 0.32.0 baseline
- At least one model installed in Ollama
- Nginx on the public ingress if using Maia Edge

## Inference providers

Ollama is the default:

```env
MAIA_INFERENCE_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
```

For `llama.cpp` or vLLM in OpenAI-compatible mode, configure its base URL and
optional bearer token. The server must expose `/v1/models`,
`/v1/chat/completions`, and `/v1/embeddings`.

```env
MAIA_INFERENCE_PROVIDER=openai-compatible
MAIA_OPENAI_COMPATIBLE_URL=http://127.0.0.1:8000
MAIA_OPENAI_COMPATIBLE_TOKEN=
```

Web search is designed for a private SearXNG deployment. See
[docs/SEARXNG.md](docs/SEARXNG.md) for installation, network restrictions, and
Maia Chat configuration.

## Web search

After SearXNG is installed, enable the private search bridge:

```env
MAIA_SEARCH_PROVIDER=searxng
MAIA_SEARXNG_URL=http://127.0.0.1:8080
MAIA_SEARCH_TIMEOUT_MS=10000
MAIA_SEARCH_MAX_RESULTS=5
```

The composer shows web search only when the server enables it. Search results
are fetched by Maia Chat, not the browser; select sources before sending a
message to include their title, URL, and summary as local, citable context.
Results are not retained by the server. Selected sources are stored with the
browser-local conversation so their links remain available in its history.

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

## Native installation

On Ubuntu/Debian, install Maia Chat without Docker from a complete repository
checkout. The installer creates the unprivileged `maia` system user, installs
Node.js 22 and required system packages, copies the application to
`/srv/maia/maia-chat`, installs production dependencies, creates a private
`.env` if needed, and enables `maia-chat.service`.

```bash
sudo ./scripts/install.sh
```

Existing `/srv/maia/maia-chat/.env` files are preserved. Review it after the
first install, then apply configuration changes with:

```bash
sudo systemctl restart maia-chat
sudo systemctl status maia-chat --no-pager
```

For supported runtime and release procedures, see
[docs/RELEASES.md](docs/RELEASES.md). Changes are tracked in
[CHANGELOG.md](CHANGELOG.md).

## Testing

Run the deterministic suite with `npm test`. It covers model discovery, error
mapping, context limits, Markdown sanitization, stream parsing, split and final
NDJSON lines, reasoning output, inactivity timeout, cancellation, and a real
HTTP integration against an ephemeral mock Ollama server. No local model is
required for these tests. The suite also verifies the public `/v1/models` and
`/v1/chat/completions` response contracts, including streamed SSE chunks.

Run browser workflows with `npm run test:browser`. The CI installs Playwright
Chromium. On a workstation with Chrome already installed, use
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:browser`.
Browser coverage includes sending, response streaming, cancellation, recovery
after an interrupted response, model selection and branching, persisted history,
and mobile navigation.

Open:

```text
http://127.0.0.1:3080
```

Make sure Ollama is running:

```bash
ollama serve
```

and that a model exists:

```bash
ollama list
```

For the current experimental machine, configure for example:

```env
MAIA_DEFAULT_MODEL=qwen2.5:3b
MAIA_VERSION=0.1.0
MAIA_SYSTEM_PROMPT=
MAIA_CONTEXT_WINDOW=8192
OLLAMA_URL=http://127.0.0.1:11434
```

`MAIA_CONTEXT_WINDOW` defines the context limit announced for installed models.
Maia Chat estimates the tokens in the full history before every request. It
does not discard messages automatically: requests that exceed the configured
limit return a recoverable `context_overflow` error so the user can reduce the
conversation or start a new one.

Each conversation stores its own generation settings. The composer exposes a
maximum output of 1 to 8192 tokens, temperature from 0 to 2, and top-p from
0.01 to 1. The browser and API both validate these ranges.

Completed assistant messages display upstream prompt and completion token counts,
elapsed generation time, and completion tokens per second.

Markdown is parsed with `marked`, sanitized with DOMPurify, and uses a locally
served `highlight.js` bundle for fenced code blocks. Unterminated code fences
received while streaming are closed only in the rendered copy, so source text
and the eventual completed message remain intact.

On narrow screens, long URLs wrap within the message while tables and code blocks
scroll horizontally inside their own bounds, preventing them from expanding the
page layout.

Messages and individual code blocks have source-text copy actions. Reasoning
blocks are collapsed by default; **Expand reasoning** persists a local display
preference without changing the stored response text.

## Accessibility and appearance

The interface offers System, Light, and Dark themes, persisted locally. It also
provides visible keyboard focus indicators, observes reduced-motion preferences,
and increases borders for high-contrast preferences.

The main interface provides English, Portuguese, and Spanish language options.
The selected language is stored alongside browser preferences in IndexedDB and
is restored when the application opens. Controls, accessibility labels, loading
and connection states, recovery actions, confirmations, and local browser errors
use the selected language; model output and upstream error detail remain source
content and are not translated.

IndexedDB also persists the selected theme, reasoning display preference, model
chosen for a new conversation, every conversation's selected model, and its
generation settings. Draft text and unsubmitted attachments remain temporary by
design and are not retained across a reload.

Operational status changes are announced through an accessible status region.
Responses generated by Maia use polite live regions and expose a busy state while
streaming, so screen-reader users receive response updates without user prompts
being announced as generated content.

The main conversation area presents loading and unavailable-service notices. An
unavailable Ollama service disables Send and provides a Retry action, while chat
history remains visible and unchanged.

`MAIA_SYSTEM_PROMPT` optionally replaces Maia's server-side identity prompt.
The default establishes Maia as a practical assistant that supports Portuguese,
English, and Spanish, asks it to use clear Markdown, and protects against
instruction injection through attached reference material.

`MAIA_MODEL_SETTINGS` optionally assigns a server-side `systemPrompt` and
generation defaults to a canonical model ID. Prompts remain private; only safe
defaults are included in model metadata and applied to new local conversations.

```env
MAIA_MODEL_SETTINGS={"qwen2.5-coder:7b":{"systemPrompt":"Focus on code.","generation":{"temperature":0.2,"top_p":0.95,"max_tokens":1024}}}
```

`MAIA_MODEL_BLACKLIST` is an optional JSON array of canonical model IDs. Blocked
models are omitted from model discovery and rejected with `model_disabled` if an
API client requests one directly. The configured default model cannot be blocked.

Available models retain their canonical API IDs while the interface shows a
friendly name with provider, parameter size when Ollama provides it, context
window, capabilities, and status. `MAIA_VERSION` is exposed by `/api/config`
and displayed in the interface.

**Model ID policy:** canonical Ollama IDs are intentionally public through
`/v1/models`, `/api/models`, exports, and the Model info page. They are the
stable identifiers required by API clients and stored conversation branches.
Friendly names are used for primary interface labels; canonical IDs are retained
where users or clients need an exact, reproducible model reference.

Model status distinguishes the configured **Default** model from models currently
**Loaded** in Ollama. Loaded status is obtained from Ollama's process list and is
best-effort: model discovery remains available when that optional query fails.
The **Model info** link in the interface opens a public inventory with canonical
IDs, metadata, runtime status, and provenance guidance without exposing private
system prompts.

## Capacity limits

Maia Chat bounds incoming JSON with `MAIA_MAX_REQUEST_BYTES` (1 MiB by default),
accepts up to `MAIA_MAX_MESSAGES` messages (100), caps output with
`MAIA_MAX_OUTPUT_TOKENS` (2048), and runs up to
`MAIA_MAX_CONCURRENT_GENERATIONS` requests (2) at once. An additional
`MAIA_MAX_CONCURRENT_GENERATIONS_PER_CLIENT` limit (1) applies by API key ID for
`/v1/*` callers or source IP for public browser routes. Chat routes also use an
in-memory sliding-window limit of `MAIA_RATE_LIMIT_MAX_REQUESTS` (20) per
`MAIA_RATE_LIMIT_WINDOW_MS` (60 seconds), per client IP and, for `/v1/*`, per
non-reversible key fingerprint. Overload responses use `429` with `Retry-After`
or `503` when generation capacity is full.

When all generation slots are in use, up to `MAIA_MAX_QUEUED_GENERATIONS` (8)
requests wait in FIFO order for `MAIA_GENERATION_QUEUE_TIMEOUT_MS` (30 seconds).
Requests are rejected with `503` and `Retry-After` if that queue is full or the
wait expires.

## Operations

Every response includes `X-Request-Id`; callers may provide their own value for
cross-service correlation. Logs are structured JSON and intentionally omit
prompts, completions, authorization headers, and attachment contents. Generation
events record only request/completion IDs, model, streaming mode, first-token
latency, duration, upstream token counts, and stable error codes.

Set `MAIA_METRICS_TOKEN` to expose Prometheus text metrics at `GET /api/metrics`:

```http
Authorization: Bearer <metrics-token>
```

The endpoint returns `404` when no metrics token is configured or when the token
is invalid. It includes HTTP request counts/durations, generation outcomes,
generation and first-token durations, upstream token totals, and active/queued
generation gauges.

Alert rules, dashboard queries, scrape guidance, and request-ID triage are in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

Maia Chat validates production configuration before binding its HTTP port. It
rejects invalid ports, host names, Ollama URLs, numeric capacity limits, duplicate
API-key IDs, malformed hashes, unsupported scopes, and invalid key expiration
timestamps. This prevents a partially configured process from serving traffic.

Security headers are applied to the browser UI and locally served dependencies:
CSP restricts content to the Maia origin, permits only the pinned import-map hash
for module resolution, and blocks frames and embedded objects. The API contract
test guards these headers against accidental weakening.

## Attachments

The composer can attach up to three local text files (`.txt`, `.text`, `.md`,
`.markdown`, `.csv`, `.json`, and `.log`) or documents in PDF, DOCX, XLSX, and
PPTX format. Text files are limited to 512 KiB; PDF and Office files are
limited to `MAIA_MAX_DOCUMENT_BYTES` (10 MiB by default). The combined browser
limit is 20 MiB. Office and PDF files are sent to a temporary extraction
endpoint and only extracted text/chunks are stored in the local conversation;
the original files are not retained by Maia Chat.

For a question sent after documents are attached, Maia Chat ranks local chunks
by shared terms with the question and sends up to four relevant sources to the
model. The model is instructed to cite factual claims as `[file name, chunk
n/total]`. Retrieval stays within the browser conversation: it does not create
a server-side document collection, use embeddings, or make external requests.

The sidebar also provides browser-local document collections. A saved document
is retained in IndexedDB until it is removed explicitly or its collection is
deleted; removing a collection removes all documents in it. The default Library
collection is retained so a collection is always available for local retrieval.

## Conversation data

Conversations are stored in browser-local IndexedDB. Existing v1 `localStorage`
history is migrated once and removed only after the IndexedDB write succeeds.
Use **Export MD** for a readable
single-conversation copy, and **Export JSON** / **Import JSON** for a versioned
portable history. Import preserves existing conversations when their IDs differ.
Deleting a conversation asks for confirmation and offers a five-second undo.
New conversations receive a concise title from the first prompt, and the sidebar
searches titles, messages, attachment names, and attachment text without sending
that search data to the server.

Clearing a conversation also asks for confirmation and offers the same five-second
undo. Restoring a cleared conversation prepends its prior history, preserving any
messages created before Undo was selected.

Changing the selected model in a conversation with history asks for confirmation
and creates a local branch. The original conversation remains unchanged; the new
branch records its parent and selected model in its title and stored metadata.

## API

### Health

```http
GET /api/health
```

Liveness does not depend on Ollama and is suitable for process probes:

```http
GET /api/health/live
```

Readiness verifies that Ollama is reachable and models can be listed:

```http
GET /api/health/ready
Authorization: Bearer <MAIA_OPERATIONS_TOKEN>
```

`/api/health` is public and returns only the summary used by the browser. Detailed
readiness requires `MAIA_OPERATIONS_TOKEN` and returns `404` when it is disabled
or the token is invalid. Readiness also requires `MAIA_DEFAULT_MODEL` to be installed. Set
`MAIA_WARMUP_MODEL=true` to issue an empty, zero-token request at startup and
keep that model warm for ten minutes. Warm-up is opt-in so idle deployments do
not retain model memory unnecessarily.

### Models

```http
GET /v1/models
```

### Embeddings

```http
POST /v1/embeddings
Content-Type: application/json
Authorization: Bearer <API key with embeddings scope>
```

The endpoint accepts `input` as a string or array of strings and forwards it to
Ollama's local embedding API. Responses use OpenAI-compatible indexed vectors.
Requesting a blocked or unavailable model returns the same stable model errors
as chat completions.

### Tool calling

Chat completions accept OpenAI-style `tools` function definitions only when the
function name is listed in `MAIA_TOOL_ALLOWLIST`, a JSON array of permitted
names. The default empty allowlist rejects all tools with `tool_not_allowed`.
Maia forwards approved definitions and returns Ollama `tool_calls`, but never
executes a tool: the authenticated API client must enforce its own permissions
and execute any requested function outside Maia Chat.

### Chat completion

```http
POST /v1/chat/completions
Content-Type: application/json
```

Example:

```json
{
  "model": "qwen2.5:3b",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "Hello, Maia."
    }
  ]
}
```

Streaming follows the familiar SSE shape:

```text
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]
```

## Production installation

Clone the repository on the Maia Edge client:

```bash
cd /srv/maia
git clone https://github.com/YOUR_USER/maia-chat.git
cd maia-chat
sudo ./scripts/install.sh
```

Then edit:

```bash
sudo nano /srv/maia/maia-chat/.env
```

Recommended when the Node server should be reachable only over WireGuard:

```env
HOST=10.20.0.2
PORT=3080
MAIA_NAME=Maia
MAIA_DEFAULT_MODEL=qwen2.5:3b
MAIA_CONTEXT_WINDOW=8192
OLLAMA_URL=http://127.0.0.1:11434
```

Replace `10.20.0.2` with the actual WireGuard address of the client.

Restart:

```bash
sudo systemctl restart maia-chat
sudo systemctl status maia-chat
```

Allow only WireGuard traffic:

```bash
sudo ufw allow in on wg0 to any port 3080 proto tcp
```

## Public Nginx

Use `deploy/nginx/maia.maiaplatform.org.conf` on the public Maia Edge VPS.

Change:

```nginx
set $maia_upstream http://10.20.0.2:3080;
```

to the real WireGuard client IP.

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Issue the TLS certificate in the same manner already used for the other Maia Platform subdomains.

## Security model

Ollama should **not** be exposed directly to the Internet.

Recommended flow:

```text
Internet -> Nginx -> WireGuard -> Maia Chat -> Ollama
```

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the supported trust
boundaries, controls, residual risks, and review triggers.

For external programmatic access to `/v1/*`, set:

```env
MAIA_API_KEYS=[{"id":"cli","hash":"<sha256-hex>","scopes":["models","chat"]}]
```

Generate a random bearer token and its stored hash locally:

```bash
npm run generate-api-key -- cli
```

Keep the emitted bearer token only in the client; place only the emitted JSON
record in `MAIA_API_KEYS`. A record can limit access with `models` and/or
`chat`, and may include an ISO-8601 `expiresAt` field. Remove one record and
restart Maia Chat to revoke that key without affecting other clients.

Clients use the generated token:

```http
Authorization: Bearer <generated-token>
```

Do not embed that key in the public web UI. The browser application uses the
separate `/api/*` routes and continues to work when API-key authentication is
enabled for `/v1/*`.

If the built-in web UI must remain public while the API later becomes authenticated, split public UI routes and external API authentication into separate policies or subdomains.

## Future Maia model

When the first Maia model is available through Ollama, the change can be as small as:

```env
MAIA_DEFAULT_MODEL=maia-small
```

The web interface and API remain unchanged.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

For the prioritized implementation checklist and acceptance criteria, see [TODO.md](TODO.md).

## License

MIT
