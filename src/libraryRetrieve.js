/**
 * libraryRetrieve.js — Retrieve relevant chunks and format for prompt injection
 *
 * Two-stage retrieval:
 *   Stage 1: metadata filter (season, plants, type flags)
 *   Stage 2: cosine similarity ranking against query embedding
 *
 * Returns a formatted string ready to inject into a generation prompt,
 * or empty string if library is empty / nothing relevant found.
 */

import { getAllChunks } from './libraryStore.js';
import { loadEmbeddingModel } from './libraryIndex.js';

// Minimum similarity score to include a chunk (0–1 cosine similarity)
const MIN_SIMILARITY = 0.25;

// ─── Season utilities ─────────────────────────────────────────────────────────

// Map month number (1–12) to season name, for a given hemisphere
function monthToSeason(month, hemisphere = 'northern') {
  const northernMap = {
    12: 'winter', 1: 'winter', 2: 'winter',
    3: 'spring',  4: 'spring', 5: 'spring',
    6: 'summer',  7: 'summer', 8: 'summer',
    9: 'autumn', 10: 'autumn', 11: 'autumn',
  };
  const southernMap = {
    12: 'summer', 1: 'summer', 2: 'summer',
    3: 'autumn',  4: 'autumn', 5: 'autumn',
    6: 'winter',  7: 'winter', 8: 'winter',
    9: 'spring', 10: 'spring', 11: 'spring',
  };
  const map = hemisphere === 'southern' ? southernMap : northernMap;
  return map[month] || null;
}

/**
 * Get the set of seasons relevant to a list of months,
 * from the user's perspective (their hemisphere).
 */
function monthsToUserSeasons(months, userHemisphere = 'northern') {
  const seasons = new Set();
  for (const m of months) {
    const s = monthToSeason(m, userHemisphere);
    if (s) seasons.add(s);
  }
  return seasons;
}

/**
 * Does a chunk's season metadata match the target seasons,
 * accounting for hemisphere inversion?
 *
 * A chunk with no relevantSeasons is always included (non-temporal).
 * A chunk from the opposite hemisphere has its seasons inverted before matching.
 */
function chunkSeasonsMatch(chunk, targetSeasons, userHemisphere = 'northern') {
  if (!chunk.relevantSeasons || chunk.relevantSeasons.length === 0) return true; // non-temporal

  // If chunk hemisphere is unknown, assume same as user
  const chunkHemisphere = chunk.hemisphere || userHemisphere;

  if (chunkHemisphere === userHemisphere) {
    // Same hemisphere — direct season match
    return chunk.relevantSeasons.some(s => targetSeasons.has(s));
  } else {
    // Opposite hemisphere — invert chunk seasons before matching
    const INVERT = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
    return chunk.relevantSeasons.some(s => targetSeasons.has(INVERT[s]));
  }
}

/**
 * Does a chunk's plant list overlap with the user's plant list?
 * Empty chunk.plants = no plant constraint (match anything).
 */
