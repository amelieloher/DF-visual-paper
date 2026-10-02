// fig.where-2n-plus-1 (content/figures/fig.where-2n-plus-1.yaml): where the
// threshold p = 2n+1 comes from. The interval bound
//   ||K||^q_{L^q((T,2T) x R^{2n})} <= C T^{1-2n(q-1)},   1 < q < (n+1)/n,
// drawn with C = 1 on the dyadic intervals (T, 2T), T = 2^{-k}, k = 1..24
// (S = 1), its partial sums, and the q-range where they stay bounded.
// Three panels in ONE <svg> (the audit snapshot captures the first svg);
// the controls (n buttons, q slider, threshold button, live readouts) are
// HTML beside it. Colours are theme tokens only.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import {
  buttonGroup, isSnapshotMode, measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { texHtml, texLabel } from './lib/texLabel.mjs';
import { makeButtonControl, makeSliderControl, showAssertionError } from './lib/theme.mjs';

const FIG_ID = 'fig.where-2n-plus-1';
const K_MAX = 24; // dyadic intervals (T, 2T), T = 2^{-k}, k = 1..K_MAX
const Y_CLIP_BARS = 4;
const Y_CLIP_SUMS = 30;
const STEP = 0.001;

/** The exponent 1 - 2n(q-1) of T in the interval bound. */
export function intervalExponent(n, q) {
  return 1 - 2 * n * (q - 1);
}

/** The open q-interval where the interval bound is stated, and its midpoint
 * 1 + 1/(2n), which is also the summability threshold. */
export function qRangeFor(n) {
  return { lo: 1, hi: (n + 1) / n, threshold: 1 + 1 / (2 * n) };
}

/** Bar heights T^e for T = 2^{-k}, k = 1..kMax (C = 1). */
export function barHeights(e, kMax = K_MAX) {
  const out = [];
  for (let k = 1; k <= kMax; k += 1) out.push(2 ** (-k * e));
  return out;
}

/** Partial sums sum_{k=1}^{K} (2^{-k})^e, K = 1..kMax. */
export function partialSums(e, kMax = K_MAX) {
  let s = 0;
  return barHeights(e, kMax).map((b) => { s += b; return s; });
}

/** The limit of the partial sums when e > 0: 2^{-e} / (1 - 2^{-e}). */
export function sumLimit(e) {
  return e > 0 ? 2 ** -e / (1 - 2 ** -e) : Infinity;
}

function stateOf(e) {
  if (e === 0) return 'threshold';
  return e > 0 ? 'summable' : 'divergent';
}
const STATE_COLOR = { summable: 'var(--fig-ok)', threshold: 'var(--text-dim)', divergent: 'var(--fig-bad)' };

function fmt(x, d = 3) {
  if (!Number.isFinite(x)) return '∞';
  const s = x.toFixed(d);
  return s.replace(/\.?0+$/, '') || '0';
}
function fracTex(n) { // (n+1)/n and 1 + 1/(2n) as fractions
  return {
    hi: n === 1 ? '2' : `${n + 1}/${n}`,
    thr: `${2 * n + 1}/${2 * n}`,
  };
}

/** A label: typeset `tex` (text with inline $...$), or the plain fallback. */
function label(parent, x, y, tex, plain, o = {}) {
  const size = o.size || 11;
  const fill = o.fill || 'var(--text)';
  const anchor = o.anchor || 'start';
  const node = texLabel(x, y, tex, {
    size,
    fill,
    anchor,
    halo: o.halo,
    clamp: o.clamp,
    weight: o.weight,
    fallback: () => svgEl('text', {
      x, y, 'font-size': size, fill, 'text-anchor': anchor === 'start' ? null : anchor, 'font-weight': o.weight || null,
    }, [plain]),
  });
  parent.appendChild(node);
  return node;
}

function line(parent, x1, y1, x2, y2, attrs = {}) {
  parent.appendChild(svgEl('line', {
    x1, y1, x2, y2, stroke: 'var(--text)', 'stroke-width': 1, ...attrs,
  }));
}
function upArrow(parent, x, y, color) {
  parent.appendChild(svgEl('path', { d: `M${x - 4},${y + 5} L${x},${y - 2} L${x + 4},${y + 5} Z`, fill: color }));
}

