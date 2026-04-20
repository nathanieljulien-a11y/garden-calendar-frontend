/**
 * VideoPanel.jsx — Sprint 8 (revised: live search)
 *
 * VideoButton: shown alongside technique-based tasks.
 * On click: searches YouTube via proxy, shows 3 results.
 * User picks one → embeds inline via youtube-nocookie.com.
 */

import { useState } from 'react';
import { searchYouTube, buildEmbedUrl } from './videoService.js';

// PROXY_BASE is read from the same env var as the rest of the app
const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PROXY_URL)
  ? String(import.meta.env.VITE_PROXY_URL).replace(/\/$/, '')
  : '';

export const VIDEO_PANEL_STYLES = `
  /* ── Video button ── */
  .video-btn {
    display: inline-flex; align-items: center; gap: .3rem;
    background: none; border: 1px solid rgba(138,180,160,.3);
    border-radius: 2px; color: var(--dew); cursor: pointer;
    font-family: 'Crimson Pro', serif; font-size: .76rem;
    padding: .2rem .6rem; transition: all .15s; line-height: 1; white-space: nowrap;
    flex-shrink: 0;
  }
  .video-btn:hover { background: rgba(138,180,160,.12); border-color: var(--dew); }
  .video-btn:disabled { opacity: .45; cursor: wait; }

  /* ── Video sheet overlay ── */
  .video-overlay {
    position: fixed; inset: 0; background: rgba(10,6,3,.82);
    z-index: 3000; display: flex; align-items: flex-end;
    justify-content: center; animation: fadeIn .2s ease;
  }
  @media (min-width: 640px) {
    .video-overlay { align-items: center; padding: 1.5rem; }
  }
  .video-sheet {
    background: #1E1208; border: 1px solid rgba(200,169,110,.22);
    border-radius: 2px 2px 0 0; width: 100%; max-width: 680px;
    max-height: 90vh; overflow-y: auto; padding: 1.25rem 1.25rem 2rem;
    animation: fadeUp .25s ease;
  }
  @media (min-width: 640px) { .video-sheet { border-radius: 2px; } }

  .video-sheet-header {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: .75rem; margin-bottom: 1rem;
  }
  .video-sheet-task {
    font-size: .8rem; color: var(--sage); font-style: italic;
    line-height: 1.4; flex: 1;
  }
  .video-sheet-close {
    background: none; border: none; color: var(--sage);
    font-size: 1.4rem; cursor: pointer; line-height: 1;
    padding: .1rem; flex-shrink: 0;
  }
  .video-sheet-close:hover { color: var(--cream); }

  .video-sheet-label {
    font-size: .68rem; text-transform: uppercase; letter-spacing: .1em;
    color: var(--straw); margin-bottom: .85rem;
  }

  /* ── Result cards ── */
  .video-results { display: flex; flex-direction: column; gap: .6rem; }

  .video-result-card {
    display: flex; gap: .75rem; align-items: flex-start;
    padding: .6rem .75rem; background: rgba(58,34,16,.5);
    border: 1px solid rgba(200,169,110,.15); border-radius: 2px;
    cursor: pointer; transition: border-color .15s; text-align: left;
    width: 100%; font-family: 'Crimson Pro', serif;
  }
  .video-result-card:hover { border-color: rgba(200,169,110,.4); }

  .video-result-thumb {
    width: 96px; height: 54px; border-radius: 2px;
    object-fit: cover; flex-shrink: 0; background: #0d0a07;
  }
  .video-result-info { flex: 1; min-width: 0; }
  .video-result-title {
    font-size: .88rem; color: var(--cream); line-height: 1.35;
    margin-bottom: .2rem;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .video-result-channel { font-size: .72rem; color: var(--sage); font-style: italic; }

  /* ── Embed ── */
  .video-embed-wrap {
    width: 100%; aspect-ratio: 16/9; background: #000;
    border-radius: 2px; overflow: hidden; margin-bottom: .6rem;
  }
  .video-embed-wrap iframe { width: 100%; height: 100%; border: none; display: block; }
  .video-embed-back {
    background: none; border: none; color: var(--sage);
    font-size: .8rem; cursor: pointer; padding: 0; font-family: 'Crimson Pro', serif;
    text-decoration: underline;
  }
  .video-embed-back:hover { color: var(--cream); }

  .video-attribution {
    font-size: .65rem; color: rgba(180,180,160,.35);
    margin-top: .85rem; font-style: italic; text-align: center;
  }

  /* ── States ── */
  .video-loading {
    display: flex; align-items: center; gap: .5rem;
    font-size: .85rem; color: var(--sage); font-style: italic; padding: .5rem 0;
  }
  .video-error { font-size: .82rem; color: var(--bloom); font-style: italic; padding: .4rem 0; }
  .video-retry {
    background: none; border: 1px solid rgba(196,102,74,.35);
    color: var(--bloom); border-radius: 2px; padding: .3rem .7rem;
    font-family: 'Crimson Pro', serif; font-size: .8rem; cursor: pointer;
    margin-top: .4rem; transition: all .15s;
  }
  .video-retry:hover { background: rgba(196,102,74,.12); }
`;

