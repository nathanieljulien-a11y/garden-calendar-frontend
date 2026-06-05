/**
 * LibraryPanel.jsx — Garden Library UI
 *
 * States:
 *   setup     — first-time model download (shown until markLibrarySetUp())
 *   loading   — model downloading, progress shown
 *   ready     — library operational, shows item list + add form
 *
 * Clockwatcher-tier only — caller is responsible for gating.
 */

import { useState, useEffect, useRef } from 'react';
import { isLibrarySetUp, markLibrarySetUp, getAllItems, getLibraryStats, deleteItem } from './libraryStore.js';
import { loadEmbeddingModel, indexItem, isModelLoaded } from './libraryIndex.js';
import { putItem } from './libraryStore.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now();
}

function isYouTubeUrl(url) {
  return /youtube\.com|youtu\.be/.test(url);
}

async function fetchUrlText(url, proxyBase) {
  // YouTube: fetch transcript via backend endpoint
  if (isYouTubeUrl(url)) {
    const res = await fetch(`${proxyBase}/api/youtube-transcript?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Could not fetch YouTube transcript. The video may not have captions.');
    const data = await res.json();
    return { text: data.transcript, title: data.title || 'YouTube video' };
  }

  // Web article: proxy fetch (backend handles CORS)
  const res = await fetch(`${proxyBase}/api/fetch-url?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Could not fetch this page. If it\'s behind a paywall, paste the text instead.');
  const data = await res.json();
  return { text: data.text, title: data.title || url };
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onSetupComplete }) {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'downloading' | 'done'
  const [progress, setProgress] = useState(null); // { loaded, total, percent }
  const [error, setError] = useState(null);

  async function handleSetup() {
    setPhase('downloading');
    setError(null);
    try {
      await loadEmbeddingModel((info) => {
        if (info.status === 'progress' && info.total) {
          const percent = Math.round((info.loaded / info.total) * 100);
          setProgress({ loaded: info.loaded, total: info.total, percent });
        }
      });
      markLibrarySetUp();
      setPhase('done');
      setTimeout(() => onSetupComplete(), 800);
    } catch (err) {
      setError('Download failed. Check your connection and try again.');
      setPhase('intro');
    }
  }

  return (
    <div style={styles.setupContainer}>
      {phase === 'intro' && (
        <>
          <div style={styles.setupIcon}>🌿</div>
          <h2 style={styles.setupTitle}>Your Garden Library</h2>
          <p style={styles.setupBody}>
            Save your own notes, articles, and inspirations — and your calendar will
            learn from them. When did your wisteria last flower? A garden you want to visit?
            Ideas for more autumn colour? Add them here.
          </p>
          <p style={styles.setupBody}>
            Everything stays on your device. Your library is included in your calendar
            prompts, the same way your plant list and location are used today.
          </p>
          <div style={styles.setupNote}>
            <strong>One-time setup:</strong> We'll download a small AI model (~23MB)
            so your library never needs to leave your browser.
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.primaryButton} onClick={handleSetup}>
            Set up my library
          </button>
        </>
      )}

      {phase === 'downloading' && (
        <>
          <div style={styles.setupIcon}>⬇️</div>
          <h2 style={styles.setupTitle}>Setting up your library</h2>
          <p style={styles.setupBody}>Downloading the AI model — this happens once.</p>
          <div style={styles.progressBarTrack}>
            <div
              style={{
                ...styles.progressBarFill,
                width: `${progress?.percent ?? 0}%`,
              }}
            />
          </div>
          {progress && (
            <p style={styles.progressLabel}>
              {progress.percent}% — {Math.round(progress.loaded / 1024 / 1024)}MB
              {' '}of{' '}
              {Math.round(progress.total / 1024 / 1024)}MB
            </p>
          )}
        </>
      )}

      {phase === 'done' && (
        <>
          <div style={styles.setupIcon}>✓</div>
          <h2 style={styles.setupTitle}>Library ready</h2>
          <p style={styles.setupBody}>Add your first item to get started.</p>
        </>
      )}
    </div>
  );
}

// ─── Add item form ────────────────────────────────────────────────────────────

