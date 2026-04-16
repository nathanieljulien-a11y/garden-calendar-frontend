/**
 * WeatherSummary.jsx — Sprint 2
 *
 * Displays:
 *   - Today's weather (icon, high/low, precipitation summary)
 *   - Next 7 days (icon row + temperature range)
 *   - Active urgency flags in amber
 *
 * Props:
 *   weatherData  — WeatherData object from weatherService.js, or null while loading
 *   signals      — UrgencySignal[] from computeUrgencySignals(), or []
 *   loading      — bool
 *   error        — string | null
 */

export const WEATHER_SUMMARY_STYLES = `
  /* ── Weather summary ── */
  .weather-panel { background: rgba(30,18,8,.7); border: 1px solid rgba(200,169,110,.18); border-radius: 2px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; animation: fadeIn .35s ease; }
  .weather-today { display: flex; align-items: center; gap: 1rem; margin-bottom: .75rem; flex-wrap: wrap; }
  .weather-today-icon { font-size: 2.2rem; line-height: 1; flex-shrink: 0; }
  .weather-today-temps { display: flex; flex-direction: column; gap: .1rem; }
  .weather-today-main { font-family: 'Playfair Display', serif; font-size: 1.5rem; color: var(--cream); line-height: 1; }
  .weather-today-label { font-size: .82rem; color: var(--sage); font-style: italic; }
  .weather-today-detail { font-size: .8rem; color: var(--sage); margin-left: auto; text-align: right; line-height: 1.6; }
  .weather-7day { display: flex; gap: .35rem; overflow-x: auto; padding-bottom: .25rem; margin-bottom: .5rem; scrollbar-width: none; }
  .weather-7day::-webkit-scrollbar { display: none; }
  .weather-day-col { display: flex; flex-direction: column; align-items: center; gap: .2rem; min-width: 40px; flex: 1; }
  .weather-day-name { font-size: .65rem; text-transform: uppercase; letter-spacing: .07em; color: var(--sage); }
  .weather-day-icon { font-size: 1.1rem; line-height: 1; }
  .weather-day-hi { font-size: .78rem; color: var(--cream); font-weight: 600; }
  .weather-day-lo { font-size: .72rem; color: var(--sage); }
  .weather-day-col.today-col .weather-day-name { color: var(--straw); }
  .weather-day-col.today-col .weather-day-hi { color: var(--straw); }
  .weather-signals { display: flex; flex-direction: column; gap: .4rem; margin-top: .6rem; padding-top: .6rem; border-top: 1px solid rgba(200,169,110,.1); }
  .weather-signal { display: flex; align-items: flex-start; gap: .5rem; padding: .4rem .6rem; border-radius: 2px; font-size: .82rem; line-height: 1.45; animation: fadeIn .3s ease; }
  .weather-signal.high   { background: rgba(196,102,74,.15); border: 1px solid rgba(196,102,74,.3); color: var(--bloom); }
  .weather-signal.medium { background: rgba(200,169,110,.1);  border: 1px solid rgba(200,169,110,.25); color: var(--straw); }
  .weather-signal-icon { flex-shrink: 0; font-size: .9rem; margin-top: .05rem; }
  .weather-signal-msg { color: var(--parchment); }
  .weather-loading { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--sage); font-style: italic; padding: .5rem 0; }
  .weather-error { font-size: .82rem; color: var(--bloom); font-style: italic; padding: .4rem 0; }
  .weather-attribution { font-size: .65rem; color: rgba(180,180,160,.35); margin-top: .5rem; font-style: italic; }
`;

const SHORT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function shortDayName(dateStr, isToday) {
  if (isToday) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return SHORT_DAYS[d.getDay()];
}

export function WeatherSummary({ weatherData, signals, loading, error }) {
  if (loading) {
    return (
      <div className="weather-panel">
        <div className="weather-loading">
          <span style={{ display:'inline-block', animation:'spin .7s linear infinite' }}>◌</span>
          Fetching today's weather…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weather-panel">
        <div className="weather-error">⚠ Weather unavailable — {error}</div>
      </div>
    );
  }

  if (!weatherData) return null;

  const { today, forecast } = weatherData;
  const next7 = forecast.slice(0, 7);

  return (
    <div className="weather-panel">
      {/* Today's summary */}
      <div className="weather-today">
        <div className="weather-today-icon">{today.icon}</div>
        <div className="weather-today-temps">
          <div className="weather-today-main">
            {today.tempMax != null ? `${today.tempMax.toFixed(0)}°` : '—'}
            <span style={{ fontSize: '1rem', color: 'var(--sage)', marginLeft: '.3rem' }}>
              / {today.tempMin != null ? `${today.tempMin.toFixed(0)}°C` : '—'}
            </span>
          </div>
          <div className="weather-today-label">{today.label}</div>
        </div>
        <div className="weather-today-detail">
          {today.precipitation > 0 && (
            <div>🌧 {today.precipitation.toFixed(0)}mm</div>
          )}
          {today.windspeedMax > 0 && (
            <div>💨 {today.windspeedMax.toFixed(0)} km/h</div>
          )}
        </div>
      </div>

      {/* 7-day forecast row */}
      <div className="weather-7day">
        {next7.map((day, i) => (
          <div
            key={day.date}
            className={`weather-day-col${i === 0 ? ' today-col' : ''}`}
          >
            <div className="weather-day-name">{shortDayName(day.date, i === 0)}</div>
            <div className="weather-day-icon">{day.icon}</div>
            <div className="weather-day-hi">{day.tempMax != null ? `${day.tempMax.toFixed(0)}°` : '—'}</div>
            <div className="weather-day-lo">{day.tempMin != null ? `${day.tempMin.toFixed(0)}°` : '—'}</div>
          </div>
        ))}
      </div>

      {/* Urgency signals */}
      {signals.length > 0 && (
        <div className="weather-signals">
          {signals.map((sig, i) => (
            <div key={i} className={`weather-signal ${sig.urgency}`}>
              <span className="weather-signal-icon">{sig.icon}</span>
              <span className="weather-signal-msg">{sig.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="weather-attribution">
        Weather: <a href="https://open-meteo.com" target="_blank" rel="noopener"
          style={{ color: 'inherit', textDecoration: 'underline', opacity: .7 }}>
          Open-Meteo
        </a> · free, no tracking
      </div>
    </div>
  );
}
