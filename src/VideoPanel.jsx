/**
 * VideoPanel.jsx — Sprint 8
 *
 * Two parts:
 * 1. VideoButton — the small button shown alongside each task (rating 2 or 3)
 * 2. VideoSheet — the bottom sheet / modal containing 3 video cards
 *
 * PRD §3.3 / §3.4:
 * - Bottom sheet on mobile, modal on desktop
 * - Each card: thumbnail, title, channel, duration, source type badge
 * - Video plays inline — no navigation away
 * - YouTube Privacy Enhanced mode (youtube-nocookie.com)
 * - Autoplay off, minimum player size 480×270px
 */

import { useState } from 'react';
import { buildEmbedUrl, videoButtonLabel, isVideoProminent, SLOT_LABELS } from './videoService.js';

export const VIDEO_PANEL_STYLES = `
  /* ── Video button ── */
  .video-btn {
    display: inline-flex; align-items: center; gap: .35rem;
    border: none; border-radius: 2px; cursor: pointer;
    font-family: 'Crimson Pro', serif; font-size: .82rem;
    padding: .35rem .75rem; transition: all .2s; line-height: 1;
  }
  .video-btn.prominent {
    background: rgba(196,102,74,.18); border: 1px solid rgba(196,102,74,.4);
    color: var(--bloom);
  }
  .video-btn.prominent:hover {
    background: rgba(196,102,74,.32); border-color: var(--bloom);
  }
  .video-btn.subtle {
    background: rgba(138,180,160,.12); border: 1px solid rgba(138,180,160,.3);
    color: var(--dew);
  }
  .video-btn.subtle:hover {
    background: rgba(138,180,160,.22); border-color: var(--dew);
  }

  /* ── Video sheet overlay ── */
  .video-overlay {
    position: fixed; inset: 0; background: rgba(10,6,3,.82);
    z-index: 3000; display: flex; align-items: flex-end;
    justify-content: center; padding: 0; animation: fadeIn .2s ease;
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
  @media (min-width: 640px) {
    .video-sheet { border-radius: 2px; }
  }
  .video-sheet-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: .75rem; margin-bottom: 1rem;
  }
  .video-sheet-title {
    font-family: 'Playfair Display', serif; font-size: 1rem;
    font-weight: 400; color: var(--straw); line-height: 1.3;
  }
  .video-sheet-close {
    background: none; border: none; color: var(--sage);
    font-size: 1.4rem; cursor: pointer; line-height: 1;
    padding: .1rem; flex-shrink: 0;
  }
  .video-sheet-close:hover { color: var(--cream); }
  .video-rating-badge {
    display: inline-flex; align-items: center; gap: .3rem;
    font-size: .72rem; padding: .2rem .6rem; border-radius: 2px;
    margin-bottom: .85rem;
  }
  .video-rating-badge.r3 {
    background: rgba(196,102,74,.15); border: 1px solid rgba(196,102,74,.3);
    color: var(--bloom);
  }
  .video-rating-badge.r2 {
    background: rgba(138,180,160,.12); border: 1px solid rgba(138,180,160,.28);
    color: var(--dew);
  }

  /* ── Video cards ── */
  .video-cards { display: flex; flex-direction: column; gap: .75rem; }
  .video-card {
    background: rgba(58,34,16,.5); border: 1px solid rgba(200,169,110,.15);
    border-radius: 2px; overflow: hidden; transition: border-color .2s;
  }
  .video-card:hover { border-color: rgba(200,169,110,.35); }
  .video-card-thumb {
    width: 100%; aspect-ratio: 16/9; position: relative;
    background: #0d0a07; cursor: pointer; overflow: hidden;
  }
  .video-card-thumb img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: opacity .2s;
  }
  .video-card-thumb:hover img { opacity: .85; }
  .video-play-overlay {
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center;
    background: rgba(0,0,0,.25); transition: background .2s;
  }
  .video-card-thumb:hover .video-play-overlay { background: rgba(0,0,0,.4); }
  .video-play-btn {
    width: 48px; height: 48px; border-radius: 50%;
    background: rgba(196,102,74,.9); display: flex;
    align-items: center; justify-content: center;
    color: white; font-size: 1.2rem; padding-left: 3px;
  }
  .video-iframe-wrap {
    width: 100%; aspect-ratio: 16/9; background: #000;
  }
  .video-iframe-wrap iframe {
    width: 100%; height: 100%; border: none; display: block;
  }
  .video-card-info {
    padding: .65rem .85rem;
    display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem;
  }
  .video-card-meta { flex: 1; min-width: 0; }
  .video-card-title {
    font-size: .88rem; color: var(--cream); line-height: 1.4;
    margin-bottom: .2rem;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .video-card-channel { font-size: .75rem; color: var(--sage); font-style: italic; }
  .video-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: .3rem; flex-shrink: 0; }
  .video-slot-badge {
    font-size: .65rem; text-transform: uppercase; letter-spacing: .07em;
    padding: .15rem .45rem; border-radius: 2px;
    background: rgba(200,169,110,.1); border: 1px solid rgba(200,169,110,.2);
    color: var(--straw); white-space: nowrap;
  }
  .video-duration { font-size: .72rem; color: var(--sage); }
  .video-attribution {
    font-size: .65rem; color: rgba(180,180,160,.35); margin-top: .75rem;
    font-style: italic; text-align: center;
  }
`;

