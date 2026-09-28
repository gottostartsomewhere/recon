import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { streamResearch } from './lib/stream.js';
import Landing from './Landing.jsx';

// What the user is about to do. Mirrors server/intents.js, which decides the
// questions each one asks.
const INTENTS = [
  ['client', 'Take them on as a client'],
  ['vendor', 'Hire them as a vendor'],
  ['partner', 'Partner with them'],
  ['employer', 'Accept their job offer'],
  ['general', 'Just look them up'],
];
const INTENT_LABEL = Object.fromEntries(INTENTS);

const VITALS_FIELDS = [
  ['legalName', 'Legal name'],
  ['registration', 'Registration'],
  ['ceo', 'CEO'],
  ['founded', 'Founded'],
  ['headquarters', 'HQ'],
  ['employees', 'Employees'],
  ['sector', 'Sector'],
  ['ticker', 'Listing'],
  ['website', 'Website'],
];
const EXAMPLES = [
  ['Crossover', 'employer'],
  ['Toptal', 'vendor'],
  ['Turing', 'employer'],
  ['Stripe', 'partner'],
  ['Notion', 'general'],
];
const PHASE_LABEL = {
  planning: 'INTAKE',
  searching: 'RECON',
  analyzing: 'DRAFTING',
  verifying: 'CROSS-EXAM',
  verdict: 'VERDICT',
  done: 'FILED',
};
const DECISION = { proceed: 'PROCEED', caution: 'CAUTION', stop: 'STOP' };
const DECISION_TONE = { proceed: 'high', caution: 'mid', stop: 'low' };
const STRUCK_AS = { unsupported: 'Unsupported', wrong_entity: 'Wrong entity' };

const isStruck = (b) => b.ruling === 'unsupported' || b.ruling === 'wrong_entity';

const initialState = () => ({
  phase: 'idle',
  statusLabel: '',
  demo: null,
  demoReason: null,
  logs: [],
  plan: null,
  identity: null,
  vitals: null,
  sources: [],
  sections: {},
  verdict: null,
  cost: null,
  startedAt: 0,
  elapsed: 0,
  error: null,
});

