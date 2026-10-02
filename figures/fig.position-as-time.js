// fig.position-as-time (content/figures/fig.position-as-time.yaml): the
// companion's Figure fig:ka-clock, rebuilt from the approved TikZ drawing
// (figures/tikz/fig.position-as-time.tex) with the visit simulated in the
// browser.
//
// (a) one visit to I* = vbar + r(-3/4, 3/4) in the (s, X) plane, inside the
//     cone of slopes inf_{I*}|v| and sup_{I*}|v|; the level X = X_0 is
//     crossed once.  (b) the same visit in sigma = (X - X_e)/(vbar r^2),
//     z = (X - X_e - vbar (s - s_e))/r^3: the level is the slice
//     sigma = sigma_0.  (c) the intervals I_c, I, I*.
// The model is the one of visual-final/src/ka_data.py ka1(): after the
// reflection, dX = v ds, dv = sqrt(2 * 0.03 * a(X, v)) dB, with an
// autonomous checkerboard coefficient a in {0.5, 2.0} (cells 0.37 x 0.21),
// vbar = 1, r = 0.4, dt = 2e-4, started at v = vbar + 0.1 r; a visit is
// kept when it lasts between 1.1 and 1.5, swings across most of I* and
// leaves through its upper end (for a legible drawing, as in ka1()).
// "Play" runs the visit: the particle, its level X = X(s) in (a), the
// slice sigma = sigma(s) in (b) and its velocity in (c) move together.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import { Rng, freshSeed, subSeed } from './lib/rng.mjs';
import { isSnapshotMode, measuredWidth, watchResize } from './lib/svgkit.mjs';
import { showAssertionError } from './lib/theme.mjs';
import {
  arrow, crossMark, lab, makeClock, polyD, seg, simControls,
} from './lib/toyrun.mjs';

const FIG_ID = 'fig.position-as-time';
export const DEFAULT_SEED = 2;
export const PA = {
  vbar: 1.0,
  r: 0.4,
  dt: 2e-4,
  displayDiffusion: 0.03,
  sMax: 3.0,
  maxAttempts: 4000,
  every: 20,
};

/** The autonomous rough coefficient of ka1(): checkerboard in (X, v), cells 0.37 x 0.21. */
export function aRough(X, v) {
  return ((Math.floor(X / 0.37) + Math.floor(v / 0.21)) % 2 + 2) % 2 === 0 ? 0.5 : 2.0;
}

const bufS = new Float64Array(15002);
const bufX = new Float64Array(15002);
const bufV = new Float64Array(15002);

/** One attempt: a visit started at e = (0, 0, vbar + 0.1 r), run until v
 * leaves I* or s reaches sMax. Fills the buffers; returns the number of points. */
function runVisit(rng, p) {
  const vlo = p.vbar - 0.75 * p.r;
  const vhi = p.vbar + 0.75 * p.r;
  let s = 0;
  let X = 0;
  let v = p.vbar + 0.1 * p.r;
  let n = 0;
  bufS[n] = s; bufX[n] = X; bufV[n] = v; n += 1;
  while (vlo < v && v < vhi && s < p.sMax) {
    const vn = v + Math.sqrt(2 * p.displayDiffusion * aRough(X, v) * p.dt) * rng.normal();
    X += 0.5 * (v + vn) * p.dt;
    v = vn;
    s += p.dt;
    bufS[n] = s; bufX[n] = X; bufV[n] = v; n += 1;
  }
  return n;
}

/** ka1()'s choice of a legible visit. */
function accepted(n, p) {
  const s = bufS[n - 1];
  if (!(s > 1.1 && s < 1.5)) return false;
  if (!(bufV[n - 1] >= p.vbar + 0.75 * p.r)) return false; // leaves through the upper end of I*
  let vmax = -Infinity;
  let vmin = Infinity;
  for (let i = 0; i < n; i += 1) { if (bufV[i] > vmax) vmax = bufV[i]; if (bufV[i] < vmin) vmin = bufV[i]; }
  return vmax > p.vbar + 0.5 * p.r && vmin < p.vbar - 0.35 * p.r;
}

/**
 * The visit for one seed: attempt k uses the stream subSeed(seed, k); the
 * first accepted attempt is kept. Returns the drawn points (every
 * `every`-th, plus the exit point), the exit, the level X_0 = 0.62 X_exit
 * and its crossing (s_0, X_0) with sigma_0, z_0 -- as in ka1().
 */
