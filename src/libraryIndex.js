/**
 * libraryIndex.js — Ingest, chunk, extract metadata, and embed library items
 *
 * Pipeline per item:
 *   1. Ingest  — fetch text from URL / YouTube / paste
 *   2. Chunk   — split on paragraph/sentence boundaries
 *   3. Extract — heuristic metadata (plants, seasons, hemisphere, isGarden, isWishlist)
 *   4. Embed   — transformers.js all-MiniLM-L6-v2 (loaded once, cached)
 *
 * No user content leaves the device in this module.
 * The embedding model is downloaded once (~23MB) and cached by the browser.
 */

import { putItem, putChunk, updateItemStatus, deleteChunksByItemId } from './libraryStore.js';

// ─── Embedding model (lazy-loaded) ───────────────────────────────────────────

let _pipeline = null;
let _modelLoadPromise = null;

/**
 * Load the embedding model. Called explicitly during library setup.
 * Returns a progress callback interface so the UI can show download progress.
 */
export async function loadEmbeddingModel(onProgress) {
  if (_pipeline) return _pipeline;
  if (_modelLoadPromise) return _modelLoadPromise;

  _modelLoadPromise = (async () => {
    const { pipeline, env } = await import(
      'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
    );

    // Use local cache — model downloads once, then served from browser cache
    env.allowLocalModels = false;

    _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: onProgress,
    });

    return _pipeline;
  })();

  return _modelLoadPromise;
}

export function isModelLoaded() {
  return _pipeline !== null;
}

async function embedText(text) {
  if (!_pipeline) throw new Error('Embedding model not loaded. Call loadEmbeddingModel() first.');
  const output = await _pipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data); // Float32Array → plain array for IndexedDB storage
}

// ─── Plant vocabulary ─────────────────────────────────────────────────────────
// Normalised keys matching the app's plant list.
// Extended with common aliases and plurals.

const PLANT_VOCAB = [
  'rose', 'roses', 'wisteria', 'peony', 'peonies', 'lavender', 'tulip', 'tulips',
  'iris', 'irises', 'magnolia', 'hydrangea', 'clematis', 'dahlia', 'dahlias',
  'foxglove', 'foxgloves', 'allium', 'alliums', 'camellia', 'camellias',
  'snowdrop', 'snowdrops', 'crocus', 'anemone', 'anemones', 'bluebell', 'bluebells',
  'lupin', 'lupins', 'delphinium', 'delphiniums', 'hollyhock', 'hollyhocks',
  'sunflower', 'sunflowers', 'verbena', 'salvia', 'echinacea', 'rudbeckia',
  'aster', 'asters', 'sedum', 'agapanthus', 'crocosmia', 'helenium',
  'geranium', 'geraniums', 'penstemon', 'penstemons', 'aquilegia', 'aquilegias',
  'hellebore', 'hellebores', 'erysimum', 'wallflower', 'wallflowers',
  'sweet pea', 'sweet peas', 'nasturtium', 'nasturtiums', 'cosmos',
  'nigella', 'poppy', 'poppies', 'cornflower', 'cornflowers',
  'lily', 'lilies', 'lily of the valley', 'lemon balm', 'bay laurel', 'mint',
  'garden mint', 'thyme', 'wild thyme', 'wormwood',
  'cherry', 'sour cherry', 'lime tree', 'hawthorn', 'elder', 'elderflower',
  'bramble', 'blackberry', 'grape', 'vine', 'oak', 'beech',
  'grass', 'grasses', 'fern', 'ferns', 'hosta', 'hostas',
  'protea', 'banksia', 'grevillea', 'kangaroo paw', 'bougainvillea',
  'agave', 'ceanothus', 'california poppy',
];

// Normalised to app plant keys (strip plurals, common aliases)
const PLANT_NORMALISE = {
  'roses': 'rose', 'tulips': 'tulip', 'irises': 'iris', 'peonies': 'peony',
  'dahlias': 'dahlia', 'camellias': 'camellia', 'snowdrops': 'snowdrop',
  'bluebells': 'bluebell', 'alliums': 'allium', 'anemones': 'anemone',
  'lupins': 'lupin', 'delphiniums': 'delphinium', 'hollyhocks': 'hollyhock',
  'sunflowers': 'sunflower', 'asters': 'aster', 'geraniums': 'geranium',
  'penstemons': 'penstemon', 'aquilegias': 'aquilegia', 'hellebores': 'hellebore',
  'wallflowers': 'wallflower', 'sweet peas': 'sweetpea', 'sweet pea': 'sweetpea',
  'nasturtiums': 'nasturtium', 'cornflowers': 'cornflower',
  'lilies': 'lily', 'poppies': 'poppy', 'foxgloves': 'foxglove',
  'hostas': 'hosta', 'ferns': 'fern', 'grasses': 'grass',
};

