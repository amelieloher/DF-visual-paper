// fig.doeblin-fourier (content/figures/fig.doeblin-fourier.yaml): main-4
// Figure 2, rebuilt from the approved TikZ drawing (figures/tikz/
// fig.doeblin-fourier.tex) with paths simulated in the browser.
//
// (a) 1 paths: the centre lines gamma_1 = v, gamma_2 = v + ell(t-s) e,
//     ell(t) = min{t, 1, L_0 - t}, L_0 = 1 + pi, their tubes of radius eta,
//     the shaded area a_2 - a_1 = pi, the continuation box D = B_{4rho}(v),
//     and two simulated velocity paths per tube.
// (b) 2 common lower bound Theta: velocity marginals at time T by rows of
//     terminal velocity w (counts of simulated paths), Theta <= nu_1, nu_2.
// (c) 3 cancellation: the windows |e.x - Phi_i| <= eps at a crest and a
//     trough of cos(e.x - Phi_1), retained (filled) and trimmed (hollow)
//     dots in the same rows.
// The model is the one of visual-final/src/tikz_data.py fig1(): a slow
// velocity diffusion kept in the tube by an h-transform drift, with a
// rough (checkerboard) coefficient, then a free diffusion clipped to D.
// Everything is in ONE <svg> (the audit snapshot captures the first svg);
// "New sample" / "Play" and the simulated parameters are HTML above it.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import { Rng, freshSeed, subSeed } from './lib/rng.mjs';
import { isSnapshotMode, measuredWidth, watchResize } from './lib/svgkit.mjs';
import { showAssertionError } from './lib/theme.mjs';
import {
  arrow, lab, makeClock, polyD, seg, simControls,
} from './lib/toyrun.mjs';

const FIG_ID = 'fig.doeblin-fourier';
export const DEFAULT_SEED = 4;
const L0 = 1 + Math.PI;
export const DF = {
  eta: 0.07, // tube radius as drawn
  rr: 0.45, // 4 rho, radius of D as drawn
  cont: 0.55, // drawn length of the continuation time 4 rho^2 (not to scale)
  diff: 0.004, // diffusion of the tube paths
  contDiff: 0.05, // diffusion of the continuation
  dt: 5e-4,
  eps: 0.22, // window half-width as drawn, below 1/4
  shown: 2, // paths drawn per tube
  perFamily: 16, // simulated paths per family counted in (b), (c)
  rows: 7, // rows of terminal velocity
  every: 8, // keep every 8th time step for drawing
};

export function ell(t) {
  return Math.max(0, Math.min(t, 1, L0 - t));
}

function mod2(n) { return ((n % 2) + 2) % 2; }

/**
 * One velocity path kept in the tube around `center` (tikz_data.py
 * tube_paths): y = w - center(t) with |y| <= 0.95 eta, an h-transform
 * drift -2 a k tan(k y), k = pi/(2 eta), and a(t, w) = diff * (1 or 3) on
 * a checkerboard of cells 0.37 x 0.11; then the continuation in D
 * (continuation): w += sqrt(2 contDiff dt) N, clipped to 0.97 * 4rho.
 * Returns the full trajectory as Float64Arrays (t, w).
 */
export function simulatePath(rng, center, p = DF) {
  const nTube = Math.floor((L0 + p.dt / 2) / p.dt); // steps on [0, L0]
  const nCont = Math.floor((p.cont + p.dt / 2) / p.dt);
  const n = nTube + nCont + 1;
  const t = new Float64Array(n);
  const w = new Float64Array(n);
  const k = Math.PI / (2 * p.eta);
  const yMax = 0.95 * p.eta;
  let y = 0;
  w[0] = center(0);
  for (let i = 0; i < nTube; i += 1) {
    const ti = i * p.dt;
    const c = center(ti);
    const a = p.diff * (mod2(Math.floor(ti / 0.37) + Math.floor((c + y) / 0.11)) ? 1.0 : 3.0);
    const ky = Math.max(-1.45, Math.min(1.45, k * y));
    y = y - 2 * a * k * Math.tan(ky) * p.dt + Math.sqrt(2 * a * p.dt) * rng.normal();
    y = Math.max(-yMax, Math.min(yMax, y));
    t[i + 1] = (i + 1) * p.dt;
    w[i + 1] = center(t[i + 1]) + y;
  }
  // tube_paths' last grid point is at nTube * dt (just below L0); the
  // continuation starts there from L0 (tikz_data.py concatenates the two).
  const wMax = 0.97 * p.rr;
  let cur = w[nTube];
  const sd = Math.sqrt(2 * p.contDiff * p.dt);
  for (let i = 0; i < nCont; i += 1) {
    cur = Math.max(-wMax, Math.min(wMax, cur + sd * rng.normal()));
    t[nTube + 1 + i] = L0 + (i + 1) * p.dt;
    w[nTube + 1 + i] = cur;
  }
  return { t, w, nTube };
}

