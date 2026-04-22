/**
 * todayTasks.js — Sprint 3 (updated)
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
 *   category:  string,   // task category key
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_NAMES_LIST = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function dayLabel(dateStr, todayStr) {
  if (!dateStr || !todayStr) return '';
  const diff = Math.round(
    (new Date(dateStr + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000
  );
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return names[new Date(dateStr + 'T12:00:00').getDay()];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
export function buildTodayPrompt(
  garden, weatherData, signals, monthName,
  calendarTasks = {}, existingTasks = [], isRefresh = false
) {
  const { city, orientation, plants, climateData } = garden;
  const cd  = climateData?._cd;
  const der = climateData?._derived;

  // ── Plant inventory ────────────────────────────────────────────────────────
  const allPlants = Object.entries(plants || {})
    .map(([cat, list]) => list.length ? `${cat}: ${list.join(', ')}` : null)
    .filter(Boolean)
    .join(' | ') || 'general/unspecified';

  const hasVeg      = (plants?.vegetables?.length || 0) > 0;
  const hasFruit    = (plants?.fruit?.length || 0) > 0;
  const hasFlowers  = (plants?.flowers?.length || 0) > 0;
  const allPlantList = Object.values(plants || {}).flat();

  // ── Climate context ────────────────────────────────────────────────────────
  const climateCtx = der ? [
    `Climate: ${der.climateType}`,
    `Hardiness zone: ${der.zone}`,
    `Last spring frost: ${der.lastFrost || 'none'}`,
    `First autumn frost: ${der.firstFrost || 'none'}`,
    der.seasonNote ? `IMPORTANT: ${der.seasonNote}` : '',
  ].filter(Boolean).join('. ') : '';

  const monthIdx = MONTH_NAMES_LIST.indexOf(monthName);
  const monthClimate = cd && monthIdx >= 0 ? [
    cd.tMean?.[monthIdx]  != null ? `Mean temp: ${cd.tMean[monthIdx].toFixed(1)}°C` : '',
    cd.tMin?.[monthIdx]   != null ? `Min: ${cd.tMin[monthIdx].toFixed(1)}°C` : '',
    cd.precip?.[monthIdx] != null ? `Avg rainfall: ${cd.precip[monthIdx].toFixed(0)}mm` : '',
  ].filter(Boolean).join(', ') : '';

  // ── Weather: today ─────────────────────────────────────────────────────────
  const w = weatherData;
  const todayStr = w?.today?.date || '';
  const todayWeather = w?.today ? [
    `Today: ${w.today.label}`,
    w.today.tempMax  != null ? `High ${w.today.tempMax.toFixed(0)}°C` : '',
    w.today.tempMin  != null ? `Low ${w.today.tempMin.toFixed(0)}°C` : '',
    w.today.precipitation > 0 ? `${w.today.precipitation.toFixed(0)}mm rain` : 'dry',
    w.today.windspeedMax > 15 ? `Wind ${w.today.windspeedMax.toFixed(0)}km/h` : '',
  ].filter(Boolean).join(', ') : 'No weather data available.';

  // ── Weather: rainfall context ──────────────────────────────────────────────
  const past14 = w?.past14dRain ?? (w?.past || []).reduce((s,d) => s+(d.precipitation||0), 0);
  const next24 = w?.next24hRain ?? (w?.forecast || []).slice(0,2).reduce((s,d) => s+(d.precipitation||0), 0);
  const next7  = w?.next7dRain  ?? (w?.forecast || []).slice(0,7).reduce((s,d) => s+(d.precipitation||0), 0);

  const rainfallCtx = [
    `Past 14 days: ${past14.toFixed(0)}mm`,
    `Next 24 hours: ${next24.toFixed(0)}mm forecast`,
    `Next 7 days: ${next7.toFixed(0)}mm forecast`,
  ].join(' · ');

  // ── Weather: temperature vs seasonal average ───────────────────────────────
  let tempVsAverage = '';
  if (w?.seasonalAvgTemp != null && w?.today?.tempMax != null) {
    const diff = w.today.tempMax - w.seasonalAvgTemp;
    if (diff > 3) {
      tempVsAverage = `Currently ${diff.toFixed(0)}°C WARMER than the recent average (${w.seasonalAvgTemp.toFixed(0)}°C) — encourage heat-loving tasks, warn about watering needs and bolting.`;
    } else if (diff < -3) {
      tempVsAverage = `Currently ${Math.abs(diff).toFixed(0)}°C COLDER than the recent average (${w.seasonalAvgTemp.toFixed(0)}°C) — delay tender plantings, check cold-sensitive plants.`;
    } else {
      tempVsAverage = `Temperature close to seasonal average (${w.seasonalAvgTemp.toFixed(0)}°C typical).`;
    }
  }

  // ── Weather: wind ──────────────────────────────────────────────────────────
  const windCtx = w?.windWarning
    ? `Wind alert: ${w.windWarning.maxKmh.toFixed(0)}km/h forecast ${w.windWarning.dayName} — avoid spraying, delay planting out, prioritise staking.`
    : w?.today?.windspeedMax > 25
      ? `Breezy today (${w.today.windspeedMax.toFixed(0)}km/h) — avoid spraying pesticides or foliar feeds.`
      : '';

  // ── Weather: weekend ──────────────────────────────────────────────────────
  const weekendCtx = w?.weekendForecast
    ? `Weekend outlook (${w.weekendForecast.gardeningScore.toUpperCase()}): ${w.weekendForecast.summary}`
    : '';

  // ── 7-day forecast summary (next 5 days) ──────────────────────────────────
  const forecastLines = (w?.forecast || []).slice(1, 6).map(d => {
    const name = dayLabel(d.date, todayStr);
    const parts = [
      d.tempMax != null ? `${d.tempMax.toFixed(0)}°C` : '',
      d.precipitation > 2 ? `${d.precipitation.toFixed(0)}mm rain` : 'dry',
      d.windspeedMax > 35 ? `wind ${d.windspeedMax.toFixed(0)}km/h` : '',
    ].filter(Boolean);
    return `  ${name}: ${d.icon} ${parts.join(', ')}`;
  }).join('\n');

  // ── Active urgency signals ─────────────────────────────────────────────────
  const signalLines = signals.length > 0
    ? signals.map(s => `• [${s.urgency.toUpperCase()}] ${s.label}: ${s.message}`).join('\n')
    : 'No urgent signals.';

  // ── Calendar tasks context ────────────────────────────────────────────────
  const calendarCtx = Object.keys(calendarTasks).length > 0
    ? `\nCALENDAR TASKS FOR THIS PERIOD:\n` +
      Object.entries(calendarTasks)
        .map(([month, tasks]) => `${month}:\n${tasks.map(t => `  • ${t}`).join('\n')}`)
        .join('\n')
    : '';

  // ── Already shown tasks (for refresh) ────────────────────────────────────
  const existingCtx = existingTasks.length > 0
    ? `\nALREADY SHOWN TODAY — do NOT repeat:\n${existingTasks.map(t => `  • ${t.question}`).join('\n')}`
    : '';

  // ── Valid category keys ────────────────────────────────────────────────────
  const CATEGORY_KEYS = [
    'watering', 'feeding', 'pruning', 'deadheading', 'harvesting',
    'planting', 'sowing', 'mulching', 'staking', 'pest_control',
    'disease_control', 'frost_protection', 'dividing', 'training',
    'lawn_care', 'general_maintenance',
  ];

  // ── Pest & bloom context ──────────────────────────────────────────────────
  // Month-specific pest pressure — guides bloom check and pest prompt generation
  const pestCtx = (() => {
    const m = monthIdx;
    const lines = [];

    // Slug/snail risk — wet conditions + spring/autumn
    const wetAndCool = past14 > 20 && (m <= 4 || m >= 8);
    if (wetAndCool) {
      lines.push('Slug and snail pressure likely given wet conditions — include a manual removal or barrier prompt for vulnerable plants (hostas, lettuce, delphiniums, dahlias).');
    }

    // Caterpillar / cabbage white — late spring to early autumn
    if (hasVeg && m >= 3 && m <= 8) {
      lines.push('Cabbage white butterfly season — check brassicas (cabbage, kale, broccoli) for eggs/caterpillars; suggest netting or manual removal.');
    }

    // Aphid pressure — spring onwards
    if (m >= 2 && m <= 8) {
      lines.push('Aphid season — check growing tips of roses, beans, and soft new growth. Suggest checking and manual removal or encouraging natural predators (ladybirds).');
    }

    // Vine weevil — spring and autumn
    if ((m >= 3 && m <= 5) || (m >= 8 && m <= 10)) {
      lines.push('Vine weevil risk in containers — watch for notched leaf edges (adult) or wilting (larvae in roots).');
    }

    // Lily beetle — spring to summer
    if (m >= 3 && m <= 7 && allPlantList.some(p => /lily|lilies|fritillary/i.test(p))) {
      lines.push('Lily beetle season — check lily and fritillary leaves for bright red beetles; remove by hand.');
    }

    // Bird netting for fruit
    if (hasFruit && m >= 4 && m <= 7) {
      lines.push('Fruit is developing — check whether netting is needed to protect against birds (soft fruit, cherries).');
    }

    return lines.join('\n');
  })();

  // ── Bloom check context ───────────────────────────────────────────────────
  // Prompt Claude to ask whether expected flowers are out yet
  const bloomCheckCtx = hasFlowers && !isRefresh
    ? `Include one bloom-check task asking the gardener whether a flower that should be blooming this month is out yet (frame as curiosity, not concern). If it's not out, suggest reasons and reassurance.`
    : '';

  return `You are an expert horticulturist giving a gardener their personalised daily briefing.

GARDEN
Location: ${city}
Orientation: ${orientation || 'unspecified'}
Month: ${monthName}
Plants: ${allPlants}
${climateCtx ? `\nCLIMATE\n${climateCtx}` : ''}
${monthClimate ? `${monthName} climate normals: ${monthClimate}` : ''}
${calendarCtx}
${existingCtx}

WEATHER
${todayWeather}
Rainfall: ${rainfallCtx}
${tempVsAverage ? `Temperature vs average: ${tempVsAverage}` : ''}
${windCtx ? `Wind: ${windCtx}` : ''}
${weekendCtx ? `Weekend: ${weekendCtx}` : ''}

${forecastLines ? `5-DAY FORECAST\n${forecastLines}` : ''}

URGENCY SIGNALS
${signalLines}

WEATHER RULES FOR TASK GENERATION — apply strictly:
- WATERING: Generate AT MOST one watering-related task. If next 24h forecast ≥ 5mm, do NOT suggest watering — rain is coming. If 5–15mm is forecast in next 48h, mention the most drought-vulnerable plants only. Only suggest deep watering if past 14 days < 10mm AND next 24h < 3mm.
- WIND: If wind > 35km/h today or forecast within 2 days, do NOT suggest spraying (pesticides, foliar feeds, fungicides). Do suggest staking or securing.
- TEMPERATURE: If warmer than average, include tasks that encourage growth (feeding, deadheading) and warn about moisture stress. If colder than average, delay tender plantings and mention checking cold-sensitive plants.
- WEEKEND: If a good gardening weekend is forecast, mention it in context for a task that benefits from a longer session (pruning, dividing, planting out).
- HEAVY RAIN: If > 20mm in next 3 days, suggest using the rain for planting out; warn about waterlogging for plants in pots or heavy soil.

TASK GENERATION
${isRefresh
  ? `Generate 2–3 ADDITIONAL tasks — different from already-shown tasks. Cover different plants or aspects.`
  : `Generate 4–6 prioritised garden tasks for today.`}

Rules:
- Frame each as a friendly question: "Have you…?", "Did you notice…?", "Is it time to…?"
- Only reference plants explicitly in the inventory above
- Urgency signals must influence at least one task if present
- WATERING: one consolidated task maximum — name the most vulnerable plants rather than listing multiple watering tasks
- PEST/BLOOM: include one pest-check or bloom-check task where seasonally appropriate
${pestCtx ? `\nPEST CONTEXT (use to inform pest tasks):\n${pestCtx}` : ''}
${bloomCheckCtx ? `\nBLOOM CHECK: ${bloomCheckCtx}` : ''}
- category must be one of: ${CATEGORY_KEYS.join(', ')}

PLANTING SEASON RULES:
- Tender crops (tomatoes, aubergines, peppers, courgettes, French beans, runner beans, basil, dahlias) cannot be planted outdoors until: (a) last frost date has passed AND (b) nights consistently above 10°C
- In temperate oceanic climates (last frost Mar/Apr): tender crops go out May–June; April = indoor sowing only
- In Mediterranean climates (last frost Feb/Mar): plant out May–June; April = seedlings indoors
- NEVER suggest outdoor watering, feeding, or training for crops not yet in the ground
- Perennials, shrubs, trees, roses, hardy herbs: tasks always valid if seasonally appropriate

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
  "calmMessage": null,
  "weekendNote": "A great weekend ahead — save bigger jobs like dividing perennials for Saturday."
}

- allCalm: true only if no urgency signals and garden just needs light maintenance
- calmMessage: warm 1-sentence message if allCalm is true, else null
- weekendNote: 1 sentence about the weekend gardening outlook if weekend data is available, else null
- urgency: "high", "medium", or "low"
- ${isRefresh ? 'Return 2–3 tasks.' : 'Return 4–6 tasks.'}`;
}

// ─── Response validator ───────────────────────────────────────────────────────
export function validateTodayResponse(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Response is not an object');
  if (!Array.isArray(raw.tasks))        throw new Error('Missing tasks array');
  if (raw.tasks.length < 1)             throw new Error('Empty tasks array');

  const VALID_URGENCY = new Set(['high', 'medium', 'low']);

  const tasks = raw.tasks.slice(0, 6).map((t, i) => {
    if (!t.question || typeof t.question !== 'string') throw new Error(`Task ${i}: missing question`);
    return {
      question:  t.question.trim(),
      context:   (t.context   || '').trim(),
      urgency:   VALID_URGENCY.has(t.urgency) ? t.urgency : 'low',
      plantName: (t.plantName || 'general').trim(),
      category:  (t.category  || 'general_maintenance').trim(),
    };
  });

  return {
    tasks,
    allCalm:     !!raw.allCalm,
    calmMessage: raw.calmMessage  || null,
    weekendNote: raw.weekendNote  || null,
    generatedAt: Date.now(),
  };
}
