import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamResearch } from './lib/stream.js';

const SECTION_ORDER = ['overview', 'leadership', 'traction', 'financials', 'landscape', 'risks', 'signals'];
const SECTION_TITLE = {
  overview: 'What They Do',
  leadership: 'Leadership',
  traction: 'Traction & Funding',
  financials: 'Financials & Stock',
  landscape: 'Competitive Landscape',
  risks: 'Risks & Red Flags',
  signals: 'Recent Developments',
};
const VITALS_FIELDS = [
  ['ceo', 'CEO'],
  ['founded', 'Founded'],
  ['headquarters', 'HQ'],
  ['employees', 'Employees'],
  ['sector', 'Sector'],
  ['ticker', 'Ticker'],
  ['marketCap', 'Market Cap'],
  ['valuation', 'Valuation'],
  ['website', 'Website'],
];
const EXAMPLES = ['Stripe', 'Anthropic', 'Rivian', 'Perplexity AI', 'Databricks'];
const PHASE_LABEL = { planning: 'INTAKE', searching: 'RECON', analyzing: 'SYNTHESIS', verdict: 'VERDICT', done: 'FILED' };

const initialState = () => ({
  phase: 'idle',
  statusLabel: '',
  demo: null,
  logs: [],
  identity: null,
  vitals: null,
  sources: [],
  sections: {},
  verdict: null,
  error: null,
});

