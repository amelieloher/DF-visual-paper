// Shared pieces of the figures that simulate their paths in the browser
// (fig.doeblin-fourier, fig.position-as-time, fig.visits, fig.below-four):
// the "New sample" / "Play" controls with the seed and the stated
// simulation parameters, an animation clock, a frame-budgeted runner for
// longer simulations, and small drawing helpers (typeset labels with a
// plain-text fallback, arrows, polylines).
//
// Bundling note (scripts/lib/bundleFigures.mjs): a lib module may import
// only lib modules whose names sort before its own -- "toyrun" sorts after
// dom, svgkit, texLabel and theme.

import { htmlEl, svgEl } from './dom.mjs';
import { texHtml, texLabel } from './texLabel.mjs';

/** A label at (x, y) (baseline), typeset when KaTeX is live, else plain SVG text. */
export function lab(parent, x, y, tex, plain, o = {}) {
  const size = o.size || 13;
  const fill = o.fill || 'var(--text)';
  const anchor = o.anchor || 'start';
  const node = texLabel(x, y, tex, {
    size,
    fill,
    anchor,
    halo: o.halo,
    weight: o.weight,
    clamp: o.clamp,
    maxWidth: o.maxWidth,
    lineHeight: o.lineHeight,
    fallback: () => svgEl('text', {
      x,
      y,
      'font-size': size,
      fill,
      'text-anchor': anchor === 'start' ? null : anchor,
      'font-weight': o.weight || null,
    }, [plain === undefined ? tex.replace(/\$/g, '') : plain]),
  });
  parent.appendChild(node);
  return node;
}

/** A straight line. */
export function seg(parent, x1, y1, x2, y2, attrs = {}) {
  const n = svgEl('line', {
    x1, y1, x2, y2, stroke: 'var(--text)', 'stroke-width': 1, ...attrs,
  });
  parent.appendChild(n);
  return n;
}

/** An arrow from (x1, y1) to (x2, y2) with a filled head (no SVG markers:
 * the audit rasterizer draws plain paths only). */
export function arrow(parent, x1, y1, x2, y2, { color = 'var(--text)', width = 1, head = 7 } = {}) {
  const g = svgEl('g');
  const a = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - head * Math.cos(a);
  const by = y2 - head * Math.sin(a);
  g.appendChild(svgEl('line', {
    x1, y1, x2: bx, y2: by, stroke: color, 'stroke-width': width,
  }));
  const w = head * 0.42;
  g.appendChild(svgEl('path', {
    d: `M${x2},${y2} L${bx - w * Math.sin(a)},${by + w * Math.cos(a)} L${bx + w * Math.sin(a)},${by - w * Math.cos(a)} Z`,
    fill: color,
  }));
  parent.appendChild(g);
  return g;
}

/** SVG path data through the points (xs[i], ys[i]) for i in [i0, i1). */
export function polyD(xs, ys, i0 = 0, i1 = xs.length, sx = (x) => x, sy = (y) => y) {
  let d = '';
  for (let i = i0; i < i1; i += 1) d += `${i === i0 ? 'M' : 'L'}${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`;
  return d;
}

/** A small "x" mark centred at (x, y). */
export function crossMark(parent, x, y, { color = 'var(--fig-1)', r = 4, width = 1.6 } = {}) {
  const n = svgEl('path', {
    d: `M${x - r},${y - r} L${x + r},${y + r} M${x - r},${y + r} L${x + r},${y - r}`, stroke: color, 'stroke-width': width, fill: 'none',
  });
  parent.appendChild(n);
  return n;
}

/**
 * The controls above a simulated figure: "New sample" (a fresh seed),
 * optionally "Play"/"Pause", the current seed, a status line, and the
 * statement of what is simulated (text with inline $...$ math).
 * Returns { node, newBtn, playBtn, setSeed(seed), setPlaying(bool),
 * setStatus(text), setBusy(bool) }.
 */
