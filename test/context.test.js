import assert from 'node:assert/strict';
import test from 'node:test';

import { contextUsage, estimateTokens } from '../public/js/context.js';

test('estimateTokens uses a conservative character estimate', () => {
  assert.equal(estimateTokens([{ role: 'user', content: 'abcdefgh' }]), 2);
  assert.equal(estimateTokens([{ role: 'user', content: 'a' }]), 1);
});

test('contextUsage reports a percentage and uses the fallback window', () => {
  assert.deepEqual(contextUsage([{ role: 'user', content: 'a'.repeat(32) }], 10), {
    usedTokens: 8,
    limit: 10,
    percentage: 80
  });
  assert.equal(contextUsage([], undefined).limit, 8192);
});
