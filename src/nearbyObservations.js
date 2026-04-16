/**
 * nearbyObservations.js — Sprint 3 extension
 *
 * Fetches recent iNaturalist observations near the garden location.
 * Shows what's actually being spotted in the area this week — plants,
 * birds, and insects — as real-time seasonal context for the Today view.
 *
 * API: iNaturalist v1 — free, no key, open CORS, called directly from browser.
 * Source attribution: iNaturalist · inaturalist.org · CC BY (observation data)
 *
 * Cache: gc_inat_{gardenId}_{date} — refreshes daily.
 *
 * Design decisions:
 * - Fetches research-grade observations only (verified by community)
 * - Last 14 days, within 30km radius
 * - Filters to Plantae + Aves + Insecta — the taxa most relevant to gardeners
 * - Groups by taxon, counts sightings, returns top results
 * - Excludes taxa already in the user's plant inventory (too obvious)
 * - Framed as "spotted nearby" not "in gardens" — honest about data source
 */

export const INAT_CACHE_PREFIX = 'gc_inat_';
export const INAT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — slower-changing than weather

const INAT_BASE = 'https://api.inaturalist.org/v1';

// Iconic taxa we care about for gardeners
const GARDEN_TAXA = 'Plantae,Aves,Insecta,Arachnida';

// Emoji by iconic taxon name
const TAXON_EMOJI = {
  Plantae:   '🌿',
  Aves:      '🐦',
  Insecta:   '🦋',
  Arachnida: '🕷',
  Mammalia:  '🐾',
  Fungi:     '🍄',
};

// ─── Cache ────────────────────────────────────────────────────────────────────
export function inatCacheKey(gardenId) {
  return `${INAT_CACHE_PREFIX}${gardenId}_${new Date().toISOString().slice(0, 10)}`;
}

export function readInatCache(gardenId) {
  try {
    const raw = localStorage.getItem(inatCacheKey(gardenId));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.observations) return null;
    if (Date.now() - cached.fetchedAt > INAT_CACHE_TTL_MS) return null;
    return cached;
  } catch { return null; }
}

