import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import {
  ModelNotInstalledError,
  ModelDisabledError,
  NoModelsInstalledError,
  OllamaUnavailableError,
  UpstreamResponseError,
  UpstreamTimeoutError
} from '../server/errors.js';
import {
  chatCompletion,
  createEmbeddings,
  listModels,
  listRunningModelIds,
  warmModel
} from '../server/providers/ollama.js';

const originalFetch = globalThis.fetch;
const originalTimeout = config.ollamaTimeoutMs;
const originalModelSettings = config.modelSettings;
const originalModelBlacklist = config.modelBlacklist;
const originalToolAllowlist = config.toolAllowlist;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  config.ollamaTimeoutMs = originalTimeout;
  config.modelSettings = originalModelSettings;
  config.modelBlacklist = originalModelBlacklist;
  config.toolAllowlist = originalToolAllowlist;
});

function jsonResponse(value, init) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    ...init
  });
}

function installedModels() {
  return jsonResponse({
    models: [
      { name: 'qwen2.5:3b', modified_at: '2026-01-01T00:00:00.000Z' },
      { name: 'qwen2.5-coder:7b', modified_at: '2026-01-02T00:00:00.000Z' }
    ]
  });
}

function streamingResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          if (chunk.delay) await new Promise((resolve) => setTimeout(resolve, chunk.delay));
          controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      }
    })
  );
}

test('listModels returns canonical installed model metadata', async () => {
  globalThis.fetch = async () => installedModels();

  const models = await listModels();

  assert.deepEqual(
    models.map((model) => model.id),
    ['qwen2.5:3b', 'qwen2.5-coder:7b']
  );
  assert.equal(models[0].owned_by, 'ollama');
  assert.equal(models[0].created, 1767225600);
  assert.equal(models[0].context_window, config.defaultContextWindow);
  assert.equal(models[0].provider, 'Ollama');
  assert.equal(models[0].display_name, 'Qwen2.5 3b');
  assert.equal(models[0].parameter_size, '3B');
  assert.deepEqual(models[0].capabilities, ['chat', 'streaming']);
  assert.equal(models[0].generation_defaults, null);
});

test('listModels maps connection failures to a stable application error', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('connection refused');
  };

  await assert.rejects(listModels(), OllamaUnavailableError);
});

test('listModels maps an unsuccessful Ollama response', async () => {
  globalThis.fetch = async () => new Response('', { status: 503 });

  await assert.rejects(listModels(), UpstreamResponseError);
});

test('listModels hides blacklisted models and chatCompletion rejects them directly', async () => {
  config.modelBlacklist = ['qwen2.5-coder:7b'];
  globalThis.fetch = async () => installedModels();

  const models = await listModels();
  assert.deepEqual(
    models.map((model) => model.id),
    ['qwen2.5:3b']
  );

  await assert.rejects(
    chatCompletion({ model: 'qwen2.5-coder:7b', messages: [{ role: 'user', content: 'Hello' }] }),
    ModelDisabledError
  );
});

test('listRunningModelIds returns active Ollama model names without blocking discovery', async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      models: [{ name: 'qwen2.5:3b' }, { name: 'qwen2.5-coder:7b' }]
    });
  assert.deepEqual([...(await listRunningModelIds())], ['qwen2.5:3b', 'qwen2.5-coder:7b']);

  globalThis.fetch = async () => {
    throw new TypeError('unavailable');
  };
  assert.deepEqual([...(await listRunningModelIds())], []);
});

test('warmModel loads the selected model without requesting generated tokens', async () => {
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return jsonResponse({ done: true });
  };

  await warmModel('qwen2.5:3b');

  assert.deepEqual(request, {
    model: 'qwen2.5:3b',
    prompt: '',
    stream: false,
    keep_alive: '10m',
    options: { num_predict: 0 }
  });
});

test('createEmbeddings resolves the model and maps Ollama embeddings', async () => {
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/tags')) return installedModels();
    upstreamBody = JSON.parse(options.body);
    return jsonResponse({
      model: 'qwen2.5:3b',
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });
  };

  const result = await createEmbeddings({ model: 'qwen2.5:3b', input: ['first', 'second'] });

  assert.deepEqual(upstreamBody, { model: 'qwen2.5:3b', input: ['first', 'second'] });
  assert.deepEqual(result, {
    model: 'qwen2.5:3b',
    embeddings: [
      [0.1, 0.2],
      [0.3, 0.4]
    ]
  });
});

test('chatCompletion forwards operator-approved tools and returns tool calls', async () => {
  config.toolAllowlist = ['calculator'];
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/tags')) return installedModels();
    upstreamBody = JSON.parse(options.body);
    return jsonResponse({
      model: 'qwen2.5:3b',
      message: { content: '', tool_calls: [{ function: { name: 'calculator', arguments: {} } }] }
    });
  };
  const tools = [{ type: 'function', function: { name: 'calculator', parameters: {} } }];

  const result = await chatCompletion({
    model: 'qwen2.5:3b',
    messages: [{ role: 'user', content: 'What is 2 + 2?' }],
    stream: false,
    tools
  });

  assert.deepEqual(upstreamBody.tools, tools);
  assert.deepEqual(result.toolCalls, [{ function: { name: 'calculator', arguments: {} } }]);
});

