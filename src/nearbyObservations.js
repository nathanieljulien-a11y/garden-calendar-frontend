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

  // Build query — research grade only, last 14 days, 30km radius
  const params = new URLSearchParams({
    lat:           lat.toFixed(4),
    lng:           lng.toFixed(4),
    radius:        30,
    quality_grade: 'research',
    d1:            d1str,
    iconic_taxa:   GARDEN_TAXA,
    per_page:      50,
    order:         'desc',
    order_by:      'observed_on',
  });

  const url = `${INAT_BASE}/observations?${params}`;
  const res = await fetch(url, {
    signal,
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`iNaturalist returned ${res.status}`);
  const data = await res.json();

  return normaliseInatObservations(data, inventoryPlants);
}

/**
 * Normalise raw iNaturalist response.
 * Groups by taxon, counts sightings, returns top 5 most-observed.
 * Exported for testing with fixture data.
 */
export function normaliseInatObservations(raw, inventoryPlants = []) {
  const results = raw?.results || [];
  const inventoryLower = inventoryPlants.map(p => p.toLowerCase());

  // Group by taxon ID
  const byTaxon = {};
  for (const obs of results) {
    const taxon = obs.taxon;
    if (!taxon) continue;

    const commonName = taxon.preferred_common_name || taxon.name || '';
    const sciName    = taxon.name || '';

    // Skip if it's already in the user's inventory (not interesting to surface)
    if (inventoryLower.some(p =>
      commonName.toLowerCase().includes(p) || p.includes(commonName.toLowerCase())
    )) continue;

    // Skip very generic taxa (order/class level — not useful)
    if (!taxon.rank || ['order','class','phylum','kingdom'].includes(taxon.rank)) continue;

    const id = taxon.id;
    if (!byTaxon[id]) {
      byTaxon[id] = {
        commonName,
        scientificName: sciName,
        taxonGroup:     taxon.iconic_taxon_name || 'Plantae',
        emoji:          TAXON_EMOJI[taxon.iconic_taxon_name] || '🌿',
        count:          0,
        mostRecentDate: null,
        photoUrl:       null,
        inatUrl:        `https://www.inaturalist.org/taxa/${id}`,
      };
    }

    byTaxon[id].count++;

    // Track most recent observation date
    if (obs.observed_on && (!byTaxon[id].mostRecentDate || obs.observed_on > byTaxon[id].mostRecentDate)) {
      byTaxon[id].mostRecentDate = obs.observed_on;
    }

    // Use first available photo
    if (!byTaxon[id].photoUrl && obs.photos?.[0]?.url) {
      // iNat photo URLs come in 'square' size (75px) — replace with 'small' (240px)
      byTaxon[id].photoUrl = obs.photos[0].url.replace('square', 'small');
    }
  }

  // Sort by count descending, take top 5
  const observations = Object.values(byTaxon)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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
