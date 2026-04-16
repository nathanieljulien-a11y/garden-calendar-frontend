/**
 * weatherService.js — Sprint 2
 *
 * Fetches Open-Meteo forecast data and computes urgency signals for the Today view.
 * All fetch/compute functions are pure (or near-pure) so they can be tested in isolation.
 *
 * API: Open-Meteo forecast — free, no key, already on allowed domain list.
 * Fetches last 14 days actuals + next 14 days forecast.
 *
 * Cache: localStorage keyed by gc_weather_{gardenId}_{date}
 * TTL: expires at midnight (date changes) — always fresh weather per day.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export const WEATHER_CACHE_PREFIX = 'gc_weather_';
export const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — re-fetch if stale within same day

// Weather variable icons
export const WEATHER_ICONS = {
  sun:    '☀️',
  cloud:  '⛅',
  rain:   '🌧',
  snow:   '❄️',
  wind:   '💨',
  frost:  '🌡',
  heat:   '🌡',
  storm:  '⛈',
  fog:    '🌫',
};

// WMO weather interpretation codes → simple category
// https://open-meteo.com/en/docs#weathervariables
export function interpretWMO(code) {
  if (code == null) return { label: '', icon: WEATHER_ICONS.sun };
  if (code === 0)                    return { label: 'Clear',        icon: '☀️' };
  if (code <= 2)                     return { label: 'Partly cloudy',icon: '⛅' };
  if (code === 3)                     return { label: 'Overcast',     icon: '☁️' };
  if (code <= 49)                    return { label: 'Foggy',        icon: '🌫' };
  if (code <= 55)                    return { label: 'Drizzle',      icon: '🌦' };
  if (code <= 65)                    return { label: 'Rain',         icon: '🌧' };
  if (code <= 77)                    return { label: 'Snow',         icon: '❄️' };
  if (code <= 82)                    return { label: 'Showers',      icon: '🌦' };
  if (code <= 86)                    return { label: 'Snow showers', icon: '🌨' };
  if (code <= 99)                    return { label: 'Thunderstorm', icon: '⛈' };
  return { label: '', icon: '☁️' };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
/**
 * Fetch 14 days past + 14 days forecast from Open-Meteo.
 * Returns a normalised WeatherData object.
 *
 * WeatherData shape:
 * {
 *   fetchedAt: number,          // ms timestamp
 *   today: {
 *     date: string,             // YYYY-MM-DD
 *     tempMin: number,
 *     tempMax: number,
 *     precipitation: number,    // mm
 *     windspeedMax: number,     // km/h
 *     wmoCode: number,
 *     icon: string,
 *     label: string,
 *   },
 *   forecast: DayData[],        // next 14 days including today
 *   past: DayData[],            // last 14 days
 *   seasonalAvgTemp: number,    // mean of past 14 days max temps — used for unseasonable detection
 * }
 *
 * DayData shape:
 * {
 *   date: string,
 *   tempMin: number,
 *   tempMax: number,
 *   precipitation: number,
 *   windspeedMax: number,
 *   wmoCode: number,
 *   icon: string,
 *   label: string,
 *   daysFromToday: number,      // negative = past, 0 = today, positive = future
 * }
 */
