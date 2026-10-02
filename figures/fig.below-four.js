// fig.below-four (content/figures/fig.below-four.yaml): the companion's
// Figure fig:ka-belowfour, rebuilt from the approved TikZ drawing
// (figures/tikz/fig.below-four.tex) with the Monte Carlo run in the browser.
//
// (a) time only: the mass m_j of visits beginning in each bin J_j;
// (b) the same bins cut into position cells B_k = [k r^3, (k+1) r^3):
//     masses n_{j,k}, m_j = sum_k n_{j,k}; (b') m_j against the largest
//     single cell sup_k n_{j,k} (log-log); the comparison of the two bounds;
// (c) the cores I_c(rho_j), rho_j = 8R(7/8)^j, overlapping and covering
//     0 < |v| <= 9R (exact, not simulated).
// The Monte Carlo is the one of visual-final/src/ka_data.py
// ka2_montecarlo(): N = 40 000 paths started at v = vbar = 2 (r = 1) at
// time 0, dv = sqrt(2 * 0.25 * a(X, v)) dB, dX = v ds, a checkerboard
// coefficient a in {0.5, 2.0} (cells 0.9 x 0.5), dt = 0.004, T = 30; a visit
// begins on reaching [1.5, 2.5] and ends on leaving (1.25, 2.75); the
// initial point counts as a visit beginning in J_0 = [0, 1] at X = 0.
// Path i of a sample uses its own random stream, so a sample is the same
// however the work is split across animation frames. The default sample
// (seed 1) is stored below and re-derived by test/fig-simulated.test.mjs.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import { Rng, freshSeed, subSeed } from './lib/rng.mjs';
import { isSnapshotMode, measuredWidth, watchResize } from './lib/svgkit.mjs';
import { showAssertionError } from './lib/theme.mjs';
import {
  arrow, lab, runChunked, seg, simControls,
} from './lib/toyrun.mjs';

const FIG_ID = 'fig.below-four';
export const MC = {
  N: 40000,
  T: 30,
  dt: 0.004,
  vbar: 2.0,
  iLo: 1.5,
  iHi: 2.5,
  sLo: 1.25,
  sHi: 2.75,
  diffusion: 0.25,
  bins: 30,
  gridBins: 12,
};
export const DEFAULT_SEED = 1;

/** The autonomous rough coefficient of ka2_montecarlo(): checkerboard in (X, v), cells 0.9 x 0.5. */
export function aRough(X, v) {
  return ((Math.floor(X / 0.9) + Math.floor(v / 0.5)) % 2 + 2) % 2 === 0 ? 0.5 : 2.0;
}

/** The bin j of an elapsed time s >= 0: J_0 = [0, 1], J_j = (j, j+1] (r = 1). */
export function binOf(s) {
  return s <= 1 ? 0 : Math.ceil(s - 1e-9) - 1;
}

const K_OFF = 1000;

/** An empty tally: visit starts per bin and per (bin, cell). */
export function emptyTally(p = MC) {
  return { paths: 0, m: new Array(p.bins).fill(0), cells: new Map() };
}

/**
 * Add paths [from, to) of sample `seed` to `tally`. Every path starts in
 * the closure of I at time 0: its first visit begins in J_0, in B_0.
 */
export function simulatePaths(seed, from, to, tally, p = MC) {
  const n = Math.round(p.T / p.dt);
  const c = 2 * p.diffusion * p.dt;
  const sdLo = Math.sqrt(c * 0.5);
  const sdHi = Math.sqrt(c * 2.0);
  const { m, cells } = tally;
  for (let path = from; path < to; path += 1) {
    const rng = new Rng(subSeed(seed, path));
    let v = p.vbar;
    let X = 0;
    let on = true;
    m[0] += 1;
    cells.set(K_OFF, (cells.get(K_OFF) || 0) + 1);
    for (let i = 0; i < n; i += 1) {
      const even = ((Math.floor(X / 0.9) + Math.floor(v / 0.5)) & 1) === 0;
      v += (even ? sdLo : sdHi) * rng.normal();
      X += v * p.dt;
      if (on) {
        if (!(v > p.sLo && v < p.sHi)) on = false;
      } else if (v >= p.iLo && v <= p.iHi) {
        on = true;
        const j = Math.min(binOf((i + 1) * p.dt), p.bins - 1);
        m[j] += 1;
        const key = j * 2 * K_OFF + K_OFF + Math.floor(X);
        cells.set(key, (cells.get(key) || 0) + 1);
      }
    }
    tally.paths += 1;
  }
  return tally;
}

