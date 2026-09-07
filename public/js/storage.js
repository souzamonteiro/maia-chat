const DATABASE_NAME = 'maia-chat';
const DATABASE_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'current';
const LEGACY_CONVERSATIONS_KEY = 'maia-chat:conversations:v1';
const LEGACY_ACTIVE_KEY = 'maia-chat:active:v1';
const LEGACY_THEME_KEY = 'maia-chat:theme';
const LEGACY_EXPAND_REASONING_KEY = 'maia-chat:expand-reasoning';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

function legacyState(storage) {
  try {
    return {
      conversations: JSON.parse(storage?.getItem(LEGACY_CONVERSATIONS_KEY)) || [],
      activeId: storage?.getItem(LEGACY_ACTIVE_KEY) || null,
      preferences: {
        theme: storage?.getItem(LEGACY_THEME_KEY) || 'system',
        expandReasoning: storage?.getItem(LEGACY_EXPAND_REASONING_KEY) === 'true'
      }
    };
  } catch {
    return { conversations: [], activeId: null, preferences: {} };
  }
}

export function createConversationStorage({
  indexedDB = globalThis.indexedDB,
  legacyStorage = globalThis.localStorage
} = {}) {
  let databasePromise;
  let writeQueue = Promise.resolve();

  function database() {
    if (!indexedDB) return Promise.reject(new Error('IndexedDB is unavailable.'));
    if (!databasePromise) {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener(
        'upgradeneeded',
        () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        },
        { once: true }
      );
      databasePromise = requestResult(request);
    }
    return databasePromise;
  }

  async function read() {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(STATE_KEY));
    await transactionDone(transaction);
    return result;
  }

  async function write(state) {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(structuredClone(state), STATE_KEY);
    await transactionDone(transaction);
  }

  return {
    async load() {
      const stored = await read();
      if (stored) return stored;

      const migrated = legacyState(legacyStorage);
      if (
        migrated.conversations.length ||
        migrated.activeId ||
        legacyStorage?.getItem(LEGACY_THEME_KEY) ||
        legacyStorage?.getItem(LEGACY_EXPAND_REASONING_KEY)
      ) {
        await write(migrated);
        legacyStorage?.removeItem(LEGACY_CONVERSATIONS_KEY);
        legacyStorage?.removeItem(LEGACY_ACTIVE_KEY);
        legacyStorage?.removeItem(LEGACY_THEME_KEY);
        legacyStorage?.removeItem(LEGACY_EXPAND_REASONING_KEY);
      }
      return migrated;
    },
    save(state) {
      writeQueue = writeQueue.catch(() => {}).then(() => write(state));
      return writeQueue;
    }
  };
}

export const conversationStorage = createConversationStorage();
