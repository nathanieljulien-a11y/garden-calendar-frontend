/**
 * HomeScreen.jsx — Sprint 1
 *
 * Shown to return users (those with at least one saved garden) instead of
 * going straight to the garden creation form. Three paths per PRD §2.2:
 *
 *   1 (primary)   — "What should I do today?"   → Today view (Sprint 2–3, hidden for now)
 *   2 (secondary) — "Create or edit my garden"  → Form (existing flow)
 *   3 (secondary) — "Improving my garden"        → Garden Insights (Sprint 4–7, hidden for now)
 *
 * Stubs for paths 1 and 3 are hidden until those features ship (per product decision).
 *
 * Props:
 *   gardens        — array of garden objects from gc_gardens
 *   selectedId     — id of the currently selected garden (for multi-garden picker)
 *   onSelectGarden — (id) => void — user picks a different garden
 *   onCreateEdit   — () => void   — user wants to create or edit
 *   onRenameGarden — (id, newName) => void
 *   onDeleteGarden — (id) => void
 */

import { useState } from "react";

// Styles that extend the existing GardenCalendar design language.
// Injected once alongside the existing <style> block — uses the same
// CSS custom properties (--cream, --straw, --sage, --fern, --moss, etc.)
export const HOME_SCREEN_STYLES = `
  /* ── Home screen ── */
  .home-screen { animation: fadeUp .4s ease forwards; max-width: 600px; margin: 0 auto; }
  .home-garden-picker { margin-bottom: 2rem; }
  .home-picker-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--sage); margin-bottom: .65rem; }
  .home-picker-list { display: flex; flex-direction: column; gap: .45rem; }
  .home-picker-row { display: flex; align-items: center; gap: 0; background: rgba(58,34,16,.55); border: 1px solid rgba(200,169,110,.18); border-radius: 2px; overflow: hidden; transition: border-color .2s; }
  .home-picker-row.selected { border-color: rgba(200,169,110,.5); background: rgba(74,52,18,.72); }
  .home-picker-btn { flex: 1; background: none; border: none; color: var(--parchment); padding: .7rem 1rem; font-family: 'Crimson Pro', serif; font-size: 1rem; text-align: left; cursor: pointer; display: flex; align-items: baseline; gap: .6rem; transition: color .15s; }
  .home-picker-btn:hover { color: var(--cream); }
  .home-picker-name { font-family: 'Playfair Display', serif; font-size: 1rem; color: var(--cream); }
  .home-picker-meta { font-size: .78rem; color: var(--sage); font-style: italic; }
  .home-picker-actions { display: flex; border-left: 1px solid rgba(200,169,110,.12); }
  .home-picker-action { background: none; border: none; color: var(--sage); padding: .5rem .65rem; cursor: pointer; font-size: .82rem; transition: all .15s; line-height: 1; min-height: 44px; min-width: 36px; display: flex; align-items: center; justify-content: center; }
  .home-picker-action:hover { color: var(--cream); background: rgba(200,169,110,.08); }
  .home-picker-action.danger:hover { color: var(--bloom); background: rgba(196,102,74,.12); }
  .home-rename-row { display: flex; gap: .5rem; padding: .5rem .75rem; background: rgba(30,18,8,.6); border-top: 1px solid rgba(200,169,110,.1); }
  .home-rename-input { flex: 1; background: rgba(245,237,216,.92); border: 1px solid rgba(200,169,110,.4); border-radius: 2px; color: #2C1A0A; padding: .45rem .75rem; font-family: 'Crimson Pro', serif; font-size: .95rem; outline: none; }
  .home-rename-input:focus { border-color: var(--straw); }
  .home-rename-save { background: var(--fern); border: none; border-radius: 2px; color: var(--cream); padding: .45rem .85rem; font-family: 'Crimson Pro', serif; font-size: .85rem; cursor: pointer; transition: background .2s; }
  .home-rename-save:hover { background: var(--moss); }
  .home-rename-cancel { background: none; border: 1px solid rgba(200,169,110,.25); border-radius: 2px; color: var(--sage); padding: .45rem .7rem; font-family: 'Crimson Pro', serif; font-size: .85rem; cursor: pointer; }

  .home-paths { display: flex; flex-direction: column; gap: .75rem; }
  .home-path-primary { display: flex; flex-direction: column; background: rgba(92,122,74,.22); border: 1px solid rgba(92,122,74,.45); border-radius: 2px; padding: 1.4rem 1.75rem; cursor: pointer; transition: all .2s; text-align: left; width: 100%; font-family: inherit; color: inherit; }
  .home-path-primary:hover { background: rgba(92,122,74,.35); border-color: rgba(92,122,74,.7); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,.3); }
  .home-path-label { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 400; color: var(--cream); margin-bottom: .3rem; }
  .home-path-sub { font-size: .85rem; color: var(--sage); font-style: italic; }
  .home-path-secondary { display: flex; align-items: center; justify-content: space-between; background: rgba(58,34,16,.55); border: 1px solid rgba(200,169,110,.18); border-radius: 2px; padding: 1rem 1.4rem; cursor: pointer; transition: all .2s; text-align: left; width: 100%; font-family: inherit; color: inherit; }
  .home-path-secondary:hover { border-color: rgba(200,169,110,.4); background: rgba(74,52,18,.72); }
  .home-path-secondary .home-path-label { font-size: 1.05rem; margin-bottom: .15rem; }
  .home-path-arrow { color: var(--straw); font-size: 1.2rem; opacity: .7; flex-shrink: 0; }
  .home-confirm-delete { background: rgba(139,58,58,.2); border: 1px solid rgba(196,102,74,.35); border-radius: 2px; padding: .65rem 1rem; margin-top: .35rem; animation: fadeIn .15s ease; }
  .home-confirm-delete p { font-size: .83rem; color: var(--parchment); margin-bottom: .5rem; }
  .home-confirm-btns { display: flex; gap: .5rem; }
  .home-confirm-delete-btn { background: rgba(196,102,74,.3); border: 1px solid rgba(196,102,74,.5); color: var(--bloom); padding: .35rem .85rem; font-family: 'Crimson Pro', serif; font-size: .83rem; border-radius: 2px; cursor: pointer; }
  .home-confirm-delete-btn:hover { background: rgba(196,102,74,.5); }
  .home-confirm-cancel-btn { background: none; border: 1px solid rgba(200,169,110,.2); color: var(--sage); padding: .35rem .85rem; font-family: 'Crimson Pro', serif; font-size: .83rem; border-radius: 2px; cursor: pointer; }
`;

