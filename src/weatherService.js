/**
 * weatherService.js — Sprint 2 (updated)
 *
 * Fetches Open-Meteo forecast data and computes urgency signals for the Today view.
 * All fetch/compute functions are pure (or near-pure) so they can be tested in isolation.
 *
 * API: Open-Meteo forecast — free, no key, already on allowed domain list.
 * Fetches last 14 days actuals + next 14 days forecast.
 *
 * Cache: localStorage keyed by gc_weather_{gardenId}_{date}
 * TTL: 1 hour — re-fetch if stale within same day.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export const WEATHER_CACHE_PREFIX = 'gc_weather_';
export const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000;

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

export function interpretWMO(code) {
  if (code == null) return { label: '', icon: WEATHER_ICONS.sun };
  if (code === 0)    return { label: 'Clear',         icon: '☀️' };
  if (code <= 2)     return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3)    return { label: 'Overcast',      icon: '☁️' };
  if (code <= 49)    return { label: 'Foggy',         icon: '🌫' };
  if (code <= 55)    return { label: 'Drizzle',       icon: '🌦' };
  if (code <= 65)    return { label: 'Rain',          icon: '🌧' };
  if (code <= 77)    return { label: 'Snow',          icon: '❄️' };
  if (code <= 82)    return { label: 'Showers',       icon: '🌦' };
  if (code <= 86)    return { label: 'Snow showers',  icon: '🌨' };
  if (code <= 99)    return { label: 'Thunderstorm',  icon: '⛈' };
  return { label: '', icon: '☁️' };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
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

  const res = await fetch(url, { signal, headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const raw = await res.json();
  return normaliseWeatherData(raw);
}

/**
 * Normalise raw Open-Meteo response into WeatherData.
 *
 * WeatherData shape:
 * {
 *   fetchedAt: number,
 *   today: DayData,
 *   forecast: DayData[],       // next 14 days including today (daysFromToday >= 0)
 *   past: DayData[],           // last 14 days (daysFromToday < 0)
 *   seasonalAvgTemp: number,   // mean of past 14 days max temps
 *   next24hRain: number,       // mm forecast in next 24h (today + tomorrow)
 *   next7dRain: number,        // mm forecast over next 7 days
 *   past14dRain: number,       // mm actual over past 14 days
 *   weekendForecast: {         // next upcoming Sat + Sun
 *     saturday: DayData | null,
 *     sunday: DayData | null,
 *     gardeningScore: 'great' | 'good' | 'mixed' | 'poor',
 *     summary: string,
 *   } | null,
 *   windWarning: {             // null if no significant wind
 *     maxKmh: number,
 *     dayName: string,
 *   } | null,
 * }
 */
