import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError, streamChat } from '../public/js/api.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('streamChat preserves structured errors from an HTTP response', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: 'The requested model is not installed: missing:latest',
          type: 'invalid_request_error',
          code: 'model_not_installed'
        }
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }
    );

  await assert.rejects(
    streamChat({ model: 'missing:latest', messages: [], onToken() {} }),
    (error) =>
      error instanceof ApiError && error.status === 404 && error.code === 'model_not_installed'
  );
});

test('streamChat preserves structured errors received inside an SSE stream', async () => {
  globalThis.fetch = async () =>
    new Response(
      'data: {"error":{"message":"Ollama unavailable","type":"service_unavailable_error","code":"ollama_unavailable"}}\n\n'
    );

  await assert.rejects(
    streamChat({ model: 'qwen2.5:3b', messages: [], onToken() {} }),
    (error) => error instanceof ApiError && error.code === 'ollama_unavailable'
  );
});

test('streamChat emits content from fragmented SSE events', async () => {
  const encoder = new TextEncoder();
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel'));
          controller.enqueue(encoder.encode('lo"}}]}\n\ndata: [DONE]\n\n'));
          controller.close();
        }
      })
    );

  const output = [];
  await streamChat({
    model: 'qwen2.5:3b',
    messages: [],
    onToken: (token) => output.push(token)
  });

  assert.equal(output.join(''), 'Hello');
});

test('streamChat sends configured generation settings', async () => {
  let url;
  let request;
  globalThis.fetch = async (target, options) => {
    url = target;
    request = JSON.parse(options.body);
    return new Response('data: [DONE]\n\n');
  };

  await streamChat({
    model: 'qwen2.5:3b',
    messages: [],
    settings: { temperature: 0.3, top_p: 0.8, max_tokens: 256 },
    onToken() {}
  });

  assert.deepEqual(request, {
    model: 'qwen2.5:3b',
    messages: [],
    temperature: 0.3,
    top_p: 0.8,
    max_tokens: 256,
    stream: true
  });
  assert.equal(url, '/api/chat/completions');
});

test('streamChat forwards final usage metadata', async () => {
  globalThis.fetch = async () =>
    new Response(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10},"elapsed_ms":1200}\n\ndata: [DONE]\n\n'
    );
  let metadata;

  await streamChat({
    model: 'qwen2.5:3b',
    messages: [],
    onToken() {},
    onComplete: (value) => {
      metadata = value;
    }
  });

  assert.deepEqual(metadata, {
    usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
    finishReason: 'stop',
    elapsedMs: 1200
  });
});

test('streamChat preserves partial text but rejects premature EOF', async () => {
  globalThis.fetch = async () =>
    new Response('data: {"choices":[{"delta":{"content":"partial"}}]}');
  const output = [];
  await assert.rejects(
    streamChat({ messages: [], onToken: (token) => output.push(token) }),
    (error) => error.code === 'incomplete_stream'
  );
  assert.equal(output.join(''), 'partial');
});

test('streamChat accepts a final DONE without trailing newline', async () => {
  globalThis.fetch = async () => new Response('data: [DONE]');
  await streamChat({ messages: [], onToken() {} });
});