// ─── Garden picker row ────────────────────────────────────────────────────────
function GardenPickerRow({ garden, isSelected, onSelect, onRename, onDelete }) {
  const [renaming, setRenaming]       = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRenameSubmit = () => {
    const trimmed = renameDraft.trim();
    if (trimmed) onRename(garden.id, trimmed);
    setRenaming(false);
  };

  const plantCount = garden.plants
    ? Object.values(garden.plants).flat().length
    : 0;

  return (
    <div>
      <div className={`home-picker-row${isSelected ? ' selected' : ''}`}>
        <button
          className="home-picker-btn"
          onClick={() => onSelect(garden.id)}
          type="button"
          aria-pressed={isSelected}
        >
          <span className="home-picker-name">{garden.name || garden.city}</span>
          {garden.name !== garden.city && garden.city && (
            <span className="home-picker-meta">{garden.city}</span>
          )}
          {plantCount > 0 && (
            <span className="home-picker-meta">· {plantCount} plants</span>
          )}
        </button>
        <div className="home-picker-actions">
          <button
            className="home-picker-action"
            title="Rename"
            type="button"
            onClick={() => {
              setRenameDraft(garden.name || garden.city || '');
              setRenaming(r => !r);
              setConfirmDelete(false);
            }}
          >
            ✎
          </button>
          <button
            className="home-picker-action danger"
            title="Delete"
            type="button"
            onClick={() => {
              setConfirmDelete(d => !d);
              setRenaming(false);
            }}
          >
            ×
          </button>
        </div>
      </div>

      {renaming && (
        <div className="home-rename-row">
          <input
            className="home-rename-input"
            value={renameDraft}
            onChange={e => setRenameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setRenaming(false);
            }}
            placeholder="Garden name…"
            autoFocus
            maxLength={60}
          />
          <button className="home-rename-save" type="button" onClick={handleRenameSubmit}>Save</button>
          <button className="home-rename-cancel" type="button" onClick={() => setRenaming(false)}>Cancel</button>
        </div>
      )}

      {confirmDelete && (
        <div className="home-confirm-delete">
          <p>Remove <strong>{garden.name || garden.city}</strong> from your saved gardens?</p>
          <div className="home-confirm-btns">
            <button className="home-confirm-delete-btn" type="button" onClick={() => { onDelete(garden.id); setConfirmDelete(false); }}>
              Remove
            </button>
            <button className="home-confirm-cancel-btn" type="button" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
export function HomeScreen({
  gardens,
  selectedId,
  onSelectGarden,
  onCreateEdit,
  onCreateNew,
  onRenameGarden,
  onDeleteGarden,
}) {
  const selected = gardens.find(g => g.id === selectedId) || gardens[0] || null;

  return (
    <div className="home-screen">
      {/* Garden picker — only shown if more than one saved garden */}
      {gardens.length > 1 && (
        <div className="home-garden-picker">
          <div className="home-picker-label">Your saved gardens</div>
          <div className="home-picker-list">
            {gardens.map(g => (
              <GardenPickerRow
                key={g.id}
                garden={g}
                isSelected={g.id === (selectedId || gardens[0]?.id)}
                onSelect={onSelectGarden}
                onRename={onRenameGarden}
                onDelete={onDeleteGarden}
              />
            ))}
          </div>
        </div>
      )}

      {/* Single garden — show rename/delete inline without the picker list */}
      {gardens.length === 1 && (
        <div className="home-garden-picker">
          <div className="home-picker-label">Your saved garden</div>
          <div className="home-picker-list">
            <GardenPickerRow
              garden={gardens[0]}
              isSelected={true}
              onSelect={onSelectGarden}
              onRename={onRenameGarden}
              onDelete={onDeleteGarden}
            />
          </div>
        </div>
      )}

      {/* Path buttons */}
      <div className="home-paths">
    <button
      className="home-path-secondary"
      type="button"
      onClick={onCreateNew}
    >
    <div>
    <div className="home-path-label">+ Create new garden</div>
    <div className="home-path-sub">Start fresh with a new location</div>
  </div>
  <span className="home-path-arrow">›</span>
</button>
        {/* Path 2 — Create or edit (always visible, this is the main existing flow) */}
        <button
          className="home-path-secondary"
          type="button"
          onClick={onCreateEdit}
        >
          <div>
            <div className="home-path-label">
              {selected ? `✎ Edit ${selected.name || selected.city}` : '✎ Create or edit my garden'}
            </div>
            <div className="home-path-sub">
              {selected
                ? 'Update plants, features or location'
                : 'Set up a new garden and generate your calendar'}
            </div>
          </div>
          <span className="home-path-arrow">›</span>
        </button>

        {/*
          Path 1 — Today view (Sprint 2–3): hidden until feature exists
          Path 3 — Improving my garden (Sprint 4–7): hidden until feature exists
          Per product decision: stubs hidden, not disabled.
        */}
      </div>
    </div>
  );
}
