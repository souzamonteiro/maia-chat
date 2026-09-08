export class ApiError extends Error {
  constructor(message, { status = 0, type = 'request_error', code = 'request_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

async function responseError(response, fallback) {
  try {
    const data = await response.json();
    if (data.error?.message) {
      return new ApiError(data.error.message, {
        status: response.status,
        type: data.error.type,
        code: data.error.code
      });
    }
  } catch {
    // Use the generic error when an upstream response is not JSON.
  }

  return new ApiError(fallback, { status: response.status });
}

export async function getConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load configuration.');
  return response.json();
}

export async function getHealth() {
  const response = await fetch('/api/health');
  return {
    ok: response.ok,
    data: await response.json()
  };
}

export async function getModels() {
  const response = await fetch('/api/models');
  if (!response.ok) throw new Error('Could not load models.');
  const data = await response.json();
  return data.data || [];
}

function base64(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function extractDocument(file) {
  const response = await fetch('/api/documents/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      contentBase64: base64(await file.arrayBuffer())
    })
  });
  if (!response.ok)
    throw await responseError(response, `Document extraction failed (${response.status}).`);
  return response.json();
}

export async function searchWeb(query, language) {
  const params = new URLSearchParams({ q: query });
  if (language) params.set('language', language);
  const response = await fetch(`/api/search?${params}`);
  if (!response.ok)
    throw await responseError(response, `Search request failed (${response.status}).`);
  const data = await response.json();
  return data.data || [];
}

export async function streamChat({ model, messages, settings, signal, onToken, onComplete }) {
  const response = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      ...settings,
      stream: true
    }),
    signal
  });

  if (!response.ok) {
    throw await responseError(response, `Chat request failed (${response.status}).`);
  }

  if (!response.body) throw new Error('Streaming is not supported by this browser.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const line = event.split('\n').find((item) => item.startsWith('data: '));

      if (!line) continue;
      const payload = line.slice(6).trim();

      if (payload === '[DONE]') return;

      const data = JSON.parse(payload);
      if (data.error) {
        throw new ApiError(data.error.message, {
          type: data.error.type,
          code: data.error.code
        });
      }

      const token = data.choices?.[0]?.delta?.content;
      if (token) onToken(token);

      if (data.choices?.[0]?.finish_reason) {
        onComplete?.({ usage: data.usage, elapsedMs: data.elapsed_ms });
      }
    }
  }
}
