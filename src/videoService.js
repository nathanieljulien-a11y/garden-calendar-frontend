/**
 * videoService.js — Sprint 8 (revised: live search)
 *
 * Determines which tasks should offer a video button, then searches YouTube
 * on demand via the proxy when the user clicks.
 *
 * No pre-sourced video library required. The proxy calls YouTube Data API v3
 * using a server-side YOUTUBE_API_KEY env var — users need no credentials.
 *
 * Flow:
 *   1. taskNeedsVideo(taskText) — returns true if the task is non-trivial
 *   2. User clicks "▶ Watch how to do this"
 *   3. searchYouTube(taskText, region) — hits /api/youtube, returns 3 results
 *   4. User picks one — it embeds inline via youtube-nocookie.com
 */

// ─── Region mapping ───────────────────────────────────────────────────────────
const CLIMATE_TO_REGION = {
  'temperate oceanic':              'uk',
  'temperate continental':          'uk',
  'cold temperate':                 'uk',
  'maritime':                       'uk',
  'temperate':                      'uk',
  'subarctic':                      'uk',
  'mediterranean':                  'mediterranean',
  'hot semi-arid':                  'mediterranean',
  'subtropical':                    'uk',
  'subtropical oceanic':            'uk',
  'subtropical (wet/dry seasons)':  'uk',
  'tropical humid':                 'uk',
  'equatorial':                     'uk',
  'arid':                           'mediterranean',
};

const REGION_SEARCH_TERM = {
  'uk':            'UK garden',
  'mediterranean': 'Mediterranean garden',
  'australasian':  'Australia garden',
  'north-american':'garden',
};

export function climateToRegion(climateType) {
  if (!climateType) return 'uk';
  return CLIMATE_TO_REGION[climateType.toLowerCase()] || 'uk';
}

// ─── Task eligibility ─────────────────────────────────────────────────────────
const ROUTINE_PATTERNS = [
  /^water\b/i, /^weed\b/i, /^tidy\b/i, /^clear\b/i,
  /^sweep\b/i, /^rake\b/i, /^mow\b/i,
  /^harvest\b/i, /^pick\b/i,
  /^deadhead annuals/i, /^remove spent/i,
  /^check for pests/i, /^inspect\b/i,
];

const TECHNIQUE_PATTERNS = [
  /\bprun/i, /\bcutting/i, /\bgraft/i, /\bdivid/i,
  /\blayer/i, /\bpropagat/i, /\bsow\b/i, /\bsowing\b/i,
  /\btransplant/i, /\bpot\s+(up|on)\b/i,
  /\bplant\s+(out|bare|bulb)/i, /\bbare.?root/i,
  /\bsoftwood/i, /\bhardwood/i, /\bsemi.?hardwood/i,
  /\bearth\s+up/i, /\bchit\b/i, /\bscarif/i,
  /\boverseed/i, /\baerat/i, /\btrain\b/i,
  /\bespalier/i, /\bspur.?prun/i, /\bwisteria/i,
  /\bgrapevine/i, /\braspberr/i, /\bcurrant/i,
  /\bgooseberr/i, /\bnematode/i, /\bvine\s+weevil/i,
];

export function taskNeedsVideo(taskText) {
  if (!taskText) return false;
  if (ROUTINE_PATTERNS.some(p => p.test(taskText))) return false;
  return TECHNIQUE_PATTERNS.some(p => p.test(taskText));
}

// ─── Search query builder ─────────────────────────────────────────────────────
export function buildSearchQuery(taskText, region = 'uk') {
  const cleaned = taskText
    .replace(/\d+\s*(cm|mm|g|kg|m²|sq\s*m|litre|liter|inch|inches|feet|ft)\b/gi, '')
    .replace(/\b(to|above|below|at|by|up to|down to|approx|approximately)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const regionTerm = REGION_SEARCH_TERM[region] || 'garden';
  return `how to ${cleaned} ${regionTerm}`;
}

// ─── YouTube search via proxy ─────────────────────────────────────────────────
export async function searchYouTube(taskText, region = 'uk', proxyBase = '') {
  const query = buildSearchQuery(taskText, region);
  const params = new URLSearchParams({ q: query, maxResults: 3 });
  const url = proxyBase ? `${proxyBase}/api/youtube?${params}` : null;
  if (!url) throw new Error('Proxy not configured — YouTube search unavailable');
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `YouTube search failed (${res.status})`);
  }
  const data = await res.json();
  return (data.results || []).map(r => ({
    videoId:      r.videoId,
    title:        r.title,
    channel:      r.channel,
    thumbnailUrl: r.thumbnailUrl || `https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg`,
  }));
}

// ─── Embed URL ────────────────────────────────────────────────────────────────
export function buildEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`;
}