/** Row (0 = lowest) of a terminal velocity w in [-4rho, 4rho]: seven rows of height 2/7 (in units of 4 rho). */
export function rowOf(w, p = DF) {
  const u = w / p.rr;
  return Math.max(0, Math.min(p.rows - 1, Math.floor((u + 1) * (p.rows / 2))));
}

/**
 * The whole sample for one seed: `shown` drawn paths per family (every
 * `every`-th point), the terminal velocities of `perFamily` paths per
 * family, their counts nu_i by rows, Theta = the smaller count in each
 * row, and the (not simulated) horizontal jitter of the dots in (c).
 */
export function simulateDoeblin(seed = DEFAULT_SEED, p = DF) {
  const centers = [() => 0, ell];
  const fam = [0, 1].map((f) => {
    const drawn = [];
    const ends = [];
    let maxTubeDev = 0;
    for (let j = 0; j < p.perFamily; j += 1) {
      const rng = new Rng(subSeed(seed, 1000 * f + j));
      const path = simulatePath(rng, centers[f], p);
      for (let i = 0; i <= path.nTube; i += 1) maxTubeDev = Math.max(maxTubeDev, Math.abs(path.w[i] - centers[f](path.t[i])));
      ends.push(path.w[path.w.length - 1]);
      if (j < p.shown) {
        const m = Math.ceil(path.t.length / p.every);
        const ts = new Float64Array(m);
        const ws = new Float64Array(m);
        for (let i = 0; i < m; i += 1) { ts[i] = path.t[i * p.every]; ws[i] = path.w[i * p.every]; }
        drawn.push({ t: ts, w: ws });
      }
    }
    const nu = new Array(p.rows).fill(0);
    for (const w of ends) nu[rowOf(w, p)] += 1;
    return {
      drawn, ends, nu, maxTubeDev,
    };
  });
  const theta = fam[0].nu.map((n1, r) => Math.min(n1, fam[1].nu[r]));
  const jr = new Rng(subSeed(seed, 9999));
  const jitter = [0, 1].map((f) => fam[f].nu.map((n) => Array.from({ length: n }, () => 0.85 * p.eps * (2 * jr.uniform() - 1))));
  return {
    seed, fam, theta, jitter,
  };
}

/** The "what must hold" list of the design brief, on a sample. */
export function checkSample(s, p = DF) {
  const area = 0.5 * 1 * 1 + (Math.PI - 1) * 1 + 0.5 * 1 * 1; // polygon (0,0),(1,1),(pi,1),(L0,0)
  if (Math.abs(area - Math.PI) > 1e-12) throw new Error('the area between the centre lines is not pi');
  for (const f of s.fam) {
    if (f.maxTubeDev > 0.95 * p.eta + 1e-12) throw new Error('a tube path left its tube');
    for (const w of f.ends) if (Math.abs(w) > 0.97 * p.rr + 1e-12) throw new Error('a continued path left D');
  }
  s.theta.forEach((th, r) => {
    if (th > s.fam[0].nu[r] || th > s.fam[1].nu[r]) throw new Error('Theta exceeds a marginal');
  });
}