/** Counts -> what the figure draws: m_j, sup_k n_{j,k} (all bins), n_{j,k} for j < gridBins, as fractions of the paths. */
export function summarize(tally, p = MC) {
  const N = Math.max(1, tally.paths);
  const supk = new Array(p.bins).fill(0);
  const grid = [];
  for (const [key, count] of tally.cells) {
    const j = Math.floor(key / (2 * K_OFF));
    const k = (key % (2 * K_OFF)) - K_OFF;
    supk[j] = Math.max(supk[j], count);
    if (j < p.gridBins) grid.push([j, k, count]);
  }
  grid.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    paths: tally.paths,
    m: tally.m.map((x) => x / N),
    supk: supk.map((x) => x / N),
    grid: grid.map(([j, k, count]) => [j, k, count / N]),
  };
}

/** Integer counts of a finished sample, in the compact form stored as DEFAULT_COUNTS. */
export function compactCounts(tally, p = MC) {
  const s = summarize(tally, p);
  const N = tally.paths;
  const r = (x) => Math.round(x * N);
  return {
    paths: N, m: s.m.map(r), supk: s.supk.map(r), grid: s.grid.flatMap(([j, k, x]) => [j, k, r(x)]),
  };
}

/** The stored default sample (seed 1, N = 40 000) as a summary. */
export function defaultSummary() {
  const c = DEFAULT_COUNTS;
  const N = c.paths;
  const grid = [];
  for (let i = 0; i < c.grid.length; i += 3) grid.push([c.grid[i], c.grid[i + 1], c.grid[i + 2] / N]);
  return {
    paths: N, m: c.m.map((x) => x / N), supk: c.supk.map((x) => x / N), grid,
  };
}

/** The "what must hold" list of the design brief, on a summary. */
export function checkSummary(s, p = MC) {
  if (s.m.length !== p.bins) throw new Error('wrong number of time bins');
  const colSum = new Array(p.gridBins).fill(0);
  for (const [j, , x] of s.grid) colSum[j] += x;
  for (let j = 0; j < p.gridBins; j += 1) {
    if (Math.abs(colSum[j] - s.m[j]) > 1e-9) throw new Error(`m_${j} is not the sum of its cells`);
    if (s.supk[j] > s.m[j] + 1e-12) throw new Error('a cell exceeds its column');
  }
  if (s.m[0] < 1) throw new Error('m_0 must include the initial visit');
}

/** The cores I_c^+(rho_j) = [7 rho_j / 8, 9 rho_j / 8], rho_j = 8R(7/8)^j (R = 1). */
export function cores(count = 35) {
  return Array.from({ length: count }, (_, j) => {
    const rho = 8 * (7 / 8) ** j;
    return { j, rho, lo: (7 * rho) / 8, hi: (9 * rho) / 8 };
  });
}

const C1 = 'var(--fig-1)';
const C2 = 'var(--fig-2)';
const CT = 'var(--fig-theta)';
const GREY = 'var(--fig-grey)';
const INK = 'var(--text)';
const DIM = 'var(--text-dim)';
const thin = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');

export function render(el, { snapshot = isSnapshotMode() } = {}) {
  try {
    renderInner(el, snapshot);
  } catch (err) {
    showAssertionError(el, FIG_ID, err.message);
  }
}

