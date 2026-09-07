import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import { InvalidToolDefinitionError, ToolNotAllowedError } from '../server/errors.js';
import { validateTools } from '../server/tools.js';

const originalToolAllowlist = config.toolAllowlist;

test.afterEach(() => {
  config.toolAllowlist = originalToolAllowlist;
});

test('validateTools accepts only operator-approved function definitions', () => {
  const calculator = {
    type: 'function',
    function: { name: 'calculator', description: 'Calculate an expression', parameters: {} }
  };
  config.toolAllowlist = ['calculator'];

  assert.deepEqual(validateTools([calculator]), [calculator]);
  assert.throws(
    () => validateTools([{ type: 'function', function: { name: '' } }]),
    InvalidToolDefinitionError
  );
  assert.throws(
    () => validateTools([{ type: 'function', function: { name: 'shell' } }]),
    ToolNotAllowedError
  );
});