function extractPlants(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  // Sort by length descending so multi-word phrases match before single words
  const sorted = [...PLANT_VOCAB].sort((a, b) => b.length - a.length);
  for (const plant of sorted) {
    if (lower.includes(plant)) {
      const key = PLANT_NORMALISE[plant] || plant.replace(/\s+/g, '');
      found.add(key);
    }
  }
  return [...found];
}

// ─── Season / temporal vocabulary ────────────────────────────────────────────

const SEASON_SIGNALS = {
  spring:       ['spring', 'early spring', 'late spring', 'march', 'april', 'may'],
  summer:       ['summer', 'early summer', 'midsummer', 'late summer', 'june', 'july', 'august'],
  autumn:       ['autumn', 'fall', 'early autumn', 'late autumn', 'september', 'october', 'november'],
  winter:       ['winter', 'midwinter', 'early winter', 'december', 'january', 'february'],
};

// Phrases that bridge seasons
const BRIDGE_SIGNALS = {
  'last frost':    ['spring'],
  'first frost':   ['autumn'],
  'growing season':['spring', 'summer'],
  'dormant':       ['winter'],
  'overwintering': ['winter'],
  'after flowering': [],   // too ambiguous — skip
};

function extractSeasons(text) {
  const lower = text.toLowerCase();
  const found = new Set();

  for (const [season, signals] of Object.entries(SEASON_SIGNALS)) {
    for (const signal of signals) {
      if (lower.includes(signal)) {
        found.add(season);
        break;
      }
    }
  }

  for (const [phrase, seasons] of Object.entries(BRIDGE_SIGNALS)) {
    if (lower.includes(phrase)) {
      seasons.forEach(s => found.add(s));
    }
  }

  return [...found]; // empty = non-temporal, relevant all year
}

// ─── Hemisphere detection ─────────────────────────────────────────────────────

const SOUTHERN_SIGNALS = [
  'australia', 'australian', 'new zealand', 'south africa', 'south african',
  'argentina', 'argentina', 'chile', 'chilean', 'southern hemisphere',
  'sydney', 'melbourne', 'brisbane', 'perth', 'auckland', 'cape town',
  'johannesburg', 'buenos aires', 'santiago',
];

const NORTHERN_SIGNALS = [
  'england', 'scotland', 'wales', 'ireland', 'uk', 'united kingdom',
  'france', 'germany', 'netherlands', 'belgium', 'sweden', 'norway',
  'denmark', 'spain', 'italy', 'portugal', 'greece', 'poland',
  'canada', 'united states', 'usa', 'us east', 'us west', 'california',
  'new england', 'pacific northwest', 'northern hemisphere',
  'london', 'paris', 'berlin', 'amsterdam', 'madrid', 'rome',
  'new york', 'toronto', 'vancouver', 'rhs', 'kew', 'wisley',
  'ngs', 'national garden scheme',
];

function detectHemisphere(text) {
  const lower = text.toLowerCase();
  const hasSouthern = SOUTHERN_SIGNALS.some(s => lower.includes(s));
  const hasNorthern = NORTHERN_SIGNALS.some(s => lower.includes(s));
  if (hasSouthern && !hasNorthern) return 'southern';
  if (hasNorthern && !hasSouthern) return 'northern';
  return null; // ambiguous or not mentioned — caller assumes user's own hemisphere
}

// ─── Garden / place detection ─────────────────────────────────────────────────

const GARDEN_SIGNALS = [
  'garden', 'gardens', 'arboretum', 'botanical', 'ngs open', 'open garden',
  'national trust', 'english heritage', 'rhs garden', 'great dixter',
  'sissinghurst', 'hidcote', 'wisley', 'kew', 'hampton court', 'chatsworth',
  'worth visiting', 'worth a visit', 'to visit', 'open to the public',
  'admission', 'opening times', 'garden centre',
];

function detectIsGarden(text) {
  const lower = text.toLowerCase();
  return GARDEN_SIGNALS.some(s => lower.includes(s));
}

function extractGardenLocation(text) {
  // Simple heuristic: look for "X Garden(s)" or "Garden at X" patterns
  // Returns the first plausible location string, or null
  const patterns = [
    /([A-Z][a-z]+(?: [A-Z][a-z]+)*)\s+(?:Garden|Gardens|Arboretum|Park)/,
    /(?:Garden|Gardens)\s+(?:at|of)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)*)/,
    /(?:visit(?:ing)?|visited?)\s+([A-Z][a-z]+(?: [A-Z][a-z]+){0,3})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Wishlist detection ───────────────────────────────────────────────────────