export default function App() {
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState('');
  const [running, setRunning] = useState(false);
  const [s, setS] = useState(initialState);
  const abortRef = useRef(null);

  const onEvent = useCallback((type, data) => {
    setS((prev) => {
      switch (type) {
        case 'mode':
          return { ...prev, demo: !!data.demo };
        case 'status':
          return { ...prev, phase: data.phase, statusLabel: data.label };
        case 'log':
          return { ...prev, logs: [...prev.logs, { ...data, id: Date.now() + Math.random() }].slice(-40) };
        case 'identity':
          return { ...prev, identity: data };
        case 'vitals':
          return { ...prev, vitals: data };
        case 'sources':
          return { ...prev, sources: data };
        case 'section':
          return { ...prev, sections: { ...prev.sections, [data.id]: data } };
        case 'verdict':
          return { ...prev, verdict: data };
        case 'error':
          return { ...prev, phase: 'error', error: data.message };
        default:
          return prev;
      }
    });
  }, []);

  const run = useCallback(
    async (q, { demo = false } = {}) => {
      const target = (q || '').trim();
      if (!target && !demo) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setEntity(target || 'Sample subject');
      setRunning(true);
      setS({ ...initialState(), phase: 'planning', statusLabel: 'Opening case file' });

      try {
        await streamResearch({ query: target, demo }, onEvent, ctrl.signal);
      } catch (err) {
        if (err.name !== 'AbortError') setS((p) => ({ ...p, phase: 'error', error: err.message }));
      } finally {
        setRunning(false);
      }
    },
    [onEvent]
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const sourceMap = useMemo(() => {
    const m = new Map();
    for (const src of s.sources) m.set(src.id, src);
    return m;
  }, [s.sources]);

  const opened = s.phase !== 'idle';

  return (
    <div className="desk">
      <Masthead started={opened} demo={s.demo} />
      {!opened ? (
        <Intake
          query={query}
          setQuery={setQuery}
          onOpen={() => run(query)}
          onExample={(ex) => {
            setQuery(ex);
            run(ex);
          }}
          onSample={() => run('', { demo: true })}
        />
      ) : (
        <Report
          entity={entity}
          state={s}
          running={running}
          sourceMap={sourceMap}
          query={query}
          setQuery={setQuery}
          onRun={() => run(query)}
          onReset={() => {
            abortRef.current?.abort();
            setRunning(false);
            setS(initialState());
            setQuery('');
            setEntity('');
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Masthead ───────────────────────── */
function Masthead({ started, demo }) {
  return (
    <header className="masthead">
      <div className="mast-brand">
        <Crosshair />
        <span className="mast-word">RECON</span>
        <span className="mast-unit">Field Intelligence</span>
      </div>
      <div className="mast-right">
        {started && demo != null && (
          <span className={`mode ${demo ? 'demo' : 'live'}`}>{demo ? 'SAMPLE' : 'LIVE'}</span>
        )}
      </div>
    </header>
  );
}

function Crosshair() {
  return (
    <svg className="crosshair" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="1.5" x2="12" y2="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="18" x2="12" y2="22.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <line x1="18" y1="12" x2="22.5" y2="12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

/* ───────────────────────── Intake ─────────────────────────── */
function Intake({ query, setQuery, onOpen, onExample, onSample }) {
  return (
    <main className="intake">
      <Reticle />
      <div className="intake-inner">
        <div className="intake-eyebrow">
          <span className="lbl">Open-Source Intelligence</span>
          <span className="lbl">File No. {fileNo(query || 'RECON')}</span>
        </div>

        <h1 className="intake-title">
          <span className="reveal-line" style={{ '--d': '0.15s' }}>
            Name a target.
          </span>
          <span className="reveal-line accent" style={{ '--d': '0.5s' }}>
            Get the file.
          </span>
        </h1>
        <p className="intake-lede">An AI analyst assembles a cited dossier on any company — in seconds.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOpen();
          }}
        >
          <span className="lbl subject-label">Subject</span>
          <div className="subject-row">
            <input
              autoFocus
              className="subject-input"
              placeholder="Company, product, or ticker"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="open-btn" type="submit" disabled={!query.trim()}>
              OPEN FILE →
            </button>
          </div>
        </form>

        <div className="recent">
          <FilesDropdown onPick={onExample} onSample={onSample} />
        </div>
      </div>
    </main>
  );
}

function FilesDropdown({ onPick, onSample }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="lbl">Prior files</span>
        <span className="dropdown-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="dropdown-menu" role="listbox">
          {EXAMPLES.map((ex) => (
            <li key={ex} role="option">
              <button
                className="dropdown-item"
                onClick={() => {
                  setOpen(false);
                  onPick(ex);
                }}
              >
                <span className="dropdown-item-name">{ex}</span>
                <span className="dropdown-item-meta">{fileNo(ex)}</span>
              </button>
            </li>
          ))}
          <li role="option" className="dropdown-sep">
            <button
              className="dropdown-item sample"
              onClick={() => {
                setOpen(false);
                onSample();
              }}
            >
              <span className="dropdown-item-name">▶ Sample file</span>
              <span className="dropdown-item-meta">demo</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function Reticle() {
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg className="reticle" viewBox="0 0 200 200" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="100" cy="100" r="96" strokeWidth="1" />
      <circle cx="100" cy="100" r="70" strokeWidth="1" />
      <circle cx="100" cy="100" r="44" strokeWidth="1" />
      <circle cx="100" cy="100" r="2.5" fill="currentColor" stroke="none" />
      <line x1="100" y1="2" x2="100" y2="28" strokeWidth="1" />
      <line x1="100" y1="172" x2="100" y2="198" strokeWidth="1" />
      <line x1="2" y1="100" x2="28" y2="100" strokeWidth="1" />
      <line x1="172" y1="100" x2="198" y2="100" strokeWidth="1" />
      <line x1="100" y1="54" x2="100" y2="146" strokeWidth="0.6" />
      <line x1="54" y1="100" x2="146" y2="100" strokeWidth="0.6" />
      {ticks.map((deg) => (
        <line key={deg} x1="100" y1="4" x2="100" y2="12" strokeWidth="1" transform={`rotate(${deg} 100 100)`} />
      ))}
      <line className="sweep" x1="100" y1="100" x2="196" y2="100" strokeWidth="1" />
    </svg>
  );
}

/* ───────────────────────── Report ─────────────────────────── */
function Report({ entity, state, running, sourceMap, query, setQuery, onRun, onReset }) {
  const active = ['searching', 'analyzing', 'verdict', 'done'].includes(state.phase);
  const done = state.phase === 'done';
  const latest = state.logs[state.logs.length - 1];

  return (
    <main className="report">
      <form
        className="reassign"
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <input
          className="reassign-input"
          placeholder="Open a file on another target…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="reassign-btn" type="submit" disabled={running || !query.trim()}>
          OPEN
        </button>
        <button type="button" className="reassign-ghost" onClick={onReset}>
          CLOSE
        </button>
      </form>

      <div className="status">
        <span className="status-phase">{PHASE_LABEL[state.phase] || ''}</span>
        {running ? (
          <span className="status-msg">
            {latest ? latest.text : state.statusLabel}
            <span className="caret"> ▍</span>
          </span>
        ) : (
          <span className="status-done">{done ? 'File closed · dossier complete' : ''}</span>
        )}
      </div>

      {state.error && <div className="notice err">Transmission error — {state.error}</div>}
      {state.demo && (
        <div className="notice">
          Sample file — a scripted demonstration. Add free Groq + Tavily keys to <code>.env</code> for live reconnaissance on any target.
        </div>
      )}

      <FileHead entity={entity} identity={state.identity} sources={state.sources} done={done} />
      <Vitals vitals={state.vitals} />
      <Assessment verdict={state.verdict} active={active} />

      {SECTION_ORDER.map((id, i) =>
        state.sections[id] ? (
          <Entry key={id} n={i + 1} section={state.sections[id]} sourceMap={sourceMap} />
        ) : active ? (
          <PendingEntry key={id} n={i + 1} title={SECTION_TITLE[id]} />
        ) : null
      )}

      {(state.sources.length > 0 || active) && (
        <section className="refs">
          <div className="refs-head">
            <span className="lbl">References</span>
            <span className="lbl">{state.sources.length} exhibits</span>
          </div>
          {state.sources.length === 0 ? (
            <div className="refs-empty">Collecting…</div>
          ) : (
            <ol className="refs-list">
              {state.sources.map((src) => (
                <li key={src.id} className="ref">
                  <span className="ref-id">[{src.id}]</span>
                  <a className="ref-link" href={src.url} target="_blank" rel="noreferrer">
                    <div className="ref-title">{src.title}</div>
                    <div className="ref-domain">{src.domain}</div>
                  </a>
                </li>
              ))}
            </ol>
          )}
          {done && (
            <button className="export" onClick={() => window.print()}>
              ⎙ Export file (PDF)
            </button>
          )}
        </section>
      )}
    </main>
  );
}

function FileHead({ entity, identity, sources, done }) {
  return (
    <header className="filehead">
      <div className="filehead-top">
        <span className="lbl">Intelligence Dossier</span>
        <span className="lbl">File No. {fileNo(identity?.name || entity)}</span>
      </div>
      <h2 className="fh-subject">{identity?.name || entity}</h2>
      {identity?.type && identity.type !== 'unknown' && <div className="fh-type">{identity.type}</div>}
      {identity?.summary && <p className="fh-summary">{identity.summary}</p>}
      <div className="fh-meta">
        <div>
          Exhibits
          <b>{sources.length}</b>
        </div>
        <div>
          Status
          <b>{done ? 'Complete' : 'Assembling'}</b>
        </div>
        <div>
          Filed
          <b>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })}</b>
        </div>
      </div>
    </header>
  );
}

function Vitals({ vitals }) {
  if (!vitals) return null;
  const items = VITALS_FIELDS.filter(([k]) => {
    const v = vitals[k];
    return v && String(v).trim() && String(v).trim().toLowerCase() !== 'unknown' && String(v).trim() !== '—';
  });
  if (items.length === 0) return null;
  return (
    <div className="vitals enter">
      {items.map(([k, label]) => (
        <div className="vital" key={k}>
          <div className="vital-label">{label}</div>
          <div className="vital-value">{vitals[k]}</div>
        </div>
      ))}
    </div>
  );
}

function Assessment({ verdict, active }) {
  if (!verdict) {
    return (
      <div className="assessment">
        <span className="lbl">Analyst Assessment</span>
        <div className="assess-pending">Awaiting synthesis — a verdict is stamped on completion.</div>
        {active && (
          <div className="stamp pending">
            <div className="stamp-top">ASSESSED</div>
            <div className="stamp-num">—</div>
            <div className="stamp-tier">PENDING</div>
          </div>
        )}
      </div>
    );
  }
  const c = verdict.confidence ?? 0;
  const tier = c >= 70 ? 'high' : c >= 40 ? 'mid' : 'low';
  const word = c >= 70 ? 'HIGH' : c >= 40 ? 'MODERATE' : 'LOW';
  return (
    <div className="assessment">
      <span className="lbl">Analyst Assessment</span>
      <p className="assess-text">{verdict.verdict}</p>
      {verdict.rationale && <div className="assess-rationale">{verdict.rationale}</div>}
      <div className={`stamp stamped ${tier}`}>
        <div className="stamp-top">ASSESSED</div>
        <div className="stamp-num">{c}</div>
        <div className="stamp-tier">{word} CONF</div>
      </div>
    </div>
  );
}

function Entry({ n, section, sourceMap }) {
  return (
    <section className="entry enter">
      <div className="entry-head">
        <span className="entry-no">§{String(n).padStart(2, '0')}</span>
        <h3 className="entry-title">{section.title || SECTION_TITLE[section.id]}</h3>
      </div>
      <ul className="findings">
        {section.bullets.map((b, i) => (
          <li key={i} className="finding">
            <span className="reveal">{b.text}</span>
            <Fnotes ids={b.sources} sourceMap={sourceMap} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingEntry({ n, title }) {
  return (
    <section className="entry">
      <div className="entry-head">
        <span className="entry-no">§{String(n).padStart(2, '0')}</span>
        <h3 className="entry-title">{title}</h3>
      </div>
      <div className="redactions">
        <div className="rbar w1" />
        <div className="rbar w2" />
        <div className="rbar w3" />
      </div>
      <div className="pending-note">DECRYPTING SOURCES…</div>
    </section>
  );
}

function Fnotes({ ids, sourceMap }) {
  if (!ids || ids.length === 0) return null;
  return (
    <span className="fnotes">
      {ids.map((id) => {
        const src = sourceMap.get(id);
        return (
          <a
            key={id}
            className="fnote"
            href={src?.url || '#'}
            target="_blank"
            rel="noreferrer"
            title={src ? `${src.title} · ${src.domain}` : `Exhibit ${id}`}
          >
            {id}
          </a>
        );
      })}
    </span>
  );
}

/* ───────────────────────── helpers ────────────────────────── */
function fileNo(str) {
  let h = 0;
  for (const ch of str || 'RECON') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `RC-2026-${(h % 9000) + 1000}`;
}