export function normaliseWeatherData(raw) {
  const daily = raw.daily || {};
  const dates   = daily.time                || [];
  const tempMax = daily.temperature_2m_max  || [];
  const tempMin = daily.temperature_2m_min  || [];
  const precip  = daily.precipitation_sum   || [];
  const wind    = daily.windspeed_10m_max   || [];
  const wmo     = daily.weathercode         || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayIdx = dates.findIndex(d => d === todayStr);

  const makeDayData = (i) => {
    const wmoCode = wmo[i] ?? null;
    const { icon, label } = interpretWMO(wmoCode);
    return {
      date:          dates[i],
      tempMin:       tempMin[i]  ?? null,
      tempMax:       tempMax[i]  ?? null,
      precipitation: precip[i]   ?? 0,
      windspeedMax:  wind[i]     ?? 0,
      wmoCode,
      icon,
      label,
      daysFromToday: i - (todayIdx >= 0 ? todayIdx : dates.length - 14),
    };
  };

  const allDays  = dates.map((_, i) => makeDayData(i));
  const today    = todayIdx >= 0 ? allDays[todayIdx] : allDays[allDays.length - 14] || allDays[0];
  const forecast = allDays.filter(d => d.daysFromToday >= 0);
  const past     = allDays.filter(d => d.daysFromToday < 0);

  // Seasonal average: mean of past 14 days max temps
  const pastMaxes = past.map(d => d.tempMax).filter(v => v != null);
  const seasonalAvgTemp = pastMaxes.length
    ? pastMaxes.reduce((a, b) => a + b, 0) / pastMaxes.length
    : null;

  // Rainfall summaries
  const past14dRain = past.reduce((s, d) => s + (d.precipitation || 0), 0);
  const next24hRain = forecast.slice(0, 2).reduce((s, d) => s + (d.precipitation || 0), 0);
  const next7dRain  = forecast.slice(0, 7).reduce((s, d) => s + (d.precipitation || 0), 0);

  // Weekend forecast — find next Saturday and Sunday within the 14-day window
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const weekendDays = forecast.filter(d => {
    const dow = new Date(d.date + 'T12:00:00').getDay();
    return (dow === 6 || dow === 0) && d.daysFromToday <= 7; // within next week
  });

  let weekendForecast = null;
  if (weekendDays.length > 0) {
    const saturday = weekendDays.find(d => new Date(d.date + 'T12:00:00').getDay() === 6) || null;
    const sunday   = weekendDays.find(d => new Date(d.date + 'T12:00:00').getDay() === 0) || null;
    const wDays    = [saturday, sunday].filter(Boolean);

    const avgMax  = wDays.map(d => d.tempMax).filter(v => v != null);
    const avgTemp = avgMax.length ? avgMax.reduce((a,b) => a+b,0) / avgMax.length : null;
    const totalRain = wDays.reduce((s,d) => s + (d.precipitation || 0), 0);
    const maxWind   = Math.max(...wDays.map(d => d.windspeedMax || 0));
    const anyStorm  = wDays.some(d => d.wmoCode >= 80);

    let gardeningScore, summary;
    if (anyStorm || maxWind > 50 || totalRain > 25) {
      gardeningScore = 'poor';
      summary = totalRain > 25
        ? `Heavy rain expected (${totalRain.toFixed(0)}mm) — indoor jobs only`
        : `Strong winds (${maxWind.toFixed(0)}km/h) — stay indoors`;
    } else if (totalRain > 10 || maxWind > 35) {
      gardeningScore = 'mixed';
      summary = `Changeable — ${totalRain > 10 ? `${totalRain.toFixed(0)}mm rain expected, ` : ''}plan indoor and outdoor tasks`;
    } else if (avgTemp != null && avgTemp > (seasonalAvgTemp || 0) + 3 && totalRain < 5) {
      gardeningScore = 'great';
      summary = `A great weekend for the garden — warm and dry (${avgTemp.toFixed(0)}°C, ${totalRain.toFixed(0)}mm)`;
    } else {
      gardeningScore = 'good';
      summary = `Decent gardening conditions — ${totalRain < 5 ? 'dry' : `${totalRain.toFixed(0)}mm rain`}, ${avgTemp != null ? `${avgTemp.toFixed(0)}°C` : ''}`;
    }

    weekendForecast = { saturday, sunday, gardeningScore, summary };
  }

  // Wind warning — highest wind in next 3 days above 30km/h
  const windDays = forecast.slice(0, 3).filter(d => d.windspeedMax > 30);
  const windWarning = windDays.length > 0 ? (() => {
    const worst = windDays.reduce((a, b) => a.windspeedMax > b.windspeedMax ? a : b);
    const diff = worst.daysFromToday;
    const name = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : DAY_NAMES[new Date(worst.date + 'T12:00:00').getDay()];
    return { maxKmh: worst.windspeedMax, dayName: name };
  })() : null;

  return {
    fetchedAt: Date.now(),
    today,
    forecast,
    past,
    seasonalAvgTemp,
    next24hRain,
    next7dRain,
    past14dRain,
    weekendForecast,
    windWarning,
  };
}

// ─── Urgency signals ──────────────────────────────────────────────────────────
/**
 * Compute urgency signals from WeatherData.
 *
 * Key change from Sprint 2: drought signal is suppressed or modified
 * when significant rain is forecast in the next 24–48 hours.
 */