function renderInner(el, snapshot) {
  clear(el);
  const state = { seed: DEFAULT_SEED, sum: defaultSummary() };
  const root = htmlEl('div', { class: 'd3-figure' });
  const svgHost = htmlEl('div', { style: 'width:100%' });
  const note = 'Monte Carlo in your browser (numerical illustration) for (a), (b), (b$′$): $40\\,000$ paths started at $v=\\bar v=2r$ ($r=1$) at time $0$, a checkerboard coefficient $a(x,v)\\in\\{0.5,2\\}$ (cells $0.9\\times0.5$) times $0.25$, time step $0.004$, up to time $30$. The bounds in the comparison and the cores in (c) are the companion’s.';
  const noteText = 'Monte Carlo in your browser (numerical illustration) for (a), (b), (b′): 40 000 paths started at v = v̄ = 2r (r = 1) at time 0, a checkerboard coefficient a(x,v) in {0.5, 2} (cells 0.9 × 0.5) times 0.25, time step 0.004, up to time 30. The bounds in the comparison and the cores in (c) are the companion’s.';
  let job = null;
  let view = null;
  const ctl = simControls({
    canPlay: false,
    note,
    noteText,
    onNewSample: () => {
      if (job) job.cancel();
      const seed = freshSeed();
      const tally = emptyTally();
      let next = 0;
      let lastDraw = 0;
      state.seed = seed;
      ctl.setSeed(seed);
      ctl.setBusy(true);
      const t0 = Date.now();
      job = runChunked((deadline) => {
        const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
        // a frame either simulates (within the budget) or redraws, never both
        const redraw = Date.now() - lastDraw > 300;
        while (!redraw && next < MC.N && nowMs() < deadline) {
          const to = Math.min(MC.N, next + 20);
          simulatePaths(seed, next, to, tally);
          next = to;
        }
        const finished = next >= MC.N;
        if (finished || redraw) {
          lastDraw = Date.now();
          state.sum = summarize(tally);
          if (view) view.update(state.sum);
          ctl.setStatus(finished ? `${thin(MC.N)} paths (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `simulating… ${thin(next)} / ${thin(MC.N)} paths`);
        }
        if (finished) {
          checkSummary(state.sum);
          job = null;
          ctl.setBusy(false);
        }
        return finished;
      }, { alive: () => el.isConnected, budgetMs: 22 });
    },
  });
  ctl.setSeed(state.seed);
  ctl.setStatus(`${thin(MC.N)} paths`);
  if (!snapshot) root.appendChild(ctl.node);
  root.appendChild(svgHost);
  el.appendChild(root);
  checkSummary(state.sum);

  function draw() {
    const W = Math.max(340, Math.min(1000, Math.round(measuredWidth(svgHost, 860))));
    const narrow = W < 680;
    const FS = 13;
    const FN = 12.5;
    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'What retaining position gains: Monte Carlo visit masses by time bin and by time-position cell, their decay, and the overlapping cores',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    let y0 = 0;
    if (snapshot) {
      svg.appendChild(svgEl('text', {
        x: 8, y: 14, 'font-size': 10, fill: DIM,
      }, [`controls (default state): New sample (fresh seed; reruns the Monte Carlo, 40 000 paths); seed ${state.seed}; (a), (b), (b') simulated (numerical illustration)`]));
      y0 = 24;
    }
    const ph = narrow ? 140 : 170; // plot height of the top panels
    const pTop = 54;
    const colW = narrow ? W : W / 3;
    const place = (i) => (narrow ? [0, y0 + i * (pTop + ph + 46)] : [i * colW, y0]);

    // ------------------------------------------------------------ (a)
    const [ax, ay] = place(0);
    const A = svgEl('g', { transform: `translate(${ax},${ay})` });
    svg.appendChild(A);
    const aL = 46;
    const aW = Math.min(colW - aL - 30, narrow ? 360 : 1e9);
    const xa = (j) => aL + (j / 12.6) * aW;
    const ya = (m) => pTop + ph - (m / 1.55) * ph;
    lab(A, 4, 16, '(a)', '(a)', { size: FS });
    lab(A, aL + aW / 2, 16, 'time only:', 'time only:', { size: FN, anchor: 'middle' });
    lab(A, aL + aW / 2, 32, 'one mass per column', 'one mass per column', { size: FN, anchor: 'middle' });
    const barsA = svgEl('g');
    A.appendChild(barsA);
    arrow(A, xa(0), ya(0), xa(12.6) + 6, ya(0));
    arrow(A, xa(0), ya(0), xa(0), ya(1.55) - 4);
    lab(A, xa(12.6) + 9, ya(0) + 5, '$j$', 'j', { size: FS });
    lab(A, xa(0) - 6, ya(1.55) + 4, '$m_j$', 'm_j', { size: FS, anchor: 'end' });
    for (const yv of [0.5, 1]) {
      seg(A, xa(0), ya(yv), xa(0) - 4, ya(yv));
      lab(A, xa(0) - 7, ya(yv) + 4, `$${yv}$`, String(yv), { size: FN, anchor: 'end' });
    }
    for (const j of [0, 5, 10]) {
      seg(A, xa(j + 0.5), ya(0), xa(j + 0.5), ya(0) + 4);
      lab(A, xa(j + 0.5), ya(0) + 19, `$${j}$`, String(j), { size: FN, anchor: 'middle' });
    }

    // ------------------------------------------------------------ (b)
    const [bx, by] = place(1);
    const B = svgEl('g', { transform: `translate(${bx},${by})` });
    svg.appendChild(B);
    const bL = 40;
    const bW = Math.min(colW - bL - 26, narrow ? 300 : 1e9) * (narrow ? 1 : 0.62);
    const kLo = -9;
    const kHi = 60;
    const xb = (j) => bL + (j / 12.6) * bW;
    const yb = (k) => pTop + ph - ((k - kLo) / (kHi + 4 - kLo)) * ph;
    lab(B, 4, 16, '(b)', '(b)', { size: FS });
    lab(B, bL + bW / 2 + 20, 16, 'time and position:', 'time and position:', { size: FN, anchor: 'middle' });
    lab(B, bL + bW / 2 + 20, 32, 'cells $J_j\\times B_k$ carry $n_{j,k}$', 'cells J_j × B_k carry n_{j,k}', { size: FN, anchor: 'middle' });
    const cellsB = svgEl('g');
    B.appendChild(cellsB);
    arrow(B, xb(0), yb(kLo), xb(12.6) + 6, yb(kLo));
    arrow(B, xb(0), yb(kLo), xb(0), yb(kHi + 4) - 4);
    lab(B, xb(12.6) + 9, yb(kLo) + 5, '$j$', 'j', { size: FS });
    lab(B, xb(0) - 6, yb(kHi + 4) + 4, '$k$', 'k', { size: FS, anchor: 'end' });
    seg(B, xb(0), yb(0.5), xb(0) - 4, yb(0.5));
    lab(B, xb(0) - 7, yb(0.5) + 4, '$0$', '0', { size: FN, anchor: 'end' });
    for (const j of [0, 5, 10]) {
      seg(B, xb(j + 0.5), yb(kLo), xb(j + 0.5), yb(kLo) + 4);
      lab(B, xb(j + 0.5), yb(kLo) + 19, `$${j}$`, String(j), { size: FN, anchor: 'middle' });
    }
    // key: opacity (n/0.19)^{1/2}, capped at 1 -- darkness is not proportional to mass
    const keyX = xb(12.6) + 22;
    [0.19, 0.1, 0.05, 0.02, 0.005].forEach((nv, i) => {
      const yy = pTop + 4 + i * 19;
      B.appendChild(svgEl('rect', {
        x: keyX, y: yy, width: 14, height: 12, fill: C1, 'fill-opacity': Math.min(1, Math.sqrt(nv / 0.19)),
      }));
      lab(B, keyX + 19, yy + 10, `$${nv}$`, String(nv), { size: FN - 1.5 });
    });
    lab(B, keyX, pTop + 4 + 5 * 19 + 12, 'key: $n_{j,k}$', 'key: n_{j,k}', { size: FN - 1.5 });
    lab(B, keyX, pTop + 4 + 5 * 19 + 27, '(nonlinear,', '(nonlinear,', { size: FN - 1.5 });
    lab(B, keyX, pTop + 4 + 5 * 19 + 41, 'capped)', 'capped)', { size: FN - 1.5 });

    // ------------------------------------------------------------ (b')
    const [cx, cy] = place(2);
    const Bp = svgEl('g', { transform: `translate(${cx},${cy})` });
    svg.appendChild(Bp);
    const pL = 52;
    const pW = Math.min(colW - pL - 44, narrow ? 330 : 1e9);
    const xl = (l) => pL + ((l - 0.25) / (1.58 - 0.25)) * pW;
    const yl = (l) => pTop + ph - ((l + 2.9) / 3.0) * ph;
    lab(Bp, 4, 16, '(b$\'$)', "(b')", { size: FS });
    lab(Bp, pL + pW / 2, 16, 'column total against', 'column total against', { size: FN, anchor: 'middle' });
    lab(Bp, pL + pW / 2, 32, 'the largest single cell', 'the largest single cell', { size: FN, anchor: 'middle' });
    const curveM = svgEl('path', {
      d: '', fill: 'none', stroke: C1, 'stroke-width': 1.8,
    });
    const curveS = svgEl('path', {
      d: '', fill: 'none', stroke: CT, 'stroke-width': 1.8,
    });
    Bp.append(curveM, curveS);
    arrow(Bp, xl(0.25), yl(-2.9), xl(1.58) + 6, yl(-2.9));
    arrow(Bp, xl(0.25), yl(-2.9), xl(0.25), yl(0.1) - 2);
    lab(Bp, xl(1.58) + 9, yl(-2.9) + 5, '$1+j$', '1+j', { size: FS, clamp: [0, colW - 2] });
    for (const [l, t] of [[0.301, '2'], [0.699, '5'], [1, '10'], [1.477, '30']]) {
      seg(Bp, xl(l), yl(-2.9), xl(l), yl(-2.9) + 4);
      lab(Bp, xl(l), yl(-2.9) + 19, `$${t}$`, t, { size: FN, anchor: 'middle' });
    }
    for (const [l, t, plain] of [[0, '1', '1'], [-1, '10^{-1}', '10^-1'], [-2, '10^{-2}', '10^-2']]) {
      seg(Bp, xl(0.25), yl(l), xl(0.25) - 4, yl(l));
      lab(Bp, xl(0.25) - 7, yl(l) + 4, `$${t}$`, plain, { size: FN, anchor: 'end' });
    }
    const labM = lab(Bp, 0, 0, '$m_j$', 'm_j', { size: FS, fill: C1 });
    const labS = lab(Bp, 0, 0, '$\\sup_k n_{j,k}$', 'sup_k n_{j,k}', { size: FS, fill: CT });

    let y = narrow ? place(2)[1] + pTop + ph + 50 : y0 + pTop + ph + 52;
    // --------------------------------------------- illustration line and comparison
    lab(svg, 12, y, '(a), (b), (b$\'$): numerical illustration (Monte Carlo), not the rates of the theorem', "(a), (b), (b'): numerical illustration (Monte Carlo), not the rates of the theorem", {
      size: FN, fill: DIM, maxWidth: W - 24, lineHeight: 17,
    });
    y += narrow ? 48 : 34;
    const rowsT = [
      ['$\\sum_k n_{j,k}=m_j\\le C(1+j)^{-\\frac12}$', 'Σ_k n_{j,k} = m_j ≤ C(1+j)^(-1/2)', 'all positions together (time-only count: $p>4$)', 'all positions together (time-only count: p > 4)'],
      ['$\\sup_k n_{j,k}\\le C(1+j)^{-\\frac\\gamma2}$, $\\gamma>1$', 'sup_k n_{j,k} ≤ C(1+j)^(-γ/2), γ > 1', 'each cell (Bellman barrier); $\\varepsilon=\\gamma-1>0$', 'each cell (Bellman barrier); ε = γ − 1 > 0'],
    ];
    for (const [t1, p1, t2, p2] of rowsT) {
      if (narrow) {
        lab(svg, 12, y, t1, p1, { size: FS });
        lab(svg, 24, y + 22, t2, p2, { size: FN, fill: DIM });
        y += 52;
      } else {
        lab(svg, Math.max(12, W * 0.08), y, t1, p1, { size: FS });
        lab(svg, Math.max(300, W * 0.46), y, t2, p2, { size: FN });
        y += 32;
      }
    }

    // ------------------------------------------------------------ (c)
    y += 14;
    lab(svg, 4, y + 4, '(c)', '(c)', { size: FS });
    const txtW = Math.min(W - 60, 760);
    const tx = narrow ? 36 : (W - txtW) / 2;
    const c1 = lab(svg, tx, y, 'cores $I^\\pm_{\\mathrm c}(\\rho_j)=\\pm\\bigl[\\tfrac78\\rho_j,\\tfrac98\\rho_j\\bigr]$, $\\rho_j=8R\\bigl(\\tfrac78\\bigr)^j$, on two rows; consecutive cores overlap (grey).', 'cores I_c^±(ρ_j) = ±[7ρ_j/8, 9ρ_j/8], ρ_j = 8R(7/8)^j, on two rows; consecutive cores overlap (grey).', {
      size: FN, maxWidth: txtW, lineHeight: 20,
    });
    const h1 = c1.mainTexBox ? c1.mainTexBox.h : (narrow ? 60 : 20);
    y += h1 + 8;
    const c2 = lab(svg, tx, y, 'Summing over the scales: at $q=\\frac43$ (that is, $p=4$) the exponent is $4-3q+\\varepsilon(q-1)=\\frac\\varepsilon3>0$, so the sum converges even at $p=4$', 'Summing over the scales: at q = 4/3 (that is, p = 4) the exponent is 4 − 3q + ε(q−1) = ε/3 > 0, so the sum converges even at p = 4', {
      size: FN, maxWidth: txtW, lineHeight: 20,
    });
    const h2 = c2.mainTexBox ? c2.mainTexBox.h : (narrow ? 80 : 40);
    y += h2 + 30;
    const cL = 30;
    const cW = W - 2 * cL - 20;
    const xv = (v) => cL + ((v + 9.8) / 19.8) * cW;
    const rowY = [y + 34, y + 12]; // even j lower row, odd j upper row
    const cs = cores();
    for (const c of cs) {
      const yy = rowY[c.j % 2];
      const col = c.j === 2 ? C2 : c.j === 3 ? CT : C1;
      const op = c.j === 2 || c.j === 3 ? 1 : 0.55;
      svg.appendChild(svgEl('line', {
        x1: xv(c.lo), x2: xv(c.hi), y1: yy, y2: yy, stroke: col, 'stroke-opacity': op, 'stroke-width': 4.5,
      }));
      svg.appendChild(svgEl('line', {
        x1: xv(-c.hi), x2: xv(-c.lo), y1: yy, y2: yy, stroke: C1, 'stroke-opacity': 0.55, 'stroke-width': 4.5,
      }));
    }
    const axV = y + 50;
    const c2c = cs[2];
    const c3c = cs[3];
    svg.appendChild(svgEl('rect', {
      x: xv(c2c.lo), y: axV - 9, width: xv(c3c.hi) - xv(c2c.lo), height: 5, fill: GREY, 'fill-opacity': 0.55,
    }));
    seg(svg, xv(c2c.rho) + 4, rowY[0] - 4, xv(c2c.rho) + 26, y - 16, { stroke: C2, 'stroke-width': 0.9 });
    lab(svg, xv(c2c.rho) + 26, y - 20, '$I^+_{\\mathrm c}(\\rho_2)$', 'I_c^+(ρ2)', { size: FN, fill: C2, anchor: 'middle', clamp: [0, W - 2] });
    seg(svg, xv(c3c.rho) - 4, rowY[1] - 4, xv(c3c.rho) - 26, y - 16, { stroke: CT, 'stroke-width': 0.9 });
    lab(svg, xv(c3c.rho) - 26, y - 20, '$I^+_{\\mathrm c}(\\rho_3)$', 'I_c^+(ρ3)', { size: FN, fill: CT, anchor: 'middle' });
    arrow(svg, xv(-9.8), axV, xv(10) + 4, axV);
    lab(svg, xv(10) + 8, axV + 5, '$v$', 'v', { size: FS });
    for (const [v, t] of [[-9, '-9R'], [0, '0'], [9, '9R']]) {
      seg(svg, xv(v), axV, xv(v), axV + 4);
      lab(svg, xv(v), axV + 20, `$${t}$`, t, { size: FN, anchor: 'middle' });
    }
    lab(svg, xv((c2c.lo + c3c.hi) / 2), axV + 36, 'overlap', 'overlap', { size: FN, fill: DIM, anchor: 'middle' });
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(axV + 46)}`);

    // ---------------------------------------------------- data marks
    view = {
      update(sum) {
        clear(barsA);
        for (let j = 0; j < 12; j += 1) {
          const mv = Math.min(sum.m[j], 1.4);
          barsA.appendChild(svgEl('rect', {
            x: xa(j + 0.1), y: ya(mv), width: xa(0.8) - xa(0), height: ya(0) - ya(mv), fill: C1, 'fill-opacity': 0.6,
          }));
        }
        clear(cellsB);
        const hk = yb(0) - yb(1);
        for (const [j, k, nv] of sum.grid) {
          if (k < kLo || k > kHi + 3) continue;
          const op = Math.min(1, Math.sqrt(nv / 0.19));
          if (op <= 0.01) continue;
          cellsB.appendChild(svgEl('rect', {
            x: xb(j), y: yb(k + 1), width: xb(1) - xb(0), height: Math.max(0.6, hk), fill: C1, 'fill-opacity': op.toFixed(3),
          }));
        }
        const pts = (arr) => {
          let d = '';
          for (let j = 1; j < arr.length; j += 1) {
            if (!(arr[j] > 0)) continue;
            const l = Math.max(-2.9, Math.log10(arr[j]));
            d += `${d ? 'L' : 'M'}${xl(Math.log10(1 + j)).toFixed(1)},${yl(l).toFixed(1)}`;
          }
          return d;
        };
        curveM.setAttribute('d', pts(sum.m));
        curveS.setAttribute('d', pts(sum.supk));
        const at = (arr, j) => yl(Math.max(-2.9, Math.log10(arr[j] || 1e-3)));
        const setPos = (node, x, yy) => {
          if (node.tagName.toLowerCase() === 'text') { node.setAttribute('x', x); node.setAttribute('y', yy); return; }
          node.setAttribute('transform', `translate(${x},${yy})`);
        };
        setPos(labM, xl(Math.log10(6)), at(sum.m, 5) - 10);
        setPos(labS, xl(Math.log10(9)) + 8, at(sum.supk, 8) - 6);
      },
    };
    view.update(state.sum);
  }

  draw();
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}

// The default sample: seed 1, N = 40 000 (integer counts; see compactCounts).
export const DEFAULT_COUNTS = {
  paths: 40000,
  m: [
    52572, 18015, 17761, 16355, 15008, 13900, 13059, 12028, 11563, 10910, 10459, 10286, 9727, 9404, 9109,
    8946, 8594, 8263, 8049, 7799, 7631, 7652, 7443, 7405, 7108, 7128, 6915, 6816, 6737, 6476,
  ],
  supk: [
    43213, 7395, 5374, 3451, 2249, 1559, 1257, 1008, 864, 683, 559, 495, 419, 373, 339,
    303, 252, 228, 206, 184, 171, 159, 146, 140, 125, 129, 117, 106, 107, 100,
  ],
  // [j, k, count] for j < 12
  grid: [
    0, 0, 43213, 0, 1, 6763, 0, 2, 2596, 1, 0, 2, 1, 1, 1727, 1, 2, 7395, 1, 3, 6229, 1, 4, 2230,
    1, 5, 429, 1, 6, 3, 2, 0, 1, 2, 1, 37, 2, 2, 1394, 2, 3, 2641, 2, 4, 4491, 2, 5, 5374,
    2, 6, 1802, 2, 7, 1821, 2, 8, 132, 2, 9, 68, 3, 0, 2, 3, 1, 10, 3, 2, 215, 3, 3, 474,
    3, 4, 2260, 3, 5, 2034, 3, 6, 2997, 3, 7, 3451, 3, 8, 1504, 3, 9, 2393, 3, 10, 608, 3, 11, 309,
    3, 12, 79, 3, 13, 19, 4, 1, 14, 4, 2, 79, 4, 3, 158, 4, 4, 720, 4, 5, 790, 4, 6, 1944,
    4, 7, 1656, 4, 8, 2032, 4, 9, 2249, 4, 10, 1721, 4, 11, 1521, 4, 12, 1156, 4, 13, 430, 4, 14, 385,
    4, 15, 80, 4, 16, 62, 4, 17, 1, 4, 18, 10, 5, -1, 4, 5, 0, 2, 5, 1, 12, 5, 2, 64,
    5, 3, 91, 5, 4, 343, 5, 5, 300, 5, 6, 919, 5, 7, 754, 5, 8, 1475, 5, 9, 1559, 5, 10, 1445,
    5, 11, 1542, 5, 12, 1485, 5, 13, 986, 5, 14, 1305, 5, 15, 472, 5, 16, 658, 5, 17, 139, 5, 18, 273,
    5, 19, 35, 5, 20, 26, 5, 21, 6, 5, 22, 5, 6, -1, 3, 6, 0, 10, 6, 1, 12, 6, 2, 38,
    6, 3, 52, 6, 4, 187, 6, 5, 197, 6, 6, 471, 6, 7, 447, 6, 8, 849, 6, 9, 921, 6, 10, 986,
    6, 11, 1244, 6, 12, 1106, 6, 13, 1040, 6, 14, 1257, 6, 15, 756, 6, 16, 1177, 6, 17, 438, 6, 18, 828,
    6, 19, 347, 6, 20, 319, 6, 21, 189, 6, 22, 67, 6, 23, 77, 6, 24, 14, 6, 25, 16, 6, 26, 5,
    6, 27, 6, 7, -6, 1, 7, -2, 2, 7, -1, 5, 7, 0, 5, 7, 1, 17, 7, 2, 41, 7, 3, 46,
    7, 4, 157, 7, 5, 142, 7, 6, 285, 7, 7, 273, 7, 8, 524, 7, 9, 529, 7, 10, 627, 7, 11, 897,
    7, 12, 777, 7, 13, 958, 7, 14, 890, 7, 15, 770, 7, 16, 1008, 7, 17, 584, 7, 18, 872, 7, 19, 564,
    7, 20, 537, 7, 21, 477, 7, 22, 277, 7, 23, 322, 7, 24, 102, 7, 25, 172, 7, 26, 31, 7, 27, 83,
    7, 28, 19, 7, 29, 14, 7, 30, 13, 7, 31, 3, 7, 32, 2, 7, 33, 1, 7, 34, 1, 8, -3, 1,
    8, -2, 1, 8, -1, 8, 8, 0, 9, 8, 1, 15, 8, 2, 33, 8, 3, 38, 8, 4, 95, 8, 5, 88,
    8, 6, 205, 8, 7, 179, 8, 8, 334, 8, 9, 389, 8, 10, 425, 8, 11, 587, 8, 12, 528, 8, 13, 727,
    8, 14, 671, 8, 15, 737, 8, 16, 756, 8, 17, 607, 8, 18, 864, 8, 19, 604, 8, 20, 655, 8, 21, 651,
    8, 22, 401, 8, 23, 543, 8, 24, 254, 8, 25, 385, 8, 26, 124, 8, 27, 234, 8, 28, 124, 8, 29, 114,
    8, 30, 71, 8, 31, 28, 8, 32, 48, 8, 33, 6, 8, 34, 14, 8, 35, 3, 8, 36, 3, 8, 37, 1,
    8, 38, 2, 8, 39, 1, 9, -4, 1, 9, -3, 5, 9, -2, 2, 9, -1, 5, 9, 0, 10, 9, 1, 22,
    9, 2, 29, 9, 3, 31, 9, 4, 80, 9, 5, 67, 9, 6, 141, 9, 7, 151, 9, 8, 257, 9, 9, 258,
    9, 10, 295, 9, 11, 390, 9, 12, 343, 9, 13, 497, 9, 14, 453, 9, 15, 613, 9, 16, 580, 9, 17, 582,
    9, 18, 683, 9, 19, 542, 9, 20, 647, 9, 21, 566, 9, 22, 441, 9, 23, 573, 9, 24, 355, 9, 25, 538,
    9, 26, 205, 9, 27, 411, 9, 28, 219, 9, 29, 228, 9, 30, 201, 9, 31, 104, 9, 32, 143, 9, 33, 46,
    9, 34, 80, 9, 35, 19, 9, 36, 45, 9, 37, 15, 9, 38, 14, 9, 39, 11, 9, 40, 4, 9, 41, 5,
    9, 43, 1, 9, 47, 1, 9, 49, 1, 10, -8, 5, 10, -6, 2, 10, -5, 3, 10, -4, 3, 10, -3, 7,
    10, -2, 5, 10, -1, 13, 10, 0, 13, 10, 1, 21, 10, 2, 35, 10, 3, 27, 10, 4, 68, 10, 5, 49,
    10, 6, 95, 10, 7, 94, 10, 8, 193, 10, 9, 192, 10, 10, 259, 10, 11, 307, 10, 12, 253, 10, 13, 420,
    10, 14, 330, 10, 15, 423, 10, 16, 397, 10, 17, 483, 10, 18, 515, 10, 19, 450, 10, 20, 559, 10, 21, 519,
    10, 22, 489, 10, 23, 493, 10, 24, 362, 10, 25, 527, 10, 26, 297, 10, 27, 490, 10, 28, 300, 10, 29, 294,
    10, 30, 296, 10, 31, 175, 10, 32, 265, 10, 33, 109, 10, 34, 191, 10, 35, 49, 10, 36, 131, 10, 37, 54,
    10, 38, 45, 10, 39, 42, 10, 40, 24, 10, 41, 30, 10, 42, 12, 10, 43, 24, 10, 44, 2, 10, 45, 8,
    10, 46, 1, 10, 47, 4, 10, 48, 1, 10, 49, 2, 10, 50, 1, 10, 56, 1, 11, -9, 1, 11, -8, 1,
    11, -6, 3, 11, -5, 6, 11, -4, 4, 11, -3, 10, 11, -2, 2, 11, -1, 17, 11, 0, 19, 11, 1, 17,
    11, 2, 19, 11, 3, 24, 11, 4, 69, 11, 5, 38, 11, 6, 113, 11, 7, 52, 11, 8, 141, 11, 9, 165,
    11, 10, 190, 11, 11, 215, 11, 12, 200, 11, 13, 319, 11, 14, 287, 11, 15, 357, 11, 16, 327, 11, 17, 388,
    11, 18, 442, 11, 19, 391, 11, 20, 443, 11, 21, 430, 11, 22, 433, 11, 23, 478, 11, 24, 390, 11, 25, 495,
    11, 26, 341, 11, 27, 460, 11, 28, 334, 11, 29, 335, 11, 30, 312, 11, 31, 228, 11, 32, 331, 11, 33, 155,
    11, 34, 282, 11, 35, 120, 11, 36, 235, 11, 37, 113, 11, 38, 115, 11, 39, 96, 11, 40, 47, 11, 41, 80,
    11, 42, 33, 11, 43, 60, 11, 44, 22, 11, 45, 34, 11, 46, 15, 11, 47, 15, 11, 48, 13, 11, 49, 2,
    11, 50, 6, 11, 51, 6, 11, 52, 7, 11, 54, 1, 11, 55, 1, 11, 57, 1,
  ],
};