function AddItemForm({ onItemAdded, proxyBase }) {
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'text'
  const [type, setType] = useState('observation');   // 'observation' | 'inspiration'
  const [urlValue, setUrlValue] = useState('');
  const [textValue, setTextValue] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [status, setStatus] = useState('idle');       // 'idle' | 'fetching' | 'indexing' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  async function handleAdd() {
    setStatus('fetching');
    setErrorMsg('');

    try {
      let rawText = '';
      let sourceUrl = null;
      let sourceTitle = null;
      let sourceType = 'text';

      if (inputMode === 'url') {
        if (!urlValue.trim()) { setErrorMsg('Please enter a URL.'); setStatus('idle'); return; }
        sourceUrl = urlValue.trim();
        sourceType = isYouTubeUrl(sourceUrl) ? 'youtube' : 'url';
        const result = await fetchUrlText(sourceUrl, proxyBase);
        rawText = result.text;
        sourceTitle = result.title;
      } else {
        if (!textValue.trim()) { setErrorMsg('Please paste some text.'); setStatus('idle'); return; }
        rawText = textValue.trim();
        sourceType = 'text';
        sourceTitle = rawText.slice(0, 60) + (rawText.length > 60 ? '…' : '');
      }

      if (rawText.length < 20) {
        setErrorMsg('That content seems too short to be useful.');
        setStatus('idle');
        return;
      }

      const id = generateId();
      const item = {
        id,
        addedAt: Date.now(),
        type,
        sourceType,
        sourceUrl,
        sourceTitle,
        userNote: noteValue.trim() || null,
        raw: rawText,
        status: 'indexing',
      };

      await putItem(item);
      setStatus('indexing');

      const result = await indexItem(id, rawText, type, noteValue.trim() || null);

      if (result.success) {
        setStatus('done');
        setUrlValue('');
        setTextValue('');
        setNoteValue('');
        onItemAdded();
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setErrorMsg('Indexing failed. Please try again.');
        setStatus('error');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  const busy = status === 'fetching' || status === 'indexing';

  return (
    <div style={styles.addForm}>
      <h3 style={styles.sectionTitle}>Add to your library</h3>

      {/* Type selector */}
      <div style={styles.typeSelector}>
        <button
          style={{ ...styles.typeButton, ...(type === 'observation' ? styles.typeButtonActive : {}) }}
          onClick={() => setType('observation')}
        >
          🌱 My observation
        </button>
        <button
          style={{ ...styles.typeButton, ...(type === 'inspiration' ? styles.typeButtonActive : {}) }}
          onClick={() => setType('inspiration')}
        >
          ✨ My inspiration
        </button>
      </div>

      {/* Input mode tabs */}
      <div style={styles.modeTabs}>
        <button
          style={{ ...styles.modeTab, ...(inputMode === 'url' ? styles.modeTabActive : {}) }}
          onClick={() => setInputMode('url')}
        >
          URL
        </button>
        <button
          style={{ ...styles.modeTab, ...(inputMode === 'text' ? styles.modeTabActive : {}) }}
          onClick={() => setInputMode('text')}
        >
          Paste text
        </button>
      </div>

      {inputMode === 'url' ? (
        <div>
          <input
            style={styles.input}
            type="url"
            placeholder="https://... or YouTube link"
            value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            disabled={busy}
          />
          <p style={styles.hint}>
            YouTube links use the video transcript.
            Paywalled articles won't work — paste the text instead.
          </p>
        </div>
      ) : (
        <textarea
          style={styles.textarea}
          placeholder={
            type === 'observation'
              ? 'e.g. "Wisteria flowered late — third week of May. Peony didn\'t flower this year, possibly the late frost in April."'
              : 'e.g. Paste an article, care guide, or garden description...'
          }
          value={textValue}
          onChange={e => setTextValue(e.target.value)}
          disabled={busy}
          rows={5}
        />
      )}

      <input
        style={styles.input}
        type="text"
        placeholder="Optional note (e.g. 'this is about my climbing rose specifically')"
        value={noteValue}
        onChange={e => setNoteValue(e.target.value)}
        disabled={busy}
        maxLength={120}
      />

      {errorMsg && <div style={styles.error}>{errorMsg}</div>}

      <button
        style={{ ...styles.primaryButton, ...(busy ? styles.buttonDisabled : {}) }}
        onClick={handleAdd}
        disabled={busy}
      >
        {status === 'fetching'  ? 'Fetching content…'  :
         status === 'indexing'  ? 'Indexing…'          :
         status === 'done'      ? '✓ Added'            :
         'Add to library'}
      </button>
    </div>
  );
}

// ─── Library item list ────────────────────────────────────────────────────────

function ItemList({ items, onDelete }) {
  if (items.length === 0) {
    return (
      <p style={styles.emptyState}>
        Your library is empty. Add your first observation or inspiration above.
      </p>
    );
  }

  return (
    <div style={styles.itemList}>
      <h3 style={styles.sectionTitle}>Your library ({items.length})</h3>
      {items.sort((a, b) => b.addedAt - a.addedAt).map(item => (
        <div key={item.id} style={styles.itemCard}>
          <div style={styles.itemHeader}>
            <span style={styles.itemTypeBadge}>
              {item.type === 'observation' ? '🌱' : '✨'}
            </span>
            <span style={styles.itemTitle}>{item.sourceTitle || 'Note'}</span>
            <span style={{
              ...styles.statusDot,
              backgroundColor: item.status === 'ready' ? '#4a7c59' : item.status === 'error' ? '#c0392b' : '#e8a838',
            }} />
          </div>
          {item.userNote && (
            <p style={styles.itemNote}>"{item.userNote}"</p>
          )}
          <div style={styles.itemFooter}>
            <span style={styles.itemDate}>
              {new Date(item.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <button style={styles.deleteButton} onClick={() => onDelete(item.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function LibraryPanel({ proxyBase = '', onClose }) {
  const [isSetUp, setIsSetUp] = useState(isLibrarySetUp());
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);

  async function loadItems() {
    const all = await getAllItems();
    setItems(all);
    const s = await getLibraryStats();
    setStats(s);
  }

  useEffect(() => {
    if (isSetUp) loadItems();
  }, [isSetUp]);

  async function handleDelete(id) {
    await deleteItem(id);
    loadItems();
  }

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h2 style={styles.panelTitle}>Garden Library</h2>
        {onClose && (
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        )}
      </div>

      {!isSetUp ? (
        <SetupScreen onSetupComplete={() => setIsSetUp(true)} />
      ) : (
        <div style={styles.panelBody}>
          {stats && stats.itemCount > 0 && (
            <div style={styles.statsBar}>
              {stats.readyCount} item{stats.readyCount !== 1 ? 's' : ''} indexed
              {stats.indexingCount > 0 && ` · ${stats.indexingCount} indexing`}
              {stats.errorCount > 0 && ` · ${stats.errorCount} failed`}
            </div>
          )}

          <AddItemForm
            onItemAdded={loadItems}
            proxyBase={proxyBase}
          />

          <ItemList
            items={items}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Inline styles consistent with the app's existing aesthetic.
// Uses the app's green palette (#4a7c59 primary, #f5f0e8 background).

const styles = {
  panel: {
    backgroundColor: '#f5f0e8',
    minHeight: '100%',
    fontFamily: "'Georgia', serif",
    color: '#2c3e2d',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px 12px',
    borderBottom: '1px solid #d4c9b0',
    backgroundColor: '#fff',
  },
  panelTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#2c3e2d',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#666',
    padding: '4px 8px',
  },
  panelBody: {
    padding: '16px 20px',
  },
  statsBar: {
    fontSize: '13px',
    color: '#4a7c59',
    fontStyle: 'italic',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: '#e8f0e9',
    borderRadius: '6px',
  },

  // Setup screen
  setupContainer: {
    padding: '32px 24px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '0 auto',
  },
  setupIcon: {
    fontSize: '40px',
    marginBottom: '16px',
  },
  setupTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2c3e2d',
    margin: '0 0 12px',
  },
  setupBody: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#4a4a3a',
    margin: '0 0 12px',
  },
  setupNote: {
    fontSize: '13px',
    padding: '10px 14px',
    backgroundColor: '#e8f0e9',
    borderRadius: '6px',
    color: '#3a5a42',
    marginBottom: '20px',
    textAlign: 'left',
  },
  progressBarTrack: {
    height: '8px',
    backgroundColor: '#d4c9b0',
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '16px 0 8px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4a7c59',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '12px',
    color: '#666',
    margin: 0,
  },

  // Add form
  addForm: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#2c3e2d',
    margin: '0 0 12px',
  },
  typeSelector: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  typeButton: {
    flex: 1,
    padding: '10px 8px',
    border: '1.5px solid #d4c9b0',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#4a4a3a',
    fontFamily: "'Georgia', serif",
    transition: 'all 0.15s ease',
  },
  typeButtonActive: {
    borderColor: '#4a7c59',
    backgroundColor: '#e8f0e9',
    color: '#2c3e2d',
    fontWeight: '600',
  },
  modeTabs: {
    display: 'flex',
    marginBottom: '10px',
    borderBottom: '1.5px solid #d4c9b0',
  },
  modeTab: {
    background: 'none',
    border: 'none',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#888',
    fontFamily: "'Georgia', serif",
    borderBottom: '2px solid transparent',
    marginBottom: '-1.5px',
  },
  modeTabActive: {
    color: '#4a7c59',
    borderBottomColor: '#4a7c59',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #d4c9b0',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: "'Georgia', serif",
    backgroundColor: '#fff',
    color: '#2c3e2d',
    marginBottom: '10px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1.5px solid #d4c9b0',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: "'Georgia', serif",
    backgroundColor: '#fff',
    color: '#2c3e2d',
    marginBottom: '10px',
    resize: 'vertical',
    boxSizing: 'border-box',
    lineHeight: '1.5',
  },
  hint: {
    fontSize: '12px',
    color: '#888',
    margin: '-4px 0 10px',
    fontStyle: 'italic',
  },
  primaryButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#4a7c59',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: "'Georgia', serif",
    transition: 'background-color 0.15s ease',
  },
  buttonDisabled: {
    backgroundColor: '#9ab5a0',
    cursor: 'not-allowed',
  },
  error: {
    fontSize: '13px',
    color: '#c0392b',
    padding: '8px 10px',
    backgroundColor: '#fdecea',
    borderRadius: '6px',
    marginBottom: '10px',
  },

  // Item list
  emptyState: {
    fontSize: '14px',
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '24px 0',
  },
  itemList: {
    marginTop: '8px',
  },
  itemCard: {
    backgroundColor: '#fff',
    border: '1px solid #d4c9b0',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '10px',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  itemTypeBadge: {
    fontSize: '14px',
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#2c3e2d',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  itemNote: {
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic',
    margin: '4px 0',
  },
  itemFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
  },
  itemDate: {
    fontSize: '11px',
    color: '#999',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    color: '#c0392b',
    cursor: 'pointer',
    padding: '2px 0',
    fontFamily: "'Georgia', serif",
  },
};
