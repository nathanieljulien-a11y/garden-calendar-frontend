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
  const month = new Date().getMonth() + 1; // 1–12

  const baseParams = {
    lat:      lat.toFixed(4),
    lng:      lng.toFixed(4),
    radius:   30,
    month:    month,
    per_page: 100,
    order:    'desc',
    order_by: 'observed_on',
  };

  // Fetch 1: captive plants (specifically in gardens/parks)
  const captivePlantParams = new URLSearchParams({
    ...baseParams,
    iconic_taxa: 'Plantae',
    captive:     'true',
  });

  // Fetch 2: wild plants (fallback if captive returns too few)
  const wildPlantParams = new URLSearchParams({
    ...baseParams,
    iconic_taxa: 'Plantae',
    captive:     'false',
  });

  // Fetch 3: garden wildlife — birds and insects, research grade
  const wildlifeParams = new URLSearchParams({
    ...baseParams,
    iconic_taxa:   'Aves,Insecta,Arachnida',
    quality_grade: 'research',
    captive:       'false',
  });

  const [captiveRes, wildPlantRes, wildlifeRes] = await Promise.allSettled([
    fetch(`${INAT_BASE}/observations?${captivePlantParams}`, { signal, headers: { 'Accept': 'application/json' } }),
    fetch(`${INAT_BASE}/observations?${wildPlantParams}`,   { signal, headers: { 'Accept': 'application/json' } }),
    fetch(`${INAT_BASE}/observations?${wildlifeParams}`,    { signal, headers: { 'Accept': 'application/json' } }),
  ]);

  const captiveData  = captiveRes.status  === 'fulfilled' && captiveRes.value.ok  ? await captiveRes.value.json()  : { results: [] };
  const wildPlantData= wildPlantRes.status=== 'fulfilled' && wildPlantRes.value.ok? await wildPlantRes.value.json(): { results: [] };
  const wildlifeData = wildlifeRes.status === 'fulfilled' && wildlifeRes.value.ok ? await wildlifeRes.value.json() : { results: [] };

  // Normalise captive plants first — mark them as captive for scoring
  const captiveNorm = normaliseInatObservations(
    { results: captiveData.results || [] }, inventoryPlants, true, lat, lng
  );

  const MIN_PLANTS = 3;
  let plantObs = captiveNorm.observations;
  if (plantObs.length < MIN_PLANTS) {
    const captiveTaxonIds = new Set(plantObs.map(o => o.taxonId));
    const wildNorm = normaliseInatObservations(
      { results: wildPlantData.results || [] }, inventoryPlants, false, lat, lng
    );
    const wildExtras = wildNorm.observations.filter(o => !captiveTaxonIds.has(o.taxonId));
    plantObs = [...plantObs, ...wildExtras];
  }

  const wildlifeNorm = normaliseInatObservations(
    { results: wildlifeData.results || [] }, inventoryPlants, false, lat, lng
  );

  // Merge: re-sort combined list by score, cap at 6, strip internal fields
  const combined = [...plantObs, ...wildlifeNorm.observations]
    .sort((a, b) => b._rawScore - a._rawScore)
    .slice(0, 6)
    .map(o => {
      const out = Object.assign({}, o);
      delete out._rawScore;
      delete out.taxonId;
      return out;
    });

  return {
    fetchedAt:    Date.now(),
    observations: combined,
    totalCount:   (captiveData.results?.length || 0) + (wildlifeData.results?.length || 0),
  };
}

// Only show birds from garden-relevant orders
// Passeriformes = perching birds, Apodiformes = swifts,
// Columbiformes = pigeons/doves, Piciformes = woodpeckers, Psittaciformes = parrots
const GARDEN_BIRD_ORDERS = new Set([
  'passeriformes', 'apodiformes', 'columbiformes', 'piciformes', 'psittaciformes',
]);

export function normaliseInatObservations(raw, inventoryPlants = [], isCaptive = false, searchLat = 0, searchLng = 0) {
  const results = raw?.results || [];
  const inventoryLower = inventoryPlants.map(p => p.toLowerCase());

  const byTaxon = {};
  for (const obs of results) {
    const taxon = obs.taxon;
    if (!taxon) continue;

    const commonName = (taxon.preferred_common_name || taxon.name || '').toLowerCase();
    const sciName    = taxon.name || '';
    const group      = taxon.iconic_taxon_name || '';

    if (inventoryLower.some(p => commonName.includes(p) || p.includes(commonName))) continue;
    if (!taxon.rank || ['order','class','phylum','kingdom'].includes(taxon.rank)) continue;
    if (group === 'Aves') {
      const order = (taxon.order_name || '').toLowerCase();
      if (!GARDEN_BIRD_ORDERS.has(order)) continue;
    }

    const id = taxon.id;
    if (!byTaxon[id]) {
      byTaxon[id] = {
        taxonId:        id,
        commonName:     taxon.preferred_common_name || taxon.name || '',
        scientificName: sciName,
        taxonGroup:     group,
        emoji:          TAXON_EMOJI[group] || '🌿',
        count:          0,
        mostRecentDate: null,
        photoUrl:       null,
        isCaptive,
        _isPlant:       group === 'Plantae',
        _obsLat:        null,
        _obsLng:        null,
        _d1:            null,
      };
    }

    byTaxon[id].count++;

    // Capture location from first observation for the local search link
    if (!byTaxon[id]._obsLat && obs.location) {
      const [olat, olng] = obs.location.split(',');
      byTaxon[id]._obsLat = parseFloat(olat);
      byTaxon[id]._obsLng = parseFloat(olng);
    }
    if (!byTaxon[id]._d1 && obs.observed_on) {
      const d = new Date(obs.observed_on + 'T12:00:00');
      d.setDate(d.getDate() - 14);
      byTaxon[id]._d1 = d.toISOString().slice(0, 10);
    }

    if (obs.observed_on && (!byTaxon[id].mostRecentDate || obs.observed_on > byTaxon[id].mostRecentDate)) {
      byTaxon[id].mostRecentDate = obs.observed_on;
    }

    if (!byTaxon[id].photoUrl && obs.photos?.[0]?.url) {
      byTaxon[id].photoUrl = obs.photos[0].url.replace('square', 'small');
    }
  }

  // Link to observations page filtered by taxon + garden location using the same
  // lat/lng/radius the API search used — consistent and always relevant.
  const observations = Object.values(byTaxon).map(o => {
    const month = new Date().getMonth() + 1; // 1–12
    const captiveParam = o.isCaptive ? '&captive=true' : 'captive=false';
    const inatUrl = `https://www.inaturalist.org/observations?taxon_id=${o.taxonId}&lat=${searchLat.toFixed(4)}&lng=${searchLng.toFixed(4)}&month=${month}&radius=30&subview=map&verifiable=any${o.isCaptive ? '&captive=true' : ''}`;
    const _rawScore = o.count * (o.isCaptive ? 1.8 : o._isPlant ? 1.4 : 1.0);

    return {
      taxonId:        o.taxonId,
      commonName:     o.commonName,
      scientificName: o.scientificName,
      taxonGroup:     o.taxonGroup,
      emoji:          o.emoji,
      count:          o.count,
      mostRecentDate: o.mostRecentDate,
      photoUrl:       o.photoUrl,
      isCaptive:      o.isCaptive,
      inatUrl,
      _rawScore,
    };
  });

  return { fetchedAt: Date.now(), observations, totalCount: results.length };
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
