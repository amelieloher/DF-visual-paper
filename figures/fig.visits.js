// fig.visits (content/figures/fig.visits.yaml): panel (a) of the
// companion's Figure fig:ka-visits, rebuilt from the approved TikZ drawing
// (figures/tikz/fig.visits.tex) with the path simulated in the browser.
//
// One velocity path, in units r = 1 with vbar = 2r: I = (1.5, 2.5),
// I* = (1.25, 2.75). A visit begins when the path reaches the closure of I
// and ends when it leaves I*; a re-crossing of the boundary of I inside
// I* is part of the same visit. Elapsed time from the starting point s = 0
// is divided into J_0 = [0, r^2], J_j = (j r^2, (j+1) r^2].
// The model is the one of visual-final/src/ka_data.py ka2_path():
// dv = sqrt(2 * 0.08 * a(X, v)) dB, dX = v ds, a checkerboard coefficient
// a in {0.5, 2.0} (cells 0.9 x 0.5), dt = 2e-3, v(0) = 1, run to s = 14; the
// first path of the sample with 3 or 4 well-separated visits in the window
// [0, 9.5] and a re-crossing of the boundary of I is shown, as there.
// "Play" runs the path: visits begin and end, and the count of visits
// beginning in each bin J_j grows, as they happen.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import { Rng, freshSeed, subSeed } from './lib/rng.mjs';
import { isSnapshotMode, measuredWidth, watchResize } from './lib/svgkit.mjs';
import { showAssertionError } from './lib/theme.mjs';
import {
  arrow, crossMark, lab, makeClock, polyD, runChunked, seg, simControls,
} from './lib/toyrun.mjs';

const FIG_ID = 'fig.visits';
export const VI = {
  vbar: 2.0,
  iLo: 1.5,
  iHi: 2.5,
  sLo: 1.25,
  sHi: 2.75,
  dt: 2e-3,
  T: 14.0,
  diffusion: 0.08,
  vStart: 1.0,
  window: 9.5,
  every: 5,
};
// The default sample: seed 7, whose first legible path is attempt 3620
// (pinned by test/fig-simulated.test.mjs, which reruns the search).
export const DEFAULT_SEED = 7;
export const DEFAULT_ATTEMPT = 3620;

/** The autonomous rough coefficient of ka2_path(): checkerboard in (X, v), cells 0.9 x 0.5. */
export function aRough(X, v) {
  return ((Math.floor(X / 0.9) + Math.floor(v / 0.5)) % 2 + 2) % 2 === 0 ? 0.5 : 2.0;
}

const N_STEPS = Math.round(VI.T / VI.dt);
const buf = new Float64Array(N_STEPS + 1);

/** Path `attempt` of the sample `seed` into `out`; false once it leaves [-1.2, 5.2] (rejected early). */
function runPath(seed, attempt, out = buf, p = VI) {
  const rng = new Rng(subSeed(seed, attempt));
  let v = p.vStart;
  let X = 0;
  out[0] = v;
  const c = 2 * p.diffusion * p.dt;
  for (let i = 0; i < N_STEPS; i += 1) {
    const vn = v + Math.sqrt(c * aRough(X, v)) * rng.normal();
    X += v * p.dt;
    v = vn;
    out[i + 1] = v;
    if (v > 5.2 || v < -1.2) return false;
  }
  return true;
}

/**
 * The visit rule along a velocity path (ka_data.py visits()): a visit
 * begins at the first index with v in the closure of I while no visit is
 * running, and ends at the first index with v outside the open I*.
 * Returns { active (Uint8Array), starts, ends }.
 */
export function visitsOf(v, p = VI) {
  const n = v.length;
  const active = new Uint8Array(n);
  const starts = [];
  const ends = [];
  let on = false;
  for (let i = 0; i < n; i += 1) {
    const vi = v[i];
    if (!on && vi >= p.iLo && vi <= p.iHi) { on = true; starts.push(i); } else if (on && !(vi > p.sLo && vi < p.sHi)) { on = false; ends.push(i); }
    active[i] = on ? 1 : 0;
  }
  return { active, starts, ends };
}

/** The bin j of an elapsed time s >= 0: J_0 = [0, 1], J_j = (j, j+1] (r = 1). */
export function binOf(s) {
  return s <= 1 + 1e-9 ? 0 : Math.ceil(s - 1e-9) - 1;
}

