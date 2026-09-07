import assert from 'node:assert/strict';
import test from 'node:test';

import { config } from '../server/config.js';
import { SearchDisabledError, SearchUnavailableError } from '../server/errors.js';
import { searchWeb } from '../server/search.js';

const originalFetch = globalThis.fetch;
const original = {
  searchProvider: config.searchProvider,
  searxngUrl: config.searxngUrl,
  searchMaxResults: config.searchMaxResults,
  searchTimeoutMs: config.searchTimeoutMs
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.assign(config, original);
});

test('searchWeb rejects disabled search without making an upstream request', async () => {
  config.searchProvider = 'disabled';
  globalThis.fetch = async () => assert.fail('search should not call upstream when disabled');

  await assert.rejects(searchWeb('Maia Chat'), SearchDisabledError);
});

test('searchWeb normalizes SearXNG results and discards unsafe URLs', async () => {
  config.searchProvider = 'searxng';
  config.searxngUrl = 'http://search.private:8080';
  config.searchMaxResults = 2;
  let url;
  globalThis.fetch = async (target) => {
    url = new URL(target);
    return new Response(
      JSON.stringify({
        results: [
          {
            title: '  Maia   Chat ',
            url: 'https://example.test/article',
            content: ' A useful\n\nsummary. ',
            engine: 'example'
          },
          { title: 'Unsafe', url: 'javascript:alert(1)', content: 'discarded' },
          { title: '', url: 'https://example.test/untitled', content: 'discarded' }
        ]
      })
    );
  };

  const results = await searchWeb('Maia Chat', { language: 'pt-BR' });

  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'Maia Chat');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('language'), 'pt-BR');
  assert.deepEqual(results, [
    {
      title: 'Maia Chat',
      url: 'https://example.test/article',
      snippet: 'A useful summary.',
      engine: 'example'
    }
  ]);
});

test('searchWeb exposes a stable unavailable error for SearXNG failures', async () => {
  config.searchProvider = 'searxng';
  config.searxngUrl = 'http://search.private:8080';
  globalThis.fetch = async () => {
    throw new TypeError('connection refused');
  };

  await assert.rejects(searchWeb('Maia Chat'), SearchUnavailableError);
});
