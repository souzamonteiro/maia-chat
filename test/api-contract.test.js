import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function reservePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startMockOllama({ holdStream = false } = {}) {
  let releaseStream;
  let streamCount = 0;
  const streamWaiters = [];
  const notifyStreamStarted = () => {
    streamCount += 1;
    for (const waiter of streamWaiters.splice(0)) {
      if (streamCount >= waiter.count) waiter.resolve();
      else streamWaiters.push(waiter);
    }
  };
  const server = http.createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ models: [{ name: 'mock:latest' }] }));
    }
    if (request.url === '/api/ps') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ models: [] }));
    }
    if (request.url === '/api/chat') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!body.stream) {
        response.setHeader('Content-Type', 'application/json');
        return response.end(
          JSON.stringify({
            model: 'mock:latest',
            message: { content: 'Hello' },
            done: true,
            prompt_eval_count: 3,
            eval_count: 1,
            done_reason: 'stop'
          })
        );
      }
      response.setHeader('Content-Type', 'application/x-ndjson');
      const streamReleased = holdStream
        ? new Promise((resolve) => {
            releaseStream = resolve;
          })
        : null;
      response.write('{"model":"mock:latest","message":{"content":"Hello"},"done":false}\n');
      notifyStreamStarted();
      if (streamReleased) await streamReleased;
      return response.end(
        '{"model":"mock:latest","message":{},"done":true,"prompt_eval_count":3,"eval_count":1,"done_reason":"stop"}\n'
      );
    }
    response.statusCode = 404;
    response.end();
  });
  const port = await listen(server);
  return {
    url: `http://127.0.0.1:${port}`,
    waitForStream: (count = 1) => {
      if (streamCount >= count) return Promise.resolve();
      return new Promise((resolve) => streamWaiters.push({ count, resolve }));
    },
    releaseStream: () => releaseStream?.(),
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    }
  };
}

function startMaia({ port, ollamaUrl, modelBlacklist = [], environment = {} }) {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      OLLAMA_URL: ollamaUrl,
      MAIA_DEFAULT_MODEL: 'mock:latest',
      MAIA_MODEL_BLACKLIST: JSON.stringify(modelBlacklist),
      MAIA_API_KEYS: '[]',
      ...environment
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Maia did not start: ${output}`)), 5000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('server_started')) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Maia exited early with ${code}: ${output}`));
      }
    });
  });
}

function stop(child) {
  return new Promise((resolve) => {
    const forceStop = setTimeout(() => child.kill('SIGKILL'), 1000);
    child.once('exit', () => {
      clearTimeout(forceStop);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

test('OpenAI-compatible API contract returns models, completions, and SSE chunks', async () => {
  const mock = await startMockOllama();
  const port = await reservePort();
  const maia = await startMaia({ port, ollamaUrl: mock.url });

  try {
    const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
    const csp = pageResponse.headers.get('content-security-policy');
    assert.equal(pageResponse.status, 200);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'sha256-/);
    assert.doesNotMatch(csp, /unsafe-inline|https?:/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(pageResponse.headers.get('x-content-type-options'), 'nosniff');

    const highlighterResponse = await fetch(
      `http://127.0.0.1:${port}/vendor/highlight.js/es/highlight.min.js`
    );
    assert.equal(highlighterResponse.status, 200);
    assert.match(highlighterResponse.headers.get('content-type'), /javascript/);

    const modelsResponse = await fetch(`http://127.0.0.1:${port}/v1/models`);
    assert.equal(modelsResponse.status, 200);
    assert.deepEqual(await modelsResponse.json(), {
      object: 'list',
      data: [
        {
          id: 'mock:latest',
          object: 'model',
          created: 0,
          owned_by: 'ollama',
          provider: 'Ollama',
          display_name: 'Mock Latest',
          parameter_size: null,
          context_window: 8192,
          capabilities: ['chat', 'streaming'],
          generation_defaults: null,
          status: 'default',
          loaded: false
        }
      ]
    });

    const body = { model: 'mock:latest', messages: [{ role: 'user', content: 'Hi' }] };
    const completionResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false })
    });
    const completion = await completionResponse.json();
    assert.equal(completionResponse.status, 200);
    assert.match(completion.id, /^chatcmpl-/);
    assert.equal(completion.object, 'chat.completion');
    assert.equal(completion.model, 'mock:latest');
    assert.deepEqual(completion.choices[0], {
      index: 0,
      message: { role: 'assistant', content: 'Hello' },
      finish_reason: 'stop'
    });
    assert.deepEqual(completion.usage, { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 });

    const streamResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true })
    });
    const stream = await streamResponse.text();
    assert.equal(streamResponse.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(stream, /"object":"chat.completion.chunk"/);
    assert.match(stream, /"finish_reason":"stop"/);
    assert.match(stream, /data: \[DONE\]/);
  } finally {
    await stop(maia);
    await mock.close();
  }
});

test('OpenAI-compatible API rejects a blacklisted model before starting an SSE stream', async () => {
  const mock = await startMockOllama();
  const port = await reservePort();
  const maia = await startMaia({
    port,
    ollamaUrl: mock.url,
    modelBlacklist: ['blocked:latest']
  });

  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'blocked:latest',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: {
        message: 'The requested model is disabled: blocked:latest',
        type: 'permission_error',
        code: 'model_disabled'
      }
    });
  } finally {
    await stop(maia);
    await mock.close();
  }
});

test('a long-running stream holds capacity and releases it after completion', async () => {
  const mock = await startMockOllama({ holdStream: true });
  const port = await reservePort();
  const maia = await startMaia({
    port,
    ollamaUrl: mock.url,
    environment: {
      MAIA_MAX_CONCURRENT_GENERATIONS: '1',
      MAIA_MAX_CONCURRENT_GENERATIONS_PER_CLIENT: '2',
      MAIA_MAX_QUEUED_GENERATIONS: '1',
      MAIA_SHUTDOWN_TIMEOUT_MS: '100'
    }
  });
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mock:latest',
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }]
    })
  };

  let firstResponse;
  try {
    firstResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, request);
    await mock.waitForStream();

    const queuedResponsePromise = fetch(`http://127.0.0.1:${port}/v1/chat/completions`, request);
    const overloadedResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, request);
    assert.equal(overloadedResponse.status, 503);
    assert.equal((await overloadedResponse.json()).error.code, 'generation_queue_full');

    mock.releaseStream();
    assert.match(await firstResponse.text(), /data: \[DONE\]/);

    const queuedResponse = await queuedResponsePromise;
    assert.equal(queuedResponse.status, 200);
    await mock.waitForStream(2);
    mock.releaseStream();
    assert.match(await queuedResponse.text(), /data: \[DONE\]/);

    const recoveredResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, request);
    assert.equal(recoveredResponse.status, 200);
    await mock.waitForStream(3);
    mock.releaseStream();
    await recoveredResponse.text();
  } finally {
    mock.releaseStream();
    await stop(maia);
    await mock.close();
  }
});
