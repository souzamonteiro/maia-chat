# Maia Chat — Product TODO

This checklist tracks the work required to take Maia Chat from its current prototype to a reliable, secure, and polished product.

## Current focus: professional public beta

Complete these items before expanding the product with accounts, file uploads, RAG, or tools.

### 1. Reliability and error handling

- [x] Discover installed Ollama models dynamically.
- [x] Use an installed lightweight model as the development default.
- [x] Stream Ollama responses to the browser.
- [x] Keep active streams alive while chunks are being received.
- [x] Preserve and display partial responses when generation fails.
- [x] Define application-specific error types for unavailable Ollama, missing models, invalid models, timeouts, and internal errors.
- [x] Add a specific context-overflow error after context management is implemented.
- [x] Return appropriate HTTP status codes for each implemented error type.
- [x] Replace raw error text in messages with a dedicated error component.
- [x] Add Retry and Continue actions after interrupted generations.
- [x] Show distinct Connecting, Loading model, Generating, Stopped, and Failed states.
- [x] Add graceful server shutdown that drains active streams.
- [x] Add separate liveness and readiness endpoints.

Acceptance criteria:

- A failed request never destroys the user prompt or partial response.
- Every common failure gives the user a clear explanation and recovery action.
- A slow but active model is not terminated by a fixed total-duration timeout.

### 2. Context and generation management

- [x] Record context-window metadata for each exposed model.
- [x] Estimate input tokens before sending a request.
- [x] Display current context usage in the composer.
- [x] Warn when a conversation approaches the model context limit.
- [x] Define a safe context-overflow strategy: trim, summarize, or ask the user.
- [x] Never silently discard conversation messages.
- [x] Add configurable maximum output tokens.
- [x] Add advanced controls for temperature and top-p.
- [x] Store generation settings with each conversation.
- [x] Display prompt tokens, completion tokens, elapsed time, and tokens per second.

Acceptance criteria:

- Users can see whether a conversation fits before submitting it.
- Context reduction is explicit and recoverable.
- Generation parameters are validated on both client and server.

### 3. Markdown and message presentation

- [x] Replace the custom regex renderer with a maintained Markdown parser.
- [x] Sanitize all generated HTML before inserting it into the page.
- [x] Support headings, lists, tables, blockquotes, links, and fenced code blocks.
- [x] Add syntax highlighting without blocking response streaming.
- [x] Add Copy buttons for messages and code blocks.
- [x] Render incomplete Markdown safely while a response is streaming.
- [x] Make reasoning display configurable and collapsed by default.
- [x] Ensure long URLs, tables, and code blocks work on mobile.

Acceptance criteria:

- Model output cannot inject scripts or unsafe HTML.
- Common Markdown renders consistently during and after streaming.
- Copying a message returns clean source text rather than rendered HTML.

### 4. Conversation experience

- [x] Rename conversations.
- [x] Delete conversations with confirmation and an undo period.
- [x] Generate useful conversation titles automatically.
- [x] Search conversation titles and content.
- [x] Add message actions: Copy, Edit and resend, Regenerate, Continue, and Delete.
- [x] Allow model changes to start a new branch or clearly mark the change.
- [x] Export a conversation as Markdown.
- [x] Export and import the complete history as versioned JSON.
- [x] Migrate conversation storage from `localStorage` to IndexedDB.
- [x] Add a versioned storage migration mechanism.

Acceptance criteria:

- Existing browser history survives application upgrades.
- Destructive actions require confirmation or offer undo.
- Users can export their data without creating an account.

### 5. Model experience and Maia identity

- [x] Add a configurable server-side system prompt.
- [x] Define Maia's identity, supported languages, tone, and formatting rules.
- [x] Allow model-specific system prompts and generation defaults.
- [x] Add friendly display names while preserving canonical model IDs in the API.
- [x] Show model metadata: provider, parameter size, context window, capabilities, and status.
- [x] Mark the default and currently loaded models.
- [x] Allow operators to blacklist canonical model IDs.
- [x] Add a model information and provenance page.
- [x] Decide whether raw Ollama model identifiers should be public.
- [x] Display the Maia Chat version in the interface and API.

Acceptance criteria:

- Maia behaves consistently across ordinary conversations.
- Users can understand the differences between available models.
- API clients continue to receive stable canonical model identifiers.

### 6. Interface and accessibility

- [x] Create reusable visual states and components instead of ad hoc DOM updates.
- [x] Add polished empty, loading, offline, and error states.
- [x] Add a mobile sidebar backdrop and close it with Escape.
- [x] Restore focus predictably after dialogs and mobile navigation.
- [x] Announce generated content and status changes to screen readers.
- [x] Verify keyboard-only operation for every action.
- [x] Add visible focus styles and accessible labels.
- [x] Respect reduced-motion and high-contrast preferences.
- [x] Add light, dark, and system theme options.
- [x] Introduce an internationalization layer.
- [x] Provide English, Portuguese, and Spanish translations.
- [x] Add production branding, icons, favicon, and metadata.