export function simulateVisit(seed = DEFAULT_SEED, p = PA) {
  for (let k = 0; k < p.maxAttempts; k += 1) {
    const n = runVisit(new Rng(subSeed(seed, k)), p);
    if (!accepted(n, p)) continue;
    const idx = [];
    for (let i = 0; i < n; i += p.every) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    const S = Float64Array.from(idx, (i) => bufS[i]);
    const X = Float64Array.from(idx, (i) => bufX[i]);
    const V = Float64Array.from(idx, (i) => bufV[i]);
    const X0 = 0.62 * bufX[n - 1];
    let i0 = 0;
    while (i0 < n && bufX[i0] < X0) i0 += 1;
    const { vbar, r } = p;
    let monotone = true;
    for (let i = 1; i < n; i += 1) if (bufX[i] < bufX[i - 1]) monotone = false;
    return {
      seed,
      attempt: k,
      S,
      X,
      V,
      sigma: Float64Array.from(X, (x) => x / (vbar * r * r)),
      z: Float64Array.from(idx, (i) => (bufX[i] - vbar * bufS[i]) / (r ** 3)),
      exit: { s: bufS[n - 1], X: bufX[n - 1], v: bufV[n - 1], up: bufV[n - 1] >= vbar + 0.75 * r },
      X0,
      s0: bufS[i0],
      sigma0: X0 / (vbar * r * r),
      z0: (X0 - vbar * bufS[i0]) / (r ** 3),
      monotone,
      vlo: vbar - 0.75 * r,
      vhi: vbar + 0.75 * r,
    };
  }
  throw new Error('no legible visit found');
}

/** The "what must hold" list of the design brief, on a visit. */
export function checkVisit(vs, p = PA) {
  if (!vs.monotone) throw new Error('position decreased during a visit with positive velocity');
  const n = vs.S.length;
  for (let i = 0; i < n - 1; i += 1) {
    // inside the cone inf|v| s <= X <= sup|v| s while v is in I*
    if (vs.X[i] < vs.vlo * vs.S[i] - 1e-9 || vs.X[i] > vs.vhi * vs.S[i] + 1e-9) throw new Error('the visit left its cone');
  }
  // the crossing is the same event in both pictures
  const s0 = p.vbar * p.r * p.r * vs.sigma0 - (p.r ** 3) * vs.z0; // s - s_e = r^2 sigma - (r^3/vbar) z, times vbar
  if (Math.abs(s0 / p.vbar - vs.s0) > 1e-9) throw new Error('the crossing differs between (a) and (b)');
}

