import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useReveal, useScrollProgress, seg, stagger, lerp } from './lib/motion.js';

/* The four phases below are ones the agent actually streams (see PHASE_LABEL
   in App.jsx), so the diagram tracks real work. */
const STAGES = [
  {
    key: 'INTAKE',
    title: 'Intake',
    body: 'Nemotron Super works out which organisation you mean and which are only similarly named. What you are about to do decides the questions.',
    readout: '5–6 questions',
  },
  {
    key: 'RECON',
    title: 'Recon',
    body: 'Super investigates through Tavily: searching, reading whole pages, mapping the company’s own site. Pages about other organisations are set aside.',
    readout: 'up to 10 tool calls',
  },
  {
    key: 'CROSS-EXAM',
    title: 'Cross-exam',
    body: 'Nano drafts each section. Nemotron Ultra then re-reads the page behind every claim and rules: held, corrected, or struck.',
    readout: 'every claim',
  },
  {
    key: 'VERDICT',
    title: 'Verdict',
    body: 'Ultra decides from surviving claims only: proceed, caution or stop, with what to ask them first. Confidence is computed, not self-reported.',
    readout: 'proceed · caution · stop',
  },
];

// One intent's questions (hiring a vendor), as the diagram's example.
const ROWS = ['IDENTITY', 'DELIVERY', 'REPUTATION', 'LEGAL', 'FINANCIAL'];

// Every question any intent can ask.
const SECTION_NAMES = [
  'Identity & Legitimacy',
  'Payment Behaviour',
  'Delivery Track Record',
  'Ownership & Leadership',
  'Track Record with Partners',
  'Recruiting Legitimacy',
  'Life as an Employee',
  'Legal & Regulatory',
  'Financial Health',
  'Reputation & Complaints',
  'Recent Developments',
];

// Doc lines the diagram strikes during cross-examination.
const STRUCK_LINES = [1, 4];

export default function Landing({ onStart, onSample }) {
  return (
    <div className="landing">
      <Problem />
      <Method />
      <Evidence />
      <Marquee />
      <Close onStart={onStart} onSample={onSample} />
    </div>
  );
}

/* ─────────────────────── § 01 The problem ─────────────────────── */

const REDACTED = [
  'You looked up a company and every sentence came with a source.',
  'Half the sources were about a different company with the same name.',
  'Scammers impersonating them became a verdict that they are the scam.',
  'Nothing on the page tells you which claims those are.',
];

