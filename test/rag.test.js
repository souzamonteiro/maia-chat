import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { config } from '../server/config.js';
import { augmentWithKnowledge } from '../server/rag.js';
import { chatRouter } from '../server/routes/chat.js';
import { errorPayload } from '../server/errors.js';

const body = { messages: [{ role: 'user', content: 'How does Maia work?' }] };
const budget = { inputTokens: 100, outputTokens: 100 };
const source = {
  filename: 'manual.md',
  startLine: 1,
  endLine: 10,
  text: 'Maia uses local models.'
};

test('knowledge retrieval: contract, budget, failures, cancellation and chat routes', async (t) => {
  const original = { ...config };
  const originalFetch = globalThis.fetch;
  let results = [source];
  let failure = false;
  let stall = false;
  let ragCalls = 0;
  let lastGeneration;
  Object.assign(config, {
    ragEnabled: true,
    ragUrl: 'http://rag.test',
    ragCollectionId: 'shared',
    ragMaxContextChars: 8000,
    ragTopK: 4,
    inferenceProvider: 'ollama',
    modelBlacklist: [],
    ollamaUrl: 'http://ollama.test',
    defaultModel: 'mock:latest',
    defaultContextWindow: 8192
  });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
    if (String(url).endsWith('/api/search')) {
      ragCalls++;
      assert.equal(JSON.parse(options.body).options.collectionId, 'shared');
      assert.equal(JSON.parse(options.body).query, body.messages[0].content);
      if (options.signal.aborted) throw new Error('aborted');
      if (stall)
        return new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new Error('timeout')), {
            once: true
          })
        );
      if (failure) return new Response('{}', { status: 503 });
      return Response.json({ results });
    }
    if (String(url).endsWith('/api/tags'))
      return Response.json({ models: [{ name: 'mock:latest' }] });
    if (String(url).endsWith('/api/chat')) {
      lastGeneration = JSON.parse(options.body);
      const result = {
        model: 'mock:latest',
        message: { content: 'Local models [manual.md, lines 1-10]' },
        done: true,
        prompt_eval_count: 20,
        eval_count: 5,
        done_reason: 'stop'
      };
      return lastGeneration.stream
        ? new Response(JSON.stringify(result) + '\n')
        : Response.json(result);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  t.after(() => {
    Object.assign(config, original);
    globalThis.fetch = originalFetch;
  });

  const enriched = await augmentWithKnowledge(body, budget);
  assert.equal(enriched.messages.at(-1), body.messages[0]);
  assert.equal(body.messages.length, 1);
  assert.match(enriched.messages[0].content, /untrusted reference/);
  assert.match(enriched.messages[0].content, /Maia uses local models/);
  assert.deepEqual(enriched.sources, [{ filename: 'manual.md', startLine: 1, endLine: 10 }]);

  results = [{ ...source, text: 'x'.repeat(40000) }, source];
  assert.equal((await augmentWithKnowledge(body, budget)).sources.length, 1);
  const before = ragCalls;
  assert.equal(
    (await augmentWithKnowledge(body, { inputTokens: 8091, outputTokens: 100 })).sources.length,
    0
  );
  assert.equal(ragCalls, before);
  config.ragEnabled = false;
  assert.equal((await augmentWithKnowledge(body, budget)).messages, body.messages);
  assert.equal(ragCalls, before);
  config.ragEnabled = true;
  results = [];
  assert.equal((await augmentWithKnowledge(body, budget)).messages, body.messages);
  results = [source];
  failure = true;
  await assert.rejects(augmentWithKnowledge(body, budget), { code: 'rag_unavailable' });
  failure = false;
  stall = true;
  config.ragTimeoutMs = 10;
  await assert.rejects(augmentWithKnowledge(body, budget), { code: 'rag_unavailable' });
  stall = false;
  config.ragTimeoutMs = 30000;
  results = null;
  await assert.rejects(augmentWithKnowledge(body, budget), { code: 'rag_unavailable' });
  results = [source];
  await assert.rejects(augmentWithKnowledge(body, { ...budget, signal: AbortSignal.abort() }));

  const app = express();
  app.use(express.json());
  app.use('/chat', chatRouter);
  app.use((error, _req, res, _next) => {
    const payload = errorPayload(error);
    res.status(payload.status).json(payload.body);
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/chat`;
  for (const stream of [false, true]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream })
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /rag_sources/);
    assert.match(text, /manual.md/);
    if (stream) assert.match(text, /\[DONE\]/);
    assert.equal(lastGeneration.model, 'mock:latest');
    assert.equal(lastGeneration.messages.at(-1).content, body.messages[0].content);
    assert.ok(lastGeneration.messages.some((message) => message.content.includes(source.text)));
  }
  failure = true;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: false })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'rag_unavailable');
});
