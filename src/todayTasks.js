/**
 * todayTasks.js — Sprint 3
 *
 * Pure functions for the Today view task layer:
 *   - Cache read/write (gc_today_{gardenId}_{date})
 *   - Prompt builder (garden state + weather context → Claude prompt)
 *   - Response parser/validator
 *
 * Task object schema:
 * {
 *   question:  string,   // friendly question e.g. "Have you staked your dahlias?"
 *   context:   string,   // one sentence of context
 *   urgency:   'high' | 'medium' | 'low',
 *   plantName: string,   // plant this task relates to, or 'general'
 *   category:  string,   // task category key matching videoLibrary.json (Sprint 8)
 * }
 */

export const TODAY_CACHE_PREFIX = 'gc_today_';

// ─── Cache ────────────────────────────────────────────────────────────────────
export function todayCacheKey(gardenId) {
  return `${TODAY_CACHE_PREFIX}${gardenId}_${new Date().toISOString().slice(0, 10)}`;
}

export function readTodayCache(gardenId) {
  try {
    const raw = localStorage.getItem(todayCacheKey(gardenId));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    // Validate shape
    if (!cached?.tasks || !Array.isArray(cached.tasks)) return null;
    return cached;
  } catch {
    return null;
  }
}

export function writeTodayCache(gardenId, payload) {
  try {
    localStorage.setItem(todayCacheKey(gardenId), JSON.stringify(payload));
  } catch {}
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
/**
 * Build the prompt for Today task generation.
 *
 * @param {object} garden      — saved garden object (city, orientation, plants, climateData)
 * @param {object} weatherData — from weatherService.js normaliseWeatherData()
 * @param {object[]} signals   — urgency signals from computeUrgencySignals()
 * @param {string} monthName   — current month name e.g. "April"
 * @returns {string}           — prompt string for callAI
 */
export function buildTodayPrompt(garden, weatherData, signals, monthName) {
  const { city, orientation, plants, climateData } = garden;
  const cd  = climateData?._cd;
  const der = climateData?._derived;

  // Plant inventory
  const allPlants = Object.entries(plants || {})
    .map(([cat, list]) => list.length ? `${cat}: ${list.join(', ')}` : null)
    .filter(Boolean)
    .join(' | ') || 'general/unspecified';

  // Climate context — from stored climateData
  const climateCtx = der ? [
    `Climate: ${der.climateType}`,
    `Hardiness zone: ${der.zone}`,
    `Last spring frost: ${der.lastFrost || 'none'}`,
    `First autumn frost: ${der.firstFrost || 'none'}`,
    der.seasonNote ? `IMPORTANT: ${der.seasonNote}` : '',
  ].filter(Boolean).join('. ') : '';

  // Monthly climate normals for current month (gives seasonal context)
  const monthIdx = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December']
                    .indexOf(monthName);
  const monthClimate = cd && monthIdx >= 0 ? [
    cd.tMean?.[monthIdx]  != null ? `Mean temp: ${cd.tMean[monthIdx].toFixed(1)}°C` : '',
    cd.tMin?.[monthIdx]   != null ? `Min temp: ${cd.tMin[monthIdx].toFixed(1)}°C` : '',
    cd.precip?.[monthIdx] != null ? `Avg rainfall: ${cd.precip[monthIdx].toFixed(0)}mm` : '',
    cd.sunHrs?.[monthIdx] != null ? `Sunshine: ${cd.sunHrs[monthIdx].toFixed(1)}h/day` : '',
  ].filter(Boolean).join(', ') : '';

  // Today's weather
  const todayWeather = weatherData?.today ? [
    `Today: ${weatherData.today.label}`,
    weatherData.today.tempMax != null ? `High ${weatherData.today.tempMax.toFixed(0)}°C` : '',
    weatherData.today.tempMin != null ? `Low ${weatherData.today.tempMin.toFixed(0)}°C` : '',
    weatherData.today.precipitation > 0 ? `${weatherData.today.precipitation.toFixed(0)}mm rain` : '',
    weatherData.today.windspeedMax > 20 ? `Wind ${weatherData.today.windspeedMax.toFixed(0)}km/h` : '',
  ].filter(Boolean).join(', ') : '';

  // Last 14 days + next 14 days summary
  const past14Precip = weatherData?.past
    ? weatherData.past.reduce((s, d) => s + (d.precipitation || 0), 0).toFixed(0)
    : null;
  const next14Precip = weatherData?.forecast
    ? weatherData.forecast.reduce((s, d) => s + (d.precipitation || 0), 0).toFixed(0)
    : null;

  // Active urgency signals as plain text
  const signalLines = signals.length > 0
    ? signals.map(s => `• ${s.label}: ${s.message}`).join('\n')
    : 'No urgent weather signals today.';

  // Valid task category keys — must match videoLibrary.json (Sprint 8)
  // Using a representative set for now; editorial will align with video library
  const CATEGORY_KEYS = [
    'watering', 'feeding', 'pruning', 'deadheading', 'harvesting',
    'planting', 'sowing', 'mulching', 'staking', 'pest_control',
    'disease_control', 'frost_protection', 'dividing', 'training',
    'lawn_care', 'general_maintenance',
  ];

  return `You are an expert horticulturist giving a gardener their personalised daily briefing.

GARDEN
Location: ${city}
Orientation: ${orientation || 'unspecified'}
Plants: ${allPlants}
Month: ${monthName}
${climateCtx ? `\nCLIMATE\n${climateCtx}` : ''}
${monthClimate ? `${monthName} normals: ${monthClimate}` : ''}

WEATHER TODAY
${todayWeather || 'No weather data available.'}
${past14Precip != null ? `Past 14 days rainfall: ${past14Precip}mm` : ''}
${next14Precip != null ? `Next 14 days forecast rainfall: ${next14Precip}mm` : ''}

ACTIVE URGENCY SIGNALS
${signalLines}

TASK
Generate 3–5 prioritised garden tasks for today. Rules:
- Frame each task as a friendly question: "Have you…?", "Did you…?", "Is it time to…?"
- Reference the weather or urgency signals where directly relevant
- Only include tasks for plants explicitly listed in the inventory above
- If urgency signals are active, at least one task must address them
- If nothing is urgent, give 3 light maintenance tasks with low urgency
- No enjoy lines — tasks only
- category must be one of: ${CATEGORY_KEYS.join(', ')}

Return ONLY valid JSON, no markdown:
{
  "tasks": [
    {
      "question": "Have you checked your dahlias before Thursday's frost?",
      "context": "Frost is forecast for Thursday night — tender tubers need protection now.",
      "urgency": "high",
      "plantName": "dahlias",
      "category": "frost_protection"
    }
  ],
  "allCalm": false,
  "calmMessage": null
}

If nothing is urgent and the garden just needs light maintenance, set allCalm:true and provide a warm 1-sentence calmMessage (e.g. "Your garden is looking after itself well — a few light tasks to keep things ticking over.").
urgency must be "high", "medium", or "low".
Return 3 tasks minimum, 5 maximum.`;
}

// ─── Response validator ───────────────────────────────────────────────────────
/**
 * Validate and normalise the AI response for Today tasks.
 * Returns a clean payload or throws if the response is unusable.
 */
export function validateTodayResponse(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Response is not an object');
  if (!Array.isArray(raw.tasks))        throw new Error('Missing tasks array');
  if (raw.tasks.length < 1)             throw new Error('Empty tasks array');

  const VALID_URGENCY  = new Set(['high', 'medium', 'low']);

  const tasks = raw.tasks.slice(0, 5).map((t, i) => {
    if (!t.question || typeof t.question !== 'string') throw new Error(`Task ${i}: missing question`);
    return {
      question:  t.question.trim(),
      context:   (t.context  || '').trim(),
      urgency:   VALID_URGENCY.has(t.urgency) ? t.urgency : 'low',
      plantName: (t.plantName || 'general').trim(),
      category:  (t.category  || 'general_maintenance').trim(),
    };
  });

  return {
    tasks,
    allCalm:     !!raw.allCalm,
    calmMessage: raw.calmMessage || null,
    generatedAt: Date.now(),
  };
}