const WISHLIST_SIGNALS = [
  "i'd like to", "i would like to", "i want to try", "want to grow",
  "thinking of planting", "considering planting", "planning to plant",
  "next year", "would love to", "would be lovely to", "might try",
  "tempted to", "on my list", "to try", "must try", "must grow",
  "would work well", "could try", "going to try",
];

function detectIsWishlist(text) {
  const lower = text.toLowerCase();
  return WISHLIST_SIGNALS.some(s => lower.includes(s));
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

const MAX_CHUNK_TOKENS = 200; // approximate — 1 token ≈ 4 chars
const MIN_CHUNK_CHARS  = 80;  // merge chunks shorter than this with next

function approximateTokens(text) {
  return Math.ceil(text.length / 4);
}

function splitIntoSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace
  return text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
}

export function chunkText(text) {
  // Short personal observations — never split
  if (text.length < 500) return [text.trim()].filter(Boolean);

  // Split on paragraph boundaries first
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (approximateTokens(para) > MAX_CHUNK_TOKENS) {
      // Paragraph too long — split on sentences
      if (buffer) { chunks.push(buffer.trim()); buffer = ''; }
      const sentences = splitIntoSentences(para);
      let sentBuffer = '';
      for (const sentence of sentences) {
        if (approximateTokens(sentBuffer + sentence) > MAX_CHUNK_TOKENS) {
          if (sentBuffer) chunks.push(sentBuffer.trim());
          sentBuffer = sentence;
        } else {
          sentBuffer += sentence;
        }
      }
      if (sentBuffer) chunks.push(sentBuffer.trim());
    } else if (approximateTokens(buffer + '\n\n' + para) > MAX_CHUNK_TOKENS) {
      // Adding this paragraph would exceed limit — flush buffer
      if (buffer) chunks.push(buffer.trim());
      buffer = para;
    } else {
      buffer = buffer ? buffer + '\n\n' + para : para;
    }
  }

  if (buffer) chunks.push(buffer.trim());

  // Merge very short trailing chunks into the previous one
  const merged = [];
  for (const chunk of chunks) {
    if (chunk.length < MIN_CHUNK_CHARS && merged.length > 0) {
      merged[merged.length - 1] += ' ' + chunk;
    } else {
      merged.push(chunk);
    }
  }

  return merged.filter(c => c.length > 20);
}

// ─── Main indexing function ───────────────────────────────────────────────────

/**
 * Index a library item: chunk → extract metadata → embed → store chunks.
 * Updates item status to 'ready' on success, 'error' on failure.
 *
 * @param {string} itemId — must already exist in libraryItems store
 * @param {string} rawText — full text to index
 * @param {'observation'|'inspiration'} type
 * @param {string|null} userNote
 */
export async function indexItem(itemId, rawText, type, userNote = null) {
  try {
    // 1. Chunk
    const chunks = chunkText(rawText);

    // 2. Extract metadata from full text (once per item, applied to all chunks)
    const plants       = extractPlants(rawText);
    const seasons      = extractSeasons(rawText);
    const hemisphere   = detectHemisphere(rawText);
    const isGarden     = type === 'inspiration' && detectIsGarden(rawText);
    const gardenLocation = isGarden ? extractGardenLocation(rawText) : null;
    const isWishlist   = type === 'inspiration' && detectIsWishlist(rawText);

    // 3. Embed and store each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embedding = await embedText(chunkText);

      const chunk = {
        id: `${itemId}_${i}`,
        itemId,
        text: chunkText,
        embedding,
        type,
        plants,
        relevantSeasons: seasons,
        hemisphere,
        isGarden,
        gardenLocation,
        isWishlist,
        userNote,
      };

      await putChunk(chunk);
    }

    // 4. Mark item ready
    await updateItemStatus(itemId, 'ready');

    return { success: true, chunkCount: chunks.length };

  } catch (err) {
    console.error('[libraryIndex] indexItem failed:', err);
    await updateItemStatus(itemId, 'error');
    return { success: false, error: err.message };
  }
}

// ─── Re-index ─────────────────────────────────────────────────────────────────

/**
 * Re-index an existing item (e.g. after model update or metadata change).
 * Deletes existing chunks first.
 */
export async function reindexItem(itemId, rawText, type, userNote = null) {
  await deleteChunksByItemId(itemId);
  await updateItemStatus(itemId, 'indexing');
  return indexItem(itemId, rawText, type, userNote);
}
