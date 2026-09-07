import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import crypto from 'node:crypto';
import { apiAuth, requireScope } from '../server/middleware/auth.js';

const originalApiKeys = config.apiKeys;

test.afterEach(() => {
  config.apiKeys = originalApiKeys;
});

function hashedKey(id, key, options = {}) {
  return {
    id,
    hash: crypto.createHash('sha256').update(key).digest('hex'),
    ...options
  };
}

function request(authorization = '') {
  return { get: (name) => (name === 'authorization' ? authorization : '') };
}

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    }
  };
}

test('apiAuth accepts a matching bearer token using the protected API policy', () => {
  config.apiKeys = [hashedKey('test-key', 'a-long-test-key')];
  let called = false;
  const req = request('Bearer a-long-test-key');

  apiAuth(req, response(), () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.apiKeyId, 'test-key');
});

test('apiAuth rejects missing, invalid, and unequal-length bearer tokens', () => {
  config.apiKeys = [hashedKey('test-key', 'a-long-test-key')];

  for (const authorization of ['', 'Bearer incorrect', 'Bearer x']) {
    const res = response();
    apiAuth(request(authorization), res, () => assert.fail('next should not be called'));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.type, 'authentication_error');
  }
});

test('apiAuth rejects expired keys and requireScope limits authorized keys', () => {
  config.apiKeys = [
    hashedKey('expired', 'expired-key', { expiresAt: '2020-01-01T00:00:00Z' }),
    hashedKey('models-only', 'models-key', { scopes: ['models'] })
  ];

  const expiredResponse = response();
  apiAuth(request('Bearer expired-key'), expiredResponse, () =>
    assert.fail('expired key accepted')
  );
  assert.equal(expiredResponse.statusCode, 401);

  const req = request('Bearer models-key');
  apiAuth(req, response(), () => {});
  const denied = response();
  requireScope('chat')(req, denied, () => assert.fail('chat scope should be denied'));
  assert.equal(denied.statusCode, 403);
});
