import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drainStreams,
  isDraining,
  registerStream,
  resetLifecycle,
  unregisterStream
} from '../server/lifecycle.js';

test.afterEach(() => resetLifecycle());

test('drainStreams waits for a completed stream before the deadline', async () => {
  const controller = new AbortController();
  registerStream(controller);
  setTimeout(() => unregisterStream(controller), 10);

  await drainStreams(100);

  assert.equal(isDraining(), true);
  assert.equal(controller.signal.aborted, false);
});

test('drainStreams aborts streams that do not finish before the deadline', async () => {
  const controller = new AbortController();
  registerStream(controller);

  await drainStreams(0);

  assert.equal(controller.signal.aborted, true);
});
