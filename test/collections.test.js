import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDocuments,
  createCollection,
  DEFAULT_COLLECTION_ID,
  ensureCollections,
  removeCollection,
  removeDocument
} from '../public/js/collections.js';

test('ensureCollections creates one local library for existing histories', () => {
  assert.deepEqual(
    ensureCollections([], () => 100),
    [
      {
        id: DEFAULT_COLLECTION_ID,
        name: 'Library',
        documents: [],
        createdAt: 100,
        updatedAt: 100
      }
    ]
  );
});

test('collections add and remove documents with explicit retention controls', () => {
  const collections = ensureCollections([], () => 100);
  const collection = createCollection(collections, ' Project files ', {
    id: 'project-files',
    now: () => 200
  });
  collections.push(collection);
  addDocuments(collection, [{ id: 'document-1', name: 'plan.md' }], () => 300);

  assert.equal(collection.documents.length, 1);
  assert.equal(collection.updatedAt, 300);
  assert.equal(
    removeDocument(collection, 'document-1', () => 400),
    true
  );
  assert.equal(collection.documents.length, 0);
  assert.equal(removeCollection(collections, DEFAULT_COLLECTION_ID), false);
  assert.equal(removeCollection(collections, 'project-files'), true);
  assert.equal(collections.length, 1);
});

test('createCollection rejects blank and duplicate names', () => {
  const collections = ensureCollections([], () => 100);

  assert.equal(createCollection(collections, '   '), null);
  assert.equal(createCollection(collections, 'library'), null);
});