Acceptance criteria:

- Core workflows are usable by keyboard and screen reader.
- The interface works at common mobile and desktop widths.
- No user-facing strings are embedded outside the localization layer.

## Production readiness

### 7. Authentication and authorization

- [x] Separate browser session authentication from external API authentication.
- [x] Ensure enabling API authentication does not break the browser application.
- [x] Compare secrets using a timing-safe method.
- [x] Support individually revocable API keys.
- [x] Store only hashed API-key material.
- [x] Add API-key scopes and optional expiration.
- [ ] Add authenticated user accounts only after defining the data model and privacy policy.
- [x] Protect administrative and operational endpoints separately.

Acceptance criteria:

- Browser users never receive or embed server API secrets.
- Compromised API keys can be identified and revoked independently.
- Authentication failures reveal no sensitive configuration.

### 8. Abuse protection and privacy

- [x] Add per-IP and per-key rate limits.
- [x] Limit concurrent generations globally and per user/key.
- [x] Set validated limits for request bytes, message count, tokens, and output length.
- [x] Add queue limits and overload responses.
- [x] Configure trusted proxy handling for Nginx.
- [x] Define logging redaction rules; do not log prompt content by default.
- [x] Publish privacy, retention, acceptable-use, and model limitation notices.
- [x] Define retention and deletion behavior before adding server-side conversations.
- [x] Review security headers and Content Security Policy for every new dependency.
- [x] Document threat models for the public UI, API, Ollama, and private network.

Acceptance criteria:

- One client cannot consume all inference capacity.
- Logs do not unintentionally retain prompts, credentials, or personal data.
- Public documentation accurately describes data handling.

### 9. Observability and operations

- [x] Add request IDs to responses and logs.
- [x] Replace unstructured console logs with structured logs.
- [x] Record latency, first-token latency, duration, token counts, errors, and active streams.
- [x] Add metrics suitable for Prometheus or an equivalent system.
- [x] Add dashboards and alerts for availability, latency, errors, and saturation.
- [x] Add model warm-up and readiness checks.
- [x] Verify Nginx, WireGuard, Node.js, and Ollama timeout alignment.
- [x] Document backup, rollback, upgrade, and incident procedures.
- [x] Pin and document supported Node.js and Ollama versions.
- [x] Add a production configuration validation step at startup.

Acceptance criteria:

- Operators can diagnose a failed or slow request using its request ID.
- Deployments fail early when required production configuration is invalid.
- Alerts distinguish application, network, Ollama, and capacity failures.

### 10. Testing and delivery

- [x] Add ESLint and a consistent formatter.
- [x] Add unit tests for model discovery, timeout behavior, stream parsing, and error mapping.
- [x] Add unit tests for context management and Markdown sanitization.
- [x] Add integration tests with a mock Ollama server.
- [x] Test split NDJSON chunks, incomplete final lines, reasoning output, aborts, and upstream failures.
- [x] Add browser tests for send, stop, retry, model selection, history, and mobile navigation.
- [x] Add API contract tests for supported OpenAI-compatible behavior.
- [x] Add concurrency and long-running-stream load tests.
- [x] Add dependency and secret scanning.
- [x] Run linting, tests, and security checks in CI.
- [x] Define a release checklist and semantic versioning policy.
- [x] Add a changelog.

Acceptance criteria:

- Every merge runs deterministic automated checks.
- Streaming edge cases are covered without requiring a real model.
- A release can be reproduced, verified, and rolled back.

## Future product capabilities

Start these only after the public-beta and production foundations are complete.

- [x] File upload with explicit file size and type limits.
- [x] Document parsing and semantic chunking.
- [x] Retrieval-augmented generation with citations.
- [x] Saved document collections and retention controls.
- [x] Tool and function calling with permission boundaries.
- [x] Web search with source attribution.
- [x] Embeddings endpoint.
- [x] Additional providers such as llama.cpp and vLLM.
- [ ] Optional encrypted server-side conversation synchronization.
- [ ] Shared conversations and teams.
- [ ] Administrative model, usage, and capacity dashboard.

## Next implementation slice

The recommended next slice is intentionally small and testable:

- [x] Introduce the test runner and mock Ollama responses.
- [x] Add regression tests for streaming, inactivity timeout, cancellation, and model discovery.
- [x] Introduce typed application errors.
- [x] Add user-friendly error cards.
- [x] Add Retry and Continue actions while preserving partial responses.
- [x] Replace and sanitize the Markdown renderer.
- [x] Add basic context metadata and a visible context-usage warning.

Definition of done:

- The new behavior is covered by automated tests.
- User-facing text is available through the localization layer or prepared for migration to it.
- Documentation and configuration examples match the implementation.
- Desktop and mobile workflows have been manually verified.
