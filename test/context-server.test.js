import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateInputTokens } from '../server/context.js';
import { ContextOverflowError, errorPayload } from '../server/errors.js';

test('estimateInputTokens counts every message without mutating the history', () => {
  const messages = [
    { role: 'user', content: 'abcdefgh' },
    { role: 'assistant', content: 'ijkl' }
  ];

  assert.equal(estimateInputTokens(messages), 3);
  assert.equal(messages.length, 2);
});

test('ContextOverflowError exposes a recoverable client error', () => {
  const payload = errorPayload(new ContextOverflowError(9000, 8192));

  assert.equal(payload.status, 400);
  assert.equal(payload.body.error.code, 'context_overflow');
  assert.match(payload.body.error.message, /Start a new chat or reduce/i);
});
