import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';

import { createConversationStorage } from '../public/js/storage.js';

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: (key) => data.get(key) || null,
    removeItem: (key) => data.delete(key),
    value: (key) => data.get(key)
  };
}

test('conversation storage migrates legacy localStorage history once', async () => {
  const legacyStorage = memoryStorage({
    'maia-chat:conversations:v1': JSON.stringify([{ id: 'legacy', messages: [] }]),
    'maia-chat:active:v1': 'legacy',
    'maia-chat:theme': 'light',
    'maia-chat:expand-reasoning': 'true'
  });
  const storage = createConversationStorage({ legacyStorage });

  const state = await storage.load();

  assert.equal(state.activeId, 'legacy');
  assert.equal(state.conversations[0].id, 'legacy');
  assert.deepEqual(state.preferences, { theme: 'light', expandReasoning: true });
  assert.equal(legacyStorage.value('maia-chat:conversations:v1'), undefined);
  assert.equal(legacyStorage.value('maia-chat:theme'), undefined);
});

test('conversation storage persists a complete state in IndexedDB', async () => {
  const storage = createConversationStorage({ legacyStorage: memoryStorage() });
  const state = {
    conversations: [{ id: 'current', messages: [] }],
    activeId: 'current',
    preferences: {
      theme: 'dark',
      expandReasoning: false,
      locale: 'pt',
      preferredModel: 'qwen2.5:3b'
    }
  };

  await storage.save(state);
  const loaded = await storage.load();

  assert.deepEqual(loaded, state);
});