export function computeUrgencySignals(weatherData) {
  if (!weatherData) return [];
  const { today, forecast, past, seasonalAvgTemp, past14dRain, next24hRain } = weatherData;
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
      message: `Frost expected ${dayName(first.date)} (${first.tempMin?.toFixed(0)}°C) — protect tender plants now.`,
      icon:    '🌡',
      urgency: first.tempMin < 0 ? 'high' : 'medium',
    });
  }

  // 2. Drought — < 5mm past 14 days, BUT suppress/modify if rain is imminent
  const pastRain = past14dRain ?? past.reduce((s, d) => s + (d.precipitation || 0), 0);
  const rainSoon = next24hRain ?? forecast.slice(0, 2).reduce((s, d) => s + (d.precipitation || 0), 0);
  const next48hRain = forecast.slice(0, 3).reduce((s, d) => s + (d.precipitation || 0), 0);

  if (pastRain < 5) {
    if (rainSoon >= 5) {
      // Rain coming soon — reframe as "rain is on the way, hold off watering"
      signals.push({
        type:    'drought_rain_incoming',
        label:   'Dry recently — but rain forecast',
        message: `It's been dry (${pastRain.toFixed(0)}mm in two weeks) but ${rainSoon.toFixed(0)}mm is forecast in the next 24 hours — hold off watering for now.`,
        icon:    '🌧',
        urgency: 'low',
      });
    } else if (next48hRain >= 8) {
      signals.push({
        type:    'drought_rain_incoming',
        label:   'Dry recently — rain coming soon',
        message: `Very dry recently (${pastRain.toFixed(0)}mm in two weeks) — ${next48hRain.toFixed(0)}mm forecast in the next few days. Water the most vulnerable plants now.`,
        icon:    '🌦',
        urgency: 'low',
      });
    } else {
      // No meaningful rain in sight — full drought signal
      signals.push({
        type:    'drought',
        label:   'Very dry — water deeply',
        message: `Only ${pastRain.toFixed(0)}mm in the last two weeks with no significant rain forecast — water deeply, focusing on new plantings and containers.`,
        icon:    '🏜',
        urgency: 'medium',
      });
    }
  }

  // 3. Heavy rain coming — > 20mm in next 3 days
  const next3Rain = forecast.slice(0, 3).reduce((s, d) => s + (d.precipitation || 0), 0);
  if (next3Rain > 20) {
    const rainyDay = forecast.slice(0, 3).find(d => d.precipitation > 10);
    signals.push({
      type:    'heavy_rain',
      label:   `Heavy rain ${rainyDay ? dayName(rainyDay.date) : 'soon'}`,
      message: `${next3Rain.toFixed(0)}mm expected — good time to plant out; check drainage and avoid applying fertiliser before the rain.`,
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
      message: `Winds up to ${first.windspeedMax?.toFixed(0)}km/h forecast ${dayName(first.date)} — stake tall plants and secure climbers now. Avoid spraying or planting out on windy days.`,
      icon:    '💨',
      urgency: 'medium',
    });
  }

  // 5. Unseasonable heat / cold vs seasonal average
  if (seasonalAvgTemp != null && today.tempMax != null) {
    const diff = today.tempMax - seasonalAvgTemp;
    if (diff > 5) {
      signals.push({
        type:    'heat',
        label:   `${diff.toFixed(0)}°C warmer than usual`,
        message: `${diff.toFixed(0)}°C above the recent average — water in the evening, mulch to retain moisture, and watch for bolting in salad crops.`,
        icon:    '☀️',
        urgency: 'medium',
      });
    } else if (diff < -5) {
      signals.push({
        type:    'cold',
        label:   `${Math.abs(diff).toFixed(0)}°C colder than usual`,
        message: `${Math.abs(diff).toFixed(0)}°C below the recent average — delay tender plantings and check for cold damage on early growth.`,
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
