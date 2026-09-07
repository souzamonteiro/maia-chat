import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import { validateConfiguration } from '../server/config-validation.js';

function validConfig() {
  return {
    ...structuredClone(config),
    apiKeys: []
  };
}

test('validateConfiguration accepts the current valid configuration', () => {
  assert.doesNotThrow(() => validateConfiguration(validConfig()));
});

test('validateConfiguration rejects invalid network and capacity settings', () => {
  const invalidPort = validConfig();
  invalidPort.port = 0;
  assert.throws(() => validateConfiguration(invalidPort), /PORT/);

  const invalidUrl = validConfig();
  invalidUrl.ollamaUrl = 'file:///private/ollama';
  assert.throws(() => validateConfiguration(invalidUrl), /OLLAMA_URL/);

  const invalidLimit = validConfig();
  invalidLimit.maxConcurrentGenerations = 0;
  assert.throws(() => validateConfiguration(invalidLimit), /maxConcurrentGenerations/);

  const invalidSearchProvider = validConfig();
  invalidSearchProvider.searchProvider = 'public-search';
  assert.throws(() => validateConfiguration(invalidSearchProvider), /MAIA_SEARCH_PROVIDER/);

  const invalidSearchUrl = validConfig();
  invalidSearchUrl.searchProvider = 'searxng';
  invalidSearchUrl.searxngUrl = '';
  assert.throws(() => validateConfiguration(invalidSearchUrl), /MAIA_SEARXNG_URL/);
});

test('validateConfiguration rejects duplicate IDs and unsafe API key records', () => {
  const duplicate = validConfig();
  duplicate.apiKeys = [
    { id: 'cli', hash: 'a'.repeat(64) },
    { id: 'cli', hash: 'b'.repeat(64) }
  ];
  assert.throws(() => validateConfiguration(duplicate), /unique/);

  const scope = validConfig();
  scope.apiKeys = [{ id: 'cli', hash: 'a'.repeat(64), scopes: ['admin'] }];
  assert.throws(() => validateConfiguration(scope), /invalid scopes/);

  const embeddings = validConfig();
  embeddings.apiKeys = [{ id: 'embedder', hash: 'a'.repeat(64), scopes: ['embeddings'] }];
  assert.doesNotThrow(() => validateConfiguration(embeddings));
});

test('validateConfiguration rejects invalid model-specific generation defaults', () => {
  const invalid = validConfig();
  invalid.modelSettings = {
    'qwen2.5:3b': { generation: { temperature: 3 } }
  };

  assert.throws(() => validateConfiguration(invalid), /invalid temperature/);
});

test('validateConfiguration accepts explicit proxy ranges and rejects unsafe values', () => {
  const trusted = validConfig();
  trusted.trustedProxy = ['10.20.0.1', 'fd00::/8', 'loopback'];
  assert.doesNotThrow(() => validateConfiguration(trusted));

  const invalid = validConfig();
  invalid.trustedProxy = ['trust-all'];
  assert.throws(() => validateConfiguration(invalid), /MAIA_TRUSTED_PROXY/);
});

test('validateConfiguration rejects a blacklisted default model', () => {
  const invalid = validConfig();
  invalid.modelBlacklist = [invalid.defaultModel];

  assert.throws(() => validateConfiguration(invalid), /MAIA_DEFAULT_MODEL/);
});
