import assert from 'node:assert/strict';
import test from 'node:test';

import { ModelNotInstalledError, OllamaUnavailableError, errorPayload } from '../server/errors.js';

test('errorPayload exposes stable public application error fields', () => {
  assert.deepEqual(errorPayload(new ModelNotInstalledError('missing:latest')), {
    status: 404,
    body: {
      error: {
        message: 'The requested model is not installed: missing:latest',
        type: 'invalid_request_error',
        code: 'model_not_installed'
      }
    }
  });
});

test('errorPayload does not expose unexpected internal exceptions', () => {
  assert.deepEqual(errorPayload(new Error('database password leaked')), {
    status: 500,
    body: {
      error: {
        message: 'Unexpected server error.',
        type: 'internal_error',
        code: 'internal_error'
      }
    }
  });
});

test('service errors retain their intended status', () => {
  assert.equal(errorPayload(new OllamaUnavailableError()).status, 503);
});
