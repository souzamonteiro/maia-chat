import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import { RateLimitError } from '../server/errors.js';
import { enforceRateLimit, resetRateLimits } from '../server/rate-limit.js';

const original = { ...config };
test.afterEach(() => {
  Object.assign(config, original);
  resetRateLimits();
});

test('enforceRateLimit limits repeated requests from one IP', () => {
  config.rateLimitMaxRequests = 2;
  config.rateLimitWindowMs = 1000;
  enforceRateLimit({ ip: '127.0.0.1', now: 1000 });
  enforceRateLimit({ ip: '127.0.0.1', now: 1001 });

  assert.throws(
    () => enforceRateLimit({ ip: '127.0.0.1', now: 1002 }),
    (error) => error instanceof RateLimitError && error.retryAfterMs === 998
  );
});

test('enforceRateLimit applies a separate key bucket', () => {
  config.rateLimitMaxRequests = 1;
  enforceRateLimit({ ip: 'one', keyId: 'shared', now: 1000 });

  assert.throws(() => enforceRateLimit({ ip: 'two', keyId: 'shared', now: 1001 }), RateLimitError);
});