function Problem() {
  const ref = useReveal();
  return (
    <section className="lsec" id="problem" ref={ref}>
      <div className="lwrap">
        <SecHead sig="§ 01" title="The problem" />
        <div className="prob-grid">
          <div>
            <h2 className="ldisp l-lg lrise">A citation is not a check.</h2>
            <p className="lprose lrise" style={{ '--d': '0.14s' }}>
              An AI research tool can cite a source for every sentence and still be wrong: the page is
              about a crypto exchange that shares the name, or it says something narrower than the claim
              built on it. Before you sign a contract, pay a vendor or accept an offer, that difference is
              the whole job.
            </p>
          </div>

          <div className="rlines">
            {REDACTED.map((line, i) => (
              <p className="rline" key={line} style={{ '--d': `${0.05 + i * 0.12}s` }}>
                <span className="rl-t">{line}</span>
              </p>
            ))}
            <p className="rline-last lrise" style={{ '--d': '0.72s' }}>
              Every line above happened in testing. Recon now cross-examines every claim.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── § 02 The method ──────────────────────── */

/* Geometry is fixed, so build the path strings once. */
function useDiagramGeometry() {
  return useMemo(() => {
    const TARGET = { x: 66, y: 230 };
    const rows = ROWS.map((label, i) => {
      const y = 70 + i * 80;
      return {
        label,
        y,
        nodeX: 232,
        labelX: 248,
        stackX: 452,
        edgeIn: `M ${TARGET.x} ${TARGET.y} C 140 ${TARGET.y}, 162 ${y}, ${232} ${y}`,
        edgeMid: `M 348 ${y} L 448 ${y}`,
        edgeOut: `M 500 ${y} C 592 ${y}, 624 230, 700 230`,
      };
    });
    return { TARGET, rows, doc: { x: 700, y: 142, w: 168, h: 176 } };
  }, []);
}

function Method() {
  const sectionRef = useRef(null);
  const [stage, setStage] = useState(-1);
  const { TARGET, rows, doc } = useDiagramGeometry();

  const targetRef = useRef(null);
  const edgeInRefs = useRef([]);
  const nodeRefs = useRef([]);
  const edgeMidRefs = useRef([]);
  const stackRefs = useRef([]);
  const edgeOutRefs = useRef([]);
  const docRef = useRef(null);
  const docLineRefs = useRef([]);
  const strikeRefs = useRef([]);
  const stampRef = useRef(null);
  const stampNumRef = useRef(null);
  const progRef = useRef(null);
  const hintRef = useRef(null);

  const draw = useCallback((list, t) => {
    const n = list.current.length;
    for (let i = 0; i < n; i += 1) {
      const el = list.current[i];
      if (el) el.style.strokeDashoffset = String(1 - stagger(t, i, n));
    }
  }, []);

  const show = useCallback((list, t, scale = false) => {
    const n = list.current.length;
    for (let i = 0; i < n; i += 1) {
      const el = list.current[i];
      if (!el) continue;
      const v = stagger(t, i, n);
      el.style.opacity = String(v);
      if (scale) el.style.transform = `scale(${lerp(0.6, 1, v)})`;
    }
  }, []);

  const onProgress = useCallback(
    (p) => {
      const s0 = seg(p, 0.0, 0.26);
      const s1 = seg(p, 0.25, 0.52);
      const s2 = seg(p, 0.51, 0.78);
      const s3 = seg(p, 0.77, 1.0);

      if (targetRef.current) targetRef.current.style.opacity = String(Math.min(1, s0 * 4));
      draw(edgeInRefs, s0);
      show(nodeRefs, s0);

      draw(edgeMidRefs, s1);
      show(stackRefs, s1, true);

      draw(edgeOutRefs, s2);
      if (docRef.current) docRef.current.style.opacity = String(Math.min(1, s2 * 2));
      show(docLineRefs, seg(s2, 0, 0.55));
      // the drafts land first, then the judge strikes two of them
      const strike = seg(s2, 0.6, 1);
      for (const el of strikeRefs.current) {
        if (el) el.style.transform = `scaleX(${strike})`;
      }

      if (stampRef.current) {
        const e = s3 < 0.6 ? s3 / 0.6 : 1;
        const overshoot = s3 < 0.6 ? lerp(2.1, 0.94, e) : lerp(0.94, 1, (s3 - 0.6) / 0.4);
        stampRef.current.style.opacity = String(Math.min(1, s3 * 3));
        stampRef.current.style.transform = `rotate(-5deg) scale(${overshoot})`;
      }
      if (stampNumRef.current) {
        stampNumRef.current.textContent = String(Math.round(lerp(0, 67, s3)));
      }

      if (progRef.current) progRef.current.style.transform = `scaleX(${p})`;
      if (hintRef.current) {
        hintRef.current.textContent =
          p >= 0.99 ? 'Filed' : p > 0.02 ? 'Running' : 'Scroll to run';
      }

      const next = p >= 0.77 ? 3 : p >= 0.51 ? 2 : p >= 0.25 ? 1 : p > 0.001 ? 0 : -1;
      setStage((cur) => (cur === next ? cur : next));
    },
    [draw, show]
  );

  useScrollProgress(sectionRef, onProgress);

  const active = stage < 0 ? null : STAGES[stage];

  return (
    <section className="method" id="method" ref={sectionRef}>
      <div className="method-stick">
        <div className="method-in">
          <div className="method-top">
            <SecHead sig="§ 02" title="What runs when you open a file" bare />
            <span className="lbl" ref={hintRef}>
              Scroll to run
            </span>
          </div>

          <div className="scene">
            <svg viewBox="0 0 940 460" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {/* connectors first so nodes sit above them */}
              <g>
                {rows.map((r, i) => (
                  <path
                    key={`in-${r.label}`}
                    ref={(el) => {
                      edgeInRefs.current[i] = el;
                    }}
                    className="dpath"
                    d={r.edgeIn}
                    pathLength="1"
                  />
                ))}
              </g>
              <g>
                {rows.map((r, i) => (
                  <path
                    key={`mid-${r.label}`}
                    ref={(el) => {
                      edgeMidRefs.current[i] = el;
                    }}
                    className="dpath dim"
                    d={r.edgeMid}
                    pathLength="1"
                  />
                ))}
              </g>
              <g>
                {rows.map((r, i) => (
                  <path
                    key={`out-${r.label}`}
                    ref={(el) => {
                      edgeOutRefs.current[i] = el;
                    }}
                    className="dpath dim"
                    d={r.edgeOut}
                    pathLength="1"
                  />
                ))}
              </g>

              {/* target */}
              <g ref={targetRef} style={{ opacity: 0 }}>
                <circle cx={TARGET.x} cy={TARGET.y} r="9" className="dfill-accent" />
                <circle cx={TARGET.x} cy={TARGET.y} r="19" className="dring" />
                <text x={TARGET.x} y={TARGET.y + 40} textAnchor="middle" className="dlab dlab-hi">
                  TARGET
                </text>
              </g>

              {/* the seven sections */}
              {rows.map((r, i) => (
                <g
                  key={`node-${r.label}`}
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  style={{ opacity: 0 }}
                >
                  <rect
                    x={r.nodeX - 5}
                    y={r.y - 5}
                    width="10"
                    height="10"
                    className="dstroke-accent"
                    transform={`rotate(45 ${r.nodeX} ${r.y})`}
                  />
                  <text x={r.labelX} y={r.y + 3.4} className="dlab">
                    {r.label}
                  </text>
                </g>
              ))}

              {/* five exhibits per section */}
              {rows.map((r, i) => (
                <g
                  key={`stack-${r.label}`}
                  ref={(el) => {
                    stackRefs.current[i] = el;
                  }}
                  style={{ opacity: 0, transformOrigin: `${r.stackX + 20}px ${r.y}px` }}
                >
                  {[0, 1, 2, 3, 4].map((j) => (
                    <rect
                      key={j}
                      x={r.stackX + j * 9}
                      y={r.y - 6}
                      width="5"
                      height="12"
                      className="dfill-ink"
                    />
                  ))}
                </g>
              ))}

              {/* the dossier */}
              <g ref={docRef} style={{ opacity: 0 }}>
                <rect x={doc.x} y={doc.y} width={doc.w} height={doc.h} className="ddoc" />
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <g
                    key={k}
                    ref={(el) => {
                      docLineRefs.current[k] = el;
                    }}
                    style={{ opacity: 0 }}
                  >
                    <rect
                      x={doc.x + 20}
                      y={doc.y + 30 + k * 22}
                      width={k === 5 ? 62 : 104}
                      height="3"
                      className="dfill-ink"
                    />
                    <circle
                      cx={doc.x + (k === 5 ? 92 : 134)}
                      cy={doc.y + 31 + k * 22}
                      r="3"
                      className="dfill-accent"
                    />
                    {STRUCK_LINES.includes(k) && (
                      <rect
                        ref={(el) => {
                          strikeRefs.current[STRUCK_LINES.indexOf(k)] = el;
                        }}
                        x={doc.x + 14}
                        y={doc.y + 30 + k * 22}
                        width="128"
                        height="3"
                        className="dfill-red"
                        style={{ transform: 'scaleX(0)', transformOrigin: `${doc.x + 14}px 0px` }}
                      />
                    )}
                  </g>
                ))}
                <text x={doc.x + doc.w / 2} y={doc.y + doc.h + 26} textAnchor="middle" className="dlab dlab-hi">
                  DOSSIER
                </text>
              </g>

              {/* confidence stamp */}
              <g
                ref={stampRef}
                style={{ opacity: 0, transformOrigin: `${doc.x + doc.w - 6}px ${doc.y + doc.h - 18}px` }}
              >
                <rect
                  x={doc.x + doc.w - 52}
                  y={doc.y + doc.h - 46}
                  width="86"
                  height="56"
                  className="dstamp"
                />
                <text
                  x={doc.x + doc.w - 9}
                  y={doc.y + doc.h - 30}
                  textAnchor="middle"
                  className="dlab dlab-stamp"
                >
                  PROCEED
                </text>
                <text
                  x={doc.x + doc.w - 9}
                  y={doc.y + doc.h - 8}
                  textAnchor="middle"
                  className="dstamp-num"
                  ref={stampNumRef}
                >
                  0
                </text>
              </g>
            </svg>
          </div>

          <div className="readout">
            <span className="readout-l">{active ? active.body : 'Four phases, in order.'}</span>
            <span className="prog">
              <i ref={progRef} />
            </span>
            <span className="readout-r">{active ? active.readout : '—'}</span>
          </div>

          <div className="stages">
            {STAGES.map((s, i) => (
              <div className={`stage${i === stage ? ' on' : ''}`} key={s.key}>
                <div className="stage-n">{String(i + 1).padStart(2, '0')}</div>
                <div className="stage-t">{s.key}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── § 03 Evidence ────────────────────────── */

const EVIDENCE = [
  {
    n: '01',
    head: 'Cross-examined, not just cited',
    body: 'Nemotron Ultra re-reads the page behind every claim. Claims the page does not support, or that belong to a different organisation, are struck in front of you, with the reason written underneath.',
  },
  {
    n: '02',
    head: 'A decision, not a summary',
    body: 'The file ends in proceed, caution or stop for the thing you are about to do, the red flags behind it, and the questions to ask them before you commit.',
  },
  {
    n: '03',
    head: 'Confidence you can audit',
    body: 'The score is computed from how many claims held, how many questions have evidence, and how many independent sites stand behind them. The model never grades itself.',
  },
];

function Evidence() {
  const ref = useReveal();
  return (
    <section className="lsec" id="evidence" ref={ref}>
      <div className="lwrap">
        <SecHead sig="§ 03" title="Evidence" />
        <div className="ev-intro">
          <h2 className="ldisp l-lg lrise">Every claim stands trial.</h2>
          <p className="lprose lrise" style={{ '--d': '0.12s' }}>
            A check is only worth the trail behind it. Recon files each finding with its exhibits, has a
            second, larger model rule on it against those exhibits, and decides only from what survives.
          </p>
        </div>

        <div className="ev-list">
          {EVIDENCE.map((e, i) => (
            <article className="ev lrise" key={e.n} style={{ '--d': `${i * 0.09}s` }}>
              <div className="ev-n">{e.n}</div>
              <h3 className="ev-head">{e.head}</h3>
              <p className="ev-body">{e.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── marquee ──────────────────────────────── */

function Marquee() {
  const seq = (
    <div className="marq-seq">
      {SECTION_NAMES.map((n) => (
        <span className="marq-item" key={n}>
          {n}
          <span className="marq-sep">/</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="marq" aria-hidden="true">
      <div className="marq-track">
        {seq}
        {seq}
      </div>
    </div>
  );
}

/* ─────────────────────── close ────────────────────────────────── */

function Close({ onStart, onSample }) {
  const ref = useReveal();
  return (
    <section className="lsec lclose" ref={ref}>
      <div className="lwrap">
        <div className="rule-draw" />
        <h2 className="ldisp l-xl lrise" style={{ '--d': '0.1s' }}>
          Name the other party.
        </h2>
        <p className="lprose lrise" style={{ '--d': '0.22s' }}>
          A client, a vendor, a partner or an employer. The file comes back cross-examined, decided, and yours
          to check.
        </p>
        <div className="lcta lrise" style={{ '--d': '0.3s' }}>
          <button type="button" className="lbtn lbtn-solid" onClick={onStart}>
            Open a file <span className="arw">→</span>
          </button>
          <button type="button" className="lbtn lbtn-ghost" onClick={onSample}>
            Read the sample first
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── shared ───────────────────────────────── */

function SecHead({ sig, title, bare = false }) {
  return (
    <div className={bare ? 'sec-head-bare' : 'sec-head'}>
      <span className="sec-sig">{sig}</span>
      <span className="sec-ttl">{title}</span>
    </div>
  );
}