/** ka2_path()'s choice of a legible path; returns the re-crossing index or -1. */
function legible(v, p = VI) {
  const { starts: st, ends: en } = visitsOf(v, p);
  if (st.length < 3 || st.length > 4 || en.length < st.length) return -1;
  const dt = p.dt;
  for (let k = 0; k < st.length; k += 1) if ((en[k] - st[k]) * dt < 0.35) return -1;
  if (en[st.length - 1] * dt > 9.3) return -1;
  const iw = Math.round(p.window / dt);
  for (let i = 0; i < iw; i += 1) if (v[i] > 2.95 || v[i] < -0.9) return -1;
  if (st[0] * dt < 1.0) return -1;
  for (let k = 0; k < st.length; k += 1) if ((st[k] - (k ? st[k - 1] : 0)) * dt < 1.2) return -1;
  const bounds = en.concat([v.length]);
  for (let k = 0; k < st.length; k += 1) {
    const a = st[k];
    const b = bounds[k];
    let first = -1;
    for (let i = a; i < b; i += 1) if (v[i] < p.iLo) { first = i - a; break; }
    if (first >= 0 && first * dt > 0.3) {
      for (let i = a + first; i < b; i += 1) if (v[i] > p.iLo + 0.1) return a + first;
    }
  }
  return -1;
}

/** Search the sample `seed` from attempt `from` for at most `count` attempts; the first legible attempt or -1. */
export function searchPath(seed, from = 0, count = Infinity, deadline = Infinity, now = () => 0) {
  for (let k = from; k < from + count; k += 1) {
    if (now() > deadline) return { next: k, found: -1 };
    if (runPath(seed, k) && legible(buf) >= 0) return { next: k + 1, found: k };
  }
  return { next: from + count, found: -1 };
}

/** The drawn path for (seed, attempt): window samples, visits, re-crossing, counts per bin. */
export function pathFor(seed, attempt, p = VI) {
  const v = new Float64Array(N_STEPS + 1);
  if (!runPath(seed, attempt, v, p)) throw new Error('the selected path left the drawing range');
  const recross = legible(v, p);
  if (recross < 0) throw new Error('the selected path is not legible');
  const { active, starts, ends } = visitsOf(v, p);
  const iw = Math.round(p.window / p.dt);
  const idx = [];
  for (let i = 0; i <= iw; i += p.every) idx.push(i);
  const nb = Math.ceil(p.window - 0.5); // bins J_0 .. J_8 drawn
  const counts = new Array(nb).fill(0);
  for (const i of starts) if (i * p.dt <= nb) counts[binOf(i * p.dt)] += 1;
  return {
    seed,
    attempt,
    t: Float64Array.from(idx, (i) => i * p.dt),
    v: Float64Array.from(idx, (i) => v[i]),
    act: Uint8Array.from(idx, (i) => active[i]),
    starts: starts.map((i) => ({ s: i * p.dt, v: v[i] })).filter((m) => m.s <= p.window),
    ends: ends.map((i) => ({ s: i * p.dt, v: v[i] })).filter((m) => m.s <= p.window),
    recross: { s: recross * p.dt, v: v[recross] },
    counts,
    full: v,
  };
}

/** The "what must hold" list of the design brief, on a drawn path. */
export function checkPath(P, p = VI) {
  const { starts, ends, active } = visitsOf(P.full, p);
  for (const i of starts) if (!(P.full[i] >= p.iLo && P.full[i] <= p.iHi)) throw new Error('a visit began outside the closure of I');
  for (const i of ends) if (P.full[i] > p.sLo && P.full[i] < p.sHi) throw new Error('a visit ended inside I*');
  if (P.full[0] >= p.iLo && P.full[0] <= p.iHi) throw new Error('the path starts in the closure of I');
  const ir = Math.round(P.recross.s / p.dt);
  if (!active[ir]) throw new Error('the marked re-crossing is not inside a visit');
  if (P.counts.reduce((a, b) => a + b, 0) !== P.starts.filter((m) => m.s <= P.counts.length).length) throw new Error('visit counts by bin do not add up');
}

const C1 = 'var(--fig-1)';
const GREY = 'var(--text-dim)';
const INK = 'var(--text)';

export function render(el, { snapshot = isSnapshotMode() } = {}) {
  try {
    renderInner(el, snapshot);
  } catch (err) {
    showAssertionError(el, FIG_ID, err.message);
  }
}