const C1 = 'var(--fig-1)';
const C2 = 'var(--fig-2)';
const CT = 'var(--fig-theta)';
const CG = 'var(--fig-grey)';
const INK = 'var(--text)';
const BG = 'var(--surface)';

function stepMark(parent, x, y, n) {
  const c = svgEl('circle', {
    cx: x, cy: y - 5, r: 10, fill: INK,
  });
  parent.appendChild(c);
  parent.appendChild(svgEl('text', {
    x: x - 4, y: y, 'font-size': 13, 'font-weight': 700, fill: BG,
  }, [String(n)]));
  return c;
}

export function render(el, { snapshot = isSnapshotMode() } = {}) {
  try {
    renderInner(el, snapshot);
  } catch (err) {
    showAssertionError(el, FIG_ID, err.message);
  }
}

function renderInner(el, snapshot) {
  clear(el);
  const state = { seed: DEFAULT_SEED, sample: null };
  const root = htmlEl('div', { class: 'd3-figure' });
  const svgHost = htmlEl('div', { style: 'width:100%' });
  const note = 'Paths simulated in your browser (numerical illustration): two velocity paths per tube (radius $\\eta=0.07$ as drawn, rough coefficient), then a common continuation in $D$ ($4\\rho=0.45$; drawn time $0.55$, not to scale). In (b) and (c), the terminal velocities of 16 simulated paths per family, counted by rows of $w$; $\\Theta$ is the smaller count in each row (in the proof, $\\Theta$ comes from the parabolic Harnack inequality, and equal mass is retained at each $w$), and the dot positions inside the windows are schematic. The tubes, $D$, the windows and $\\Phi_2-\\Phi_1=\\pi$ are the paper\u2019s construction.';
  const noteText = 'Paths simulated in your browser (numerical illustration): two velocity paths per tube (radius η = 0.07 as drawn, rough coefficient), then a common continuation in D (4ρ = 0.45; drawn time 0.55, not to scale). In (b) and (c), the terminal velocities of 16 simulated paths per family, counted by rows of w; Θ is the smaller count in each row (in the proof, Θ comes from the parabolic Harnack inequality, and equal mass is retained at each w), and the dot positions inside the windows are schematic. The tubes, D, the windows and Φ2 − Φ1 = π are the paper’s construction.';
  let view = null; // dynamic handles of the current drawing
  const clock = makeClock({
    duration: 9000,
    onFrame: (p) => { if (view) view.frame(p); },
    onEnd: () => { ctl.setPlaying(false); if (view) view.frame(1); },
    alive: () => el.isConnected,
  });
  const ctl = simControls({
    canPlay: true,
    note,
    noteText,
    onNewSample: () => {
      state.seed = freshSeed();
      resample();
      if (clock.playing) clock.play();
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

  function resample() {
    state.sample = simulateDoeblin(state.seed);
    checkSample(state.sample);
    ctl.setSeed(state.seed);
    draw();
  }

  function draw() {
    const s = state.sample;
    const W = Math.max(340, Math.min(940, Math.round(measuredWidth(svgHost, 820))));
    const narrow = W < 640;
    const FS = 13;
    const FN = 12;
    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'Doeblin-Fourier cancellation: simulated paths in two tubes, the common lower bound of the velocity marginals, and the two windows of opposite phase',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    let y0 = 0;
    if (snapshot) {
      svg.appendChild(svgEl('text', {
        x: 8, y: 14, 'font-size': 10, fill: 'var(--text-dim)',
      }, [`controls: New sample, Play (t from s to T, then 2, 3); seed ${s.seed}; paths simulated (numerical illustration)`]));
      y0 = 24;
    }

    // ---------------------------------------------------------- (a) paths
    const A = svgEl('g', { transform: `translate(0,${y0})` });
    svg.appendChild(A);
    const ml = 82;
    const mr = 34;
    const wa = W - ml - mr;
    const tMax = L0 + DF.cont + 0.25;
    const xa = (t) => ml + ((t + 0.06) / (tMax + 0.06)) * wa;
    const ha = Math.max(170, Math.min(270, 0.36 * wa));
    const topA = 40;
    const ya = (y) => topA + ((1.32 - y) / 1.94) * ha;
    lab(A, 8, 22, '(a)', '(a)', { size: FS });
    const mark1 = stepMark(A, 46, 22, 1);
    lab(A, 62, 22, 'paths', 'paths', { size: FS + 1, weight: 700 });
    // area between the centre lines (= a_2 - a_1 = pi)
    A.appendChild(svgEl('path', {
      d: `M${xa(0)},${ya(0)} L${xa(1)},${ya(1)} L${xa(Math.PI)},${ya(1)} L${xa(L0)},${ya(0)} Z`, fill: C2, 'fill-opacity': 0.1,
    }));
    const e = DF.eta;
    A.appendChild(svgEl('path', {
      d: `M${xa(0)},${ya(-e)} L${xa(L0)},${ya(-e)} L${xa(L0)},${ya(e)} L${xa(0)},${ya(e)} Z`, fill: C1, 'fill-opacity': 0.22,
    }));
    A.appendChild(svgEl('path', {
      d: `M${xa(0)},${ya(e)} L${xa(1)},${ya(1 + e)} L${xa(Math.PI)},${ya(1 + e)} L${xa(L0)},${ya(e)} L${xa(L0)},${ya(-e)} L${xa(Math.PI)},${ya(1 - e)} L${xa(1)},${ya(1 - e)} L${xa(0)},${ya(-e)} Z`,
      fill: C2,
      'fill-opacity': 0.28,
    }));
    A.appendChild(svgEl('rect', {
      x: xa(L0), y: ya(DF.rr), width: xa(L0 + DF.cont) - xa(L0), height: ya(-DF.rr) - ya(DF.rr), fill: CT, 'fill-opacity': 0.12, stroke: CT, 'stroke-width': 0.8,
    }));
    seg(A, xa(0), ya(0), xa(L0), ya(0), { stroke: C1, 'stroke-dasharray': '4 3' });
    A.appendChild(svgEl('path', {
      d: `M${xa(0)},${ya(0)} L${xa(1)},${ya(1)} L${xa(Math.PI)},${ya(1)} L${xa(L0)},${ya(0)}`, fill: 'none', stroke: C2, 'stroke-dasharray': '4 3',
    }));
    // simulated paths (dynamic: drawn up to the clock's time)
    const pathEls = [];
    s.fam.forEach((f, fi) => {
      for (const pth of f.drawn) {
        const node = svgEl('path', {
          d: '', fill: 'none', stroke: fi === 0 ? C1 : C2, 'stroke-width': 1.1, 'stroke-linejoin': 'round',
        });
        A.appendChild(node);
        pathEls.push({ node, pth });
      }
    });
    // terminal velocities of all simulated paths, at time T (they are counted in (b), (c))
    const endG = svgEl('g');
    A.appendChild(endG);
    s.fam.forEach((f, fi) => {
      for (const w of f.ends) {
        endG.appendChild(svgEl('line', {
          x1: xa(L0 + DF.cont) + 2 + 5 * fi, x2: xa(L0 + DF.cont) + 7 + 5 * fi, y1: ya(w), y2: ya(w), stroke: fi === 0 ? C1 : C2, 'stroke-width': 1.2,
        }));
      }
    });
    // time cursor (Play)
    const cursor = svgEl('line', {
      x1: 0, x2: 0, y1: ya(1.3), y2: ya(-0.62), stroke: 'var(--text-dim)', 'stroke-width': 1, 'stroke-dasharray': '2 3', visibility: 'hidden',
    });
    A.appendChild(cursor);
    // axes
    const yAx = ya(-0.62);
    const xAx = xa(-0.06);
    arrow(A, xAx, yAx, xa(tMax) + 6, yAx);
    arrow(A, xAx, yAx, xAx, ya(1.34));
    lab(A, xa(tMax) + 10, yAx + 5, '$t$', 't', { size: FS });
    lab(A, xAx - 6, ya(1.34) + 4, '$e\\cdot w$', 'e·w', { size: FS, anchor: 'end' });
    for (const [t, tex, plain] of [[0, 's', 's'], [1, 's+1', 's+1'], [Math.PI, 's+\\pi', 's+π'], [L0, 's+L_0', 's+L0'], [L0 + DF.cont, 'T', 'T']]) {
      seg(A, xa(t), yAx, xa(t), yAx + 4);
      lab(A, xa(t), yAx + 19, `$${tex}$`, plain, { size: FN, anchor: 'middle' });
    }
    for (const [yv, tex, plain] of [[0, 'e\\cdot v', 'e·v'], [1, 'e\\cdot v+1', 'e·v+1']]) {
      seg(A, xAx, ya(yv), xAx - 4, ya(yv));
      lab(A, xAx - 7, ya(yv) + 4, `$${tex}$`, plain, { size: FN, anchor: 'end' });
    }
    lab(A, xa(2.07), ya(1.08) - 6, '$\\gamma_2(t)=v+\\ell(t-s)\\,e$', 'γ2(t) = v + ℓ(t−s) e', { size: FS, fill: C2, anchor: 'middle' });
    lab(A, xa(2.07), ya(-0.09) + 15, '$\\gamma_1(t)=v$', 'γ1(t) = v', { size: FS, fill: C1, anchor: 'middle' });
    lab(A, xa(2.07), ya(0.5) + 5, 'area $=a_2-a_1=\\pi$', 'area = a2 − a1 = π', { size: FS, anchor: 'middle' });
    {
      const tx = narrow ? 3.55 : 3.85;
      const tip = [xa(3.62), ya(0.52 + e)];
      const base = [xa(tx), ya(0.9)];
      arrow(A, base[0], base[1], tip[0], tip[1], { width: 0.9, head: 6 });
      lab(A, base[0], base[1] - 22, 'tube', 'tube', { size: FN, anchor: 'middle' });
      lab(A, base[0], base[1] - 6, '$\\abs{w-\\gamma_2(t)}<\\eta$', '|w − γ2(t)| < η', { size: FN, anchor: 'middle', halo: true });
    }
    const dMid = xa(L0 + DF.cont / 2);
    lab(A, dMid, ya(DF.rr) - 26, '$D=B_{4\\rho}(v)$', 'D = B4ρ(v)', {
      size: FN, fill: CT, anchor: 'middle', clamp: [0, W - 2],
    });
    lab(A, dMid, ya(DF.rr) - 6, 'time $4\\rho^2$', 'time 4ρ²', {
      size: FN, fill: CT, anchor: 'middle', clamp: [0, W - 2],
    });
    y0 += yAx + 34;

    // ---------------------------------------- lower row: (b) and (c)
    const S = narrow ? 72 : Math.max(80, Math.min(108, 0.135 * W)); // px per unit of w (units of 4 rho)
    const rowsY = Array.from({ length: DF.rows }, (_, r) => -6 / 7 + (2 * r) / 7);
    const bW = narrow ? W - 40 : Math.round(0.36 * W);
    const bX = narrow ? 28 : 24;
    const cX = narrow ? 70 : Math.round(0.47 * W);
    const cW = narrow ? W - 70 - 26 : W - cX - 26;
    const headH = 30;

    // (b)
    const B = svgEl('g', { transform: `translate(${bX},${y0})` });
    svg.appendChild(B);
    lab(B, 0, 18, '(b)', '(b)', { size: FS });
    const mark2 = stepMark(B, 38, 18, 2);
    lab(B, 54, 18, 'common lower bound $\\Theta$', 'common lower bound Θ', { size: FS + 1, weight: 700 });
    lab(B, bW / 2, headH + 18, 'velocity marginals at time $T$', 'velocity marginals at time T', { size: FN, anchor: 'middle' });
    const topB = headH + 40;
    const yb = (u) => topB + (1.25 - u) * S;
    const maxNu = Math.max(5, ...s.fam[0].nu, ...s.fam[1].nu);
    const xb0 = 22;
    const xbw = Math.min(bW - xb0 - 50, 280);
    const xb = (m) => xb0 + (m / (maxNu + 1)) * xbw;
    const barsG = svgEl('g');
    B.appendChild(barsG);
    rowsY.forEach((w, r) => {
      const th = s.theta[r];
      const n1 = s.fam[0].nu[r];
      const n2 = s.fam[1].nu[r];
      const hb = 0.105 * S;
      if (th > 0) {
        barsG.appendChild(svgEl('rect', {
          x: xb(0), y: yb(w + 0.115), width: xb(th) - xb(0), height: hb, fill: CT, 'fill-opacity': 0.45,
        }));
        barsG.appendChild(svgEl('rect', {
          x: xb(0), y: yb(w - 0.01), width: xb(th) - xb(0), height: hb, fill: CT, 'fill-opacity': 0.45,
        }));
      }
      if (n1 > 0) {
        barsG.appendChild(svgEl('rect', {
          x: xb(0), y: yb(w + 0.115), width: xb(n1) - xb(0), height: hb, fill: 'none', stroke: C1, 'stroke-width': 1,
        }));
      }
      if (n2 > 0) {
        barsG.appendChild(svgEl('rect', {
          x: xb(0), y: yb(w - 0.01), width: xb(n2) - xb(0), height: hb, fill: 'none', stroke: C2, 'stroke-width': 1,
        }));
      }
    });
    arrow(B, xb(0), yb(-1.18), xb(0), yb(1.27));
    arrow(B, xb(0), yb(-1.18), xb(maxNu + 1) + 8, yb(-1.18));
    lab(B, xb(0) - 8, yb(1.27) + 4, '$w$', 'w', { size: FS, anchor: 'end' });
    lab(B, xb(maxNu + 1) + 8, yb(-1.18) + 18, 'mass', 'mass', { size: FN, anchor: 'end' });
    // legend: swatches (outline nu_1 upper, outline nu_2 lower, filled Theta)
    const lgY = yb(-1.18) + 36;
    const sw = (yy, attrs) => B.appendChild(svgEl('rect', {
      x: xb(0), y: yy - 9, width: 18, height: 9, ...attrs,
    }));
    sw(lgY, { fill: 'none', stroke: C1 });
    lab(B, xb(0) + 24, lgY, 'upper bars: $\\nu_1$', 'upper bars: ν1', { size: FN, fill: C1 });
    sw(lgY + 18, { fill: 'none', stroke: C2 });
    lab(B, xb(0) + 24, lgY + 18, 'lower bars: $\\nu_2$', 'lower bars: ν2', { size: FN, fill: C2 });
    sw(lgY + 36, { fill: CT, 'fill-opacity': 0.45 });
    lab(B, xb(0) + 24, lgY + 36, 'filled: $\\Theta\\le\\nu_1,\\ \\Theta\\le\\nu_2$', 'filled: Θ ≤ ν1, Θ ≤ ν2', { size: FN, fill: CT });
    const bBottom = lgY + 44;

    // (c)
    const cY = narrow ? y0 + bBottom + 22 : y0;
    const Cg = svgEl('g', { transform: `translate(${cX},${cY})` });
    svg.appendChild(Cg);
    const cTitleX = narrow ? bX - cX : 0;
    lab(Cg, cTitleX, 18, '(c)', '(c)', { size: FS });
    const mark3 = stepMark(Cg, cTitleX + 38, 18, 3);
    lab(Cg, cTitleX + 54, 18, 'cancellation', 'cancellation', { size: FS + 1, weight: 700 });
    if (!narrow) arrow(svg, bX + bW - 6, y0 + 13, cX - 14, y0 + 13, { color: 'var(--text-dim)', width: 1.6, head: 9 });
    const xc = (x) => ((x + 1.0) / 5.55) * cW;
    const topC = headH + 6;
    const yc = (u) => topC + (2.0 - u) * S * 0.98;
    const P1 = 0;
    const P2 = Math.PI;
    const ep = DF.eps;
    // the wave and its crest/trough
    let wave = '';
    for (let i = 0; i <= 90; i += 1) {
      const x = -1.0 + (5.5 * i) / 90;
      wave += `${i ? 'L' : 'M'}${xc(x).toFixed(1)},${yc(1.62 + 0.28 * Math.cos(x)).toFixed(1)}`;
    }
    Cg.appendChild(svgEl('path', {
      d: wave, fill: 'none', stroke: INK, 'stroke-width': 0.9,
    }));
    lab(Cg, xc(4.55), yc(1.66) - 14, '$\\cos(e\\cdot x-\\Phi_1)$', 'cos(e·x − Φ1)', { size: FN, anchor: 'end' });
    Cg.appendChild(svgEl('circle', {
      cx: xc(P1), cy: yc(1.9), r: 3, fill: C1,
    }));
    Cg.appendChild(svgEl('circle', {
      cx: xc(P2), cy: yc(1.34), r: 3, fill: C2,
    }));
    for (const [P, c] of [[P1, C1], [P2, C2]]) {
      Cg.appendChild(svgEl('rect', {
        x: xc(P - ep), y: yc(1), width: xc(P + ep) - xc(P - ep), height: yc(-1) - yc(1), fill: c, 'fill-opacity': 0.08, stroke: c, 'stroke-opacity': 0.6, 'stroke-width': 0.9,
      }));
      seg(Cg, xc(P), yc(-1), xc(P), yc(1.9), { stroke: CG, 'stroke-dasharray': '1.5 2.5' });
    }
    const dotsG = svgEl('g');
    Cg.appendChild(dotsG);
    rowsY.forEach((w, r) => {
      [[P1, C1, 0], [P2, C2, 1]].forEach(([P, c, fi]) => {
        const xs = s.jitter[fi][r];
        xs.forEach((dx, k) => {
          const retained = k < s.theta[r];
          dotsG.appendChild(svgEl('circle', {
            cx: xc(P + dx), cy: yc(w), r: 3.4, fill: retained ? c : BG, stroke: c, 'stroke-width': retained ? 0 : 1.1,
          }));
        });
      });
    });
    const eqG = svgEl('g');
    Cg.appendChild(eqG);
    eqG.appendChild(svgEl('line', {
      x1: xc(P1 + ep), y1: yc(0), x2: xc(P2 - ep), y2: yc(0), stroke: CT, 'stroke-width': 1.6, 'stroke-dasharray': '6 4',
    }));
    lab(eqG, xc(Math.PI / 2), yc(0) - 26, 'equal retained', 'equal retained', { size: FN, fill: CT, anchor: 'middle' });
    lab(eqG, xc(Math.PI / 2), yc(0) - 10, 'mass at each $w$', 'mass at each w', { size: FN, fill: CT, anchor: 'middle' });
    const yAxC = yc(-1.18);
    arrow(Cg, xc(-1.0), yAxC, xc(4.55) + 6, yAxC);
    lab(Cg, xc(4.55) + 4, yAxC + 18, '$e\\cdot x$', 'e·x', { size: FS, anchor: 'end' });
    seg(Cg, xc(P1), yAxC, xc(P1), yAxC + 4);
    lab(Cg, xc(P1), yAxC + 19, '$\\Phi_1$', 'Φ1', { size: FN, anchor: 'middle' });
    seg(Cg, xc(P2), yAxC, xc(P2), yAxC + 4);
    lab(Cg, xc(P2), yAxC + 19, '$\\Phi_2=\\Phi_1+\\pi$', 'Φ2 = Φ1 + π', { size: FN, anchor: 'middle', clamp: [-cX + 2, cW + 20] });
    arrow(Cg, xc(-1.0), yAxC, xc(-1.0), yc(1.25));
    lab(Cg, xc(-1.0) - 6, yc(1.25) + 4, '$w$', 'w', { size: FS, anchor: 'end' });
    for (const [u, tex, plain] of [[-1, 'v-4\\rho', 'v−4ρ'], [0, 'v', 'v'], [1, 'v+4\\rho', 'v+4ρ']]) {
      seg(Cg, xc(-1.0), yc(u), xc(-1.0) - 4, yc(u));
      lab(Cg, xc(-1.0) - 6, yc(u) + 4, `$${tex}$`, plain, { size: FN, anchor: 'end' });
    }
    // brace 2 epsilon over the second window
    {
      const yB = yc(1.04);
      const x1 = xc(P2 - ep);
      const x2 = xc(P2 + ep);
      Cg.appendChild(svgEl('path', {
        d: `M${x1},${yB} Q${x1},${yB - 4} ${x1 + 4},${yB - 4} L${(x1 + x2) / 2 - 3},${yB - 4} L${(x1 + x2) / 2},${yB - 8} L${(x1 + x2) / 2 + 3},${yB - 4} L${x2 - 4},${yB - 4} Q${x2},${yB - 4} ${x2},${yB}`,
        fill: 'none',
        stroke: INK,
        'stroke-width': 0.9,
      }));
      lab(Cg, (x1 + x2) / 2, yB - 12, '$2\\varepsilon$', '2ε', { size: FN, anchor: 'middle', halo: true });
    }
    lab(Cg, xc(P1 - ep) - 5, yc(0.85) + 4, '$F_1$', 'F1', { size: FS, fill: C1, anchor: 'end' });
    lab(Cg, xc(P2 - ep) - 5, yc(0.85) + 4, '$F_2$', 'F2', { size: FS, fill: C2, anchor: 'end' });
    // legend
    const lY = yAxC + 42;
    Cg.appendChild(svgEl('circle', {
      cx: xc(-0.9), cy: lY - 4, r: 3.4, fill: CG,
    }));
    lab(Cg, xc(-0.9) + 8, lY, 'retained $F_i$', 'retained F_i', { size: FN });
    const hx = xc(-0.9) + 100;
    Cg.appendChild(svgEl('circle', {
      cx: hx, cy: lY - 4, r: 3.4, fill: BG, stroke: CG, 'stroke-width': 1.1,
    }));
    lab(Cg, hx + 8, lY, 'trimmed $E_i-F_i$', 'trimmed E_i − F_i', { size: FN });
    const twoLines = cW < 420;
    lab(Cg, twoLines ? xc(-0.9) - 4 : hx + 132, twoLines ? lY + 20 : lY, 'rows of $w$: $n=1$', 'rows of w: n = 1', { size: FN, fill: 'var(--text-dim)' });
    const cBottom = lY + (twoLines ? 28 : 10);
    const total = narrow ? cY + cBottom + 8 : y0 + Math.max(bBottom, cBottom) + 8;
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(total)}`);

    // ---------------------------------------------------- animation
    const tEnd = L0 + DF.cont;
    const marks = [mark1, mark2, mark3];
    function setActive(k) {
      marks.forEach((m, i) => m.setAttribute('fill', i === k ? 'var(--accent)' : INK));
    }
    view = {
      frame(p) {
        // phase 1 (p < 0.62): time runs from s to T in (a); phase 2: (b); phase 3: (c)
        const t = p >= 1 ? tEnd : Math.min(tEnd, (p / 0.62) * tEnd);
        for (const { node, pth } of pathEls) {
          let n = 0;
          while (n < pth.t.length && pth.t[n] <= t + 1e-9) n += 1;
          node.setAttribute('d', polyD(pth.t, pth.w, 0, Math.max(1, n), xa, ya));
        }
        const done = p >= 1;
        cursor.setAttribute('visibility', done ? 'hidden' : 'visible');
        cursor.setAttribute('x1', xa(t));
        cursor.setAttribute('x2', xa(t));
        const showB = done || p >= 0.62;
        const showC = done || p >= 0.81;
        endG.setAttribute('visibility', showB ? 'visible' : 'hidden');
        barsG.setAttribute('visibility', showB ? 'visible' : 'hidden');
        dotsG.setAttribute('visibility', showC ? 'visible' : 'hidden');
        eqG.setAttribute('visibility', showC ? 'visible' : 'hidden');
        setActive(done ? -1 : p < 0.62 ? 0 : p < 0.81 ? 1 : 2);
      },
    };
    view.frame(clock.playing ? clock.progress : 1);
  }

  resample();
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}
