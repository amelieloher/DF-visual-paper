// fig.from-six-to-four (content/figures/fig.from-six-to-four.yaml): from
// p = 6 to p > 4. On the core, ||G_{P,I}||^q_{L^q} <= C_q r^{6-4q} sum_j m_j^q.
//   (a) visit masses per window: the barrier-only step profile (m_j <= 1,
//       sum_j m_j = 1/r exactly) against the Harnack decay (1+j)^{-1/2};
//   formula strip: what each profile gives for the interval bound;
//   (b) summing over velocity scales: F(rho) = int_rho^1 r^alpha dr/r for
//       the preliminary bound at q = 6/5 (alpha = 1/6, fixed) and the
//       improved bound (alpha = 4/q - 3, driven by q);
//   (c) the thresholds on the p axis.
// Every constant C, C_q is 1: only the exponents are the paper's. One <svg>
// (the audit snapshot captures the first svg); controls are HTML beside it.

import { svgEl, htmlEl, clear } from './lib/dom.mjs';
import { isSnapshotMode, measuredWidth, watchResize } from './lib/svgkit.mjs';
import { texHtml, texLabel } from './lib/texLabel.mjs';
import { makeSliderControl, showAssertionError } from './lib/theme.mjs';

const FIG_ID = 'fig.from-six-to-four';
const Q_SNAPS = [{ q: 6 / 5, key: '6/5', tex: '6/5' }, { q: 4 / 3, key: '4/3', tex: '4/3' }];
const SNAP_TOL = 0.0008;
const R_MIN = 0.01;
const R_MAX = 0.5;
const RHO_MIN_EXP = -8; // rho from 10^-8 to 1
const F_CLIP = 12;

/** The last window index: j runs over 0 <= j <= 2 + r^{-2}. */
export function lastWindow(r) {
  return Math.floor(2 + 1 / (r * r) + 1e-9); // tolerance: 1/0.1^2 is 99.999... in floating point
}

/** The barrier-only step profile: m_j = 1 for j < N = floor(1/r), the
 * fractional remainder 1/r - N in window N, and 0 after; so every m_j <= 1
 * and sum_j m_j = 1/r. */
export function barrierProfile(r) {
  const J = lastWindow(r);
  const N = Math.floor(1 / r);
  const m = new Array(J + 1).fill(0);
  for (let j = 0; j < N; j += 1) m[j] = 1;
  if (N <= J) m[N] = 1 / r - N;
  return m;
}

/** The Harnack profile m_j = (1+j)^{-1/2}, 0 <= j <= 2 + r^{-2}. */
export function harnackProfile(r) {
  const J = lastWindow(r);
  const m = new Array(J + 1);
  for (let j = 0; j <= J; j += 1) m[j] = (1 + j) ** -0.5;
  return m;
}

export function sumPow(m, q) {
  let s = 0;
  for (const x of m) if (x > 0) s += x ** q;
  return s;
}

/** The improved interval bound's exponent 4/q - 3, written (4 - 3q)/q so
 * that its sign is exactly that of 4/3 - q. */
export function improvedAlpha(q) {
  return (4 - 3 * q) / q;
}

/** F(rho) = int_rho^1 r^alpha dr/r. */
export function scaleIntegral(alpha, rho) {
  if (alpha === 0) return Math.log(1 / rho);
  return (1 - rho ** alpha) / alpha;
}

function fmt(x, sig = 4) {
  if (!Number.isFinite(x)) return '∞';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e4 || a < 1e-3) {
    const [mant, ex] = x.toExponential(2).split('e');
    return `${mant}\\cdot10^{${Number(ex)}}`;
  }
  return String(Number(x.toPrecision(sig)));
}
const plainOfSub = (s) => s.replace('$m_j\\le C(1+j)^{-\\frac{1}{2}}$', 'm_j ≤ C(1+j)^(-1/2)');
const plain = (s) => s.replace(/\\cdot10\^\{(-?\d+)\}/, '·10^$1');

function label(parent, x, y, tex, fallbackText, o = {}) {
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
    maxWidth: o.maxWidth,
    lineHeight: o.lineHeight,
    fallback: () => svgEl('text', {
      x, y, 'font-size': size, fill, 'text-anchor': anchor === 'start' ? null : anchor, 'font-weight': o.weight || null,
    }, [fallbackText]),
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

let hatchSeq = 0;

export function render(el, { params = {}, snapshot = isSnapshotMode() } = {}) {
  try {
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, FIG_ID, err.message);
  }
}

