import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { config } from '../server/config.js';
import { chatCompletion } from '../server/providers/ollama.js';

function startMockOllama() {
  let chatRequest;
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/tags') {
      response.setHeader('Content-Type', 'application/json');
      return response.end(JSON.stringify({ models: [{ name: 'mock:latest' }] }));
    }

    if (request.method === 'POST' && request.url === '/api/chat') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      chatRequest = JSON.parse(Buffer.concat(chunks).toString());
      response.setHeader('Content-Type', 'application/x-ndjson');
      response.write('{"model":"mock:latest","message":{"content":"Hel');
      return response.end(
        'lo"},"done":false}\n{"model":"mock:latest","message":{},"done":true,"prompt_eval_count":4,"eval_count":2,"done_reason":"stop"}\n'
      );
    }

    response.statusCode = 404;
    response.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        chatRequest: () => chatRequest,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

test('chatCompletion works against fragmented NDJSON from a mock Ollama server', async () => {
  const originalUrl = config.ollamaUrl;
  const originalDefaultModel = config.defaultModel;
  const mock = await startMockOllama();
  config.ollamaUrl = mock.url;
  config.defaultModel = 'mock:latest';

  try {
    const chunks = [];
    const result = await chatCompletion(
      { model: 'mock:latest', messages: [{ role: 'user', content: 'Hello' }] },
      { onChunk: (chunk) => chunks.push(chunk.content) }
    );

    assert.equal(mock.chatRequest().model, 'mock:latest');
    assert.equal(mock.chatRequest().messages.at(-1).content, 'Hello');
    assert.equal(chunks.join(''), 'Hello');
    assert.deepEqual(result, {
      model: 'mock:latest',
      content: '',
      promptEvalCount: 4,
      evalCount: 2,
      doneReason: 'stop'
    });
  } finally {
    config.ollamaUrl = originalUrl;
    config.defaultModel = originalDefaultModel;
    await mock.close();
  }
});