export default function App() {
  const [query, setQuery] = useState('');
  const [intent, setIntent] = useState('client');
  const [entity, setEntity] = useState('');
  const [running, setRunning] = useState(false);
  const [s, setS] = useState(initialState);
  const abortRef = useRef(null);
  const intakeInputRef = useRef(null);

  const onEvent = useCallback((type, data) => {
    setS((prev) => {
      switch (type) {
        case 'mode':
          return { ...prev, demo: !!data.demo, demoReason: data.reason || null };
        case 'status':
          return {
            ...prev,
            phase: data.phase,
            statusLabel: data.label,
            elapsed: data.phase === 'done' ? Date.now() - prev.startedAt : prev.elapsed,
          };
        case 'log':
          return { ...prev, logs: [...prev.logs, { ...data, id: Date.now() + Math.random() }].slice(-40) };
        case 'plan':
          return { ...prev, plan: data };
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
        case 'cost':
          return { ...prev, cost: data };
        case 'error':
          return { ...prev, phase: 'error', error: data.message };
        default:
          return prev;
      }
    });
  }, []);

  const run = useCallback(
    async (q, { demo = false, as = intent } = {}) => {
      const target = (q || '').trim();
      if (!target && !demo) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setEntity(target || 'Sample subject');
      setRunning(true);
      setS({ ...initialState(), phase: 'planning', statusLabel: 'Opening case file', startedAt: Date.now() });

      try {
        await streamResearch({ query: target, demo, intent: as }, onEvent, ctrl.signal);
      } catch (err) {
        if (err.name !== 'AbortError') setS((p) => ({ ...p, phase: 'error', error: err.message }));
      } finally {
        setRunning(false);
      }
    },
    [onEvent, intent]
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const sourceMap = useMemo(() => {
    const m = new Map();
    for (const src of s.sources) m.set(src.id, src);
    return m;
  }, [s.sources]);

  const opened = s.phase !== 'idle';

  /* Landing CTA: put the cursor back in the intake field without the focus
     call yanking the page up before the smooth scroll can run. */
  const focusIntake = useCallback(() => {
    intakeInputRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const pick = useCallback(
    ([name, as]) => {
      setQuery(name);
      setIntent(as);
      run(name, { as });
    },
    [run]
  );

  return (
    <div className="desk">
      <Masthead started={opened} demo={s.demo} />
      {!opened ? (
        <>
          <Intake
            query={query}
            setQuery={setQuery}
            intent={intent}
            setIntent={setIntent}
            inputRef={intakeInputRef}
            onOpen={() => run(query)}
            onExample={pick}
            onSample={() => run('', { demo: true })}
          />
          <Landing onStart={focusIntake} onSample={() => run('', { demo: true })} />
        </>
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
        <span className="mast-unit">Counterparty Intelligence</span>
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
function Intake({ query, setQuery, intent, setIntent, inputRef, onOpen, onExample, onSample }) {
  return (
    <main className="intake">
      <Reticle />
      <div className="intake-inner">
        <div className="intake-eyebrow">
          <span className="lbl">Counterparty Check</span>
          <span className="lbl">File No. {fileNo(query || 'RECON')}</span>
        </div>

        <h1 className="intake-title">
          <span className="reveal-line" style={{ '--d': '0.15s' }}>
            Name the other party.
          </span>
          <span className="reveal-line accent" style={{ '--d': '0.5s' }}>
            Get the file.
          </span>
        </h1>
        <p className="intake-lede">
          Before you sign, pay, partner or accept an offer, an AI investigator checks who you are dealing with,
          then cross-examines every claim it files.
        </p>

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
              ref={inputRef}
              className="subject-input"
              placeholder="Company or organisation"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="open-btn" type="submit" disabled={!query.trim()}>
              OPEN FILE →
            </button>
          </div>

          <fieldset className="intent">
            <legend className="lbl intent-legend">I am about to</legend>
            <div className="intent-opts">
              {INTENTS.map(([id, label]) => (
                <label key={id} className={`intent-opt${intent === id ? ' on' : ''}`}>
                  <input type="radio" name="intent" value={id} checked={intent === id} onChange={() => setIntent(id)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </form>

        <div className="recent">
          <FilesDropdown onPick={onExample} onSample={onSample} />
        </div>
      </div>

      <div className="scroll-cue" aria-hidden="true">
        <span>How it works</span>
        <i />
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
            <li key={ex[0]} role="option">
              <button
                className="dropdown-item"
                onClick={() => {
                  setOpen(false);
                  onPick(ex);
                }}
              >
                <span className="dropdown-item-name">{ex[0]}</span>
                <span className="dropdown-item-meta">{INTENT_LABEL[ex[1]]}</span>
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
              <span className="dropdown-item-meta">recorded run</span>
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
  const active = ['searching', 'analyzing', 'verifying', 'verdict', 'done'].includes(state.phase);
  const done = state.phase === 'done';
  const latest = state.logs[state.logs.length - 1];
  const kept = state.sources.filter((src) => !src.offTarget);
  const setAside = state.sources.filter((src) => src.offTarget);
  const order = state.plan?.sections || Object.values(state.sections).map(({ id, title }) => ({ id, title }));

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
          placeholder="Check another party…"
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
          <span className="status-done">{done ? 'File closed · every claim cross-examined' : ''}</span>
        )}
      </div>

      {state.error && <div className="notice err">Transmission error: {state.error}</div>}
      {state.demo && <SampleNotice reason={state.demoReason} />}

      <FileHead entity={entity} plan={state.plan} identity={state.identity} kept={kept.length} setAside={setAside.length} done={done} />
      <Vitals vitals={state.vitals} identity={state.identity} />
      <Assessment verdict={state.verdict} active={active} sourceMap={sourceMap} />

      {order.map((sec, i) =>
        state.sections[sec.id] ? (
          <Entry key={sec.id} n={i + 1} section={state.sections[sec.id]} sourceMap={sourceMap} />
        ) : active ? (
          <PendingEntry key={sec.id} n={i + 1} title={sec.title} />
        ) : null
      )}

      {(state.sources.length > 0 || active) && (
        <section className="refs">
          <div className="refs-head">
            <span className="lbl">References</span>
            <span className="lbl">{kept.length} exhibits</span>
          </div>
          {kept.length === 0 ? (
            <div className="refs-empty">Collecting…</div>
          ) : (
            <ol className="refs-list">
              {kept.map((src) => (
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

          {setAside.length > 0 && (
            <details className="aside">
              <summary>
                <span className="lbl">Set aside</span>
                <span className="aside-count">
                  {setAside.length} exhibit{setAside.length === 1 ? '' : 's'} about other organisations
                </span>
              </summary>
              <ol className="aside-list">
                {setAside.map((src) => (
                  <li key={src.id} className="ref">
                    <span className="ref-id">[{src.id}]</span>
                    <a className="ref-link" href={src.url} target="_blank" rel="noreferrer">
                      <div className="ref-title">{src.title}</div>
                      <div className="ref-domain">{src.about ? `about: ${src.about}` : src.domain}</div>
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {done && state.cost && <CostLine cost={state.cost} elapsed={state.elapsed} demo={state.demo} />}
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

// Why a sample is showing instead of a live check.
function SampleNotice({ reason }) {
  if (reason === 'daily-cap' || reason === 'ip-cap') {
    return (
      <div className="notice">
        {reason === 'daily-cap'
          ? "Today's live checks are used up, since each one runs on paid Nemotron inference."
          : "You've used this connection's live checks for today, since each one runs on paid Nemotron inference."}{' '}
        This is a recorded live check instead. The quota resets at 00:00 UTC.
      </div>
    );
  }
  if (reason === 'missing-keys') {
    return (
      <div className="notice">
        Sample file: a recorded live check, replayed. Add Nebius Token Factory and Tavily keys to <code>.env</code> to
        check any party.
      </div>
    );
  }
  return <div className="notice">Sample file: a recorded live check, replayed. Name any party above to run a live one.</div>;
}

function FileHead({ entity, plan, identity, kept, setAside, done }) {
  return (
    <header className="filehead">
      <div className="filehead-top">
        <span className="lbl">
          Counterparty Check{plan ? ` · ${INTENT_LABEL[plan.intent] || plan.label}` : ''}
        </span>
        <span className="lbl">File No. {fileNo(identity?.name || entity)}</span>
      </div>
      <h2 className="fh-subject">{identity?.name || entity}</h2>
      {identity?.type && identity.type !== 'unknown' && <div className="fh-type">{identity.type}</div>}
      {identity?.summary && <p className="fh-summary">{identity.summary}</p>}
      {identity?.lookalikes?.length > 0 && (
        <p className="fh-not">
          <span className="lbl">Not to be confused with</span>
          {identity.lookalikes.join(' · ')}
        </p>
      )}
      <div className="fh-meta">
        <div>
          Exhibits
          <b>{kept}</b>
        </div>
        {setAside > 0 && (
          <div>
            Set aside
            <b>{setAside}</b>
          </div>
        )}
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

function Vitals({ vitals, identity }) {
  if (!vitals) return null;
  const known = (v) => v && String(v).trim() && !['unknown', '—', ''].includes(String(v).trim().toLowerCase());
  const items = VITALS_FIELDS.filter(([k]) => {
    if (!known(vitals[k])) return false;
    // A legal name identical to the file heading adds nothing.
    return !(k === 'legalName' && String(vitals[k]).toLowerCase() === String(identity?.name || '').toLowerCase());
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

function Assessment({ verdict, active, sourceMap }) {
  if (!verdict) {
    return (
      <div className="assessment">
        <span className="lbl">Decision</span>
        <div className="assess-pending">Awaiting cross-examination. A decision is stamped once every claim has been ruled on.</div>
        {active && (
          <div className="stamp pending">
            <div className="stamp-top">ASSESSED</div>
            <div className="stamp-word">—</div>
            <div className="stamp-tier">PENDING</div>
          </div>
        )}
      </div>
    );
  }
  const decision = DECISION[verdict.decision] ? verdict.decision : 'caution';
  return (
    <div className="assessment">
      <span className="lbl">Decision</span>
      <p className="assess-text">{verdict.verdict}</p>
      <div className={`stamp stamped ${DECISION_TONE[decision]}`}>
        <div className="stamp-top">ASSESSED</div>
        <div className="stamp-word">{DECISION[decision]}</div>
        <div className="stamp-tier">CONF {verdict.confidence ?? '—'}</div>
      </div>

      {verdict.basis && <Tally basis={verdict.basis} />}

      {verdict.redFlags?.length > 0 && (
        <div className="flags">
          <span className="lbl">Red flags</span>
          <ul>
            {verdict.redFlags.map((f, i) => (
              <li key={i}>
                {f.text}
                <Fnotes ids={f.sources} sourceMap={sourceMap} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {verdict.askThem?.length > 0 && (
        <div className="asks">
          <span className="lbl">Before you go ahead, ask them</span>
          <ol>
            {verdict.askThem.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// The confidence number, shown as the counts it is computed from, so a reader
// can audit the stamp instead of trusting it.
function Tally({ basis }) {
  const items = [
    ['Claims', basis.claims],
    ['Held', basis.supported],
    ['Corrected', basis.overstated],
    ['Struck', basis.struck, basis.struck > 0],
    ['Questions answered', `${basis.covered}/${basis.sections}`],
    ['Independent sites', basis.domains],
  ];
  return (
    <div className="tally-wrap">
      <dl className="tally">
        {items.map(([k, v, bad]) => (
          <div key={k} className={`tally-i${bad ? ' bad' : ''}`}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="tally-note">
        Confidence is computed from these counts: the share of claims that held, the questions with evidence, and how
        many independent sites stand behind them. The model never grades itself.
      </p>
    </div>
  );
}

function Entry({ n, section, sourceMap }) {
  const ruled = section.bullets.filter((b) => b.ruling);
  const held = ruled.filter((b) => b.ruling === 'supported').length;
  const corrected = ruled.filter((b) => b.ruling === 'overstated').length;
  const struck = ruled.filter(isStruck).length;
  const tally = section.examined
    ? [ruled.length ? `${held} held` : '', corrected ? `${corrected} corrected` : '', struck ? `${struck} struck` : '']
        .filter(Boolean)
        .join(' · ')
    : 'awaiting cross-exam';

  return (
    <section className="entry enter">
      <div className="entry-head">
        <span className="entry-no">§{String(n).padStart(2, '0')}</span>
        <h3 className="entry-title">{section.title}</h3>
        <span className={`entry-tally${section.examined ? '' : ' wait'}`}>{tally}</span>
      </div>
      <ul className="findings">
        {section.bullets.map((b, i) => (
          <Finding key={i} b={b} sourceMap={sourceMap} />
        ))}
      </ul>
    </section>
  );
}

function Finding({ b, sourceMap }) {
  const [open, setOpen] = useState(false);
  if (b.meta) return <li className="finding meta">{b.text}</li>;

  const state = !b.ruling ? 'draft' : isStruck(b) ? 'struck' : b.ruling === 'overstated' ? 'corrected' : 'held';
  return (
    <li className={`finding ${state}`}>
      <span className="reveal">
        <span className="claim">{b.text}</span>
      </span>
      <Fnotes ids={b.sources} sourceMap={sourceMap} />
      {state === 'held' && (
        <span className="mark held" title="Held up under cross-examination">
          ✓
        </span>
      )}
      {state === 'corrected' && (
        <button type="button" className="mark corrected" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Corrected {open ? '▴' : '▾'}
        </button>
      )}
      {state === 'struck' && <span className="mark struck">Struck · {STRUCK_AS[b.ruling]}</span>}
      {(state === 'struck' || (state === 'corrected' && open)) && (
        <div className="ruling-note">
          {state === 'corrected' && b.original && (
            <div className="was">
              Filed as: <s>{b.original}</s>
            </div>
          )}
          {b.reason && <div className="why">{b.reason}</div>}
        </div>
      )}
    </li>
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

function CostLine({ cost, elapsed, demo }) {
  const rank = ['Nano', 'Lightning', 'Super', 'Ultra'];
  const tiers = Object.entries(cost.byModel || {})
    .map(([model, v]) => [modelName(model), v.calls])
    .sort((a, b) => rank.indexOf(a[0]) - rank.indexOf(b[0]))
    .map(([name, calls]) => `${name} ×${calls}`)
    .join(', ');
  return (
    <p className="costline">
      {demo ? 'The recorded run cost' : 'This check cost'} <b>${cost.usd.toFixed(3)}</b> in NVIDIA Nemotron inference on
      Nebius Token Factory ({tiers}) and <b>{cost.tavilyCredits}</b> Tavily credits
      {elapsed > 0 && !demo ? `, in ${Math.round(elapsed / 1000)} s` : ''}.
    </p>
  );
}

/* ───────────────────────── helpers ────────────────────────── */
function modelName(id) {
  const m = String(id).match(/nano|super|ultra|lightning/i);
  return m ? m[0][0].toUpperCase() + m[0].slice(1).toLowerCase() : id;
}

function fileNo(str) {
  let h = 0;
  for (const ch of str || 'RECON') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `RC-2026-${(h % 9000) + 1000}`;
}
