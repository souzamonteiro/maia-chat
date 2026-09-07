import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import { GenerationQueueError, RequestLimitError } from '../server/errors.js';
import {
  acquireGeneration,
  releaseGeneration,
  resetGenerationLimits,
  validateRequestLimits
} from '../server/limits.js';

const original = { ...config };
test.afterEach(() => {
  Object.assign(config, original);
  resetGenerationLimits();
});

test('validateRequestLimits rejects excessive message and output counts', () => {
  config.maxMessages = 1;
  config.maxOutputTokens = 10;
  assert.throws(() => validateRequestLimits({ messages: [{}, {}] }), RequestLimitError);
  assert.throws(() => validateRequestLimits({ messages: [{}], max_tokens: 11 }), RequestLimitError);
});

test('generation capacity queues work and releases it in FIFO order', async () => {
  config.maxConcurrentGenerations = 1;
  await acquireGeneration('first');
  let secondStarted = false;
  const second = acquireGeneration('second').then(() => {
    secondStarted = true;
  });
  assert.equal(secondStarted, false);
  releaseGeneration('first');
  await second;
  assert.equal(secondStarted, true);
});

test('generation capacity rejects a full or timed-out queue', async () => {
  config.maxConcurrentGenerations = 1;
  config.maxQueuedGenerations = 0;
  await acquireGeneration('first');
  await assert.rejects(
    acquireGeneration('second'),
    (error) => error instanceof GenerationQueueError && error.code === 'generation_queue_full'
  );
  releaseGeneration('first');

  config.maxQueuedGenerations = 1;
  config.generationQueueTimeoutMs = 1;
  await acquireGeneration('first');
  await assert.rejects(
    acquireGeneration('second'),
    (error) => error instanceof GenerationQueueError && error.code === 'generation_queue_timeout'
  );
});

test('generation capacity limits each client without blocking another client', async () => {
  config.maxConcurrentGenerations = 2;
  config.maxConcurrentGenerationsPerClient = 1;
  await acquireGeneration('client-a');
  await acquireGeneration('client-b');
  let queued = false;
  const waiting = acquireGeneration('client-a').then(() => {
    queued = true;
  });
  assert.equal(queued, false);
  releaseGeneration('client-b');
  assert.equal(queued, false);
  releaseGeneration('client-a');
  await waiting;
  assert.equal(queued, true);
});