function chunkPlantsMatch(chunk, userPlants) {
  if (!chunk.plants || chunk.plants.length === 0) return true;
  if (!userPlants || userPlants.length === 0) return true;
  return chunk.plants.some(p => userPlants.includes(p));
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Main retrieval function ──────────────────────────────────────────────────

/**
 * Retrieve relevant chunks for a generation context.
 *
 * @param {object} options
 * @param {'calendar'|'weekly'|'inspo'|'insights'} options.context
 * @param {number[]}  options.months        — months being generated (1–12)
 * @param {string[]}  options.userPlants    — user's plant list (normalised keys)
 * @param {'northern'|'southern'} options.userHemisphere — defaults to 'northern'
 * @param {number}    options.topK          — max chunks to return (default 4)
 * @returns {string} formatted context string for prompt injection, or ''
 */
export async function retrieveContext({
  context,
  months = [],
  userPlants = [],
  userHemisphere = 'northern',
  topK = 4,
}) {
  const allChunks = await getAllChunks();
  if (allChunks.length === 0) return '';

  // ── Stage 1: metadata filter ───────────────────────────────────────────────

  const targetSeasons = monthsToUserSeasons(months, userHemisphere);

  let candidates = allChunks.filter(chunk => {
    switch (context) {
      case 'calendar':
      case 'weekly':
        // Temporal + plant relevance
        return chunkSeasonsMatch(chunk, targetSeasons, userHemisphere)
            && chunkPlantsMatch(chunk, userPlants);

      case 'inspo':
        // Garden chunks and wishlist inspirations, seasonally relevant
        return (chunk.isGarden || chunk.isWishlist || chunk.type === 'inspiration')
            && chunkSeasonsMatch(chunk, targetSeasons, userHemisphere);

      case 'insights':
        // Full corpus — no filter; analytical context wants everything
        return true;

      default:
        return true;
    }
  });

  if (candidates.length === 0) return '';

  // ── Stage 2: embedding similarity ─────────────────────────────────────────

  const queryString = buildQueryString(context, months, userPlants, userHemisphere);

  let ranked;

  try {
    // Requires model to be loaded
    const { pipeline, env } = await import(
      'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'
    );
    // Model should already be loaded from setup — this just gets the cached instance
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: null,
    });
    const queryOutput = await pipe(queryString, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(queryOutput.data);

    ranked = candidates
      .map(chunk => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .filter(({ score }) => score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);

  } catch (err) {
    // Model not available — fall back to returning top candidates by metadata match only
    console.warn('[libraryRetrieve] Embedding similarity unavailable, using metadata-only retrieval:', err.message);
    ranked = candidates.slice(0, topK);
  }

  if (ranked.length === 0) return '';

  // ── Stage 3: format for prompt injection ──────────────────────────────────

  return formatForPrompt(ranked, context, userHemisphere);
}

// ─── Query string builder ─────────────────────────────────────────────────────

function buildQueryString(context, months, userPlants, userHemisphere) {
  const seasonNames = [...monthsToUserSeasons(months, userHemisphere)].join(', ');
  const plantNames = userPlants.slice(0, 5).join(', '); // cap for query length

  switch (context) {
    case 'calendar':
      return `gardening tasks observations plant care ${seasonNames} ${plantNames}`.trim();
    case 'weekly':
      return `what to do in the garden this week ${seasonNames} ${plantNames}`.trim();
    case 'inspo':
      return `gardens places to visit inspiration ${seasonNames}`.trim();
    case 'insights':
      return `plants to add ideas for the garden inspiration wishlist`.trim();
    default:
      return 'garden notes observations inspirations';
  }
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

function formatForPrompt(chunks, context, userHemisphere) {
  const observations = chunks.filter(c => c.type === 'observation');
  const inspirations = chunks.filter(c => c.type === 'inspiration');

  const lines = [];

  if (observations.length > 0) {
    lines.push('--- Personal garden notes (treat as ground truth about this specific garden) ---');
    for (const chunk of observations) {
      const seasonNote = chunk.relevantSeasons?.length
        ? ` [${chunk.relevantSeasons.join('/')}]`
        : '';
      lines.push(`• ${chunk.text.trim()}${seasonNote}`);
    }
  }

  if (inspirations.length > 0) {
    const label = context === 'inspo'
      ? '--- Saved garden inspirations (incorporate where seasonally appropriate) ---'
      : '--- Saved inspirations and ideas (use as reference; weigh alongside climate and location data) ---';
    lines.push(label);

    for (const chunk of inspirations) {
      const hemisphereNote = chunk.hemisphere && chunk.hemisphere !== userHemisphere
        ? ` [Note: ${chunk.hemisphere} hemisphere — seasonal references are inverted relative to the user's location]`
        : '';
      const gardenNote = chunk.isGarden && chunk.gardenLocation
        ? ` [Garden: ${chunk.gardenLocation}]`
        : '';
      lines.push(`• ${chunk.text.trim()}${gardenNote}${hemisphereNote}`);
    }
  }

  if (lines.length === 0) return '';

  return [
    '=== From the user\'s personal garden library ===',
    ...lines,
    '=== End of personal garden library ===',
  ].join('\n');
}
