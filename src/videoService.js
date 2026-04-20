/**
 * videoService.js — Sprint 8
 *
 * Determines which tasks warrant a video button, then builds a clean
 * YouTube search query by extracting the action verb and plant name
 * from the task text — rather than passing the full sentence.
 *
 * Flow:
 *   1. taskNeedsVideo(taskText)     — should we show a button?
 *   2. buildSearchQuery(text,region) — "how to prune hydrangea UK"
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

// Appended to search query to bias results geographically
const REGION_TERM = {
  'uk':            'UK',
  'mediterranean': 'Mediterranean',
  'australasian':  'Australia',
  'north-american': '',
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
  /\bprun/i, /\bcutting/i, /\bgraft/i, /\bdivid/i,
  /\blayer\s+(shrub|climber|stem)/i, /\bpropagat/i,
  /\bsow\b/i, /\bsowing\b/i, /\btransplant/i,
  /\bpot\s+(up|on)\b/i, /\brepot/i,
  /\bplant\s+(out|bare|bulb)/i, /\bbare.?root/i,
  /\bsoftwood/i, /\bhardwood/i, /\bsemi.?hardwood/i,
  /\bearth\s+up/i, /\bchit\b/i, /\bscarif/i,
  /\boverseed/i, /\baerat/i, /\btrain\b/i,
  /\bespalier/i, /\bspur.?prun/i, /\bwisteria/i,
  /\bgrapevine/i, /\braspberr/i, /\bcurrant/i,
  /\bgooseberr/i, /\bnematode/i, /\bvine\s+weevil/i,
  /\bmulch/i,
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
  [/\bsow\b/i,                    'sow'],
  [/\bsowing\b/i,                 'sow'],
  [/\brepot/i,                    'repot'],
  [/\btie\s+in/i,                 'tie in'],
  [/\bstake/i,                    'stake'],
];

// ─── Plant extraction ─────────────────────────────────────────────────────────
// Ordered longest-first so "climbing rose" matches before "rose".
const PLANTS = [
  // Roses
  'climbing rose', 'rambling rose', 'shrub rose', 'hybrid tea rose', 'rose',
  // Climbers & wall shrubs
  'wisteria', 'clematis', 'jasmine', 'honeysuckle', 'virginia creeper',
  'passion flower', 'pyracantha', 'ceanothus', 'cotoneaster',
  // Flowering shrubs
  'hydrangea', 'camellia', 'forsythia', 'buddleja', 'buddleia',
  'photinia', 'viburnum', 'magnolia', 'lilac', 'rhododendron', 'azalea',
  'hebe', 'escallonia', 'pittosporum', 'choisya', 'Mexican orange blossom',
  'weigela', 'deutzia', 'philadelphus', 'mock orange',
  'cornus', 'dogwood', 'sambucus', 'elder',
  // Mediterranean / structural shrubs
  'lavender', 'rosemary', 'sage', 'thyme', 'cistus', 'rock rose',
  'oleander', 'myrtle', 'olive',
  // Perennials — this was the main gap
  'heuchera', 'hosta', 'agapanthus', 'crocosmia', 'echinacea', 'rudbeckia',
  'astrantia', 'geranium', 'hardy geranium', 'salvia', 'nepeta', 'catmint',
  'lupin', 'delphinium', 'achillea', 'yarrow', 'kniphofia', 'red hot poker',
  'penstemon', 'sedum', 'sedums', 'verbena', 'gaillardia', 'coreopsis',
  'campanula', 'aquilegia', 'bergenia', 'pulmonaria', 'hellebore',
  'digitalis', 'foxglove', 'alchemilla', 'lady\'s mantle',
  'euphorbia', 'ornamental grass', 'miscanthus', 'stipa', 'pampas grass',
  // Bulbs & tubers
  'dahlia', 'peony', 'iris', 'tulip', 'allium', 'snowdrop', 'daffodil',
  'sweet pea', 'gladiolus', 'crocosmia', 'anemone', 'ranunculus',
  // Bedding & tender
  'pelargonium', 'fuchsia', 'begonia', 'impatiens', 'busy lizzie',
  // Fruit trees
  'apple tree', 'pear tree', 'plum tree', 'cherry tree', 'peach tree',
  'apple', 'pear', 'plum', 'cherry', 'fig', 'peach', 'apricot', 'quince',
  'grape vine', 'grapevine',
  // Soft fruit
  'raspberry', 'blackcurrant', 'redcurrant', 'whitecurrant', 'gooseberry',
  'strawberry', 'blackberry', 'blueberry',
  // Vegetables
  'tomato', 'courgette', 'cucumber', 'pepper', 'chilli', 'aubergine',
  'potato', 'sweet potato', 'runner bean', 'french bean', 'broad bean', 'pea',
  'leek', 'onion', 'garlic', 'carrot', 'parsnip', 'beetroot',
  'kale', 'broccoli', 'cauliflower', 'cabbage', 'lettuce', 'spinach', 'chard',
  // Herbs
  'mint', 'basil', 'parsley', 'chives', 'dill', 'fennel', 'tarragon',
  // Lawn
  'lawn', 'grass',
];

function extractAction(taskText) {
  for (const [pattern, label] of ACTION_MAP) {
    if (pattern.test(taskText)) return label;
  }
  // Fallback: lowercase first word
  return taskText.trim().split(/\s+/)[0].toLowerCase();
}

function extractPlant(taskText) {
  const lower = taskText.toLowerCase();
  for (const plant of PLANTS) {
    // Word-boundary aware match
    const re = new RegExp('\\b' + plant.replace(/\s+/g, '\\s+') + 's?\\b', 'i');
    if (re.test(lower)) return plant;
  }
  return null;
}

// ─── Search query builder ─────────────────────────────────────────────────────
/**
 * Build a short, YouTube-friendly search query from a task string.
 * e.g. "Prune hydrangeas back to first pair of fat buds..."
 *   → "how to prune hydrangea UK"
 */
export function buildSearchQuery(taskText, region = 'uk') {
  const action = extractAction(taskText);
  const plant  = extractPlant(taskText);
  const regionSuffix = REGION_TERM[region] || '';

  const parts = ['how to', action, plant, regionSuffix].filter(Boolean);
  return parts.join(' ');
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