export function writeInatCache(gardenId, data) {
  try {
    localStorage.setItem(inatCacheKey(gardenId), JSON.stringify(data));
  } catch {}
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
/**
 * Fetch recent observations near a location from iNaturalist.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string[]} inventoryPlants — plant names to exclude (too obvious)
 * @param {AbortSignal} signal
 * @returns {Promise<ObservationResult>}
 *
 * ObservationResult shape:
 * {
 *   fetchedAt: number,
 *   observations: [{
 *     commonName: string,
 *     scientificName: string,
 *     taxonGroup: string,   // 'Plantae' | 'Aves' | 'Insecta' etc
 *     emoji: string,
 *     count: number,        // sightings in last 14 days within radius
 *     mostRecentDate: string, // YYYY-MM-DD
 *     photoUrl: string | null,
 *     inatUrl: string,
 *   }],
 *   radius: number,         // km actually used
 *   totalCount: number,     // raw total observations fetched
 * }
 */
export async function fetchNearbyObservations(lat, lng, inventoryPlants = [], signal) {
  const d1 = new Date();
  d1.setDate(d1.getDate() - 14);
  const d1str = d1.toISOString().slice(0, 10);

  // Two parallel fetches:
  // 1. Plants — include captive=true to get cultivated garden plants (tulips, magnolia etc)
  // 2. Wildlife — birds and insects, wild only, research grade
  const baseParams = {
    lat:      lat.toFixed(4),
    lng:      lng.toFixed(4),
    radius:   30,
    d1:       d1str,
    per_page: 100,
    order:    'desc',
    order_by: 'observed_on',
  };

  const plantParams = new URLSearchParams({
    ...baseParams,
    iconic_taxa: 'Plantae',
    // No quality_grade filter — include casual + needs_id + research
    // captive not filtered — includes cultivated garden plants
  });

  const wildlifeParams = new URLSearchParams({
    ...baseParams,
    iconic_taxa:   'Aves,Insecta,Arachnida',
    quality_grade: 'research', // wildlife benefits from stricter filtering
    captive:       'false',
  });

  const [plantRes, wildlifeRes] = await Promise.allSettled([
    fetch(`${INAT_BASE}/observations?${plantParams}`, { signal, headers: { 'Accept': 'application/json' } }),
    fetch(`${INAT_BASE}/observations?${wildlifeParams}`, { signal, headers: { 'Accept': 'application/json' } }),
  ]);

  const plantData    = plantRes.status    === 'fulfilled' && plantRes.value.ok    ? await plantRes.value.json()    : { results: [] };
  const wildlifeData = wildlifeRes.status === 'fulfilled' && wildlifeRes.value.ok ? await wildlifeRes.value.json() : { results: [] };

  // Merge results — plants first so they rank higher when counts are equal
  const merged = {
    results: [...(plantData.results || []), ...(wildlifeData.results || [])],
  };

  return normaliseInatObservations(merged, inventoryPlants);
}

/**
 * Normalise raw iNaturalist response.
 * Groups by taxon, counts sightings, returns top 5 most-observed.
 * Exported for testing with fixture data.
 */
// Birds unlikely to appear in a domestic garden — filter these out
const NON_GARDEN_BIRDS = new Set([
  'coot', 'moorhen', 'mallard', 'tufted duck', 'great crested grebe',
  'cormorant', 'grey heron', 'mute swan', 'canada goose', 'barnacle goose',
  'herring gull', 'lesser black-backed gull', 'common gull', 'black-headed gull',
  'kingfisher', 'grey wagtail', 'sand martin', 'house martin',
]);

export function normaliseInatObservations(raw, inventoryPlants = []) {
  const results = raw?.results || [];
  const inventoryLower = inventoryPlants.map(p => p.toLowerCase());

  const byTaxon = {};
  for (const obs of results) {
    const taxon = obs.taxon;
    if (!taxon) continue;

    const commonName = (taxon.preferred_common_name || taxon.name || '').toLowerCase();
    const sciName    = taxon.name || '';
    const group      = taxon.iconic_taxon_name || '';

    // Skip if in user's inventory
    if (inventoryLower.some(p =>
      commonName.includes(p) || p.includes(commonName)
    )) continue;

    // Skip very generic ranks
    if (!taxon.rank || ['order','class','phylum','kingdom'].includes(taxon.rank)) continue;

    // Skip non-garden waterbirds
    if (group === 'Aves' && NON_GARDEN_BIRDS.has(commonName)) continue;

    const id = taxon.id;
    if (!byTaxon[id]) {
      byTaxon[id] = {
        commonName:     taxon.preferred_common_name || taxon.name || '',
        scientificName: sciName,
        taxonGroup:     group,
        emoji:          TAXON_EMOJI[group] || '🌿',
        count:          0,
        mostRecentDate: null,
        photoUrl:       null,
        inatUrl:        `https://www.inaturalist.org/taxa/${id}`,
        _isPlant:       group === 'Plantae',
      };
    }

    byTaxon[id].count++;

    if (obs.observed_on && (!byTaxon[id].mostRecentDate || obs.observed_on > byTaxon[id].mostRecentDate)) {
      byTaxon[id].mostRecentDate = obs.observed_on;
    }

    if (!byTaxon[id].photoUrl && obs.photos?.[0]?.url) {
      byTaxon[id].photoUrl = obs.photos[0].url.replace('square', 'small');
    }
  }

  // Score: plants get a bonus to surface garden-relevant flora over common birds
  // Score = count * multiplier (1.4 for plants, 1.0 for wildlife)
  const observations = Object.values(byTaxon)
    .map(o => ({ ...o, _score: o.count * (o._isPlant ? 1.4 : 1.0) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 6)
    .map(({ _isPlant, _score, ...o }) => o); // strip internal fields

  return {
    fetchedAt:    Date.now(),
    observations,
    totalCount:   results.length,
  };
}

// ─── Relative date helper ─────────────────────────────────────────────────────
export function relativeDate(dateStr) {
  if (!dateStr) return '';
  const days = Math.round((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 6)  return `${days} days ago`;
  if (days <= 13) return 'last week';
  return '2 weeks ago';
}
