/**
 * videoService.js — Sprint 8
 *
 * Handles all video library logic:
 * - Looks up curated videos for a task category + climate region
 * - Maps climate types to library regions
 * - Determines whether/how to show the video button (rating 2 vs 3)
 *
 * The library JSON is imported statically at build time — no runtime fetch.
 * YouTube nocookie embeds only — no API key needed.
 */

import videoLibrary from './videoLibrary.json';

// ─── Region mapping ───────────────────────────────────────────────────────────
// Maps climate type strings (from deriveClimateFromOM) to library region keys.
// Unmapped climates fall back to 'uk' (temperate).
const CLIMATE_TO_REGION = {
  // UK / temperate
  'temperate oceanic':     'uk',
  'temperate continental': 'uk',
  'cold temperate':        'uk',
  'maritime':              'uk',
  'temperate':             'uk',
  'subarctic':             'uk',
  // Mediterranean
  'mediterranean':         'mediterranean',
  'hot semi-arid':         'mediterranean',
  // Subtropical / tropical — use UK as closest available
  'subtropical':           'uk',
  'subtropical oceanic':   'uk',
  'subtropical (wet/dry seasons)': 'uk',
  'tropical humid':        'uk',
  'equatorial':            'uk',
  // Arid
  'arid':                  'mediterranean',
};

/**
 * Resolve climate type to library region key.
 * @param {string} climateType — from garden.climateData._derived.climateType
 * @returns {'uk' | 'mediterranean' | 'australasian' | 'north-american'}
 */
export function climateToRegion(climateType) {
  if (!climateType) return 'uk';
  const lower = climateType.toLowerCase();
  return CLIMATE_TO_REGION[lower] || 'uk';
}

// ─── Video lookup ─────────────────────────────────────────────────────────────
/**
 * Look up curated videos for a task category and region.
 * Falls back to UK if region has no entry.
 *
 * @param {string} categoryKey  — e.g. 'hard-prune-roses'
 * @param {string} region       — 'uk' | 'mediterranean' | 'australasian' | 'north-american'
 * @returns {{ rating: number, label: string, videos: VideoEntry[] } | null}
 *
 * VideoEntry shape:
 * { slot, channel, videoId, title, duration }
 */
export function getVideosForTask(categoryKey, region = 'uk') {
  const entry = videoLibrary[categoryKey];
  if (!entry) return null;

  const rating = entry._rating;
  if (rating === 1) return null; // routine tasks get no video

  // Try requested region, fall back to uk
  const videos = (entry[region] || entry['uk'] || [])
    .filter(v => v.videoId && !v.videoId.startsWith('_'))
    .map(({ slot, channel, videoId, title, duration }) => ({
      slot, channel, videoId, title, duration,
    }));

  if (!videos.length) return null;

  return { rating, label: entry._label, videos };
}

// ─── Embed URL builder ────────────────────────────────────────────────────────
/**
 * Build a YouTube Privacy Enhanced embed URL.
 * PRD §3.6: use youtube-nocookie.com, autoplay off.
 */
export function buildEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

// ─── Button label ─────────────────────────────────────────────────────────────
/**
 * Returns the button label for a given rating.
 * PRD §3.3: rating 2 = '▶ How to do this', rating 3 = '▶ Watch before you start'
 */
export function videoButtonLabel(rating) {
  return rating === 3 ? '▶ Watch before you start' : '▶ How to do this';
}

/**
 * Returns whether the video button should be prominent (rating 3) or subtle (rating 2).
 */
export function isVideoProminent(rating) {
  return rating === 3;
}

// ─── Source type badge labels ─────────────────────────────────────────────────
export const SLOT_LABELS = {
  expert:      'Expert',
  institution: 'Institution',
  nursery:     'Nursery',
};
