/**
 * libraryStore.js — Garden Library IndexedDB storage
 *
 * Two object stores:
 *   libraryItems  — user-facing records (one per saved item)
 *   libraryChunks — retrieval units (one or more per item, with embeddings)
 *
 * All data stays on device. Nothing in this file makes network calls.
 */

const DB_NAME = 'gardenLibrary';
const DB_VERSION = 1;

let _db = null;

// ─── Open / initialise ────────────────────────────────────────────────────────

export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Items store — one record per thing the user saves
      if (!db.objectStoreNames.contains('libraryItems')) {
        const items = db.createObjectStore('libraryItems', { keyPath: 'id' });
        items.createIndex('status', 'status', { unique: false });
        items.createIndex('type', 'type', { unique: false });
        items.createIndex('addedAt', 'addedAt', { unique: false });
      }

      // Chunks store — retrieval units derived from items
      if (!db.objectStoreNames.contains('libraryChunks')) {
        const chunks = db.createObjectStore('libraryChunks', { keyPath: 'id' });
        chunks.createIndex('itemId', 'itemId', { unique: false });
        chunks.createIndex('type', 'type', { unique: false });
        chunks.createIndex('isGarden', 'isGarden', { unique: false });
        chunks.createIndex('isWishlist', 'isWishlist', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── libraryItems CRUD ────────────────────────────────────────────────────────

/**
 * Save a new item record.
 * @param {object} item
 * @param {string} item.id          — uuid
 * @param {number} item.addedAt     — Date.now()
 * @param {'observation'|'inspiration'} item.type
 * @param {'text'|'url'|'youtube'}  item.sourceType
 * @param {string|null} item.sourceUrl
 * @param {string|null} item.sourceTitle
 * @param {string|null} item.userNote
 * @param {string}      item.raw    — original text before chunking
 * @param {'indexing'|'ready'|'error'} item.status
 */
export async function putItem(item) {
  await openDB();
  return promisify(tx('libraryItems', 'readwrite').put(item));
}

export async function getItem(id) {
  await openDB();
  return promisify(tx('libraryItems').get(id));
}

export async function getAllItems() {
  await openDB();
  return promisify(tx('libraryItems').getAll());
}

export async function updateItemStatus(id, status) {
  await openDB();
  const item = await getItem(id);
  if (!item) return;
  item.status = status;
  return promisify(tx('libraryItems', 'readwrite').put(item));
}

export async function deleteItem(id) {
  await openDB();
  // Delete item and all its chunks in one transaction
  const db = await openDB();
  const transaction = db.transaction(['libraryItems', 'libraryChunks'], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    // Delete item
    transaction.objectStore('libraryItems').delete(id);

    // Delete all chunks for this item
    const chunkStore = transaction.objectStore('libraryChunks');
    const index = chunkStore.index('itemId');
    const req = index.openCursor(IDBKeyRange.only(id));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

// ─── libraryChunks CRUD ───────────────────────────────────────────────────────

/**
 * Save a chunk record.
 * @param {object} chunk
 * @param {string}      chunk.id
 * @param {string}      chunk.itemId          — foreign key to libraryItems
 * @param {string}      chunk.text
 * @param {Float32Array} chunk.embedding      — from transformers.js
 * @param {'observation'|'inspiration'} chunk.type
 * @param {string[]}    chunk.plants          — normalised plant keys
 * @param {string[]}    chunk.relevantSeasons — ['spring','summer','autumn','winter']
 * @param {'northern'|'southern'|null} chunk.hemisphere
 * @param {boolean}     chunk.isGarden
 * @param {string|null} chunk.gardenLocation
 * @param {boolean}     chunk.isWishlist
 * @param {string|null} chunk.userNote        — inherited from parent item
 */
export async function putChunk(chunk) {
  await openDB();
  return promisify(tx('libraryChunks', 'readwrite').put(chunk));
}

export async function getAllChunks() {
  await openDB();
  return promisify(tx('libraryChunks').getAll());
}

export async function getChunksByItemId(itemId) {
  await openDB();
  return promisify(tx('libraryChunks').index('itemId').getAll(IDBKeyRange.only(itemId)));
}

export async function deleteChunksByItemId(itemId) {
  await openDB();
  const chunks = await getChunksByItemId(itemId);
  const store = tx('libraryChunks', 'readwrite');
  return Promise.all(chunks.map(c => promisify(store.delete(c.id))));
}

// ─── Library stats ────────────────────────────────────────────────────────────

export async function getLibraryStats() {
  await openDB();
  const items = await getAllItems();
  const chunks = await getAllChunks();
  return {
    itemCount: items.length,
    chunkCount: chunks.length,
    readyCount: items.filter(i => i.status === 'ready').length,
    indexingCount: items.filter(i => i.status === 'indexing').length,
    errorCount: items.filter(i => i.status === 'error').length,
  };
}

// ─── Setup flag ───────────────────────────────────────────────────────────────
// Tracks whether the user has completed the one-time library setup
// (model downloaded, intro acknowledged). Stored in localStorage — tiny value,
// no content, appropriate for a preference flag.

export function isLibrarySetUp() {
  return localStorage.getItem('gc_library_setup') === '1';
}

export function markLibrarySetUp() {
  localStorage.setItem('gc_library_setup', '1');
}