// ─── VideoSheet ───────────────────────────────────────────────────────────────
function VideoSheet({ taskText, region, onClose }) {
  const [state, setState]     = useState('idle'); // idle | loading | results | embed | error
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError]     = useState('');

  const doSearch = async () => {
    setState('loading');
    setError('');
    try {
      const res = await searchYouTube(taskText, region, PROXY_BASE);
      if (!res.length) throw new Error('No results found — try a different search');
      setResults(res);
      setState('results');
    } catch (e) {
      setError(e.message || 'Search failed');
      setState('error');
    }
  };

  // Auto-search when sheet opens
  useState(() => { doSearch(); }, []);
  // ^ useState trick doesn't work — use a ref-based approach:
  const searchedRef = { current: false };
  if (!searchedRef.current && state === 'idle') {
    searchedRef.current = true;
    doSearch();
  }

  const pick = (result) => {
    setSelected(result);
    setState('embed');
  };

  return (
    <div className="video-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="video-sheet">
        <div className="video-sheet-header">
          <div className="video-sheet-task">"{taskText}"</div>
          <button className="video-sheet-close" onClick={onClose} type="button">×</button>
        </div>

        {(state === 'idle' || state === 'loading') && (
          <div className="video-loading">
            <span style={{ display:'inline-block', animation:'spin .7s linear infinite' }}>◌</span>
            Searching YouTube…
          </div>
        )}

        {state === 'error' && (
          <div>
            <div className="video-error">⚠ {error}</div>
            <button className="video-retry" onClick={doSearch} type="button">↺ Try again</button>
          </div>
        )}

        {state === 'results' && (
          <>
            <div className="video-sheet-label">Choose a video</div>
            <div className="video-results">
              {results.map((r, i) => (
                <button key={i} className="video-result-card" onClick={() => pick(r)} type="button">
                  <img
                    className="video-result-thumb"
                    src={r.thumbnailUrl}
                    alt={r.title}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  <div className="video-result-info">
                    <div className="video-result-title">{r.title}</div>
                    <div className="video-result-channel">{r.channel}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {state === 'embed' && selected && (
          <>
            <div className="video-embed-wrap">
              <iframe
                src={buildEmbedUrl(selected.videoId)}
                title={selected.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div style={{ marginBottom: '.4rem' }}>
              <div style={{ fontSize: '.88rem', color: 'var(--cream)', marginBottom: '.15rem' }}>{selected.title}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--sage)', fontStyle: 'italic' }}>{selected.channel}</div>
            </div>
            <button className="video-embed-back" onClick={() => setState('results')} type="button">
              ← Back to results
            </button>
          </>
        )}

        <div className="video-attribution">
          Videos via YouTube · embedded in Privacy Enhanced mode · no tracking cookies
        </div>
      </div>
    </div>
  );
}

// ─── VideoButton ──────────────────────────────────────────────────────────────
/**
 * Props:
 *   taskText {string}  — the raw task string
 *   region   {string}  — 'uk' | 'mediterranean' | etc.
 */
export function VideoButton({ taskText, region = 'uk' }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="video-btn"
        type="button"
        onClick={() => setOpen(true)}
        title="Find a video guide for this task"
      >
        ▶ Watch how to do this
      </button>
      {open && (
        <VideoSheet
          taskText={taskText}
          region={region}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