export function simControls({
  canPlay = false, note, noteText, onNewSample, onPlay,
}) {
  const node = htmlEl('div', { class: 'figure-sim', style: 'display:flex;flex-direction:column;gap:6px;width:100%' });
  const row = htmlEl('div', { class: 'figure-controls' });
  const newBtn = htmlEl('button', { type: 'button', class: 'figure-control figure-control--button', 'data-sim': 'new' }, ['New sample']);
  newBtn.title = 'Simulate new paths with a fresh random seed';
  newBtn.addEventListener('click', () => onNewSample());
  row.appendChild(newBtn);
  let playBtn = null;
  if (canPlay) {
    playBtn = htmlEl('button', {
      type: 'button', class: 'figure-control figure-control--button', 'data-sim': 'play', 'aria-pressed': 'false',
    }, ['▶ Play']);
    playBtn.title = 'Run the paths forward in time';
    playBtn.addEventListener('click', () => onPlay());
    row.appendChild(playBtn);
  }
  const seedOut = htmlEl('span', { class: 'figure-control', 'data-sim': 'seed' });
  const status = htmlEl('span', { class: 'figure-control', 'aria-live': 'polite', 'data-sim': 'status' });
  row.append(seedOut, status);
  const noteEl = htmlEl('p', {
    class: 'figure-sim__note',
    style: 'margin:0;font-family:var(--font-ui);font-size:12.5px;line-height:1.45;color:var(--text-dim)',
  });
  texHtml(noteEl, note, noteText);
  node.append(row, noteEl);
  return {
    node,
    newBtn,
    playBtn,
    setSeed(seed) { seedOut.textContent = `seed ${seed}`; },
    setPlaying(on) {
      if (!playBtn) return;
      playBtn.setAttribute('aria-pressed', String(!!on));
      playBtn.textContent = on ? '❚❚ Pause' : '▶ Play';
    },
    setStatus(text) { status.textContent = text || ''; },
    setBusy(on) { newBtn.disabled = !!on; },
  };
}

function raf(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return setTimeout(() => fn(Date.now()), 16);
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * An animation clock: progress runs from 0 to 1 in `duration` ms while
 * playing; `onFrame(progress)` on every frame, `onEnd()` once at 1.
 * Stops by itself once `alive()` is false (the figure left the page).
 */
export function makeClock({
  duration, onFrame, onEnd, alive = () => true,
}) {
  let progress = 1;
  let playing = false;
  let last = 0;
  let token = 0;
  function tick(my) {
    if (my !== token || !playing) return;
    if (!alive()) { playing = false; return; }
    const t = now();
    progress = Math.min(1, progress + (t - last) / duration);
    last = t;
    onFrame(progress);
    if (progress >= 1) {
      playing = false;
      onEnd();
      return;
    }
    raf(() => tick(my));
  }
  return {
    get playing() { return playing; },
    get progress() { return progress; },
    play() {
      if (progress >= 1) progress = 0;
      playing = true;
      last = now();
      token += 1;
      const my = token;
      onFrame(progress);
      raf(() => tick(my));
    },
    pause() { playing = false; token += 1; },
    stop() { playing = false; token += 1; progress = 1; },
  };
}

/**
 * Run `step(deadline)` repeatedly, one call per animation frame, until it
 * returns true; `step` should stop working once `now() > deadline` (a
 * frame budget of `budgetMs`). Returns { cancel() }.
 */
export function runChunked(step, { budgetMs = 28, onDone = () => {}, alive = () => true } = {}) {
  let cancelled = false;
  function frame() {
    if (cancelled) return;
    if (!alive()) { cancelled = true; return; }
    const done = step(now() + budgetMs);
    if (done) { onDone(); return; }
    raf(frame);
  }
  raf(frame);
  return { cancel() { cancelled = true; } };
}

/** Milliseconds, monotonic where available. */
export function clockNow() { return now(); }
