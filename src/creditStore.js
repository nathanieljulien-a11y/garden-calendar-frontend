// creditStore.js
// Sprint B3 — frontend credit management.
//
// Establishes the current user's tier (free | print | subscriber) and
// remaining credit counts. For token holders (print / subscriber), credits
// are tracked server-side via the /api/credits endpoints. For free users,
// credits are tracked in localStorage only.
//
// Usage:
//   import { loadCredits, useCredit, getTier } from './creditStore.js';
//
//   const credits = await loadCredits(PROXY_BASE);
//   // { tier, plan, remaining: { gen, week }, inspoTrialAvailable, expiresAt }
//
//   const result = await useCredit('gen', PROXY_BASE);
//   // { ok, remaining } or { ok: false, reason }

// ── localStorage keys ─────────────────────────────────────────────────────────
const KEYS = {
  printToken:  'gc_print_token',
  subToken:    'gc_sub_token',
  freeCredits: 'gc_credits_free',
  cache:       'gc_credits_cache',  // sessionStorage — avoids repeat API calls
};

// ── Free tier allowances ──────────────────────────────────────────────────────
const FREE_LIMITS = { gen: 2, week: 10 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getToken() {
  try {
    return localStorage.getItem(KEYS.subToken)
      || localStorage.getItem(KEYS.printToken)
      || null;
  } catch { return null; }
}

function _getRef() {
  try { return sessionStorage.getItem('gc_ref') || 'direct'; } catch { return 'direct'; }
}

function _readFreeCredits() {
  try {
    const raw = localStorage.getItem(KEYS.freeCredits);
    if (!raw) return { genUsed: 0, weekUsed: 0 };
    return JSON.parse(raw);
  } catch { return { genUsed: 0, weekUsed: 0 }; }
}

function _writeFreeCredits(data) {
  try { localStorage.setItem(KEYS.freeCredits, JSON.stringify(data)); } catch {}
}

function _readCache() {
  try {
    const raw = sessionStorage.getItem(KEYS.cache);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _writeCache(data) {
  try { sessionStorage.setItem(KEYS.cache, JSON.stringify(data)); } catch {}
}

function _clearCache() {
  try { sessionStorage.removeItem(KEYS.cache); } catch {}
}

// ── loadCredits ───────────────────────────────────────────────────────────────
// Call once on app mount. Returns a credits object describing the current tier.
//
// Returns:
// {
//   tier:               'free' | 'print' | 'subscriber',
//   plan:               string,
//   remaining:          { gen: number, week: number },
//   inspoTrialAvailable: boolean,
//   inspoTrialUsed:     boolean,
//   expiresAt:          string | null,
//   token:              string | null,
//   error:              string | null,   // set if API call failed — falls back gracefully
// }
export async function loadCredits(proxyBase) {
  // Return cached result if available (avoids API call on every re-render)
  const cached = _readCache();
  if (cached) return cached;

  const token = _getToken();

  // ── Token holder (print or subscriber) ───────────────────────────────────
  if (token && proxyBase) {
    try {
      const res  = await fetch(`${proxyBase}/api/credits/${token}`);
      const data = await res.json();

      if (data.ok) {
        const tier = data.plan === 'subscriber_6mo' ? 'subscriber' : 'print';
        const result = {
          tier,
          plan:                data.plan,
          remaining:           data.remaining,
          inspoTrialAvailable: data.inspoTrialAvailable,
          inspoTrialUsed:      data.inspoTrialUsed,
          expiresAt:           data.expiresAt,
          token,
          error: null,
        };
        _writeCache(result);
        return result;
      }

      // Token expired or not found — fall through to free tier
      if (data.reason === 'token_expired') {
        const result = {
          tier: 'free', plan: 'free',
          remaining: { gen: 0, week: 0 },
          inspoTrialAvailable: false, inspoTrialUsed: false,
          expiresAt: null, token: null,
          error: 'token_expired',
        };
        _writeCache(result);
        return result;
      }

    } catch (e) {
      // Network error — return a degraded result so the app still works
      console.warn('[creditStore] API error, falling back to token-present state:', e.message);
      const result = {
        tier: 'print', plan: 'print',
        remaining: { gen: 5, week: 25 }, // assume full allowance on network failure
        inspoTrialAvailable: false, inspoTrialUsed: false,
        expiresAt: null, token,
        error: 'network_error',
      };
      _writeCache(result);
      return result;
    }
  }

  // ── Free tier (localStorage) ──────────────────────────────────────────────
  const free = _readFreeCredits();
  const result = {
    tier:  'free',
    plan:  'free',
    remaining: {
      gen:  Math.max(0, FREE_LIMITS.gen  - (free.genUsed  || 0)),
      week: Math.max(0, FREE_LIMITS.week - (free.weekUsed || 0)),
    },
    inspoTrialAvailable: false,
    inspoTrialUsed:      false,
    expiresAt:           null,
    token:               null,
    error:               null,
  };
  _writeCache(result);
  return result;
}

// ── saveToken ─────────────────────────────────────────────────────────────────
// Called when a user enters a subscription code or arrives via QR URL with a token.
// Stores the token in localStorage and clears the session cache so loadCredits
// re-fetches from the API on next call.
export function saveToken(token, type = 'print') {
  try {
    const key = type === 'subscriber' ? KEYS.subToken : KEYS.printToken;
    localStorage.setItem(key, token);
    _clearCache();
  } catch {}
}

// ── useCredit ─────────────────────────────────────────────────────────────────
// Call before any credit-consuming action. Decrements server-side for token
// holders; decrements localStorage for free users.
//
// action: 'gen' | 'week' | 'inspo_trial'
//
// Returns:
//   { ok: true,  remaining: { gen, week } }
//   { ok: false, reason: string }
export async function useCredit(action, proxyBase) {
  const token = _getToken();

  // ── Token holder ──────────────────────────────────────────────────────────
  if (token && proxyBase) {
    try {
      const res  = await fetch(`${proxyBase}/api/credits/use`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, action }),
      });
      const data = await res.json();
      _clearCache(); // force re-fetch on next loadCredits
      return data;   // { ok, remaining } or { ok: false, reason }
    } catch (e) {
      console.warn('[creditStore] useCredit API error:', e.message);
      // On network error, allow the action — don't block the user
      _clearCache();
      return { ok: true, remaining: null, error: 'network_error' };
    }
  }

  // ── Free tier ─────────────────────────────────────────────────────────────
  const free = _readFreeCredits();
  if (action === 'gen') {
    if ((free.genUsed || 0) >= FREE_LIMITS.gen) {
      return { ok: false, reason: 'credit_exhausted' };
    }
    free.genUsed = (free.genUsed || 0) + 1;
  } else if (action === 'week') {
    if ((free.weekUsed || 0) >= FREE_LIMITS.week) {
      return { ok: false, reason: 'credit_exhausted' };
    }
    free.weekUsed = (free.weekUsed || 0) + 1;
  }
  _writeFreeCredits(free);
  _clearCache();

  return {
    ok: true,
    remaining: {
      gen:  Math.max(0, FREE_LIMITS.gen  - free.genUsed),
      week: Math.max(0, FREE_LIMITS.week - free.weekUsed),
    },
  };
}

// ── checkCredit ───────────────────────────────────────────────────────────────
// Non-destructive check — does not decrement. Uses cached state.
// Returns true if the action is available, false if exhausted.
export function checkCredit(action, credits) {
  if (!credits) return false;
  if (action === 'gen')  return (credits.remaining?.gen  || 0) > 0;
  if (action === 'week') return (credits.remaining?.week || 0) > 0;
  if (action === 'inspo_trial') return credits.inspoTrialAvailable === true;
  return false;
}

// ── getTier ───────────────────────────────────────────────────────────────────
// Returns current tier string from sessionStorage cache, or 'free' if unknown.
export function getTier() {
  const cached = _readCache();
  return cached?.tier || 'free';
}

// ── initFromUrl ───────────────────────────────────────────────────────────────
// Call on mount after A3 ref detection.
// If URL contains ?token=xxx, save it to localStorage as a print token
// and clear cache so the next loadCredits picks it up from the API.
export function initFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const ref    = params.get('ref');
    if (token && ref === 'print') {
      saveToken(token, 'print');
    } else if (token && ref === 'subscriber') {
      saveToken(token, 'subscriber');
    }
  } catch {}
}
