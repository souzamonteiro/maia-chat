export const DEFAULT_COLLECTION_ID = 'library';

function timestamp(now) {
  return typeof now === 'function' ? now() : now;
}

export function ensureCollections(collections = [], now = Date.now) {
  if (Array.isArray(collections) && collections.length > 0) return collections;
  const createdAt = timestamp(now);
  return [
    {
      id: DEFAULT_COLLECTION_ID,
      name: 'Library',
      documents: [],
      createdAt,
      updatedAt: createdAt
    }
  ];
}

export function createCollection(
  collections,
  name,
  { id = crypto.randomUUID(), now = Date.now } = {}
) {
  const title = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (
    !title ||
    collections.some(
      (collection) => collection.name.toLocaleLowerCase() === title.toLocaleLowerCase()
    )
  ) {
    return null;
  }
  const createdAt = timestamp(now);
  return {
    id,
    name: title,
    documents: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function addDocuments(collection, documents, now = Date.now) {
  collection.documents.push(...documents);
  collection.updatedAt = timestamp(now);
}

export function removeDocument(collection, documentId, now = Date.now) {
  const index = collection.documents.findIndex((document) => document.id === documentId);
  if (index < 0) return false;
  collection.documents.splice(index, 1);
  collection.updatedAt = timestamp(now);
  return true;
}

export function removeCollection(collections, collectionId) {
  if (collectionId === DEFAULT_COLLECTION_ID) return false;
  const index = collections.findIndex((collection) => collection.id === collectionId);
  if (index < 0) return false;
  collections.splice(index, 1);
  return true;
}
