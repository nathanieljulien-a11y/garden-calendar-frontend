/**
 * gardenStorage.js — Sprint 1
 * Named garden save/load for The Garden Calendar.
 *
 * Storage keys (gc_ prefix, per PRD §A.5):
 *   gc_gardens   — Array of named garden objects (new format)
 *   gc_favs      — Legacy favourites (URL-hash based) — migrated on first load
 *
 * Garden object schema:
 *   {
 *     id:          string,   // short UUID, stable across renames
 *     name:        string,   // user-editable, defaults to city
 *     city:        string,
 *     orientation: string,
 *     features:    string[],
 *     plants:      { trees, shrubs, flowers, vegetables, fruit, herbs },
 *     lat:         number|null,
 *     lng:         number|null,
 *     climateData: object|null,  // serialised _cd + _derived for prompt reuse
 *     encoded:     string|null,  // legacy URL hash, preserved for back-compat
 *     createdAt:   number,  // ms timestamp
 *     lastAccessed:number,  // ms timestamp — used for multi-garden picker sort
 *   }
 *
 * All functions are pure (no side-effects beyond localStorage reads/writes)
 * so they can be tested in isolation.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export const GARDENS_KEY  = 'gc_gardens';
export const LEGACY_KEY   = 'gc_favs';
export const MAX_GARDENS  = 3; // PRD §4.2

// ─── UUID helpers ─────────────────────────────────────────────────────────────
/** Short timestamp-based ID — unique enough for 3-garden local storage use */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Low-level storage ────────────────────────────────────────────────────────
/** Read gardens array from localStorage. Returns [] on any error. */
export function readGardens() {
  try {
    const raw = localStorage.getItem(GARDENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Write gardens array to localStorage. Silently swallows storage errors. */
export function writeGardens(gardens) {
  try {
    localStorage.setItem(GARDENS_KEY, JSON.stringify(gardens));
    return true;
  } catch {
    return false;
  }
}

// ─── Migration: gc_favs → gc_gardens ─────────────────────────────────────────
/**
 * Decode the legacy base64 URL-hash garden state.
 * Copied from GardenCalendar.jsx — kept here so migration is self-contained.
 */
function decodeLegacyState(hash) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(hash))));
  } catch {
    return null;
  }
}

/**
 * Migrate legacy gc_favs entries into gc_gardens format.
 * - Only runs if gc_gardens does not yet exist.
 * - Preserves the original encoded field for back-compat.
 * - Silently skips any corrupt entries.
 * - Returns the migrated gardens array (may be empty).
 */
export function migrateLegacyFavourites() {
  // Only migrate if new store doesn't exist yet
  if (localStorage.getItem(GARDENS_KEY) !== null) {
    return readGardens();
  }

  let legacyFavs = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) legacyFavs = JSON.parse(raw);
    if (!Array.isArray(legacyFavs)) legacyFavs = [];
  } catch {
    legacyFavs = [];
  }

  const migrated = legacyFavs
    .map(fav => {
      const state = decodeLegacyState(fav.encoded);
      if (!state) return null;
      return createGardenObject({
        city:        state.city        || fav.city || 'My garden',
        orientation: state.orientation || '',
        features:    state.features    || [],
        plants:      state.plants      || {},
        encoded:     fav.encoded,
        createdAt:   fav.savedAt       || Date.now(),
        lastAccessed:fav.savedAt       || Date.now(),
      });
    })
    .filter(Boolean)
    .slice(0, MAX_GARDENS);

  writeGardens(migrated);
  return migrated;
}

// ─── Garden object factory ────────────────────────────────────────────────────
/**
 * Create a well-formed garden object with sensible defaults.
 * Accepts partial overrides — useful for both new gardens and migration.
 */
export function createGardenObject(overrides = {}) {
  const now = Date.now();
  const city = overrides.city || '';
  return {
    id:           overrides.id           || generateId(),
    name:         overrides.name         || city,          // defaults to city per PRD
    city,
    orientation:  overrides.orientation  || '',
    features:     overrides.features     || [],
    plants:       overrides.plants       || {
      trees: [], shrubs: [], flowers: [],
      vegetables: [], fruit: [], herbs: [],
    },
    lat:          overrides.lat          ?? null,
    lng:          overrides.lng          ?? null,
    climateData:  overrides.climateData  ?? null,
    encoded:      overrides.encoded      ?? null,          // legacy hash preserved
    createdAt:    overrides.createdAt    || now,
    lastAccessed: overrides.lastAccessed || now,
  };
}

// ─── CRUD operations ──────────────────────────────────────────────────────────

/**
 * Save a garden (create or update).
 * - If a garden with the same id exists, it is updated in-place.
 * - If id is new, it is prepended (most-recent-first).
 * - Trims to MAX_GARDENS, keeping the most recently accessed.
 * - Returns the updated gardens array.
 */
export function saveGarden(garden) {
  const gardens = readGardens();
  const idx = gardens.findIndex(g => g.id === garden.id);
  const updated = { ...garden, lastAccessed: Date.now() };

  if (idx >= 0) {
    gardens[idx] = updated;
  } else {
    gardens.unshift(updated);
  }

  // Sort by lastAccessed descending, then trim
  const trimmed = gardens
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, MAX_GARDENS);

  writeGardens(trimmed);
  return trimmed;
}

/**
 * Touch a garden's lastAccessed timestamp without changing other fields.
 * Call this when the user opens a saved garden.
 * Returns the updated gardens array.
 */
export function touchGarden(id) {
  const gardens = readGardens();
  const idx = gardens.findIndex(g => g.id === id);
  if (idx < 0) return gardens;
  gardens[idx] = { ...gardens[idx], lastAccessed: Date.now() };
  writeGardens(gardens);
  return gardens;
}

/**
 * Rename a garden. Returns the updated gardens array, or null if not found.
 */
export function renameGarden(id, newName) {
  const name = (newName || '').trim();
  if (!name) return null;
  const gardens = readGardens();
  const idx = gardens.findIndex(g => g.id === id);
  if (idx < 0) return null;
  gardens[idx] = { ...gardens[idx], name };
  writeGardens(gardens);
  return gardens;
}

/**
 * Delete a garden by id.
 * Returns the updated gardens array.
 */
export function deleteGarden(id) {
  const gardens = readGardens().filter(g => g.id !== id);
  writeGardens(gardens);
  return gardens;
}

/**
 * Get the most recently accessed garden (for multi-garden picker default).
 * Returns null if no gardens saved.
 */
export function getMostRecentGarden() {
  const gardens = readGardens();
  if (!gardens.length) return null;
  return gardens.reduce((a, b) => a.lastAccessed > b.lastAccessed ? a : b);
}

/**
 * Returns true if the user has at least one saved garden.
 * Used to decide whether to show the home screen or go straight to the form.
 */
export function hasSavedGardens() {
  return readGardens().length > 0;
}