function renderInner(el, snapshot) {
  clear(el);
  const state = { seed: DEFAULT_SEED, P: null };
  const root = htmlEl('div', { class: 'd3-figure' });
  const svgHost = htmlEl('div', { style: 'width:100%' });
  const note = 'Path simulated in your browser (illustrative path): units $r=1$, $\\bar v=2r$, started at $v=1$; a checkerboard coefficient $a(X,v)\\in\\{0.5,2\\}$ (cells $0.9\\times0.5$) slowed by the factor $0.08$, time step $2\\cdot10^{-3}$. The first path of the sample with three or four well-separated visits and a re-crossing of $\\partial I$ is shown. The intervals, the visit rule and the bins $J_j$ are the paper’s.';
  const noteText = 'Path simulated in your browser (illustrative path): units r = 1, v̄ = 2r, started at v = 1; a checkerboard coefficient a(X,v) in {0.5, 2} (cells 0.9 × 0.5) slowed by the factor 0.08, time step 2·10^-3. The first path of the sample with three or four well-separated visits and a re-crossing of ∂I is shown. The intervals, the visit rule and the bins J_j are the paper’s.';
  let view = null;
  let search = null;
  const clock = makeClock({
    duration: 9500,
    onFrame: (q) => { if (view) view.frame(q); },
    onEnd: () => { ctl.setPlaying(false); if (view) view.frame(1); },
    alive: () => el.isConnected,
  });
  const ctl = simControls({
    canPlay: true,
    note,
    noteText,
    onNewSample: () => {
      if (search) search.cancel();
      const seed = freshSeed();
      let next = 0;
      ctl.setBusy(true);
      ctl.setStatus('simulating paths…');
      search = runChunked((deadline) => {
        const r = searchPath(seed, next, 400, deadline, () => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
        next = r.next;
        if (r.found >= 0) {
          search = null;
          ctl.setBusy(false);
          ctl.setStatus(`(path ${r.found + 1} of the sample)`);
          state.seed = seed;
          show(seed, r.found);
          if (clock.playing) clock.play();
          return true;
        }
        ctl.setStatus(`simulating paths… ${next} tried`);
        if (next > 200000) { ctl.setBusy(false); ctl.setStatus('no legible path found'); return true; }
        return false;
      }, { alive: () => el.isConnected });
    },
    onPlay: () => {
      if (clock.playing) { clock.pause(); ctl.setPlaying(false); return; }
      ctl.setPlaying(true);
      clock.play();
    },
  });
  if (!snapshot) root.appendChild(ctl.node);
  root.appendChild(svgHost);
  el.appendChild(root);

  function show(seed, attempt) {
    state.P = pathFor(seed, attempt);
    checkPath(state.P);
    ctl.setSeed(seed);
    draw();
  }

  function draw() {
    const P = state.P;
    const W = Math.max(340, Math.min(1000, Math.round(measuredWidth(svgHost, 820))));
    const narrow = W < 600;
    const FS = 13;
    const FN = 12.5;
    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'Visits to a velocity interval: one simulated velocity path with its visits, and the time bins J_j',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    let y0 = 4;
    if (snapshot) {
      svg.appendChild(svgEl('text', {
        x: 8, y: 14, 'font-size': 10, fill: 'var(--text-dim)',
      }, [`controls (default state): New sample (fresh seed), Play (runs the path in time); seed ${P.seed}, path ${P.attempt + 1}; illustrative path (simulated)`]));
      y0 = 26;
    }
    const ml = narrow ? 58 : 76;
    const mr = 46;
    const pw = W - ml - mr;
    const xs = (s) => ml + (s / VI.window) * pw;
    // legend (one or two rows)
    const lg = svgEl('g', { transform: `translate(${narrow ? 8 : ml},${y0 + 14})` });
    svg.appendChild(lg);
    {
      let x = 0;
      let y = 0;
      const item = (draw1, tex, plain, w) => {
        if (x + w > W - 16 - (narrow ? 8 : ml) && x > 0) { x = 0; y += 20; }
        draw1(x, y);
        lab(lg, x + 22, y + 4, tex, plain, { size: FN });
        x += w;
      };
      item((x1, y1) => seg(lg, x1, y1, x1 + 18, y1, { stroke: C1, 'stroke-width': 1.6 }), 'active: from reaching $\\overline I$ to leaving $I^*$', 'active: from reaching Ī to leaving I*', 270);
      item((x1, y1) => seg(lg, x1, y1, x1 + 18, y1, { stroke: GREY, 'stroke-width': 1 }), 'waiting', 'waiting', 90);
      item((x1, y1) => lg.appendChild(svgEl('circle', {
        cx: x1 + 9, cy: y1, r: 3.6, fill: C1,
      })), 'visit begins', 'visit begins', 112);
      item((x1, y1) => crossMark(lg, x1 + 9, y1, { color: C1, r: 4 }), 'visit ends', 'visit ends', 100);
      y0 += y + 34;
    }
    // annotations sit above the plot
    const top = y0 + 44;
    const ph = Math.max(150, Math.min(230, 0.26 * pw));
    const vTop = 3.05;
    const vBot = -0.62;
    const yv = (v) => top + ((vTop - v) / (vTop - vBot)) * ph;
    const g = svgEl('g');
    svg.appendChild(g);
    g.appendChild(svgEl('rect', {
      x: xs(0), y: yv(VI.sHi), width: xs(VI.window) - xs(0), height: yv(VI.sLo) - yv(VI.sHi), fill: C1, 'fill-opacity': 0.08,
    }));
    g.appendChild(svgEl('rect', {
      x: xs(0), y: yv(VI.iHi), width: xs(VI.window) - xs(0), height: yv(VI.iLo) - yv(VI.iHi), fill: C1, 'fill-opacity': 0.24,
    }));
    for (const v of [VI.sLo, VI.sHi]) seg(g, xs(0), yv(v), xs(VI.window), yv(v), { stroke: C1, 'stroke-opacity': 0.6, 'stroke-width': 0.8 });
    for (const v of [VI.iLo, VI.iHi]) seg(g, xs(0), yv(v), xs(VI.window), yv(v), { stroke: C1, 'stroke-opacity': 0.8, 'stroke-width': 0.8, 'stroke-dasharray': '4 3' });
    seg(g, xs(0), yv(0), xs(VI.window), yv(0), { stroke: 'var(--fig-grey)', 'stroke-width': 0.8 });
    const nb = P.counts.length;
    const binHi = svgEl('rect', {
      x: 0, y: yv(2.95), width: xs(1) - xs(0), height: yv(-0.45) - yv(2.95), fill: 'var(--fig-grey)', 'fill-opacity': 0.12, visibility: 'hidden',
    });
    g.appendChild(binHi);
    for (let j = 0; j <= nb; j += 1) seg(g, xs(j), yv(-0.45), xs(j), yv(2.95), { stroke: 'var(--fig-grey)', 'stroke-opacity': 0.45, 'stroke-width': 0.7 });
    for (let j = 0; j < nb; j += 1) lab(g, xs(j + 0.5), yv(-0.3) + 5, `$J_{${j}}$`, `J${j}`, { size: FN, fill: GREY, anchor: 'middle' });
    // the path (dynamic)
    const waitPath = svgEl('path', {
      d: '', fill: 'none', stroke: GREY, 'stroke-width': 1, 'stroke-linejoin': 'round',
    });
    const actPath = svgEl('path', {
      d: '', fill: 'none', stroke: C1, 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    });
    g.append(waitPath, actPath);
    const marks = svgEl('g');
    g.appendChild(marks);
    const startEls = P.starts.map((m) => {
      const c = svgEl('circle', {
        cx: xs(m.s), cy: yv(m.v), r: 3.8, fill: C1,
      });
      marks.appendChild(c);
      return { el: c, s: m.s };
    });
    const endEls = P.ends.map((m) => ({ el: crossMark(marks, xs(m.s), yv(m.v), { color: C1, r: 4 }), s: m.s }));
    const head = svgEl('circle', { r: 4, fill: GREY, visibility: 'hidden' });
    g.appendChild(head);
    // annotations
    const annG = svgEl('g');
    g.appendChild(annG);
    const st1 = P.starts[0];
    const rc = P.recross;
    const annY = top - 16;
    arrow(annG, xs(st1.s), annY + 4, xs(st1.s), yv(st1.v) - 6, { width: 0.9, head: 6 });
    const firstLab = 'first arrival in $\\overline I$: first visit begins';
    // the first-arrival label extends away from the re-crossing, which lies later in time
    lab(annG, xs(st1.s) + 12, annY, firstLab, 'first arrival in Ī: first visit begins', {
      size: FN, anchor: 'end', clamp: [4, W - 4], halo: true,
    });
    const rcX = xs(rc.s);
    const rcRight = rc.s < VI.window * 0.6;
    const rcBase = rcX + (rcRight ? -8 : 8);
    arrow(annG, rcBase, annY - 18 + 4, rcX, yv(rc.v) - 6, { width: 0.9, head: 6 });
    lab(annG, rcBase + (rcRight ? -6 : 6), annY - 18, 're-crossing $\\partial I$: no new visit', 're-crossing ∂I: no new visit', {
      size: FN, anchor: rcRight ? 'start' : 'end', clamp: [4, W - 4], halo: true,
    });
    // labels and axes
    lab(g, xs(VI.window) + 6, yv(2.62) + 4, '$I^*$', 'I*', { size: FN });
    lab(g, xs(VI.window) + 6, yv(2.0) + 4, '$I$', 'I', { size: FN });
    lab(g, xs(VI.window) + 6, yv(0) + 4, '$v=0$', 'v = 0', { size: FN });
    const axY = yv(-0.62);
    arrow(g, xs(0), axY, xs(VI.window) + 18, axY);
    lab(g, xs(VI.window) + 22, axY + 5, '$s$', 's', { size: FS });
    seg(g, xs(0), axY, xs(0), axY + 4);
    lab(g, xs(0), axY + 19, '$0$', '0', { size: FN, anchor: 'middle' });
    arrow(g, xs(0) - 4, axY, xs(0) - 4, yv(3.05) - 4);
    lab(g, xs(0) - 8, yv(3.05), '$v$', 'v', { size: FS, anchor: 'end' });
    seg(g, xs(0) - 4, yv(2), xs(0) - 8, yv(2));
    lab(g, xs(0) - 10, yv(2) + 4, '$\\bar v=2r$', 'v̄ = 2r', { size: FN, anchor: 'end' });
    // visits of this path beginning in each bin
    const cY = axY + 44;
    lab(g, xs(0), cY, 'visits of this path beginning in each bin $J_j$:', 'visits of this path beginning in each bin J_j:', { size: FN, fill: GREY });
    const countEls = [];
    for (let j = 0; j < nb; j += 1) {
      const t = svgEl('text', {
        x: xs(j + 0.5) - 4, y: cY + 22, 'font-size': 14, 'font-weight': 600, fill: INK,
      }, [String(P.counts[j])]);
      g.appendChild(t);
      countEls.push(t);
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(cY + 32)}`);

    // ---------------------------------------------------------- animation
    const n = P.t.length;
    view = {
      frame(q) {
        const done = q >= 1;
        const sNow = done ? VI.window : q * VI.window;
        let m = 0;
        while (m < n && P.t[m] <= sNow + 1e-9) m += 1;
        m = Math.max(2, m);
        // split into active / waiting pieces (each piece extended by one sample at a join)
        let dA = '';
        let dW = '';
        let i = 0;
        while (i < m - 1) {
          const a = P.act[i];
          let j = i;
          while (j < m - 1 && P.act[j + 1] === a) j += 1;
          const d = polyD(P.t, P.v, i, Math.min(m, j + 2), xs, yv);
          if (a) dA += d; else dW += d;
          i = j + 1;
        }
        actPath.setAttribute('d', dA);
        waitPath.setAttribute('d', dW);
        for (const s of startEls) s.el.setAttribute('visibility', s.s <= sNow ? 'visible' : 'hidden');
        for (const s of endEls) s.el.setAttribute('visibility', s.s <= sNow ? 'visible' : 'hidden');
        const counts = new Array(nb).fill(0);
        for (const s of P.starts) if (s.s <= sNow && s.s <= nb) counts[binOf(s.s)] += 1;
        countEls.forEach((t, j) => { t.textContent = String(counts[j]); });
        annG.setAttribute('visibility', done ? 'visible' : 'hidden');
        head.setAttribute('visibility', done ? 'hidden' : 'visible');
        binHi.setAttribute('visibility', done || sNow > nb ? 'hidden' : 'visible');
        if (!done) {
          const k = m - 1;
          head.setAttribute('cx', xs(P.t[k]));
          head.setAttribute('cy', yv(P.v[k]));
          head.setAttribute('fill', P.act[k] ? C1 : GREY);
          binHi.setAttribute('x', xs(binOf(sNow)));
        }
      },
    };
    view.frame(clock.playing ? clock.progress : 1);
  }

  show(DEFAULT_SEED, DEFAULT_ATTEMPT);
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}
