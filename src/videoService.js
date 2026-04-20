/**
 * videoService.js — Sprint 8
 *
 * Determines which tasks warrant a video button, then builds a clean
 * YouTube search query by extracting the action verb and plant name
 * from the task text — rather than passing the full sentence.
 *
 * Flow:
 *   1. taskNeedsVideo(taskText)     — should we show a button?
 *   2. searchYouTube(text,region) — proxy calls Claude for query, then searches YouTube
 *   3. searchYouTube(...)            — hits /api/youtube on proxy
 *   4. User picks result → embeds inline
 */

// ─── Region mapping ───────────────────────────────────────────────────────────
const CLIMATE_TO_REGION = {
  'temperate oceanic':             'uk',
  'temperate continental':         'uk',
  'cold temperate':                'uk',
  'maritime':                      'uk',
  'temperate':                     'uk',
  'subarctic':                     'uk',
  'mediterranean':                 'mediterranean',
  'hot semi-arid':                 'mediterranean',
  'subtropical':                   'uk',
  'subtropical oceanic':           'uk',
  'subtropical (wet/dry seasons)': 'uk',
  'tropical humid':                'uk',
  'equatorial':                    'uk',
  'arid':                          'mediterranean',
};

export function climateToRegion(climateType) {
  if (!climateType) return 'uk';
  return CLIMATE_TO_REGION[climateType.toLowerCase()] || 'uk';
}

// ─── Task eligibility ─────────────────────────────────────────────────────────
// Excludes clearly routine tasks; includes anything technique-based.

const ROUTINE_PATTERNS = [
  /^water\b/i, /^weed\b/i, /^tidy\b/i, /^clear\b/i,
  /^sweep\b/i, /^rake\b/i, /^mow\b/i,
  /^harvest\b/i, /^pick\b/i,
  /^deadhead annuals/i, /^remove spent/i,
  /^check for pests/i, /^inspect\b/i,
];

const TECHNIQUE_PATTERNS = [
  // Pruning — always technique-dependent
  /\bprun/i,
  /\bdeadhead\s+(rose|dahlia|peony|wisteria|camellia)/i,  // specific deadheading only
  // Propagation — all forms involve real technique
  /\bcutting/i, /\bgraft/i, /\bdivid/i,
  /\bpropagat/i, /\blayer\s+(shrub|climber|stem)/i,
  /\bsoftwood/i, /\bhardwood/i, /\bsemi.?hardwood/i,
  // Planting technique — depth/method matters
  /\bbare.?root/i,
  /\bplant\s+(out\s+)?(bare|bulb|dahlia|tuber)/i,
  /\btransplant/i,
  /\bpot\s+(up|on)\b/i, /\brepot/i,
  /\bgraft/i,
  /\bearth\s+up/i, /\bchit\b/i,
  // Lawn care — equipment/timing dependent
  /\bscarif/i, /\boverseed/i, /\baerat/i,
  // Training — specialist
  /\btrain\b.*\b(rose|wisteria|fruit|espalier|fan)/i,
  /\bespalier/i,
  // Pest/disease treatment — timing critical
  /\bnematode/i, /\bvine\s+weevil/i,
  // Specific plants where even basic tasks are technique-sensitive
  /\bwisteria/i, /\braspberr/i, /\bcurrant/i, /\bgooseberr/i,
];

export function taskNeedsVideo(taskText) {
  if (!taskText) return false;
  if (ROUTINE_PATTERNS.some(p => p.test(taskText))) return false;
  return TECHNIQUE_PATTERNS.some(p => p.test(taskText));
}

// ─── Action extraction ────────────────────────────────────────────────────────
// Maps task text patterns to clean action phrases for the search query.
// Ordered: more specific patterns first.
const ACTION_MAP = [
  [/\bhard\s+prun/i,              'hard prune'],
  [/\bspur\s*prun/i,              'spur prune'],
  [/\bsummer\s+prun/i,            'summer prune'],
  [/\bwinter\s+prun/i,            'winter prune'],
  [/\bprun/i,                     'prune'],
  [/\bdivid/i,                    'divide'],
  [/\btransplant/i,               'transplant'],
  [/\bpot\s+on\b/i,               'pot on'],
  [/\bpot\s+up\b/i,               'pot up'],
  [/\bplant\s+out/i,              'plant out'],
  [/\bbare.?root/i,               'plant bare root'],
  [/\bsoftwood\s+cutting/i,       'take softwood cuttings'],
  [/\bhardwood\s+cutting/i,       'take hardwood cuttings'],
  [/\bsemi.?hardwood\s+cutting/i, 'take semi-hardwood cuttings'],
  [/\bearth\s+up/i,               'earth up'],
  [/\bchit\b/i,                   'chit'],
  [/\bscarif/i,                   'scarify lawn'],
  [/\boverseed/i,                 'overseed lawn'],
  [/\baerat/i,                    'aerate lawn'],
  [/\bmulch/i,                    'mulch'],   // before layer — avoids "layer of compost" false positive
  [/\btrain\b/i,                  'train'],
  [/\bpropagat/i,                 'propagate'],
  [/\blayer\s+(shrub|climber|stem)/i, 'layer'], // only match "layer" as a propagation verb, not "layer of"
  [/\bgraft/i,                    'graft'],
  [/\brepot/i,                    'repot'],
  [/\btie\s+in/i,                 'tie in'],
  [/\bstake/i,                    'stake'],
];

// ─── AI-powered search query + YouTube search ─────────────────────────────────
/**
 * Calls the proxy to:
 *   1. Ask Claude to distil the task into a clean YouTube search query
 *   2. Search YouTube with that query
 *
 * Returns { query, results } so the UI can show what was searched.
 *
 * The proxy handles both steps server-side — one round trip from the browser.
 * Proxy endpoint: POST /api/youtube-search
 *   body: { task, region }
 *   returns: { query, results: [{ videoId, title, channel, thumbnailUrl }] }
 */
export async function searchYouTube(taskText, region = 'uk', proxyBase = '') {
  if (!proxyBase) throw new Error('Proxy not configured — YouTube search unavailable');

  const res = await fetch(`${proxyBase}/api/youtube-search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ task: taskText, region }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Search failed (${res.status})`);
  }

  const data = await res.json();
  return {
    query:   data.query || '',
    results: (data.results || []).map(r => ({
      videoId:      r.videoId,
      title:        r.title,
      channel:      r.channel,
      thumbnailUrl: r.thumbnailUrl || `https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg`,
    })),
  };
}

// ─── Embed URL ────────────────────────────────────────────────────────────────
export function buildEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`;
}