const C1 = 'var(--fig-1)';
const CT = 'var(--fig-theta)';
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
  const state = { seed: DEFAULT_SEED, vs: null };
  const root = htmlEl('div', { class: 'd3-figure' });
  const svgHost = htmlEl('div', { style: 'width:100%' });
  const note = 'Visit simulated in your browser (numerical illustration): $\\bar v=1$, $r=0.4$, a checkerboard coefficient $a(X,v)\\in\\{0.5,2\\}$ (cells $0.37\\times0.21$) slowed by the factor $0.03$, time step $2\\cdot10^{-4}$; a visit lasting between $1.1$ and $1.5$ and leaving $I^*$ upwards is shown. The cone, the change of variables and the intervals are the paper’s.';
  const noteText = 'Visit simulated in your browser (numerical illustration): v̄ = 1, r = 0.4, a checkerboard coefficient a(X,v) in {0.5, 2} (cells 0.37 × 0.21) slowed by the factor 0.03, time step 2·10^-4; a visit lasting between 1.1 and 1.5 and leaving I* upwards is shown. The cone, the change of variables and the intervals are the paper’s.';
  let view = null;
  const clock = makeClock({
    duration: 7000,
    onFrame: (q) => { if (view) view.frame(q); },
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
    state.vs = simulateVisit(state.seed);
    checkVisit(state.vs);
    ctl.setSeed(state.seed);
    draw();
  }

  function draw() {
    const vs = state.vs;
    const W = Math.max(340, Math.min(960, Math.round(measuredWidth(svgHost, 820))));
    const narrow = W < 640;
    const FS = 14;
    const FN = 13;
    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'Position as time: one simulated visit in the (s, X) plane and in the coordinates (sigma, z), and the nested velocity intervals',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    let y0 = 0;
    if (snapshot) {
      svg.appendChild(svgEl('text', {
        x: 8, y: 14, 'font-size': 10, fill: 'var(--text-dim)',
      }, [`controls (default state): New sample (fresh seed), Play (runs the visit); seed ${vs.seed}; visit simulated (numerical illustration)`]));
      y0 = 24;
    }
    const { vlo, vhi } = vs;
    const sTop = Math.max(1.3, vs.exit.s) * 1.08;
    const XTop = Math.max(1.6, vs.exit.X * 1.22);

    // ------------------------------------------------------------- (a)
    const aW = narrow ? W - 20 : Math.round(0.4 * W);
    const A = svgEl('g', { transform: `translate(0,${y0})` });
    svg.appendChild(A);
    const ml = 74;
    const pw = aW - ml - (narrow ? 120 : 112);
    const ph = Math.max(190, Math.min(280, pw * 0.82));
    const topA = 34;
    const xs = (s) => ml + (s / sTop) * pw;
    const yX = (X) => topA + (1 - X / XTop) * ph;
    lab(A, 6, topA - 12, '(a)', '(a)', { size: FS });
    // cone inf|v| (s - s_e) <= X - X_e <= sup|v| (s - s_e), clipped to the box
    const sUp = Math.min(sTop, XTop / vhi);
    A.appendChild(svgEl('path', {
      d: `M${xs(0)},${yX(0)} L${xs(sTop)},${yX(vlo * sTop)} L${xs(sTop)},${yX(Math.min(XTop, vhi * sTop))} L${xs(sUp)},${yX(vhi * sUp)} Z`, fill: C1, 'fill-opacity': 0.09,
    }));
    seg(A, xs(0), yX(0), xs(sTop), yX(vlo * sTop), { stroke: C1, 'stroke-opacity': 0.6 });
    seg(A, xs(0), yX(0), xs(sUp), yX(vhi * sUp), { stroke: C1, 'stroke-opacity': 0.6 });
    const sMid = Math.min(sTop, XTop);
    seg(A, xs(0), yX(0), xs(sMid), yX(sMid), { stroke: INK, 'stroke-dasharray': '3 3', 'stroke-width': 0.9 });
    // level X = X_0, the old times it meets the cone, the crossing
    const levelG = svgEl('g');
    A.appendChild(levelG);
    seg(levelG, xs(0) - 10, yX(vs.X0), xs(Math.min(sTop, vs.X0 / vlo + 0.12)), yX(vs.X0), { stroke: CT });
    seg(levelG, xs(vs.X0 / vhi), yX(vs.X0), xs(vs.X0 / vlo), yX(vs.X0), { stroke: CT, 'stroke-width': 3 });
    const pathA = svgEl('path', {
      d: '', fill: 'none', stroke: C1, 'stroke-width': 1.4,
    });
    A.appendChild(pathA);
    A.appendChild(svgEl('circle', {
      cx: xs(0), cy: yX(0), r: 2.6, fill: INK,
    }));
    lab(A, xs(0) + 2, yX(0) - 8, '$e$', 'e', { size: FN });
    const exitA = crossMark(A, xs(vs.exit.s), yX(vs.exit.X), { color: C1, r: 4.5, width: 1.8 });
    levelG.appendChild(svgEl('circle', {
      cx: xs(vs.s0), cy: yX(vs.X0), r: 3.4, fill: CT,
    }));
    lab(levelG, xs(0) - 17, yX(vs.X0) + 5, '$X=X_0$', 'X = X0', { size: FN, fill: CT, anchor: 'end' });
    lab(levelG, xs((vs.X0 / vhi + vs.s0) / 2) - 10, yX(vs.X0) - 7, '$s$ varies', 's varies', { size: FN, fill: CT, anchor: 'middle', halo: true });
    lab(A, xs(sUp) - 6, yX(vhi * sUp) + 4, 'slope $\\sup_{I^*}\\abs v$', 'slope sup_{I*} |v|', { size: FN, fill: C1, anchor: 'end' });
    lab(A, xs(sTop) + 6, yX(vlo * sTop) + 4, 'slope $\\inf_{I^*}\\abs v$', 'slope inf_{I*} |v|', { size: FN, fill: C1 });
    lab(A, xs(sMid) + 6, yX(sMid) + 4, 'slope $\\bar v$', 'slope v̄', { size: FN });
    const exitLab = lab(A, xs(vs.exit.s) + 8, yX(vs.exit.X) + 17, 'visit ends', 'visit ends', { size: FN, fill: C1, halo: true });
    // moving level and particle (Play)
    const movG = svgEl('g', { visibility: 'hidden' });
    A.appendChild(movG);
    const movLevel = seg(movG, 0, 0, 0, 0, { stroke: CT, 'stroke-width': 1.2 });
    const movDot = svgEl('circle', { r: 4, fill: CT });
    movG.appendChild(movDot);
    // axes
    const axY = yX(0) + 12;
    arrow(A, xs(0), axY, xs(sTop) + 14, axY);
    lab(A, xs(sTop) + 18, axY + 5, '$s$', 's', { size: FS });
    seg(A, xs(0), axY, xs(0), axY + 4);
    lab(A, xs(0), axY + 20, '$s_e$', 's_e', { size: FN, anchor: 'middle' });
    arrow(A, xs(0) - 10, yX(0), xs(0) - 10, yX(XTop) - 6);
    lab(A, xs(0) - 14, yX(XTop) - 2, '$X$', 'X', { size: FS, anchor: 'end' });
    seg(A, xs(0) - 10, yX(0), xs(0) - 14, yX(0));
    lab(A, xs(0) - 17, yX(0) + 5, '$X_e$', 'X_e', { size: FN, anchor: 'end' });
    const aBottom = axY + 30;

    // ----------------------------------------------- the change of variables
    const mX = narrow ? W / 2 : aW + (W - aW - (0.42 * W)) / 2 + 6;
    const mY = narrow ? y0 + aBottom + 16 : y0 + topA + ph * 0.42;
    const midW = narrow ? 220 : W - aW - 0.42 * W;
    arrow(svg, mX - Math.min(70, midW / 2 - 8), mY, mX + Math.min(46, midW / 2 - 30), mY, { width: 1.6, head: 9 });
    lab(svg, mX + Math.min(46, midW / 2 - 30) + 6, mY + 6, '$\\chi_e$', 'χ_e', { size: FS + 3 });
    lab(svg, mX, mY + 38, '$X=X_e+\\bar v r^2\\sigma$', 'X = X_e + v̄ r² σ', { size: FS + 3, anchor: 'middle' });
    lab(svg, mX, mY + 76, '$s=s_e+r^2\\sigma-\\dfrac{r^3}{\\bar v}z$', 's = s_e + r² σ − (r³/v̄) z', { size: FS + 3, anchor: 'middle' });
    const midBottom = narrow ? mY + 96 - y0 : 0;

    // ------------------------------------------------------------- (b)
    const bX0 = narrow ? 0 : Math.round(0.58 * W);
    const bY0 = narrow ? y0 + midBottom + 10 : y0;
    const bW = narrow ? W - 20 : W - bX0 - 8;
    const Bg = svgEl('g', { transform: `translate(${bX0},${bY0})` });
    svg.appendChild(Bg);
    const sigTop = (vhi * sTop) / (PA.vbar * PA.r * PA.r) * 0.93;
    const kUp = (vhi - PA.vbar) * PA.vbar / (vhi * PA.r);
    const kLo = (vlo - PA.vbar) * PA.vbar / (vlo * PA.r);
    const zTop = Math.max(kUp * sigTop, ...vs.z) * 1.1;
    const zBot = Math.min(kLo * sigTop, ...vs.z) * 1.04;
    const bml = 44;
    const bpw = bW - bml - (narrow ? 150 : 128);
    const bph = ph;
    const topB = 34;
    const xg = (sg) => bml + (sg / sigTop) * bpw;
    const yz = (z) => topB + ((zTop - z) / (zTop - zBot)) * bph;
    lab(Bg, 6, topB - 12, '(b)', '(b)', { size: FS });
    Bg.appendChild(svgEl('path', {
      d: `M${xg(0)},${yz(0)} L${xg(sigTop)},${yz(kUp * sigTop)} L${xg(sigTop)},${yz(kLo * sigTop)} Z`, fill: C1, 'fill-opacity': 0.09,
    }));
    seg(Bg, xg(0), yz(0), xg(sigTop), yz(kUp * sigTop), { stroke: C1, 'stroke-opacity': 0.6 });
    seg(Bg, xg(0), yz(0), xg(sigTop), yz(kLo * sigTop), { stroke: C1, 'stroke-opacity': 0.6 });
    seg(Bg, xg(0), yz(0), xg(sigTop) + 8, yz(0), { stroke: INK, 'stroke-dasharray': '3 3', 'stroke-width': 0.9 });
    const sliceG = svgEl('g');
    Bg.appendChild(sliceG);
    seg(sliceG, xg(vs.sigma0), yz(zBot) + 4, xg(vs.sigma0), yz(zTop) - 4, { stroke: CT });
    seg(sliceG, xg(vs.sigma0), yz(kLo * vs.sigma0), xg(vs.sigma0), yz(kUp * vs.sigma0), { stroke: CT, 'stroke-width': 3 });
    const pathB = svgEl('path', {
      d: '', fill: 'none', stroke: C1, 'stroke-width': 1.4,
    });
    Bg.appendChild(pathB);
    Bg.appendChild(svgEl('circle', {
      cx: xg(0), cy: yz(0), r: 2.6, fill: INK,
    }));
    lab(Bg, xg(0) + 5, yz(0) + 16, '$e$', 'e', { size: FN });
    sliceG.appendChild(svgEl('circle', {
      cx: xg(vs.sigma0), cy: yz(vs.z0), r: 3.4, fill: CT,
    }));
    lab(sliceG, xg(vs.sigma0), yz(zTop) - 10, '$\\sigma=\\sigma_0$', 'σ = σ0', { size: FN, fill: CT, anchor: 'middle' });
    const noteX = xg(vs.sigma0) + 8;
    const noteY = yz(kLo * vs.sigma0 * 0.55);
    ['$X=X_0$ fixed,', '$s$ varies with $z$:', '$a(X,v)$ does not', 'depend on $z$'].forEach((t, i) => {
      lab(sliceG, noteX, noteY + i * 17, t, t.replace(/\$/g, ''), { size: FN, fill: CT, halo: true });
    });
    const movB = svgEl('g', { visibility: 'hidden' });
    Bg.appendChild(movB);
    const movSlice = seg(movB, 0, yz(zBot) + 4, 0, yz(zTop) - 4, { stroke: CT, 'stroke-width': 1.2 });
    const movDotB = svgEl('circle', { r: 4, fill: CT });
    movB.appendChild(movDotB);
    const axYB = yz(zBot) + 10;
    arrow(Bg, xg(0) - 6, axYB, xg(sigTop) + 16, axYB);
    lab(Bg, xg(sigTop) + 20, axYB + 5, '$\\sigma$', 'σ', { size: FS });
    arrow(Bg, xg(0) - 6, axYB, xg(0) - 6, yz(zTop) - 8);
    lab(Bg, xg(0) - 10, yz(zTop) - 4, '$z$', 'z', { size: FS, anchor: 'end' });
    seg(Bg, xg(0) - 6, yz(0), xg(0) - 10, yz(0));
    lab(Bg, xg(0) - 13, yz(0) + 5, '$0$', '0', { size: FN, anchor: 'end' });
    const bBottom = axYB + 16;

    // ------------------------------------------------------------- (c)
    const cY0 = (narrow ? bY0 + bBottom : y0 + Math.max(aBottom, bBottom)) + 18;
    const Cg = svgEl('g', { transform: `translate(0,${cY0})` });
    svg.appendChild(Cg);
    const cxL = narrow ? 50 : Math.round(0.2 * W);
    const cScale = narrow ? (W - cxL - 20) / 1.9 : Math.min(240, (W - cxL - 330) / 0.9 / 2);
    const xy = (y) => cxL + (y + 0.85) * cScale;
    lab(Cg, 6, 16, '(c)', '(c)', { size: FS });
    const barH = 18;
    const rowsC = narrow
      ? [[0.75, 0.15, 'I^*'], [0.5, 0.35, 'I'], [0.25, 0.7, 'I_{\\mathrm c}']]
      : [[0.75, 0.15, 'I^*'], [0.5, 0.35, 'I'], [0.25, 0.7, 'I_{\\mathrm c}']];
    const texts = [
      ['$I^*$: a visit ends on leaving $I^*$', 'I*: a visit ends on leaving I*'],
      ['$I$: a visit begins on reaching $\\overline I$', 'I: a visit begins on reaching Ī'],
      ['$I_{\\mathrm c}$: the density is estimated here', 'I_c: the density is estimated here'],
    ];
    rowsC.forEach(([h, op], i) => {
      const yy = 8 + i * (barH + (narrow ? 26 : 8)) + (narrow ? 18 : 0);
      Cg.appendChild(svgEl('rect', {
        x: xy(-h), y: yy, width: xy(h) - xy(-h), height: barH, fill: C1, 'fill-opacity': op,
      }));
      if (narrow) lab(Cg, xy(-h), yy - 5, texts[i][0], texts[i][1], { size: FN - 1 });
      else lab(Cg, xy(h) + 6, yy + 14, texts[i][0], texts[i][1], { size: FN });
    });
    const axC = 8 + 3 * (barH + (narrow ? 26 : 8)) + (narrow ? 12 : 6);
    arrow(Cg, xy(-0.85), axC, xy(0.9), axC);
    const ticks = [[-0.75, '-\\tfrac34', '−3/4'], [-0.5, '-\\tfrac12', '−1/2'], [-0.25, '-\\tfrac14', '−1/4'], [0, '0', '0'], [0.25, '\\tfrac14', '1/4'], [0.5, '\\tfrac12', '1/2'], [0.75, '\\tfrac34', '3/4']];
    for (const [y, tex, plain] of ticks) {
      seg(Cg, xy(y), axC, xy(y), axC + 4, { stroke: y === 0 ? INK : 'var(--fig-grey)' });
      lab(Cg, xy(y), axC + 22, `$${tex}$`, plain, { size: FN - 1, anchor: 'middle' });
    }
    if (narrow) lab(Cg, xy(0.9), axC + 46, '$y=\\frac{v-\\bar v}{r}$', 'y = (v − v̄)/r', { size: FN, anchor: 'end' });
    else lab(Cg, xy(0.9) + 6, axC + 20, '$y=\\frac{v-\\bar v}{r}$', 'y = (v − v̄)/r', { size: FN });
    // the particle's velocity (Play)
    const movC = svgEl('path', { d: '', fill: CT, visibility: 'hidden' });
    Cg.appendChild(movC);
    const cBottom = axC + (narrow ? 56 : 34);
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(cY0 + cBottom)}`);

    // ---------------------------------------------------------- animation
    const n = vs.S.length;
    view = {
      frame(q) {
        const done = q >= 1;
        const m = done ? n : Math.max(2, Math.min(n, Math.round(q * n)));
        pathA.setAttribute('d', polyD(vs.S, vs.X, 0, m, xs, yX));
        pathB.setAttribute('d', polyD(vs.sigma, vs.z, 0, m, xg, yz));
        for (const g of [levelG, sliceG]) g.setAttribute('visibility', done ? 'visible' : 'hidden');
        exitA.setAttribute('visibility', done || m >= n ? 'visible' : 'hidden');
        exitLab.setAttribute('visibility', done || m >= n ? 'visible' : 'hidden');
        for (const g of [movG, movB, movC]) g.setAttribute('visibility', done ? 'hidden' : 'visible');
        if (!done) {
          const i = m - 1;
          const X = vs.X[i];
          movLevel.setAttribute('x1', xs(0) - 10);
          movLevel.setAttribute('x2', xs(Math.min(sTop, X / vlo + 0.1)));
          movLevel.setAttribute('y1', yX(X));
          movLevel.setAttribute('y2', yX(X));
          movDot.setAttribute('cx', xs(vs.S[i]));
          movDot.setAttribute('cy', yX(X));
          movSlice.setAttribute('x1', xg(vs.sigma[i]));
          movSlice.setAttribute('x2', xg(vs.sigma[i]));
          movDotB.setAttribute('cx', xg(vs.sigma[i]));
          movDotB.setAttribute('cy', yz(vs.z[i]));
          const yv = (vs.V[i] - PA.vbar) / PA.r;
          const px = xy(Math.max(-0.85, Math.min(0.88, yv)));
          movC.setAttribute('d', `M${px},${axC - 2} L${px - 6},${axC - 12} L${px + 6},${axC - 12} Z`);
        }
      },
    };
    view.frame(clock.playing ? clock.progress : 1);
  }

  resample();
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}