// ─── VideoCard ────────────────────────────────────────────────────────────────
function VideoCard({ video }) {
  const [playing, setPlaying] = useState(false);
  const thumbUrl = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;
  const embedUrl = buildEmbedUrl(video.videoId) + '&autoplay=1';

  return (
    <div className="video-card">
      {playing ? (
        <div className="video-iframe-wrap">
          <iframe
            src={embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="video-card-thumb" onClick={() => setPlaying(true)}>
          <img
            src={thumbUrl}
            alt={video.title}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div className="video-play-overlay">
            <div className="video-play-btn">▶</div>
          </div>
        </div>
      )}
      <div className="video-card-info">
        <div className="video-card-meta">
          <div className="video-card-title">{video.title}</div>
          <div className="video-card-channel">{video.channel}</div>
        </div>
        <div className="video-card-right">
          <span className="video-slot-badge">{SLOT_LABELS[video.slot] || video.slot}</span>
          {video.duration && <span className="video-duration">{video.duration}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── VideoSheet ───────────────────────────────────────────────────────────────
function VideoSheet({ taskLabel, rating, videos, onClose }) {
  return (
    <div className="video-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="video-sheet">
        <div className="video-sheet-header">
          <div className="video-sheet-title">{taskLabel}</div>
          <button className="video-sheet-close" onClick={onClose} type="button">×</button>
        </div>
        <div className={`video-rating-badge r${rating}`}>
          {rating === 3 ? '⚠ Watch before you start' : '▶ How to do this'}
        </div>
        <div className="video-cards">
          {videos.map((v, i) => <VideoCard key={i} video={v} />)}
        </div>
        <div className="video-attribution">
          Videos via YouTube · embedded in Privacy Enhanced mode · no tracking cookies
        </div>
      </div>
    </div>
  );
}

// ─── VideoButton ─────────────────────────────────────────────────────────────
/**
 * The button shown alongside a task in the calendar or Today view.
 * Renders null if no videos are available for this task.
 *
 * Props:
 *   taskResult — from getVideosForTask() — { rating, label, videos } or null
 */
export function VideoButton({ taskResult }) {
  const [open, setOpen] = useState(false);

  if (!taskResult || !taskResult.videos.length) return null;

  const { rating, label, videos } = taskResult;
  const prominent = isVideoProminent(rating);
  const btnLabel  = videoButtonLabel(rating);

  return (
    <>
      <button
        className={`video-btn ${prominent ? 'prominent' : 'subtle'}`}
        type="button"
        onClick={() => setOpen(true)}
      >
        {btnLabel}
      </button>
      {open && (
        <VideoSheet
          taskLabel={label}
          rating={rating}
          videos={videos}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
