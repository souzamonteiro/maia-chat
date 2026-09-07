import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidGenerationSettingsError } from '../server/errors.js';
import { validateGenerationSettings } from '../server/generation.js';

test('validateGenerationSettings accepts supported generation parameters', () => {
  assert.doesNotThrow(() =>
    validateGenerationSettings({
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 512
    })
  );
});

test('validateGenerationSettings rejects invalid generation parameters', () => {
  assert.throws(
    () => validateGenerationSettings({ temperature: 3 }),
    InvalidGenerationSettingsError
  );
  assert.throws(() => validateGenerationSettings({ top_p: 0 }), InvalidGenerationSettingsError);
  assert.throws(
    () => validateGenerationSettings({ max_tokens: 10.5 }),
    InvalidGenerationSettingsError
  );
});