export function render(el, { params = {}, snapshot = isSnapshotMode() } = {}) {
  try {
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, FIG_ID, err.message);
  }
}

function renderInner(el, params, snapshot) {
  clear(el);
  const nValues = (params.n && params.n.values) || [1, 2, 3];
  const state = {
    n: (params.n && params.n.default) || 1,
    q: 4 / 3,
    atThreshold: false,
  };

  const root = htmlEl('div', { class: 'd3-figure' });
  const controls = htmlEl('div', { class: 'figure-controls' });
  const svgHost = htmlEl('div', { style: 'width:100%' });
  root.append(controls, svgHost);
  el.appendChild(root);

  // --- controls -------------------------------------------------------
  const nGroup = buttonGroup({
    label: texHtml(htmlEl('span'), '$n$', 'n'),
    options: nValues.map((v) => ({ value: v, label: String(v) })),
    value: state.n,
    onChange: (v) => setN(Number(v)),
  });
  const slider = makeSliderControl({
    id: `${FIG_ID}-q-${Math.random().toString(36).slice(2, 8)}`,
    label: 'q',
    labelTex: '$q$',
    min: 1 + STEP,
    max: 2 - STEP,
    step: STEP,
    value: state.q,
    formatValue: () => fmt(state.q, 3),
    formatTex: () => (state.atThreshold ? `$${fracTex(state.n).thr}$` : `$${fmt(state.q, 3)}$`),
  });
  const thrBtn = makeButtonControl({ id: `${FIG_ID}-thr-${Math.random().toString(36).slice(2, 8)}`, label: 'threshold' });
  const pOut = htmlEl('span', { class: 'figure-control', 'aria-live': 'polite' });
  const eOut = htmlEl('span', { class: 'figure-control', 'aria-live': 'polite' });
  controls.append(nGroup.node, slider.wrap, thrBtn, pOut, eOut);

  function sliderBounds(n) {
    const { hi } = qRangeFor(n);
    return { min: 1 + STEP, max: Math.floor((hi - 1e-9) / STEP) * STEP };
  }
  function syncSlider() {
    const b = sliderBounds(state.n);
    slider.input.min = String(b.min);
    slider.input.max = b.max.toFixed(3);
    slider.input.value = String(state.q);
    texHtml(slider.out, state.atThreshold ? `$${fracTex(state.n).thr}$` : `$${fmt(state.q, 3)}$`, fmt(state.q, 3));
  }
  function setN(n) {
    const { lo, hi, threshold } = qRangeFor(n);
    state.n = n;
    if (!(state.q > lo && state.q < hi)) {
      // Out of the new range: the midpoint, which is the threshold.
      state.q = threshold;
      state.atThreshold = true;
    } else {
      state.atThreshold = Math.abs(intervalExponent(n, state.q)) < 1e-12;
    }
    syncSlider();
    draw();
  }
  slider.input.addEventListener('input', () => {
    const b = sliderBounds(state.n);
    state.q = Math.min(b.max, Math.max(b.min, Number(slider.input.value)));
    state.atThreshold = Math.abs(intervalExponent(state.n, state.q)) < 1e-12;
    syncSlider();
    draw();
  });
  thrBtn.addEventListener('click', () => {
    state.q = qRangeFor(state.n).threshold;
    state.atThreshold = true;
    syncSlider();
    draw();
  });

  // --- drawing ---------------------------------------------------------
  function draw() {
    const { n } = state;
    const q = state.q;
    const { lo, hi, threshold } = qRangeFor(n);
    if (!(q > lo && q < hi)) throw new Error(`q = ${q} left the open interval (1, (n+1)/n)`);
    // At the threshold the exponent is exactly 0 (and p = 2n+1 exactly).
    const e = state.atThreshold ? 0 : intervalExponent(n, q);
    const st = stateOf(e);
    const col = STATE_COLOR[st];
    const p = state.atThreshold ? 2 * n + 1 : q / (q - 1);
    const ft = fracTex(n);

    texHtml(pOut, `$p=\\frac{q}{q-1}=${state.atThreshold ? String(2 * n + 1) : fmt(p, 3)}$`, `p = q/(q-1) = ${fmt(p, 3)}`);
    texHtml(eOut, `$1-2n(q-1)=${state.atThreshold ? '0' : fmt(e, 3)}$`, `1 - 2n(q-1) = ${fmt(e, 3)}`);
    eOut.style.color = col;
    eOut.style.fontWeight = '600';

    const W = Math.max(320, Math.round(measuredWidth(svgHost, 760)));
    const narrow = W < 520;
    // Label sizes (px at the card's own width: the viewBox is the measured width).
    const FS = { tick: 12, axis: 13, head: 14 };
    const ml = 44;
    const mr = 18;
    const w = W - ml - mr;

    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'The interval bound on dyadic intervals, its partial sums, and the summable range of q',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    let y0 = 0;

    if (snapshot) {
      const t = svgEl('text', { x: 8, y: 14, 'font-size': 10, fill: 'var(--text-dim)' }, [
        `controls (default state): n = ${n}; q = ${fmt(q, 4)} (slider on (1, (n+1)/n)); threshold button sets q = 1 + 1/(2n)`,
      ]);
      svg.appendChild(t);
      y0 = 24;
    }

    // ---- Panel A: the bound on each interval --------------------------
    const A = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(A);
    const hA = narrow ? 130 : 150;
    label(A, -ml + 6, 14, 'A · the bound on each interval $(T,2T)$', 'A · the bound on each interval (T, 2T)', { size: FS.head, weight: 600 });
    label(A, -ml + 6, 34, 'bound $CT^{1-2n(q-1)}$, $C=1$', 'bound C T^(1-2n(q-1)), C = 1', { size: FS.axis, fill: 'var(--text-dim)' });
    const topA = 50;
    const xLog = (tau) => ((Math.log2(tau) + K_MAX) / K_MAX) * w; // tau in [2^-24, 1]
    const yA = (v) => topA + hA * (1 - v / Y_CLIP_BARS);
    // grid + y ticks
    for (let v = 0; v <= Y_CLIP_BARS; v += 1) {
      line(A, 0, yA(v), w, yA(v), { stroke: 'var(--border)', 'stroke-width': v === 0 ? 0 : 0.7 });
      label(A, -6, yA(v) + 4, `$${v}$`, String(v), { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)' });
    }
    const bars = barHeights(e);
    bars.forEach((b, i) => {
      const k = i + 1;
      const x1 = xLog(2 ** -k);
      const x2 = xLog(2 ** (-k + 1));
      const gap = Math.min(2, (x2 - x1) * 0.12);
      const clipped = b > Y_CLIP_BARS;
      const top = clipped ? yA(Y_CLIP_BARS) : yA(b);
      A.appendChild(svgEl('rect', {
        x: x1 + gap / 2, y: top, width: Math.max(0.5, x2 - x1 - gap), height: Math.max(0, yA(0) - top), fill: 'var(--fig-1)', 'fill-opacity': 0.85,
      }));
      if (clipped) upArrow(A, (x1 + x2) / 2, topA - 6, 'var(--fig-1)');
    });
    line(A, 0, yA(0), w, yA(0));
    line(A, 0, topA - 2, 0, yA(0));
    const tickEvery = narrow ? 8 : 4;
    for (let k = 0; k <= K_MAX; k += tickEvery) {
      const x = xLog(2 ** -k);
      line(A, x, yA(0), x, yA(0) + 4);
      label(A, x, yA(0) + 22, k === 0 ? '$S$' : `$2^{-${k}}S$`, k === 0 ? 'S' : `2^-${k} S`, { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)', clamp: [-ml + 2, w + mr - 2] });
    }
    label(A, w, yA(0) + 40, 'elapsed time $\\tau$ (log scale), $S=1$', 'elapsed time τ (log scale), S = 1', { anchor: 'end', size: FS.axis, fill: 'var(--text-dim)' });
    // "towards smaller times" (tasks/p17-figure-feedback.md): on this axis the
    // elapsed time decreases to the LEFT, which is where the sum runs.
    {
      const ay = yA(0) + 68;
      const xR = Math.min(w, narrow ? 0.62 * w : 0.42 * w);
      A.appendChild(svgEl('line', {
        x1: xR, y1: ay - 4, x2: 6, y2: ay - 4, stroke: 'var(--text)', 'stroke-width': 1.4,
      }));
      A.appendChild(svgEl('path', { d: `M0,${ay - 4} L9,${ay - 9} L9,${ay + 1} Z`, fill: 'var(--text)' }));
      label(A, 14, ay - 9, 'towards smaller times', 'towards smaller times', { size: FS.axis, weight: 600, halo: true });
    }
    y0 += yA(0) + 78;

    // ---- Panel B: partial sums ----------------------------------------
    const B = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(B);
    const hB = narrow ? 120 : 140;
    label(B, -ml + 6, 14, narrow ? 'B · sum of the bounds over $K$ intervals' : 'B · sum of the bounds over $K$ intervals: $\\sum_{k=1}^{K}(2^{-k})^{1-2n(q-1)}$', narrow ? 'B · sum of the bounds over K intervals' : 'B · sum of the bounds over K intervals: Σ_{k=1..K} (2^-k)^(1-2n(q-1))', { size: FS.head, weight: 600 });
    const topB = 40;
    const xB = (K) => ((K - 1) / (K_MAX - 1)) * w;
    const yB = (v) => topB + hB * (1 - v / Y_CLIP_SUMS);
    for (let v = 0; v <= Y_CLIP_SUMS; v += 10) {
      line(B, 0, yB(v), w, yB(v), { stroke: 'var(--border)', 'stroke-width': v === 0 ? 0 : 0.7 });
      label(B, -6, yB(v) + 4, `$${v}$`, String(v), { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)' });
    }
    // reference: the line K (one per interval), where the points sit at e = 0
    B.appendChild(svgEl('line', {
      x1: xB(1), y1: yB(1), x2: xB(K_MAX), y2: yB(K_MAX), stroke: 'var(--text-faint)', 'stroke-width': 1, 'stroke-dasharray': '2 3',
    }));
    label(B, xB(K_MAX) - 4, yB(K_MAX) - 6, 'slope one: $K$', 'slope one: K', { anchor: 'end', size: FS.tick, fill: 'var(--text-faint)', halo: true });
    const sums = partialSums(e);
    const lim = sumLimit(e);
    if (e > 0 && lim <= Y_CLIP_SUMS) {
      B.appendChild(svgEl('line', {
        x1: 0, y1: yB(lim), x2: w, y2: yB(lim), stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '6 4',
      }));
      const labY = lim > Y_CLIP_SUMS - 4 ? yB(lim) + 14 : yB(lim) - 5;
      label(B, w * 0.42, labY, `limit $2^{-e}/(1-2^{-e})=${fmt(lim, 2)}$`, `limit = ${fmt(lim, 2)}`, { anchor: 'middle', size: FS.tick, fill: col, halo: true });
    }
    let pts = '';
    let firstClip = null;
    sums.forEach((s, i) => {
      const K = i + 1;
      if (s > Y_CLIP_SUMS) { if (firstClip === null) firstClip = K; return; }
      pts += `${pts ? 'L' : 'M'}${xB(K)},${yB(s)}`;
    });
    if (pts) B.appendChild(svgEl('path', { d: pts, fill: 'none', stroke: col, 'stroke-width': 1.6 }));
    sums.forEach((s, i) => {
      if (s > Y_CLIP_SUMS) return;
      B.appendChild(svgEl('circle', {
        cx: xB(i + 1), cy: yB(s), r: 2.6, fill: col,
      }));
    });
    if (firstClip !== null) upArrow(B, xB(firstClip), topB - 6, col);
    line(B, 0, yB(0), w, yB(0));
    line(B, 0, topB - 2, 0, yB(0));
    for (const K of [1, 4, 8, 12, 16, 20, 24]) {
      if (narrow && K % 8 !== 0 && K !== 1) continue;
      line(B, xB(K), yB(0), xB(K), yB(0) + 4);
      label(B, xB(K), yB(0) + 22, `$${K}$`, String(K), { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    }
    label(B, w, yB(0) + 40, narrow ? 'number $K$ of intervals summed' : 'number $K$ of intervals summed, down to $T=2^{-K}S$', narrow ? 'number K of intervals summed' : 'number K of intervals summed, down to T = 2^-K S', { anchor: 'end', size: FS.axis, fill: 'var(--text-dim)' });
    y0 += yB(0) + 52;

    // ---- Panel C: the range -------------------------------------------
    const C = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(C);
    label(C, -ml + 6, 14, narrow ? 'C · the range of $q$ for the bound' : 'C · the range of $q$ where the interval bound is stated', narrow ? 'C · the range of q for the bound' : 'C · the range of q where the interval bound is stated', { size: FS.head, weight: 600 });
    const xq = (qq) => ((qq - lo) / (hi - lo)) * w;
    const xt = xq(threshold);
    const rowThr = 36;
    label(C, xt, rowThr, '$q=1+\\frac{1}{2n}\\iff p=2n+1$', 'q = 1 + 1/(2n) ⇔ p = 2n+1', { anchor: 'middle', size: FS.axis, clamp: [-ml + 2, w + mr - 2] });
    const barY = 54;
    const barH = 18;
    C.appendChild(svgEl('rect', {
      x: 0, y: barY, width: xt, height: barH, fill: 'var(--fig-ok)', 'fill-opacity': 0.25,
    }));
    C.appendChild(svgEl('rect', {
      x: xt, y: barY, width: w - xt, height: barH, fill: 'var(--fig-bad)', 'fill-opacity': 0.25,
    }));
    label(C, 8, barY + 14, 'summable', 'summable', { size: FS.axis, fill: 'var(--fig-ok)', weight: 600 });
    label(C, w - 8, barY + 14, 'not summable', 'not summable', { anchor: 'end', size: FS.axis, fill: 'var(--fig-bad)', weight: 600 });
    const axQ = barY + barH;
    line(C, 0, axQ, w, axQ);
    // open ends of the q-interval
    for (const xx of [0, w]) C.appendChild(svgEl('circle', { cx: xx, cy: axQ, r: 3, fill: 'var(--fig-bg)', stroke: 'var(--text)' }));
    line(C, xt, barY, xt, axQ + 4, { 'stroke-width': 1.4 });
    label(C, -10, axQ + 4, '$q$', 'q', { anchor: 'end', size: FS.axis });
    label(C, 0, axQ + 20, '$1$', '1', { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    label(C, xt, axQ + 20, `$${ft.thr}$`, `${2 * n + 1}/${2 * n}`, { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    label(C, w, axQ + 20, `$${ft.hi}$`, n === 1 ? '2' : `${n + 1}/${n}`, { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    // the aligned p axis: p = q/(q-1), decreasing to the right
    const axP = axQ + 44;
    line(C, 0, axP, w, axP);
    label(C, -10, axP + 4, '$p$', 'p', { anchor: 'end', size: FS.axis });
    const xp = (pp) => xq(pp / (pp - 1));
    const kept = [n + 1, 2 * n + 1];
    for (let pp = n + 2; pp < 400; pp += 1) {
      if (kept.includes(pp)) continue;
      const x = xp(pp);
      if (x < 26) break;
      if (kept.every((k) => Math.abs(xp(k) - x) >= 26)) kept.push(pp);
    }
    for (const pp of kept) {
      const x = xp(pp);
      line(C, x, axP, x, axP + 4, pp === 2 * n + 1 ? { 'stroke-width': 1.4 } : {});
      label(C, x, axP + 19, `$${pp}$`, String(pp), { anchor: 'middle', size: FS.tick, fill: pp === 2 * n + 1 ? 'var(--text)' : 'var(--text-dim)', weight: pp === 2 * n + 1 ? 600 : null });
    }
    label(C, 0, axP + 19, '$\\infty$', '∞', { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    line(C, xt, axQ + 24, xt, axP, { stroke: 'var(--text-faint)', 'stroke-dasharray': '2 3' });
    // the current q
    const xc = xq(q);
    line(C, xc, axQ, xc, axP, { stroke: col, 'stroke-width': 2 });
    C.appendChild(svgEl('path', { d: `M${xc - 5},${barY - 9} L${xc + 5},${barY - 9} L${xc},${barY - 2} Z`, fill: col }));
    C.appendChild(svgEl('circle', { cx: xc, cy: axQ, r: 3.5, fill: col }));
    C.appendChild(svgEl('circle', { cx: xc, cy: axP, r: 3.5, fill: col }));
    y0 += axP + 32;

    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(y0)}`);
  }

  syncSlider();
  draw();
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}