test('chatCompletion rejects an empty Ollama installation', async () => {
  globalThis.fetch = async () => jsonResponse({ models: [] });

  await assert.rejects(
    chatCompletion({ messages: [{ role: 'user', content: 'Hello' }] }),
    NoModelsInstalledError
  );
});

test('chatCompletion rejects an explicitly requested missing model', async () => {
  globalThis.fetch = async () => installedModels();

  await assert.rejects(
    chatCompletion({ model: 'missing:latest', messages: [{ role: 'user', content: 'Hello' }] }),
    ModelNotInstalledError
  );
});

test('chatCompletion prepends the configured Maia system prompt', async () => {
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/tags')) return installedModels();
    upstreamBody = JSON.parse(options.body);
    return streamingResponse([{ text: '{"message":{},"done":true}\n' }]);
  };

  await chatCompletion({
    model: 'qwen2.5:3b',
    messages: [
      { role: 'system', content: 'Client instruction' },
      { role: 'user', content: 'Hello' }
    ]
  });

  assert.equal(upstreamBody.messages[0].role, 'system');
  assert.equal(upstreamBody.messages[0].content, config.systemPrompt);
  assert.deepEqual(upstreamBody.messages.slice(1), [
    { role: 'system', content: 'Client instruction' },
    { role: 'user', content: 'Hello' }
  ]);
});

test('chatCompletion applies model-specific prompts and generation defaults', async () => {
  config.modelSettings = {
    'qwen2.5:3b': {
      systemPrompt: 'You are Maia Code.',
      generation: { temperature: 0.2, top_p: 0.8, max_tokens: 256 }
    }
  };
  let upstreamBody;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/tags')) return installedModels();
    upstreamBody = JSON.parse(options.body);
    return streamingResponse([{ text: '{"message":{},"done":true}\n' }]);
  };

  await chatCompletion({ model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'Hello' }] });

  assert.equal(upstreamBody.messages[0].content, 'You are Maia Code.');
  assert.deepEqual(upstreamBody.options, {
    num_ctx: config.defaultContextWindow,
    temperature: 0.2,
    top_p: 0.8,
    num_predict: 256
  });
});

test('chatCompletion parses fragmented streaming output and reasoning', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    if (url.endsWith('/api/tags')) return installedModels();
    return streamingResponse([
      { text: '{"model":"qwen2.5:3b","message":{"thinking":"Check' },
      { text: 'ing"},"done":false}\n{"model":"qwen2.5:3b","message":{"content":"Hel' },
      { text: 'lo"},"done":false}\n' },
      { text: '{"model":"qwen2.5:3b","message":{},"done":true,"done_reason":"stop"}' }
    ]);
  };

  const output = [];
  const result = await chatCompletion(
    { model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'Hello' }] },
    { onChunk: (chunk) => output.push(chunk.content) }
  );

  assert.equal(calls, 2);
  assert.equal(output.join(''), '<think>\nChecking\n</think>\n\nHello');
  assert.equal(result.model, 'qwen2.5:3b');
  assert.equal(result.doneReason, 'stop');
});

test('active stream chunks reset the inactivity timeout', async () => {
  config.ollamaTimeoutMs = 30;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/api/tags')) return installedModels();
    return streamingResponse([
      { text: '{"message":{"content":"A"},"done":false}\n', delay: 20 },
      { text: '{"message":{"content":"B"},"done":false}\n', delay: 20 },
      { text: '{"message":{},"done":true}\n', delay: 20 }
    ]);
  };

  const output = [];
  await chatCompletion(
    { model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'Hello' }] },
    { onChunk: (chunk) => output.push(chunk.content) }
  );

  assert.equal(output.join(''), 'AB');
});

test('a stalled Ollama request raises an inactivity timeout', async () => {
  config.ollamaTimeoutMs = 20;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/api/tags')) return installedModels();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  };

  await assert.rejects(
    chatCompletion({ model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'Hello' }] }),
    UpstreamTimeoutError
  );
});

test('caller cancellation aborts the Ollama request', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/api/tags')) return installedModels();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      queueMicrotask(() => controller.abort());
    });
  };

  await assert.rejects(
    chatCompletion(
      { model: 'qwen2.5:3b', messages: [{ role: 'user', content: 'Hello' }] },
      { signal: controller.signal }
    ),
    (error) => error?.name === 'AbortError'
  );
});

test('chatCompletion rejects premature EOF and streamed errors', async () => {
  for (const text of ['{"message":{"content":"partial"}}\n', '{"error":"generation failed"}\n']) {
    globalThis.fetch = async (url) =>
      url.endsWith('/api/tags') ? installedModels() : streamingResponse([{ text }]);
    await assert.rejects(
      chatCompletion({ messages: [{ role: 'user', content: 'Hello' }] }),
      UpstreamResponseError
    );
  }
});

test('chatCompletion preserves thinking and content in the same final chunk', async () => {
  globalThis.fetch = async (url) =>
    url.endsWith('/api/tags')
      ? installedModels()
      : streamingResponse([
          {
            text: '{"message":{"thinking":"reason","content":"answer"},"done":true,"done_reason":"length"}'
          }
        ]);
  const output = [];
  const result = await chatCompletion(
    { messages: [{ role: 'user', content: 'Hello' }] },
    { onChunk: (chunk) => output.push(chunk.content) }
  );
  assert.equal(output.join(''), '<think>\nreason\n</think>\n\nanswer');
  assert.equal(result.doneReason, 'length');
});
