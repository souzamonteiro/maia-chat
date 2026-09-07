import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { config } from '../server/config.js';
import { chatCompletion, createEmbeddings, listModels } from '../server/providers/ollama.js';

function startProvider() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ path: request.url, authorization: request.headers.authorization, body });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/models') {
      return response.end(JSON.stringify({ data: [{ id: 'mock:latest', owned_by: 'vllm' }] }));
    }
    if (request.url === '/v1/chat/completions') {
      if (body.stream) {
        response.setHeader('Content-Type', 'text/event-stream');
        response.write('data: {"model":"mock:latest","choices":[{"delta":{"content":"Hel');
        return response.end(
          'lo"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\ndata: [DONE]\n\n'
        );
      }
      return response.end(
        JSON.stringify({
          model: 'mock:latest',
          choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1 }
        })
      );
    }
    if (request.url === '/v1/embeddings') {
      return response.end(
        JSON.stringify({ model: 'mock:latest', data: [{ index: 0, embedding: [0.1, 0.2] }] })
      );
    }
    response.statusCode = 404;
    response.end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

test('openai-compatible provider supports models, chat, embeddings, and bearer authentication', async () => {
  const original = {
    inferenceProvider: config.inferenceProvider,
    openaiCompatibleUrl: config.openaiCompatibleUrl,
    openaiCompatibleToken: config.openaiCompatibleToken,
    defaultModel: config.defaultModel
  };
  const mock = await startProvider();
  Object.assign(config, {
    inferenceProvider: 'openai-compatible',
    openaiCompatibleUrl: mock.url,
    openaiCompatibleToken: 'provider-secret',
    defaultModel: 'mock:latest'
  });

  try {
    const models = await listModels();
    assert.equal(models[0].provider, 'OpenAI-compatible');
    assert.deepEqual(
      await chatCompletion({
        model: 'mock:latest',
        stream: false,
        messages: [{ role: 'user', content: 'Hello' }]
      }),
      {
        model: 'mock:latest',
        content: 'Hello',
        promptEvalCount: 3,
        evalCount: 1,
        doneReason: 'stop'
      }
    );
    assert.deepEqual(await createEmbeddings({ model: 'mock:latest', input: ['Hello'] }), {
      model: 'mock:latest',
      embeddings: [[0.1, 0.2]]
    });
    assert.equal(
      mock.requests.every((request) => request.authorization === 'Bearer provider-secret'),
      true
    );
  } finally {
    Object.assign(config, original);
    await mock.close();
  }
});

test('openai-compatible provider parses fragmented SSE completion events', async () => {
  const original = {
    inferenceProvider: config.inferenceProvider,
    openaiCompatibleUrl: config.openaiCompatibleUrl,
    defaultModel: config.defaultModel
  };
  const mock = await startProvider();
  Object.assign(config, {
    inferenceProvider: 'openai-compatible',
    openaiCompatibleUrl: mock.url,
    defaultModel: 'mock:latest'
  });

  try {
    const chunks = [];
    const result = await chatCompletion(
      { model: 'mock:latest', messages: [{ role: 'user', content: 'Hello' }] },
      { onChunk: (chunk) => chunks.push(chunk.content) }
    );
    assert.equal(chunks.join(''), 'Hello');
    assert.deepEqual(result, {
      model: 'mock:latest',
      content: '',
      promptEvalCount: 3,
      evalCount: 1,
      doneReason: 'stop'
    });
  } finally {
    Object.assign(config, original);
    await mock.close();
  }
});