export async function fetchWeatherForecast(lat, lng, signal) {
  const vars = [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'windspeed_10m_max',
    'weathercode',
  ].join(',');

  const url = [
    'https://api.open-meteo.com/v1/forecast',
    `?latitude=${lat}`,
    `&longitude=${lng}`,
    `&daily=${vars}`,
    `&past_days=14`,
    `&forecast_days=14`,
    `&timezone=auto`,
  ].join('');

  const res = await fetch(url, {
    signal,
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const raw = await res.json();
  return normaliseWeatherData(raw);
}

/**
 * Normalise raw Open-Meteo response into WeatherData.
 * Exported so it can be tested with fixture data.
 */
export function normaliseWeatherData(raw) {
  const daily = raw.daily || {};
  const dates       = daily.time                || [];
  const tempMax     = daily.temperature_2m_max  || [];
  const tempMin     = daily.temperature_2m_min  || [];
  const precip      = daily.precipitation_sum   || [];
  const wind        = daily.windspeed_10m_max   || [];
  const wmo         = daily.weathercode         || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayIdx = dates.findIndex(d => d === todayStr);

  const makeDayData = (i) => {
    const wmoCode = wmo[i] ?? null;
    const { icon, label } = interpretWMO(wmoCode);
    return {
      date:         dates[i],
      tempMin:      tempMin[i]  ?? null,
      tempMax:      tempMax[i]  ?? null,
      precipitation:precip[i]   ?? 0,
      windspeedMax: wind[i]     ?? 0,
      wmoCode,
      icon,
      label,
      daysFromToday: i - (todayIdx >= 0 ? todayIdx : dates.length - 14),
    };
  };

  const allDays = dates.map((_, i) => makeDayData(i));
  const today   = todayIdx >= 0 ? allDays[todayIdx] : allDays[allDays.length - 14] || allDays[0];
  const forecast = allDays.filter(d => d.daysFromToday >= 0);
  const past     = allDays.filter(d => d.daysFromToday < 0);

  // Seasonal average: mean of past 14 days max temps
  const pastMaxes = past.map(d => d.tempMax).filter(v => v != null);
  const seasonalAvgTemp = pastMaxes.length
    ? pastMaxes.reduce((a, b) => a + b, 0) / pastMaxes.length
    : null;

  return {
    fetchedAt: Date.now(),
    today,
    forecast,
    past,
    seasonalAvgTemp,
  };
}

// ─── Urgency signals ──────────────────────────────────────────────────────────
/**
 * Compute urgency signals from WeatherData.
 * Returns an array of signal objects — empty if no urgent conditions.
 *
 * Signal shape:
 * {
 *   type:    string,   // 'frost' | 'drought' | 'heavy_rain' | 'high_wind' | 'heat' | 'cold'
 *   label:   string,   // short display label e.g. 'Frost forecast Thursday'
 *   message: string,   // fuller friendly message for the Today view
 *   icon:    string,
 *   urgency: 'high' | 'medium',
 * }
 *
 * Thresholds from PRD §4.3:
 *   Frost imminent:      min < 2°C within 5 days
 *   Prolonged drought:   < 5mm in last 14 days
 *   Heavy rain coming:   > 20mm in next 3 days
 *   High wind:           > 40km/h within 3 days
 *   Unseasonable heat:   > 5°C above seasonal avg
 *   Unseasonable cold:   > 5°C below seasonal avg
 */
export function computeUrgencySignals(weatherData) {
  if (!weatherData) return [];
  const { today, forecast, past, seasonalAvgTemp } = weatherData;
  const signals = [];

  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    const diff = Math.round((d - new Date(today.date + 'T12:00:00')) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return DAY_NAMES[d.getDay()];
  };

  // 1. Frost imminent — min < 2°C within next 5 days
  const frostDays = forecast.slice(0, 5).filter(d => d.tempMin != null && d.tempMin < 2);
  if (frostDays.length > 0) {
    const first = frostDays[0];
    signals.push({
      type:    'frost',
      label:   `Frost forecast ${dayName(first.date)}`,
      message: `Have you protected your tender plants? Frost expected ${dayName(first.date)} (${first.tempMin?.toFixed(0)}°C).`,
      icon:    '🌡',
      urgency: first.tempMin < 0 ? 'high' : 'medium',
    });
  }

  // 2. Prolonged drought — < 5mm total in last 14 days
  const totalPastPrecip = past.reduce((sum, d) => sum + (d.precipitation || 0), 0);
  if (totalPastPrecip < 5) {
    signals.push({
      type:    'drought',
      label:   'Very dry — water deeply',
      message: `Have you watered deeply? It's been very dry — only ${totalPastPrecip.toFixed(0)}mm in the last two weeks.`,
      icon:    '🏜',
      urgency: 'medium',
    });
  }

  // 3. Heavy rain coming — > 20mm in next 3 days
  const next3Days = forecast.slice(0, 3);
  const upcomingRain = next3Days.reduce((sum, d) => sum + (d.precipitation || 0), 0);
  if (upcomingRain > 20) {
    const rainyDay = next3Days.find(d => d.precipitation > 10);
    signals.push({
      type:    'heavy_rain',
      label:   `Heavy rain ${rainyDay ? dayName(rainyDay.date) : 'soon'}`,
      message: `Good planting window — soil will be moist after the rain (${upcomingRain.toFixed(0)}mm expected).`,
      icon:    '🌧',
      urgency: 'medium',
    });
  }

  // 4. High wind — > 40km/h within next 3 days
  const windyDays = forecast.slice(0, 3).filter(d => d.windspeedMax > 40);
  if (windyDays.length > 0) {
    const first = windyDays[0];
    signals.push({
      type:    'high_wind',
      label:   `High wind ${dayName(first.date)}`,
      message: `Have you staked tall plants before the wind arrives ${dayName(first.date)} (${first.windspeedMax?.toFixed(0)} km/h)?`,
      icon:    '💨',
      urgency: 'medium',
    });
  }

  // 5. Unseasonable heat — today's max > 5°C above seasonal avg
  if (seasonalAvgTemp != null && today.tempMax != null) {
    if (today.tempMax > seasonalAvgTemp + 5) {
      signals.push({
        type:    'heat',
        label:   'Unseasonably warm',
        message: `Water in the evening this week, not midday — it's ${(today.tempMax - seasonalAvgTemp).toFixed(0)}°C above the seasonal average.`,
        icon:    '☀️',
        urgency: 'medium',
      });
    }

    // 6. Unseasonable cold — today's max > 5°C below seasonal avg
    if (today.tempMax < seasonalAvgTemp - 5) {
      signals.push({
        type:    'cold',
        label:   'Unseasonably cold',
        message: `Check your tender plants for cold damage — it's ${(seasonalAvgTemp - today.tempMax).toFixed(0)}°C below the seasonal average.`,
        icon:    '🌡',
        urgency: 'medium',
      });
    }
  }

  return signals;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
export function weatherCacheKey(gardenId) {
  const date = new Date().toISOString().slice(0, 10);
  return `${WEATHER_CACHE_PREFIX}${gardenId}_${date}`;
}

export function readWeatherCache(gardenId) {
  try {
    const raw = localStorage.getItem(weatherCacheKey(gardenId));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    // Invalidate if older than TTL
    if (Date.now() - cached.fetchedAt > WEATHER_CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

export function writeWeatherCache(gardenId, weatherData) {
  try {
    localStorage.setItem(weatherCacheKey(gardenId), JSON.stringify(weatherData));
  } catch {}
}
