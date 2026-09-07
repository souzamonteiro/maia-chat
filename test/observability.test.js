import assert from 'node:assert/strict';
import test from 'node:test';

import { log, requestId } from '../server/observability.js';

test('requestId preserves a supplied ID and returns it in the response', () => {
  const headers = new Map();
  const req = { get: (name) => (name === 'x-request-id' ? 'client-request' : '') };
  const res = { set: (name, value) => headers.set(name, value) };

  requestId(req, res, () => {});

  assert.equal(req.requestId, 'client-request');
  assert.equal(headers.get('X-Request-Id'), 'client-request');
});

test('log emits structured allowlisted fields without prompt content', () => {
  const originalLog = console.log;
  let line;
  console.log = (value) => {
    line = value;
  };
  try {
    log('request_completed', { requestId: 'req-1', path: '/api/models', status: 200 });
  } finally {
    console.log = originalLog;
  }

  const event = JSON.parse(line);
  assert.deepEqual(event.event, 'request_completed');
  assert.equal(event.requestId, 'req-1');
  assert.equal(event.prompt, undefined);
});