function renderInner(el, params, snapshot) {
  clear(el);
  const state = { q: 4 / 3, snap: '4/3', r: (params.r && params.r.default) || 0.05 };
  const uid = Math.random().toString(36).slice(2, 8);

  const root = htmlEl('div', { class: 'd3-figure' });
  const controls = htmlEl('div', { class: 'figure-controls' });
  const note = htmlEl('p', { class: 'figure-banner' }, ['profiles drawn with C = 1; the bounds hold up to constants C_q (not computed): compare exponents, not values']);
  const svgHost = htmlEl('div', { style: 'width:100%' });
  // tasks/p17-figure-feedback.md: the readout table, closed by default (its
  // values compare two illustrative profiles, not the exponents).
  const details = htmlEl('details', { class: 'figure-details' });
  const summary = htmlEl('summary', {}, ['Details: sums for the two drawn profiles']);
  const table = htmlEl('table', { class: 'figure-table' });
  const tableNotes = htmlEl('div', { class: 'figure-table__notes' });
  details.append(summary, table, tableNotes);
  root.append(controls, note, svgHost, details);
  el.appendChild(root);

  const cell = (tag, src, fallback, attrs = {}) => texHtml(htmlEl(tag, attrs), src, fallback);
  const thead = htmlEl('thead');
  const headRow = htmlEl('tr');
  headRow.append(
    htmlEl('th', { scope: 'col' }, ['profile']),
    cell('th', '$\\sum_j m_j$', 'Σ m_j', { scope: 'col' }),
    cell('th', '$\\sum_j m_j^q$', 'Σ m_j^q', { scope: 'col' }),
    cell('th', 'order (up to $C_q$)', 'order (up to C_q)', { scope: 'col' }),
  );
  thead.appendChild(headRow);
  const tbody = htmlEl('tbody');
  table.append(thead, tbody);
  const notes = [
    ['Harnack: $\\sum_j m_j^q\\le C_qr^{q-2}$ for $1<q<2$; interval bound $C_qr^{\\frac{4}{q}-3}$ for $1<q<\\frac{3}{2}$.', 'Harnack: Σ m_j^q ≤ C_q r^(q-2) for 1<q<2; interval bound C_q r^(4/q-3) for 1<q<3/2.'],
    ['Barrier: $\\sum_j m_j^q\\le C_qr^{-1}$.', 'Barrier: Σ m_j^q ≤ C_q r^-1.'],
  ];
  notes.forEach(([src, fb]) => tableNotes.appendChild(cell('p', src, fb)));
  function updateTable({
    sumB, sumBq, sumH, sumHq, r, q,
  }) {
    tbody.textContent = '';
    const vB = [fmt(sumB), fmt(sumBq), fmt(1 / r)];
    const vH = [fmt(sumH), fmt(sumHq), fmt(r ** (q - 2))];
    const rowOf = (name, color, v, orderTex, orderPlain) => {
      const tr = htmlEl('tr');
      tr.append(
        htmlEl('th', { scope: 'row', style: `color:${color}` }, [name]),
        cell('td', `$${v[0]}$`, plain(v[0])),
        cell('td', `$${v[1]}$`, plain(v[1])),
        cell('td', `$${orderTex}=${v[2]}$`, `${orderPlain} = ${plain(v[2])}`),
      );
      tbody.appendChild(tr);
    };
    rowOf('barrier', 'var(--fig-2)', vB, 'r^{-1}', 'r^-1');
    rowOf('Harnack', 'var(--fig-1)', vH, 'r^{q-2}', 'r^(q-2)');
  }

  // --- controls -------------------------------------------------------
  const qTex = () => {
    const s = Q_SNAPS.find((x) => x.key === state.snap);
    return s ? s.tex : String(state.q);
  };
  const pValue = () => (state.snap === '6/5' ? 6 : state.snap === '4/3' ? 4 : state.q / (state.q - 1));
  const qSlider = makeSliderControl({
    id: `${FIG_ID}-q-${uid}`,
    label: 'q',
    labelTex: '$q$',
    min: 1.001,
    max: 1.499,
    step: 0.001,
    value: state.q,
    formatValue: () => String(state.q),
    formatTex: () => `$${qTex()}$`,
  });
  const ticks = htmlEl('datalist', { id: `${FIG_ID}-qsnaps-${uid}` }, Q_SNAPS.map((s) => htmlEl('option', { value: s.q.toFixed(3) })));
  qSlider.input.setAttribute('list', ticks.id);
  qSlider.wrap.appendChild(ticks);
  const pOut = htmlEl('span', { class: 'figure-control', 'aria-live': 'polite' });
  const lr = (r) => Math.log10(r);
  const rSlider = makeSliderControl({
    id: `${FIG_ID}-r-${uid}`,
    label: 'r (log scale)',
    labelTex: '$r$ (log scale)',
    min: lr(R_MIN),
    max: Number(lr(R_MAX).toFixed(3)),
    step: 0.001,
    value: lr(state.r),
    formatValue: () => fmt(state.r, 3),
    formatTex: () => `$${fmt(state.r, 3)}$`,
  });
  controls.append(qSlider.wrap, pOut, rSlider.wrap);

  function showQ() {
    texHtml(qSlider.out, `$${qTex()}$`, String(state.q));
    const p = pValue();
    const exact = state.snap !== null;
    texHtml(pOut, `$p=\\frac{q}{q-1}=${exact ? String(p) : fmt(p, 4)}$`, `p = q/(q-1) = ${exact ? p : plain(fmt(p, 4))}`);
  }
  qSlider.input.addEventListener('input', () => {
    const v = Number(qSlider.input.value);
    const s = Q_SNAPS.find((x) => Math.abs(v - x.q) < SNAP_TOL);
    state.q = s ? s.q : v;
    state.snap = s ? s.key : null;
    showQ();
    draw();
  });
  rSlider.input.addEventListener('input', () => {
    state.r = Math.min(R_MAX, Math.max(R_MIN, 10 ** Number(rSlider.input.value)));
    texHtml(rSlider.out, `$${fmt(state.r, 3)}$`, fmt(state.r, 3));
    draw();
  });

  // --- drawing ---------------------------------------------------------
  function draw() {
    const { q, r } = state;
    if (!(q > 1 && q < 1.5)) throw new Error(`q = ${q} left (1, 3/2)`);
    const W = Math.max(320, Math.round(measuredWidth(svgHost, 820)));
    const wide = W >= 760;
    // Label sizes (px at the card's own width: the viewBox is the measured width).
    const FS = {
      tick: 12, note: 12.5, axis: 13, head: 14,
    };
    const ml = 46;
    const mr = 18;

    // Profiles and their checks (the spec's "what must hold").
    const mb = barrierProfile(r);
    const mh = harnackProfile(r);
    const sumB = mb.reduce((a, b) => a + b, 0);
    if (Math.abs(sumB - 1 / r) > 1e-9 * (1 / r)) throw new Error(`barrier profile sums to ${sumB}, not \\frac{1}{r} = ${1 / r}`);
    if (mb.some((x) => x > 1 || x < 0)) throw new Error('barrier profile has a mass outside [0, 1]');
    const sumBq = sumPow(mb, q);
    const sumH = mh.reduce((a, b) => a + b, 0);
    const sumHq = sumPow(mh, q);
    const alpha = state.snap === '4/3' ? 0 : improvedAlpha(q);
    const st = state.snap === '4/3' ? 'threshold' : q < 4 / 3 ? 'summable' : 'divergent';
    const stCol = { summable: 'var(--fig-ok)', threshold: 'var(--text-dim)', divergent: 'var(--fig-bad)' }[st];

    clear(svgHost);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} 10`,
      role: 'img',
      'aria-label': 'Visit masses per window, the interval bounds they give, their sums over scales, and the thresholds in p',
      style: 'width:100%;height:auto;display:block;font-family:var(--font-ui, sans-serif)',
    });
    svgHost.appendChild(svg);
    const defs = svgEl('defs');
    svg.appendChild(defs);
    hatchSeq += 1;
    const hatchId = `fs4-hatch-${hatchSeq}`;
    defs.appendChild(svgEl('pattern', {
      id: hatchId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
    }, [svgEl('line', {
      x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--fig-theta)', 'stroke-width': 2,
    })]));
    let y0 = 0;
    if (snapshot) {
      svg.appendChild(svgEl('text', { x: 8, y: 14, 'font-size': 10, fill: 'var(--text-dim)' }, [
        `controls (default state): q = 4/3 (slider on (1, 3/2), snaps at 6/5 and 4/3), p = 4; r = ${r} (log slider 0.01..0.5). Profiles drawn with C = 1; bounds hold up to C_q (not computed): compare exponents, not values.`,
      ]));
      y0 = 24;
    }

    // ---- the chain behind the improvement (main-4 sec. 6) ----------------
    {
      const G = svgEl('g', { transform: `translate(0,${y0})` });
      svg.appendChild(G);
      label(G, 6, 14, 'the chain behind the improvement', 'the chain behind the improvement', { size: FS.head, weight: 600 });
      const steps = [
        ['$p=6$', 'p = 6', 'maximum principle', 'var(--fig-2)'],
        ['Hölder continuity', 'Hölder continuity', 'homogeneous solutions', 'var(--text-faint)'],
        ['Harnack', 'Harnack', 'kinetic comparison', 'var(--text-faint)'],
        ['better visit counts', 'better visit counts', '$m_j\\le C(1+j)^{-\\frac{1}{2}}$', 'var(--fig-1)'],
      ];
      const perRow = wide ? 4 : 2;
      const arrowW = 30;
      const boxH = 46;
      const avail = W - 12;
      const boxW = (avail - perRow * arrowW + (wide ? arrowW : 0)) / perRow;
      steps.forEach(([tex, plainText, sub, stroke], i) => {
        const rowI = Math.floor(i / perRow);
        const colI = i % perRow;
        const bx = 6 + colI * (boxW + arrowW);
        const by = 26 + rowI * (boxH + 10);
        G.appendChild(svgEl('rect', {
          x: bx, y: by, width: boxW, height: boxH, rx: 6, fill: 'var(--surface-2)', stroke, 'stroke-width': 1.6,
        }));
        label(G, bx + boxW / 2, by + 19, tex, plainText, { anchor: 'middle', size: boxW < 170 ? 12 : FS.axis, weight: 600 });
        label(G, bx + boxW / 2, by + 37, sub, plainOfSub(sub), { anchor: 'middle', size: boxW < 170 ? 10.5 : FS.tick, fill: 'var(--text-dim)' });
        if (i < steps.length - 1) {
          label(G, bx + boxW + arrowW / 2, by + boxH / 2 + 7, '$\\Rightarrow$', '⇒', { anchor: 'middle', size: 18 });
        }
      });
      y0 += 26 + Math.ceil(steps.length / perRow) * (boxH + 10) + 12;
    }

    // ---- (a) visit masses per window -----------------------------------
    const plotW = W - ml - mr;
    const A = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(A);
    label(A, -ml + 6, 14, '(a) visit masses per window $J_j$ (length $r^2$)', '(a) visit masses per window J_j (length r^2)', { size: FS.head, weight: 600 });
    // legend, one entry per line (never over the data)
    const lg = 36;
    A.appendChild(svgEl('line', {
      x1: 0, y1: lg - 4, x2: 22, y2: lg - 4, stroke: 'var(--text)', 'stroke-width': 1.2, 'stroke-dasharray': '5 3',
    }));
    label(A, 30, lg, 'barrier: $m_j\\le C$', 'barrier: m_j ≤ C', { size: FS.axis });
    A.appendChild(svgEl('rect', {
      x: 0, y: lg + 8, width: 22, height: 10, fill: 'var(--fig-2)', 'fill-opacity': 0.35, stroke: 'var(--fig-2)',
    }));
    const lg2 = label(A, 30, lg + 19, 'allowed by the barrier bounds alone: $m_j\\le1$, $\\sum_j m_j=\\frac{1}{r}$', 'allowed by the barrier bounds alone: m_j ≤ 1, Σ m_j = 1/r', {
      size: FS.axis, maxWidth: Math.max(160, plotW - 30), lineHeight: 17,
    });
    const lg2h = lg2.mainTexBox ? Math.max(17, lg2.mainTexBox.h) : (plotW < 520 ? 34 : 17);
    const lg3 = lg + 23 + lg2h;
    A.appendChild(svgEl('line', {
      x1: 0, y1: lg3 - 4, x2: 22, y2: lg3 - 4, stroke: 'var(--fig-1)', 'stroke-width': 1.6,
    }));
    A.appendChild(svgEl('circle', { cx: 11, cy: lg3 - 4, r: 2.6, fill: 'var(--fig-1)' }));
    label(A, 30, lg3, 'Harnack: $C(1+j)^{-1/2}$', 'Harnack: C(1+j)^(-1/2)', { size: FS.axis });

    const topA = lg3 + 18;
    const hA = 150;
    const xMax = 3 + 1 / (r * r);
    const xA = (x) => (Math.log(x) / Math.log(xMax)) * plotW; // x = 1 + j on a log scale
    const yMaxA = 1.25;
    const yA = (v) => topA + hA * (1 - v / yMaxA);
    for (const v of [0, 0.5, 1]) {
      line(A, 0, yA(v), plotW, yA(v), { stroke: 'var(--border)', 'stroke-width': v === 0 ? 0 : 0.7 });
      label(A, -6, yA(v) + 4, `$${v}$`, String(v), { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)' });
    }
    // barrier-only step area
    // outline of the step area: up the left edge, along each window's
    // height, down after the last nonzero window
    let d = `M${xA(1)},${yA(0)}`;
    let xEnd = xA(1);
    mb.forEach((m, j) => {
      if (m <= 0) return;
      const x1 = xA(1 + j);
      xEnd = xA(Math.min(xMax, 2 + j));
      d += `L${x1},${yA(m)}L${xEnd},${yA(m)}`;
    });
    d += `L${xEnd},${yA(0)}Z`;
    A.appendChild(svgEl('path', {
      d, fill: 'var(--fig-2)', 'fill-opacity': 0.3, stroke: 'var(--fig-2)', 'stroke-width': 1,
    }));
    // barrier line m = 1
    A.appendChild(svgEl('line', {
      x1: 0, y1: yA(1), x2: plotW, y2: yA(1), stroke: 'var(--text)', 'stroke-width': 1.2, 'stroke-dasharray': '5 3',
    }));
    // Harnack profile: the full polyline, dots where they stay apart
    let hp = '';
    let lastX = -Infinity;
    let lastDot = -Infinity;
    const dots = [];
    mh.forEach((m, j) => {
      const x = xA(1 + j);
      if (j === mh.length - 1 || x - lastX >= 0.6) {
        hp += `${hp ? 'L' : 'M'}${x.toFixed(2)},${yA(m).toFixed(2)}`;
        lastX = x;
      }
      if (x - lastDot >= 7) { dots.push([x, yA(m)]); lastDot = x; }
    });
    A.appendChild(svgEl('path', {
      d: hp, fill: 'none', stroke: 'var(--fig-1)', 'stroke-width': 1.6,
    }));
    for (const [x, y] of dots) A.appendChild(svgEl('circle', { cx: x, cy: y, r: 2.4, fill: 'var(--fig-1)' }));
    line(A, 0, yA(0), plotW, yA(0));
    line(A, 0, topA - 4, 0, yA(0));
    // x ticks at powers of ten (and the right end 3 + r^{-2})
    for (let k = 0; 10 ** k <= xMax; k += 1) {
      const x = xA(10 ** k);
      if (plotW - x < 30 && k > 0) continue;
      line(A, x, yA(0), x, yA(0) + 4);
      label(A, x, yA(0) + 22, `$10^{${k}}$`, `10^${k}`, { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    }
    line(A, plotW, yA(0), plotW, yA(0) + 4);
    label(A, plotW, yA(0) + 22, '$3+r^{-2}$', '3+r^-2', { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)', clamp: [0, plotW + mr] });
    label(A, plotW, yA(0) + 40, '$1+j$ (log scale)', '1+j (log scale)', { anchor: 'end', size: FS.axis, fill: 'var(--text-dim)' });
    const bottomA = yA(0) + 46;

    updateTable({
      sumB, sumBq, sumH, sumHq, r, q,
    });
    y0 += bottomA + 14;

    // ---- formula strip --------------------------------------------------
    const stripRow = W >= 1060;
    const F = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(F);
    F.appendChild(svgEl('rect', {
      x: -ml + 4, y: 0, width: W - 8, height: stripRow ? 36 : 80, rx: 6, fill: 'var(--surface-2)',
    }));
    const f1 = ['$\\|G_{P,I}\\|_{L^q}^q\\le C_qr^{6-4q}\\sum_j m_j^q$', '‖G‖^q ≤ C_q r^(6-4q) Σ m_j^q'];
    const f2 = ['barrier: $\\sum_j m_j^q\\le C_qr^{-1}\\Rightarrow\\|G_{P,I}\\|_{L^q}\\le C_qr^{\\frac{5}{q}-4}$', 'barrier: Σ m_j^q ≤ C_q r^-1 ⇒ ‖G‖ ≤ C_q r^(5/q-4)'];
    const f3 = ['Harnack: $\\sum_j m_j^q\\le C_qr^{q-2}\\Rightarrow\\|G_{P,I}\\|_{L^q}\\le C_qr^{\\frac{4}{q}-3}$', 'Harnack: Σ m_j^q ≤ C_q r^(q-2) ⇒ ‖G‖ ≤ C_q r^(4/q-3)'];
    if (stripRow) {
      const span = (W - 8) / 3;
      [f1, f2, f3].forEach((f, i) => label(F, -ml + 4 + span * (i + 0.5), 22, f[0], f[1], { anchor: 'middle', size: FS.axis }));
    } else {
      label(F, -ml + 12, 22, f1[0], f1[1], { size: FS.axis });
      label(F, -ml + 12, 46, f2[0], f2[1], { size: FS.axis });
      label(F, -ml + 12, 70, f3[0], f3[1], { size: FS.axis });
    }
    y0 += (stripRow ? 36 : 80) + 22;

    // ---- (b) summing over velocity scales ------------------------------
    const B = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(B);
    const wB = W - ml - mr;
    const bTitle = label(B, -ml + 6, 14, '(b) summing over velocity scales: $F(\\rho)=\\int_\\rho^1 r^{\\alpha}\\,\\dd r/r$', '(b) summing over velocity scales: F(ρ) = ∫_ρ^1 r^α dr/r', {
      size: FS.head, weight: 600, maxWidth: W - 12, lineHeight: 18,
    });
    const lb = 36 + (bTitle.mainTexBox && bTitle.mainTexBox.h > 24 ? 18 : 0);
    B.appendChild(svgEl('line', {
      x1: 0, y1: lb - 4, x2: 22, y2: lb - 4, stroke: 'var(--fig-2)', 'stroke-width': 2,
    }));
    label(B, 30, lb, 'preliminary, $q=\\frac{6}{5}$ ($p=6$): $\\alpha=\\frac{1}{6}$, fixed', 'preliminary, q = 6/5 (p = 6): α = 1/6, fixed', { size: FS.axis });
    B.appendChild(svgEl('line', {
      x1: 0, y1: lb + 17, x2: 22, y2: lb + 17, stroke: 'var(--fig-1)', 'stroke-width': 2,
    }));
    const aTex = state.snap === '4/3' ? '0' : fmt(alpha, 3);
    label(B, 30, lb + 21, `improved, $q=${qTex()}$: $\\alpha=4/q-3=${aTex}$`, `improved, q = ${state.q}: α = 4/q - 3 = ${plain(aTex)}`, { size: FS.axis });
    const stText = {
      summable: 'improved bound summable: $q<\\frac{4}{3}\\iff p>4$ — yes',
      threshold: 'improved bound summable: $q<\\frac{4}{3}\\iff p>4$ — at $q=\\frac{4}{3}$: no, $F(\\rho)=\\log(1/\\rho)$',
      divergent: 'improved bound summable: $q<\\frac{4}{3}\\iff p>4$ — no',
    }[st];
    const stNode = label(B, 0, lb + 45, stText, `improved bound summable: q < 4/3 ⇔ p > 4 — ${st === 'summable' ? 'yes' : 'no'}`, {
      size: FS.axis, fill: stCol, weight: 600, maxWidth: wB, lineHeight: 18,
    });
    const stH = stNode.mainTexBox ? Math.max(16, stNode.mainTexBox.h) : 16;
    const topB = lb + 48 + stH;
    const hB = 150;
    const xB = (rho) => ((Math.log10(rho) - RHO_MIN_EXP) / -RHO_MIN_EXP) * wB;
    const yB = (v) => topB + hB * (1 - v / F_CLIP);
    for (const v of [0, 3, 6, 9, 12]) {
      line(B, 0, yB(v), wB, yB(v), { stroke: 'var(--border)', 'stroke-width': v === 0 ? 0 : 0.7 });
      label(B, -6, yB(v) + 4, `$${v}$`, String(v), { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)' });
    }
    const curve = (fn, color, dash) => {
      let pathD = '';
      let clippedAt = null;
      for (let i = 0; i <= 400; i += 1) {
        const lx = RHO_MIN_EXP * (i / 400); // from 10^0 down to 10^-8
        const rho = 10 ** lx;
        const v = fn(rho);
        if (v > F_CLIP) { clippedAt = rho; break; }
        pathD += `${pathD ? 'L' : 'M'}${xB(rho).toFixed(2)},${yB(v).toFixed(2)}`;
      }
      B.appendChild(svgEl('path', {
        d: pathD, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash || null,
      }));
      if (clippedAt !== null) {
        const x = xB(clippedAt);
        B.appendChild(svgEl('path', { d: `M${x - 4},${topB + 3} L${x},${topB - 4} L${x + 4},${topB + 3} Z`, fill: color }));
      }
    };
    // asymptotes
    B.appendChild(svgEl('line', {
      x1: 0, y1: yB(6), x2: wB, y2: yB(6), stroke: 'var(--fig-2)', 'stroke-width': 1, 'stroke-dasharray': '5 4',
    }));
    label(B, 6, yB(6) - 5, '$6$', '6', { size: FS.tick, fill: 'var(--fig-2)', halo: true });
    if (alpha > 0 && 1 / alpha <= F_CLIP) {
      B.appendChild(svgEl('line', {
        x1: 0, y1: yB(1 / alpha), x2: wB, y2: yB(1 / alpha), stroke: 'var(--fig-1)', 'stroke-width': 1, 'stroke-dasharray': '5 4',
      }));
      const ay = Math.abs(1 / alpha - 6) < 0.9 ? yB(1 / alpha) + 14 : yB(1 / alpha) - 5;
      label(B, 30, ay, `$1/\\alpha=${fmt(1 / alpha, 3)}$`, `1/α = ${plain(fmt(1 / alpha, 3))}`, { size: FS.tick, fill: 'var(--fig-1)', halo: true });
    }
    curve((rho) => 6 * (1 - rho ** (1 / 6)), 'var(--fig-2)');
    curve((rho) => scaleIntegral(alpha, rho), 'var(--fig-1)');
    line(B, 0, yB(0), wB, yB(0));
    line(B, 0, topB - 4, 0, yB(0));
    for (let k = RHO_MIN_EXP; k <= 0; k += 2) {
      const x = xB(10 ** k);
      line(B, x, yB(0), x, yB(0) + 4);
      label(B, x, yB(0) + 22, k === 0 ? '$1$' : `$10^{${k}}$`, k === 0 ? '1' : `10^${k}`, { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)', clamp: [-ml + 2, wB + mr - 2] });
    }
    label(B, wB, yB(0) + 40, 'lower limit $\\rho$ of the $r$-integral (log scale)', 'lower limit ρ of the r-integral (log scale)', { anchor: 'end', size: FS.axis, fill: 'var(--text-dim)' });
    y0 += yB(0) + 52;

    // ---- (c) the thresholds ---------------------------------------------
    const Cg = svgEl('g', { transform: `translate(${ml},${y0})` });
    svg.appendChild(Cg);
    const wC = W - ml - mr - 40;
    label(Cg, -ml + 6, 14, '(c) the thresholds in $p=\\frac{q}{q-1}$', '(c) the thresholds in p = q/(q-1)', { size: FS.head, weight: 600 });
    const xp = (p) => ((p - 3) / 5) * wC;
    const bandNarrow = (wC / 5) < 65; // the p_*(kappa) label does not fit beside the improved one
    const rowImp = bandNarrow ? 52 : 34;
    label(Cg, xp(4) + 6, rowImp, 'improved interval estimate: every $p>4$', 'improved interval estimate: every p > 4', { size: FS.axis, fill: 'var(--fig-1)', weight: 600, clamp: [-ml + 2, W - ml - 2] });
    const bandY = rowImp + 14;
    const bandH = 18;
    const axY = bandY + bandH;
    Cg.appendChild(svgEl('rect', {
      x: xp(4), y: bandY, width: wC + 26 - xp(4), height: bandH, fill: 'var(--fig-1)', 'fill-opacity': 0.25,
    }));
    Cg.appendChild(svgEl('rect', {
      x: xp(3), y: bandY, width: xp(4) - xp(3), height: bandH, fill: `url(#${hatchId})`, stroke: 'var(--fig-theta)', 'stroke-width': 0.8,
    }));
    // the band only locates p_*(kappa): name it, mark no point inside it
    label(Cg, bandNarrow ? xp(3) : (xp(3) + xp(4)) / 2, bandNarrow ? rowImp - 18 : rowImp, '$p_*(\\kappa)$?', 'p_*(κ)?', {
      anchor: bandNarrow ? 'start' : 'middle', size: FS.axis, fill: 'var(--fig-theta)', weight: 600,
    });
    // axis with an arrow to infinity
    line(Cg, xp(3), axY, wC + 30, axY);
    Cg.appendChild(svgEl('path', { d: `M${wC + 30},${axY - 4} L${wC + 38},${axY} L${wC + 30},${axY + 4} Z`, fill: 'var(--text)' }));
    for (let p = 3; p <= 8; p += 1) {
      line(Cg, xp(p), axY, xp(p), axY + 4);
      label(Cg, xp(p), axY + 19, `$${p}$`, String(p), { anchor: 'middle', size: FS.tick, fill: 'var(--text-dim)' });
    }
    label(Cg, wC + 38, axY + 19, '$\\infty$', '∞', { anchor: 'end', size: FS.tick, fill: 'var(--text-dim)' });
    // open end at 4 of the improved range
    Cg.appendChild(svgEl('circle', { cx: xp(4), cy: axY, r: 3.5, fill: 'var(--fig-bg)', stroke: 'var(--fig-1)', 'stroke-width': 1.5 }));
    // p = 6: the preliminary maximum principle
    Cg.appendChild(svgEl('circle', { cx: xp(6), cy: axY, r: 4, fill: 'var(--fig-2)' }));
    line(Cg, xp(6), axY + 20, xp(6), axY + 30, { stroke: 'var(--fig-2)' });
    label(Cg, xp(6), axY + 44, 'preliminary: maximum principle at $p=6$', 'preliminary: maximum principle at p = 6', { anchor: 'middle', size: FS.axis, fill: 'var(--fig-2)', clamp: [-ml + 2, W - ml - 2] });
    // the current p
    const p = pValue();
    const xc = p > 8 ? wC + 26 : xp(p);
    line(Cg, xc, bandY - 2, xc, axY, { stroke: stCol, 'stroke-width': 2 });
    Cg.appendChild(svgEl('path', { d: `M${xc - 5},${bandY - 9} L${xc + 5},${bandY - 9} L${xc},${bandY - 2} Z`, fill: stCol }));
    // the Bellman band, as a legend line below
    const lgY = axY + 66;
    Cg.appendChild(svgEl('rect', {
      x: 0, y: lgY - 10, width: 22, height: 12, fill: `url(#${hatchId})`, stroke: 'var(--fig-theta)', 'stroke-width': 0.8,
    }));
    const bell = label(Cg, 30, lgY, 'hatched band: it locates the threshold $p_*(\\kappa)\\in[3,4)$, which is not computed here and depends on $\\kappa=\\frac{\\Lambda}{\\lambda}$; it does not say that every $p$ in $[3,4)$ works. Bellman barrier (companion): every $p>p_*(\\kappa)$, including $p=4$.', 'hatched band: it locates the threshold p_*(κ) ∈ [3,4), which is not computed here and depends on κ = Λ/λ; it does not say that every p in [3,4) works. Bellman barrier (companion): every p > p_*(κ), including p = 4.', {
      size: FS.axis, fill: 'var(--text)', maxWidth: W - ml - 30 - mr, lineHeight: 17,
    });
    const bellH = bell.mainTexBox ? Math.max(17, bell.mainTexBox.h) : 51;
    const triangleNote = label(Cg, 30, lgY + bellH + 10, 'marker: the current $p$ from the $q$ slider', 'marker: the current p from the q slider', { size: FS.note, fill: 'var(--text-dim)' });
    Cg.appendChild(svgEl('path', { d: `M6,${lgY + bellH + 3} L16,${lgY + bellH + 3} L11,${lgY + bellH + 10} Z`, fill: stCol }));
    void triangleNote;
    y0 += lgY + bellH + 24;

    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(y0)}`);
  }

  showQ();
  draw();
  watchResize(svgHost, () => { try { draw(); } catch (err) { showAssertionError(el, FIG_ID, err.message); } });
}
