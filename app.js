// Polynomial Entry -- visual paper app shell (tasks/p1b-site.md deliverable
// 4). Loads dist/data.json (pre-rendered by scripts/build.mjs -- every
// statement, proof and title is already HTML; nothing here re-renders
// math), draws the Cytoscape dependency graph, and drives the reading
// panel, search, theme, deep links and dev view.

import { notationKeyFromClassName, getNotationEntry, renderNotationCard } from './notation.mjs';
import { createGraphController } from './graphnav.mjs';
import { initReadingMode } from './readingmode.mjs';

// vendor/cytoscape-dagre.min.js is loaded as a classic <script> tag before
// this module and attaches a plain global; cytoscape only gains the `dagre`
// layout once it is registered via `.use(...)`. The graph's views, layout
// and zoom live in ./graphnav.mjs (tasks/p8-graph-navigation.md), shared
// with the compact preview.
if (window.cytoscape && window.cytoscapeDagre) window.cytoscape.use(window.cytoscapeDagre);

const state = {
  data: null,
  graph: null, // site/graphnav.mjs controller; null when the graph is unavailable
  devMode: new URLSearchParams(location.search).has('dev'),
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function initTheme() {
  const stored = safeLocalStorageGet('vp-theme');
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    safeLocalStorageSet('vp-theme', next);
    withGraph((g) => g.refreshStyle());
  });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onSystemTheme = () => withGraph((g) => g.refreshStyle());
  if (mq.addEventListener) mq.addEventListener('change', onSystemTheme);
}
function safeLocalStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeLocalStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

// ---------------------------------------------------------------------------
// Mobile pane tabs
// ---------------------------------------------------------------------------
function initTabs() {
  const buttons = document.querySelectorAll('.tabbar__btn');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.classList.remove('is-active'));
    b.classList.add('is-active');
    document.body.setAttribute('data-pane', b.dataset.pane);
    if (b.dataset.pane === 'graph') revealOutlineCurrent();
  }));
  document.body.setAttribute('data-pane', 'graph');
}
function showPanelTab() {
  document.body.setAttribute('data-pane', 'panel');
  document.querySelectorAll('.tabbar__btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.pane === 'panel');
  });
}

// ---------------------------------------------------------------------------
// Reading mode (tasks/p13-reading-mode.md, site/readingmode.mjs): the
// divider, "Hide graph" and the text size. Whenever the graph pane settles
// at a new size -- the divider let go, or the graph shown again -- the
// canvas is resized and re-fitted; while hidden, routes still update the
// panel and the graph (at zero size) keeps a pending fit for when it is
// back. The D3 figures in the panel follow their own mounts' size (each
// either scales with its viewBox or re-lays out from svgkit's watchResize).
// ---------------------------------------------------------------------------
function initReading() {
  try {
    initReadingMode({
      onLayoutChange: (reason) => {
        if (!['split', 'graph-shown', 'graph-expanded', 'graph-restored'].includes(reason)) return;
        requestAnimationFrame(() => withGraph((g) => g.resize({ refit: true })));
      },
    });
  } catch (err) {
    console.warn(`Reading-mode controls unavailable: ${err && err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function htmlToText(html) {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
/** Like htmlToText, but math reads once: KaTeX's MathML text is kept and
 * its duplicate HTML rendering and TeX annotation are dropped (graph
 * labels and the phone outline). */
function plainText(html) {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  el.querySelectorAll('.katex-html, annotation').forEach((x) => x.remove());
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Site metadata (tasks/p11-launch.md sec.1): content/site.yaml, shipped as
// extra fields on data.meta (scripts/build.mjs) -- paper title, authors,
// arXiv id (null until the paper is posted), year, public URL.
// These constants are only the LAST-RESORT fallback for a data.meta with a
// field missing (an old cached data.json, or a test fixture) -- never a
// second source of truth to keep in sync by hand.
// ---------------------------------------------------------------------------
const DEFAULT_PAPER_TITLE = 'Untitled paper';
const DEFAULT_AUTHORS = [];

function authorsLine(authors) {
  return (authors && authors.length) ? authors.join(', ') : DEFAULT_AUTHORS.join(', ');
}
/** The legend's external-source labels (site/index.html `[data-ext-name]`
 * / `[data-ext-tag]`), from data.meta.external; with no external source,
 * its legend rows and toggle are hidden. */
function applyExternalNames(meta) {
  if (typeof document.querySelectorAll !== 'function') return;
  const ext = externalNames(meta);
  document.querySelectorAll('[data-ext-name]').forEach((el) => { if (ext) el.textContent = ext.lower; });
  document.querySelectorAll('[data-ext-tag]').forEach((el) => { if (ext) el.textContent = ext.tag; });
  document.querySelectorAll('.graph-legend__row--xsrc, .graph-legend__row--xsrc-toggle').forEach((el) => { el.hidden = !ext; });
}
function arxivUrl(id) {
  return `https://arxiv.org/abs/${encodeURIComponent(id)}`;
}

/** Top bar: the paper's title (replacing site/index.html's static text once
 * data.json has loaded), and a small "arXiv:<id>" link -- shown only once
 * `meta.arxivId` is set (tasks/p11-launch.md sec.2). `#topbar-arxiv-link`
 * does not exist in every test fixture's minimal DOM, so both lookups are
 * guarded exactly like initBrandHome's `.topbar__brand` below. */
function applySiteMeta(data) {
  const meta = (data && data.meta) || {};
  const h1 = document.querySelector('.topbar__title');
  if (h1 && meta.paperTitle) h1.textContent = meta.paperTitle;
  applyExternalNames(meta);
  const arxivLink = document.getElementById('topbar-arxiv-link');
  if (!arxivLink) return;
  if (meta.arxivId) {
    arxivLink.href = arxivUrl(meta.arxivId);
    arxivLink.textContent = `arXiv:${meta.arxivId}`;
    arxivLink.hidden = false;
  } else {
    arxivLink.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Welcome panel (tasks/p5-polish-5.md): shown whenever there is no route
// (`#/...`) -- on first load with no hash, and again whenever the route is
// cleared, including by clicking the site title (see initBrandHome below).
// Its heading, byline and three paragraphs are fixed, reviewed copy, not
// derived from content/** -- so, unlike every other panel in this file,
// nothing here goes through the audit pipeline. The start buttons are
// ordinary links built from the already-loaded data (never hard-coded ids):
// one per main theorem in data.meta.mainTheoremIds. The arXiv
// line and "How to cite" line (tasks/p11-launch.md sec.2) show only once
// meta.arxivId is set; the footer (sec.3, full site only -- the preview
// build never calls welcomeFooterHtml) never carries a licence grant for
// the paper content itself.
// ---------------------------------------------------------------------------
function welcomeFooterHtml(meta) {
  const year = meta.year || 2026;
  return `
      <footer class="welcome-panel__footer">
        <p>&copy; ${year} ${escapeHtml(authorsLine(meta.authors))}.</p>
        <p>Third-party software: KaTeX (MIT), D3 (ISC), Cytoscape.js and cytoscape-dagre (MIT), dagre (MIT), IBM Plex (SIL OFL 1.1). <a href="THIRD_PARTY_LICENSES.txt">Full licence texts</a>.</p>
      </footer>`;
}

/** The external source's display names (content/site.yaml
 * project.external_sources, shipped on data.meta.external): its region
 * label ("Companion manuscript") and short tag ("Companion"). */
function externalNames(meta) {
  const ext = meta && meta.external;
  if (!ext) return null;
  const label = htmlToText(ext.label || '') || ext.tag || 'External source';
  return { label, tag: ext.tag || label, lower: label.charAt(0).toLowerCase() + label.slice(1) };
}

/** "How to read the graph": every box and arrow style the graph draws, a
 * mini swatch reusing the graph legend's own CSS classes (so this and the
 * legend can never drift apart), plus one plain sentence each on Main
 * results vs. Full graph, the two layouts (map and columns), opening a
 * section, clicking a result, and Back/Forward. Fixed, reviewed copy. */
function howToReadGraphHtml(meta) {
  const ext = externalNames(meta);
  const extItems = ext ? `
        <li><i class="legend-swatch legend-swatch--xsrc" aria-hidden="true"></i>A result quoted from the ${escapeHtml(ext.lower)}, in its own region of the graph (only with “Show ${escapeHtml(ext.tag)} links”).</li>
        <li><i class="legend-swatch legend-swatch--background" aria-hidden="true"></i>A fact the paper takes from the ${escapeHtml(ext.lower)} without stating it, written out here and marked “Background” (only with “Show ${escapeHtml(ext.tag)} links”).</li>` : '';
  return `
    <div class="welcome-panel__how-to-read" id="how-to-read-graph">
      <h3 class="section-label">How to read the graph</h3>
      <ul class="how-to-read__list">
        <li><i class="legend-swatch legend-swatch--theorem" aria-hidden="true"></i>Main theorem: filled orange.</li>
        <li><i class="legend-swatch legend-swatch--major" aria-hidden="true"></i>Major result: a proposition, or a step marked as one of the main steps of the proofs; orange border.</li>
        <li><i class="legend-swatch legend-swatch--result" aria-hidden="true"></i>Supporting result: a lemma, labelled estimate or named step of a proof; pale green.</li>
        <li><i class="legend-swatch legend-swatch--definition" aria-hidden="true"></i>Definition or assumption: small, grey. The paper&rsquo;s setting (the definitions every section works with) sits beside the sections in the full graph.</li>
        <li><i class="legend-swatch legend-swatch--section" aria-hidden="true"></i>Section, closed: click to open it.</li>
        <li><i class="legend-swatch legend-swatch--subsection" aria-hidden="true"></i>Subsection: a group of results, not a result; white with a dashed border.</li>
        <li><i class="legend-swatch legend-swatch--ext" aria-hidden="true"></i>Another paper the proofs cite.</li>${extItems}
        <li><i class="legend-arrow" aria-hidden="true"></i>Arrow A &rarr; B: A is used in the proof (or statement, or definition) of B. Every arrow is drawn the same way.</li>
        <li><i class="legend-arrow legend-arrow--hl" aria-hidden="true"></i>Orange arrows: the arrows of the box you point at or have selected.</li>
        <li><i class="legend-arrow legend-arrow--mutual" aria-hidden="true"></i>Two-headed arrow (full graph, closed sections): each section uses something in the other.</li>
      </ul>
      <p>Main results (the default) shows only the major results and the direct uses between them; Full graph shows every result, definition and link.</p>
      <p>The map shows sections and results as boxes joined by arrows; clicking a result switches to a columns view instead, with what it uses in the left columns and what uses it in the right ones.</p>
      <p>Click a section to open it and see what is inside; click it again to close it.</p>
      <p>Click a result to read it in this panel: its statement, what it uses, what uses it, and, where the paper gives one, its proof.</p>
      <p>Back and Forward step through the graph views already opened, like a browser's own.</p>
    </div>`;
}

/** One start button per main theorem (data.meta.mainTheoremIds), labelled
 * with the theorem's own number from the .aux ("Start with Theorem 1.1"). */
function mainTheoremButtons(data) {
  const ids = ((data && data.meta && data.meta.mainTheoremIds) || []).filter((id) => data.nodes && data.nodes[id]);
  return ids.map((id, i) => {
    const num = htmlToText(data.nodes[id].numberHtml) || id;
    const cls = i === 0 ? 'welcome-panel__button' : 'welcome-panel__button welcome-panel__button--ghost';
    return `<a class="${cls}" href="#/${encodeURIComponent(id)}/L3">${i === 0 ? `Start with ${escapeHtml(num)}` : escapeHtml(num)}</a>`;
  }).join('');
}

function welcomePanelHtml(data) {
  const meta = (data && data.meta) || {};
  const paperTitle = meta.paperTitle || DEFAULT_PAPER_TITLE;
  const authors = authorsLine(meta.authors);
  const ext = externalNames(meta);
  const arxivPara = meta.arxivId
    ? `<p class="welcome-panel__arxiv">Paper: <a href="${arxivUrl(meta.arxivId)}">arXiv:${escapeHtml(meta.arxivId)}</a></p>` : '';
  const citeLine = meta.arxivId
    ? `<p class="welcome-panel__cite">How to cite: ${escapeHtml(authors)}. ${escapeHtml(paperTitle)}. <a href="${arxivUrl(meta.arxivId)}">arXiv:${escapeHtml(meta.arxivId)}</a>, ${meta.year || ''}.</p>`
    : '';
  // Companion status as main-4 states it (source/main-4.tex, disclosure paragraph).
  const extPara = ext ? `
        <p>The paper refers to a companion manuscript for several detailed arguments. Each result it cites from there, and each companion result those arguments use directly, is shown in its own region of the graph, labelled “${escapeHtml(ext.label)}”: its statement quoted verbatim with the companion manuscript's own numbering, a summary, how it is used, and, where the companion manuscript gives one, its proof in numbered steps. On the map these appear with “Show ${escapeHtml(ext.tag)} links”. The companion manuscript is not intended for publication.</p>` : '';
  const checkedExt = ext ? ', text quoted from the companion manuscript,' : '';
  const allNodes = { ...((data && data.nodes) || {}), ...((data && data.externalNodes) || {}) };
  const hasBackground = Object.values(allNodes).some((n) => n && n.kind === 'background');
  const background = ext && hasBackground ? ` The only mathematics that appears in neither the paper nor the companion manuscript is in nodes marked <em>Background</em>, which state facts the paper takes from the companion manuscript.` : '';
  const figs = Object.values((data && data.figures) || {});
  const figPara = figs.length ? `
        <p>Some results carry a figure, drawn for this site to illustrate an argument of the paper; its title and each statement of what it shows were checked in the same way.${figs.some((f) => f && f.status && f.status !== 'approved') ? ' A figure marked “awaiting author review” has passed that check but has not yet been approved by the authors.' : ''} ${figs.some((f) => f && f.illustrationLabel) ? ' A figure marked “numerical illustration” or “illustrative path” draws example data, not a proved bound.' : ''} Under each figure, “Full explanation” gives its complete caption; “Enlarge” opens it at full width.</p>` : '';
  const pdfPara = typeof document !== 'undefined' && document.querySelector('[data-pdf-downloads]') ? `
        <p>“Download PDF” at the top gives the paper${ext ? ' and the companion manuscript' : ''} as PDF files, in the versions this site is built from.</p>` : '';
  return `
    <div class="welcome-panel">
      <h2 class="node-head__title">${escapeHtml(paperTitle)}</h2>
      <p class="welcome-panel__byline">${escapeHtml(authors)}</p>
      ${arxivPara}
      <div class="prose">
        <p>An interactive companion to the paper. The graph shows how the proofs are put together: the paper's sections, their subsections, and the individual results, definitions, labelled estimates and named steps of its arguments, with an arrow from each result to the results whose proofs use it. Click a section to open it, and click a result to read it here.</p>
        <p>Each result has a short summary, the exact statement from the paper, what it uses and what uses it, and, where the paper gives one, its proof: a proof idea, then numbered steps, each with a one-line summary and the paper's own text. Click a highlighted symbol in any formula to see its definition.</p>${extPara}
        <p>All text shown is the paper's own text${checkedExt} or a summary.${background} Each summary sentence was checked, against the source passages it cites, by an independent AI auditor that did not write it; a sentence is shown only once it has passed that check. Statements and proofs are never retyped: they are extracted from the pinned source${ext ? 's' : ''} at build time.</p>${figPara}${pdfPara}
      </div>
      ${howToReadGraphHtml(meta)}
      ${citeLine}
      <div class="welcome-panel__actions">${mainTheoremButtons(data)}</div>
      ${welcomeFooterHtml(meta)}
    </div>`;
}

function renderWelcome() {
  document.getElementById('panel-content').innerHTML = welcomePanelHtml(state.data);
}

/** The site title/brand in the top bar (a <button>, not a link -- it does
 * not navigate to a URL, it clears the current one) always returns to the
 * welcome panel: clear the route if one is set (the resulting hashchange
 * re-renders it), or render it directly if the route was already empty
 * (no hashchange event would fire). */
function initBrandHome() {
  const brand = document.querySelector('.topbar__brand');
  if (!brand) return;
  brand.addEventListener('click', () => {
    if (location.hash && location.hash !== '#') location.hash = '';
    else applyRoute(null);
    showPanelTab();
  });
}

/** The graph toolbar's "?" button (tasks/p18-legend.md): opens the welcome panel
 * (like the site title) and scrolls straight to "How to read the graph" -- called
 * synchronously (not left to the async hashchange event) so the scroll target
 * exists by the time it runs. */
function initGraphHelp() {
  document.querySelectorAll('[data-graph-action="help"]').forEach((b) => b.addEventListener('click', () => {
    if (location.hash && location.hash !== '#') location.hash = '';
    applyRoute(null);
    showPanelTab();
    const target = document.getElementById('how-to-read-graph');
    if (target) target.scrollIntoView({ block: 'start' });
  }));
}

// ---------------------------------------------------------------------------
// Graph (tasks/p8-graph-navigation.md): site/graphnav.mjs owns the views --
// the whole map, an opened section with its outside links, and a result's
// own neighbourhood -- plus layout and zoom. A graph failure (e.g. cytoscape
// missing) never takes the reading panel down with it.
// ---------------------------------------------------------------------------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function graphLabelOf(id) {
  const n = state.data.nodes[id] || state.data.externalNodes[id];
  if (!n) return { number: id, title: '' };
  return { number: plainText(n.numberHtml), title: plainText(n.titleHtml) };
}

function graphFailed(err) {
  console.warn(`Dependency graph unavailable: ${err && err.message}`);
  state.graph = null;
}

function initGraph(data) {
  try {
    state.graph = createGraphController({
      cytoscape: window.cytoscape,
      container: document.getElementById('cy'),
      pane: document.getElementById('graph-pane'),
      data,
      labelOf: graphLabelOf,
      cssVar,
      navigate: (id) => { navigate(id, 'L3'); showPanelTab(); },
      onWholeMap: navigateWholeMap,
    });
  } catch (err) {
    graphFailed(err);
  }
}

/** Every call into the graph goes through here, so a failure disables the
 * graph (once, with a warning) instead of breaking the page. */
function withGraph(fn) {
  if (!state.graph) return;
  try {
    fn(state.graph);
  } catch (err) {
    graphFailed(err);
  }
}

function showInGraph(id) {
  withGraph((g) => g.show(id));
  markOutlineCurrent(id);
}

/** Phone outline: mark the routed node (aria-current) and, once the Graph tab
 * shows, scroll it into view -- so a section link lands on that section. */
function markOutlineCurrent(id) {
  const root = document.getElementById('outline');
  if (!root) return;
  root.querySelectorAll('[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
  const btn = id ? [...root.querySelectorAll('button[data-id]')].find((b) => b.dataset.id === id) : null;
  if (btn) btn.setAttribute('aria-current', 'true');
  revealOutlineCurrent();
}
function revealOutlineCurrent() {
  const root = document.getElementById('outline');
  if (!root || root.hidden || !root.offsetParent) return;
  const btn = root.querySelector('[aria-current]');
  if (btn) btn.scrollIntoView({ block: 'start' });
  else root.scrollTop = 0;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
/** `#/<id>/<level>` (a node route); `#/map` or `#/map/<id>` (the whole map,
 * keeping the reading panel on `<id>` if given -- "Whole map" is a history
 * step of its own, see navigateWholeMap below); or no hash at all (the
 * welcome panel, `null`). */
function parseHash() {
  const map = /^#\/map(?:\/([^/]+))?$/.exec(location.hash);
  if (map) return { map: true, id: map[1] ? decodeURIComponent(map[1]) : null };
  const m = /^#\/([^/]+)(?:\/([A-Za-z0-9]+))?$/.exec(location.hash);
  if (!m) return null;
  return { id: decodeURIComponent(m[1]), level: m[2] || 'L3' };
}
function navigate(id, level) {
  const target = `#/${encodeURIComponent(id)}/${level}`;
  if (location.hash === target) applyRoute({ id, level });
  else location.hash = target;
}
/** "Whole map" button: pushes `#/map`, or `#/map/<id>` when a node is
 * currently open, so the browser's Back returns to the view before the map
 * was opened and Forward returns to the map -- previously this button
 * changed only the graph, with no hash and no history entry at all. */
function navigateWholeMap() {
  const current = parseHash();
  const id = current ? current.id : null;
  const target = id ? `#/map/${encodeURIComponent(id)}` : '#/map';
  if (location.hash === target) applyRoute(parseHash());
  else location.hash = target;
}
function applyRoute(route) {
  if (!route) {
    renderWelcome();
    showInGraph(null);
    return;
  }
  if (route.map) {
    withGraph((g) => g.wholeMap(route.id || null));
    if (!route.id) { renderWelcome(); return; }
    const { data } = state;
    const node = data.nodes[route.id] || data.externalNodes[route.id];
    if (node) renderPanel(node, 'L3'); else renderMissing(route.id);
    return;
  }
  const { data } = state;
  const node = data.nodes[route.id] || data.externalNodes[route.id];
  if (!node) {
    renderMissing(route.id);
    return;
  }
  renderPanel(node, route.level);
  showInGraph(route.id);
}

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------
function kindBadge(node) {
  const label = node.kind === 'theorem' ? 'theorem' : node.kind;
  return `<span class="badge badge--kind">${escapeHtml(label)}</span>`;
}
function draftBadge(node) {
  if (!node.draft) return '';
  return `<span class="badge badge--draft">${escapeHtml(node.status || 'draft')}</span>`;
}
function auditBadge(node) {
  if (!state.devMode) return '';
  if (!node.audit) return '<span class="badge badge--audit-none">no audit</span>';
  const cls = node.audit.status === 'audited' ? 'badge--ok' : 'badge--draft';
  return `<span class="badge ${cls}">${escapeHtml(node.audit.status)} &middot; ${node.audit.claims} claims &middot; ${node.audit.auditors} auditor${node.audit.auditors === 1 ? '' : 's'}${node.audit.waived ? ` &middot; ${node.audit.waived} waived` : ''}</span>`;
}

function usesList(title, ids, data, fromId) {
  if (!ids || ids.length === 0) return '';
  const overrides = (fromId && data.usesNote && data.usesNote[fromId]) || {};
  const items = ids.map((id) => {
    const n = data.nodes[id] || data.externalNodes[id];
    // PLAN.md sec.2 task 2: a `uses` target that was really an equation
    // label shows its own .aux number ("(2.12) in §2.1"), never the raw
    // label -- the override always wins when present.
    const label = overrides[id] || (n ? (htmlToText(n.numberHtml) || id) : id);
    const t = n ? htmlToText(n.titleHtml) : '';
    return `<a href="#/${encodeURIComponent(id)}/L3"><span class="uses-list__num">${escapeHtml(label)}</span>${escapeHtml(t)}</a>`;
  }).join('');
  return `<div class="section-label">${title}</div><nav class="uses-list">${items}</nav>`;
}

function renderStepsHtml(steps, { quoted = false } = {}) {
  // `quoted`: the step text is the companion manuscript's own (a companion
  // content node), so it carries .xsrc-quote and never a notation popover.
  return steps.map((s, i) => `
    <div class="step" data-open="${i === 0}">
      <div class="step__head" data-step-toggle>
        <span class="step__num">Step ${i + 1}</span>
        <span>${s.titleHtml}</span>
      </div>
      ${s.summaryHtml.map((c) => `<div class="step__summary">${c.html}</div>`).join('')}
      <div class="step__body prose${quoted ? ' xsrc-quote' : ''}">${s.textHtml}</div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Figures (tasks/p3t-tooling.md sec.3): a figure is placed on every panel
// named in its own `attach_to` (data/build time -- scripts/lib/
// assembleGraph.mjs's buildFiguresByAttachment sets `node.figures`). A
// `renderer: 'tikz'` figure is a build-time static SVG (figures/<id>.svg,
// produced by scripts/build_tikz_figures.mjs); a `renderer: 'd3'` figure is
// an interactive module (site/figures/<id>.js, exporting
// `render(el, {theme, params})`) mounted client-side by mountFigures below.
// ---------------------------------------------------------------------------
// tasks/p9a-figure-popout.md: the same expand-to-corners glyph as the
// graph toolbar's own "fit" button.
const FIGURE_ENLARGE_BTN_HTML = `<button type="button" class="figure-enlarge-btn" aria-haspopup="dialog" title="Open this figure at full width">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
        <span class="figure-enlarge-btn__label">Enlarge</span>
      </button>`;

/** A figure's `parameters` as a readable list (never raw JSON). An illustration's
 * facts (`parameters.illustration`: [{name, value, description}]) are listed
 * under the illustration badge; a static figure's other drawing parameters as
 * name: value; a D3 figure's slider settings are not repeated (its controls
 * show them). */
function figureParamValueText(v) {
  if (Array.isArray(v)) return v.map(figureParamValueText).join(', ');
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${figureParamValueText(x)}`).join('; ');
  return String(v);
}
function figureParamsHtml(fig) {
  const p = fig.parameters;
  if (!p || typeof p !== 'object') return '';
  const row = (name, value, desc) => `<li><span class="figure-params__name">${escapeHtml(name)}</span>: <span class="figure-params__value">${escapeHtml(figureParamValueText(value))}</span>${desc ? ` <span class="figure-params__desc">(${escapeHtml(desc)})</span>` : ''}</li>`;
  if (Array.isArray(p.illustration) && p.illustration.length) {
    const items = p.illustration.map((it) => row(it.name, it.value, it.description)).join('');
    return `<details class="figure-params figure-params--toy"><summary>${figureIllustrationBadge(fig)} about the illustrative data</summary><ul class="figure-params__list">${items}</ul></details>`;
  }
  if (fig.renderer === 'd3') return '';
  const items = Object.entries(p).map(([k, v]) => row(k, v, '')).join('');
  return items ? `<details class="figure-params"><summary>drawing parameters</summary><ul class="figure-params__list">${items}</ul></details>` : '';
}

/** tasks/p17-figure-feedback.md: the badge marking illustrative (not
 * proved) data -- "numerical illustration" or "illustrative path"
 * (assembleGraph.mjs figureIllustrationLabel; the schema field stays
 * `toy_run`). */
function figureIllustrationBadge(fig) {
  const label = fig.illustrationLabel || 'numerical illustration';
  return `<span class="badge badge--draft badge--illustration" title="Drawn from illustrative data: an example, not a proved bound">${escapeHtml(label)}</span>`;
}

/** tasks/p17-figure-feedback.md: the visible caption is the title plus the
 * figure's `lead` claims (in that order; by default its first claim); every
 * other claim sits under a closed "Full explanation". Every claim stays in
 * the DOM. */
function figureCaptionParts(fig) {
  const shown = Array.isArray(fig.captionHtml) ? fig.captionHtml : [];
  const byId = new Map(shown.filter((c) => c && c.id).map((c) => [c.id, c]));
  let lead = (Array.isArray(fig.lead) ? fig.lead : []).map((id) => byId.get(id)).filter(Boolean);
  if (lead.length === 0 && shown.length) lead = [shown[0]];
  const inLead = new Set(lead);
  return { lead, rest: shown.filter((c) => !inLead.has(c)) };
}
function figureCaptionHtml(fig) {
  const { lead, rest } = figureCaptionParts(fig);
  const title = fig.titleHtml ? `<strong>${fig.titleHtml}.</strong> ` : '';
  const more = rest.length
    ? `<details class="figure-caption__more"><summary>Full explanation</summary>${rest.map((c) => `<p>${c.html}</p>`).join('')}</details>`
    : '';
  return `<figcaption><p class="figure-caption__lead">${title}${lead.map((c) => c.html).join(' ')}</p>${more}</figcaption>`;
}

function figureCardHtml(fig) {
  const kindTag = fig.kind ? `<span class="badge badge--kind">${escapeHtml(fig.kind)}</span>` : '';
  const toyTag = fig.toyRun ? figureIllustrationBadge(fig) : '';
  const reviewTag = fig.status && fig.status !== 'approved'
    ? '<span class="badge badge--draft">awaiting author review</span>' : '';
  const params = figureParamsHtml(fig);
  // Both theme variants of a static figure (scripts/build_tikz_figures.mjs);
  // site/app.css shows the one matching the page's theme.
  const altText = escapeHtml(plainText(fig.titleHtml)).replace(/"/g, '&quot;');
  const mount = fig.renderer === 'd3'
    ? `<div class="figure-mount" data-figure-id="${escapeHtml(fig.id)}"></div>`
    : `<div class="figure-img-frame figure-static-frame"><img class="figure-static figure-static--light" src="figures/${encodeURIComponent(fig.id)}.svg" alt="${altText}" loading="lazy"><img class="figure-static figure-static--dark" src="figures/${encodeURIComponent(fig.id)}.dark.svg" alt="${altText}" loading="lazy"></div>`;
  return `
    <figure class="figure-card" id="figure-${escapeHtml(fig.id)}">
      <div class="figure-card__head">${kindTag}${toyTag}${reviewTag}${FIGURE_ENLARGE_BTN_HTML}</div>
      ${mount}
      ${figureCaptionHtml(fig)}
      ${params}
    </figure>`;
}

function figuresSectionHtml(node, data) {
  const ids = Array.isArray(node.figures) ? node.figures : [];
  const figs = ids.map((id) => data.figures && data.figures[id]).filter(Boolean);
  if (figs.length === 0) return '';
  return `<div class="section-label">Figures</div><div class="figures">${figs.map(figureCardHtml).join('')}</div>`;
}

/** Mount every D3 figure in `root` (a freshly-rendered panel): dynamic
 * `import()` of its own site/figures/<id>.js module (relative to this
 * page, never a CDN -- PLAN.md sec.5/tasks/p3t-tooling.md sec.3), calling
 * its exported `render(el, {theme, params})`. A figure with no such module
 * yet (content/figures/*.yaml specs exist ahead of their build) shows a
 * placeholder instead of a dead mount point. */
function mountFigures(root, data) {
  root.querySelectorAll('.figure-mount[data-figure-id]').forEach(async (el) => {
    const id = el.dataset.figureId;
    const fig = data.figures && data.figures[id];
    const theme = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    try {
      const mod = await import(`./figures/${id}.js`);
      mod.render(el, { theme, params: (fig && fig.parameters) || {} });
    } catch (err) {
      el.innerHTML = '<p class="prose figure-mount__missing">(figure not yet built)</p>';
    }
  });
}

// ---------------------------------------------------------------------------
// Figure pop-out (tasks/p9a-figure-popout.md): "Enlarge" (or clicking the
// figure itself, outside its own controls) MOVES a figure card's live DOM --
// its `.figure-mount`/`.figure-static`/`.figure-img-frame` plus the
// `<figcaption>` right after it -- into #figure-modal, a `<dialog>` sized to
// fill most of the window, and moves the same two nodes back on close.
// Nothing is re-rendered: slider positions, listeners, and any
// resize-driven layout (fig.counting-scales' own ResizeObserver on its
// mount) carry over unchanged in both directions, and a fixed-viewBox SVG
// (`width="100%"`) simply scales to the dialog's larger box. `<dialog>`'s
// own showModal()/close() give focus-trap-while-open, Esc-to-close, and (in
// every real browser) focus-return-to-opener for free; both are called
// defensively since jsdom implements neither (test/figure-popout.test.mjs
// exercises the move logic directly instead).
// ---------------------------------------------------------------------------
const figurePopoutState = {
  mount: null, caption: null, placeholder: null, opener: null, observer: null,
};

function figurePopoutMountEl(card) {
  return card.querySelector('.figure-mount, .figure-static, .figure-img-frame');
}

/** The single cleanup path for every way the dialog can close (its own
 * close button, a backdrop click, or -- in a real browser -- Esc/the
 * native `cancel` default action): moves the mount and caption back to
 * exactly where they came from and returns focus to whatever opened it. */
function closeFigurePopoutNow() {
  const {
    mount, caption, placeholder, opener,
  } = figurePopoutState;
  if (!mount) return;
  if (figurePopoutState.observer) { figurePopoutState.observer.disconnect(); figurePopoutState.observer = null; }
  mount.style.transform = '';
  mount.style.transformOrigin = '';
  mount.style.marginBottom = '';
  placeholder.replaceWith(...(caption ? [mount, caption] : [mount]));
  figurePopoutState.mount = null;
  figurePopoutState.caption = null;
  figurePopoutState.placeholder = null;
  figurePopoutState.opener = null;
  document.getElementById('figure-modal').removeAttribute('open');
  if (opener) opener.focus();
}

function requestCloseFigurePopout() {
  const dialog = document.getElementById('figure-modal');
  if (typeof dialog.close === 'function') dialog.close(); // fires 'close' -> closeFigurePopoutNow
  else closeFigurePopoutNow(); // jsdom: no close() to fire it for us
}

function openFigurePopout(card, opener) {
  const mount = figurePopoutMountEl(card);
  if (!mount) return;
  if (figurePopoutState.mount) closeFigurePopoutNow(); // only one figure open at a time
  const next = mount.nextElementSibling;
  const caption = next && next.tagName === 'FIGCAPTION' ? next : null;

  const id = card.id.startsWith('figure-') ? card.id.slice('figure-'.length) : '';
  const fig = state.data.figures && state.data.figures[id];
  document.getElementById('figure-modal-title').textContent = fig ? plainText(fig.titleHtml) : '';

  const placeholder = document.createComment('figure-popout-slot');
  mount.before(placeholder);
  const target = document.getElementById('figure-modal-figure');
  target.appendChild(mount);
  if (caption) target.appendChild(caption);

  figurePopoutState.mount = mount;
  figurePopoutState.caption = caption;
  figurePopoutState.placeholder = placeholder;
  figurePopoutState.opener = opener || null;

  const dialog = document.getElementById('figure-modal');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', ''); // jsdom: no showModal -- reflect `open` so the DOM move is still checkable
  // Author feedback (2026-10-02): the enlarged figure must fit on one screen.
  // It is laid out at the dialog's full width, then the whole drawing
  // (controls included) is scaled down to the dialog's height if taller;
  // the caption follows below and scrolls.
  fitFigurePopout();
  requestAnimationFrame(() => requestAnimationFrame(fitFigurePopout));
  if (typeof ResizeObserver === 'function') {
    figurePopoutState.observer = new ResizeObserver(() => fitFigurePopout());
    figurePopoutState.observer.observe(mount);
    figurePopoutState.observer.observe(target);
  }
}

/** Scale the popped-out figure so that its full drawing fits in the
 * dialog's figure area. A CSS transform leaves the element's layout box
 * (what ResizeObserver watches) unchanged, so this cannot loop; the
 * negative bottom margin removes the space the unscaled box would keep. */
function fitFigurePopout() {
  const { mount } = figurePopoutState;
  const target = document.getElementById('figure-modal-figure');
  if (!mount || !target) return;
  const h = mount.offsetHeight;
  const avail = target.clientHeight;
  if (!h || !avail || h <= avail) {
    mount.style.transform = '';
    mount.style.marginBottom = '';
    return;
  }
  const s = avail / h;
  mount.style.transformOrigin = 'top center';
  mount.style.transform = `scale(${s})`;
  mount.style.marginBottom = `${-(h - h * s)}px`;
}

/** Interactive controls a click on the figure itself must NOT pop out --
 * sliders, buttons, selects, checkboxes, `details`, or any other
 * interactive element a figure module builds into its own mount. */
const FIGURE_INTERACTIVE_SELECTOR = 'input, button, select, textarea, a, details, summary, [contenteditable], [role="button"], [tabindex]';

function initFigurePopouts() {
  const dialog = document.getElementById('figure-modal');
  const panel = document.getElementById('panel-content');
  if (!dialog || !panel) return;
  panel.addEventListener('click', (e) => {
    const enlargeBtn = e.target.closest('.figure-enlarge-btn');
    if (enlargeBtn) {
      const card = enlargeBtn.closest('.figure-card');
      if (card) openFigurePopout(card, enlargeBtn);
      return;
    }
    const hit = e.target.closest('.figure-mount, .figure-static, .figure-img-frame');
    if (!hit) return;
    // Scoped to `hit` itself: an ANCESTOR further up the page can carry a
    // stray `tabindex`/similar for unrelated reasons (e.g. #panel's own
    // scroll-to-top tabindex="-1") without being one of the figure's own
    // controls -- closest() alone would wrongly walk past the figure to find it.
    const interactive = e.target.closest(FIGURE_INTERACTIVE_SELECTOR);
    if (interactive && hit.contains(interactive)) return;
    const card = hit.closest('.figure-card');
    if (card) openFigurePopout(card, card.querySelector('.figure-enlarge-btn'));
  });
  dialog.querySelector('.figure-modal__close').addEventListener('click', requestCloseFigurePopout);
  // The UA-drawn ::backdrop is not a real element to target -- a click
  // there bubbles as a click on the dialog itself (spec behavior).
  dialog.addEventListener('click', (e) => { if (e.target === dialog) requestCloseFigurePopout(); });
  dialog.addEventListener('close', closeFigurePopoutNow);
}

function renderStructuralNode(node) {
  const { data } = state;
  const children = Object.values(data.nodes).filter((n) => n.parent === node.id);
  const rows = children.map((c) => `<a href="#/${encodeURIComponent(c.id)}/L3"><span class="uses-list__num">${escapeHtml(htmlToText(c.numberHtml))}</span>${escapeHtml(htmlToText(c.titleHtml))}</a>`).join('');
  // The section/subsection's own summary/idea come from a content/graph/*
  // fragment when an author has written one, and are simply absent
  // otherwise (build.mjs falls back to the paper's own title only).
  const summary = Array.isArray(node.summaryHtml) && node.summaryHtml.length
    ? `<div class="section-label">Summary</div><div class="prose">${node.summaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const idea = Array.isArray(node.ideaHtml) && node.ideaHtml.length
    ? `<div class="section-label">Idea</div><div class="prose">${node.ideaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow">${kindBadge(node)}${draftBadge(node)}</div>
      <h2 class="node-head__title">${node.titleHtml}</h2>
    </div>
    ${summary}
    ${idea}
    ${figuresSectionHtml(node, data)}
    ${usesList('Proved here', node.provedHere, data)}
    ${usesList('Setting stated here', node.settingHere, data)}
    <div class="section-label">Contains</div>
    <nav class="uses-list">${rows || '<p class="prose">No children shown at this zoom level yet.</p>'}</nav>`;
}

function renderExternalNode(node) {
  const { data } = state;
  const c = data.citations[node.id];
  // The external-source cluster (tasks/p7a-tooling.md sec.6) also lists what it
  // holds: the external-source results the paper cites, companion content
  // nodes and background nodes (at any depth of its section boxes), then the
  // section boxes themselves.
  const inside = Object.values(data.externalNodes).filter((n) => n.id !== node.id && xsrcClusterOf(n).id === node.id);
  const items = inside.filter((n) => n.kind !== 'xsrc-box').map((n) => n.id);
  const boxes = inside.filter((n) => n.kind === 'xsrc-box').map((n) => n.id);
  const contains = `${usesList('Cited items and background', items, data)}${usesList('Sections', boxes, data)}`;
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--kind">external input</span></div>
      ${node.cluster === 'xsrc'
    ? `<h2 class="node-head__title">${node.numberHtml}${node.titleHtml ? `: <em>${node.titleHtml}</em>` : ''}</h2>`
    : `<h2 class="node-head__title mono">[${escapeHtml(c ? c.tag : node.id)}]</h2>`}
      ${node.cluster === 'xsrc' ? xsrcNumberingNote(node) : ''}
    </div>
    <div class="section-label">Reference</div>
    <p class="bib-card">${c && c.cardHtml ? c.cardHtml : '(no bibliography entry found)'}</p>
    ${contains}
    ${usesList('Cited by', node.usedBy, data)}`;
}

// ---------------------------------------------------------------------------
// external-source panels (tasks/p7a-tooling.md sec.6). An ak.* node holds only text
// quoted verbatim from the pinned external-source source (rendered at build time with
// the external source's own macros, never wrapped for main-paper notation popovers) plus .aux
// numbers and pages. A bg.* node is new mathematics: audited claims in the
// paper's notation, labelled as background, with its external-source sources quoted.
// ---------------------------------------------------------------------------
/** The external-source cluster holding `node` (through its section boxes). */
function xsrcClusterOf(node) {
  let cur = node;
  for (let i = 0; i < 8 && cur && cur.kind !== 'external' && cur.parent && state.data.externalNodes[cur.parent]; i++) {
    cur = state.data.externalNodes[cur.parent];
  }
  return cur || {};
}

function xsrcTag(node) {
  const c = xsrcClusterOf(node);
  return c.tag || htmlToText(c.numberHtml) || 'external source';
}

function xsrcNumberingNote(node) {
  const cluster = xsrcClusterOf(node);
  const a = cluster.arxiv;
  if (!a) return cluster.sourceNote ? `<p class="xsrc-note">${escapeHtml(cluster.sourceNote)}</p>` : '';
  return `<p class="xsrc-note">numbering as in <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">arXiv:${escapeHtml(a.id)}${escapeHtml(a.version)}</a></p>`;
}

function xsrcQuotes(htmlList) {
  return (htmlList || []).map((h) => `<div class="prose xsrc-quote">${h}</div>`).join('');
}

function xsrcProofHtml(proof, tag) {
  if (!proof) return '';
  if (proof.type === 'quote') {
    return `<div class="section-label" id="proof-anchor">Proof</div>
      <details class="xsrc-details"><summary>The proof in ${escapeHtml(tag)}, quoted (${escapeHtml(proof.text || '')})</summary><div class="prose xsrc-quote">${proof.html}</div></details>`;
  }
  return `<div class="section-label" id="proof-anchor">Proof</div><p class="xsrc-pointer">${escapeHtml(proof.text)}</p>`;
}

/** The paper's own sentences around its citations of the external source (tasks/
 * p7a-tooling.md follow-up): each quoted verbatim through an main-paper anchor and
 * rendered with the paper's macros -- so, unlike external-source text, notation
 * popovers work here -- and linked to the node(s) containing it. A sentence
 * clipped to 3 source lines is marked [...] at the cut. */
function paperSentencesHtml(title, list, data) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const items = list.map((s) => {
    const where = (s.nodes || []).map((id) => {
      const n = data.nodes[id] || data.externalNodes[id];
      if (!n) return '';
      const num = htmlToText(n.numberHtml);
      const t = htmlToText(n.titleHtml);
      return `<a href="#/${encodeURIComponent(id)}/L3">${escapeHtml([num, t].filter(Boolean).join(' ') || id)}</a>`;
    }).filter(Boolean).join(', ');
    const cls = `prose vp-quote${s.clippedStart ? ' vp-quote--clip-start' : ''}${s.clippedEnd ? ' vp-quote--clip-end' : ''}`;
    return `<figure class="vp-cite"><blockquote class="${cls}">${s.html}</blockquote>${where ? `<figcaption class="vp-cite__where">in ${where}</figcaption>` : ''}</figure>`;
  }).join('');
  return `<div class="section-label">${title}</div><div class="vp-cites">${items}</div>`;
}

function renderXsrcNode(node) {
  const { data } = state;
  const tag = xsrcTag(node);
  const statement = node.akType === 'section'
    ? `<div class="section-label" id="statement-anchor">Section title only</div><p class="xsrc-pointer">${escapeHtml(node.locationText || '')}</p>`
    : `<div class="section-label" id="statement-anchor">Statement, quoted from ${escapeHtml(tag)}</div>${xsrcQuotes(node.statementHtml)}
       ${node.locationText ? `<p class="xsrc-pointer">${escapeHtml(node.locationText)}</p>` : ''}`;
  const citedBy = node.usedBy && node.usedBy.length
    ? usesList('Cited here by', node.usedBy, data)
    : '<div class="section-label">Cited here by</div><p class="xsrc-pointer">Cited in a part of the paper that is not on this map.</p>';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--xsrc">from ${escapeHtml(tag)}</span></div>
      <h2 class="node-head__title"><span class="mono">${node.numberHtml}</span>${node.titleHtml ? ` (${node.titleHtml})` : ''}</h2>
      ${xsrcNumberingNote(node)}
    </div>
    ${statement}
    ${paperSentencesHtml('How the paper cites it', node.citingSentences, data)}
    ${xsrcProofHtml(node.proof, tag)}
    ${citedBy}
    ${usesList('Background that adds to it', node.background, data)}`;
}

/** A companion content node (tasks/p12-companion-tooling.md): an item of the
 * companion manuscript with the treatment of a main-paper result -- audited
 * summary, its statement and its own proof quoted from the companion (its
 * macros, no notation popovers), split into steps, plus how the paper uses it. */
function renderCompanionNode(node) {
  const { data } = state;
  const tag = xsrcTag(node);
  const claims = (list) => (list || []).map((c) => `<p>${c.html}</p>`).join('');
  const block = (title, list) => (list && list.length ? `<div class="section-label">${title}</div><div class="prose">${claims(list)}</div>` : '');
  const idea = block('Proof idea', node.ideaHtml);
  let proofSection = '';
  const proof = node.proofHtml;
  if (proof && Array.isArray(proof.steps) && proof.steps.length) {
    proofSection = `<div class="section-label" id="proof-anchor">Proof in ${escapeHtml(tag)} &mdash; steps</div>${idea}${renderStepsHtml(proof.steps, { quoted: true })}`
      + (proof.fullHtml ? `<details class="xsrc-details"><summary>The whole proof, quoted from ${escapeHtml(tag)}</summary><div class="prose xsrc-quote">${proof.fullHtml}</div></details>` : '');
  } else if (proof && proof.fullHtml) {
    proofSection = `<div class="section-label" id="proof-anchor">Proof in ${escapeHtml(tag)}</div>${idea}<div class="prose xsrc-quote">${proof.fullHtml}</div>`;
  } else if (idea) {
    proofSection = `<div id="proof-anchor">${idea}</div>`;
  }
  const users = node.usedBy || [];
  const mainUsers = users.filter((id) => data.nodes[id]);
  const companionUsers = users.filter((id) => !data.nodes[id]);
  const kind = node.contentKind ? `<span class="badge badge--kind">${escapeHtml(node.contentKind)}</span>` : '';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--xsrc">from ${escapeHtml(tag)}</span>${kind}${draftBadge(node)}${auditBadge(node)}</div>
      <h2 class="node-head__title"><span class="mono">${node.numberHtml}</span>${node.titleHtml ? ` ${node.titleHtml}` : ''}</h2>
      ${xsrcNumberingNote(node)}
    </div>
    ${block('Summary', node.summaryHtml)}
    <div class="section-label" id="statement-anchor">Statement, quoted from ${escapeHtml(tag)}</div>${xsrcQuotes(node.statementHtml)}
    ${node.locationText ? `<p class="xsrc-pointer">${escapeHtml(node.locationText)}</p>` : ''}
    ${block('How the paper uses it', node.roleHtml)}
    ${paperSentencesHtml('How the paper cites it', node.citingSentences, data)}
    ${usesList('Uses', node.uses, data, node.id)}
    ${usesList('Used by', companionUsers, data)}
    ${usesList('Cited here by', mainUsers, data)}
    ${proofSection}`;
}

/** A companion section or subsection box: what the site shows from it, and
 * the paper's section-level citations of it. */
function renderCompanionBox(node) {
  const { data } = state;
  const tag = xsrcTag(node);
  const children = Object.values(data.externalNodes).filter((n) => n.parent === node.id).map((n) => n.id);
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--xsrc">${escapeHtml(tag)} ${escapeHtml(node.boxKind || 'section')}</span></div>
      <h2 class="node-head__title"><span class="mono">${node.numberHtml}</span>${node.titleHtml ? ` ${node.titleHtml}` : ''}</h2>
      ${xsrcNumberingNote(node)}
    </div>
    ${node.locationText ? `<p class="xsrc-pointer">${escapeHtml(node.locationText)}</p>` : ''}
    ${paperSentencesHtml('How the paper cites it', node.citingSentences, data)}
    ${usesList('Cited here by', node.usedBy, data)}
    ${children.length ? usesList('Contains', children, data) : `<div class="section-label">Contains</div><p class="xsrc-pointer">Nothing from this part of ${escapeHtml(tag)} is shown separately.</p>`}`;
}

function renderBackgroundNode(node) {
  const { data } = state;
  const tag = xsrcTag(node);
  const claims = (list) => (list || []).map((c) => `<p>${c.html}</p>`).join('');
  const implicitBadge = node.implicit ? `<span class="badge badge--implicit">Not stated as such in ${escapeHtml(tag)}</span>` : '';
  const derivation = node.implicit && node.derivationHtml && node.derivationHtml.length
    ? `<div class="section-label">How it follows from ${escapeHtml(tag)}</div><div class="prose">${claims(node.derivationHtml)}</div>` : '';
  const sources = node.sourceHtml && node.sourceHtml.length
    ? `<div class="section-label">Where it comes from in ${escapeHtml(tag)}</div>
       <details class="xsrc-details"><summary>Quoted from ${escapeHtml(tag)} (${node.sourceHtml.length} passage${node.sourceHtml.length === 1 ? '' : 's'})</summary>${xsrcQuotes(node.sourceHtml)}</details>` : '';
  let proof = '';
  if (node.proof && node.proof.type === 'quote') {
    proof = `<div class="section-label" id="proof-anchor">Proof</div>
      <details class="xsrc-details"><summary>Quoted from ${escapeHtml(tag)}</summary><div class="prose xsrc-quote">${node.proof.html}</div></details>`;
  } else if (node.proof) {
    proof = `<div class="section-label" id="proof-anchor">Proof</div><p class="xsrc-pointer">${escapeHtml(node.proof.text)}</p>`;
  }
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--background">Background: not stated in this paper</span>${implicitBadge}${auditBadge(node)}</div>
      <h2 class="node-head__title">${node.titleHtml || ''}</h2>
    </div>
    <div class="section-label" id="statement-anchor">Statement</div>
    <div class="prose">${claims(node.statementHtml)}</div>
    ${derivation}
    ${paperSentencesHtml('Where the paper uses it', node.usedAtSentences, data)}
    ${sources}
    ${usesList(`Related ${escapeHtml(tag)} results`, node.related, data)}
    ${proof}
    ${usesList('Used by', node.usedBy, data)}`;
}

// tasks/p5-polish-2.md bug fix: a top-level theorem whose content/graph/
// <label>.yaml section fragment shares its own id (Theorem A today; the
// same fragment/node id collision would apply to B-D if one of them gets a
// fragment) carries that fragment's own overview under
// `sectionSummaryHtml`/`sectionIdeaHtml`/`sectionTitleHtml` (scripts/lib/
// assembleGraph.mjs), separately from the node's own `summaryHtml` below --
// shown first, since it is "what the reader sees" before the node's own
// exact statement. `sectionTitleHtml` is the fragment's own title claim
// (its text duplicates the node's own titleHtml above almost always, so
// showing it again would just look like a typo); it still needs to be
// present so the claim itself is covered (tasks/p5-polish-2.md's coverage
// guarantee), so it renders visually hidden.
function theoremOverviewHtml(node) {
  const hasSummary = Array.isArray(node.sectionSummaryHtml) && node.sectionSummaryHtml.length > 0;
  const hasIdea = Array.isArray(node.sectionIdeaHtml) && node.sectionIdeaHtml.length > 0;
  if (!hasSummary && !hasIdea) return '';
  const heading = node.sectionTitleHtml ? `<h3 class="sr-only">${node.sectionTitleHtml}</h3>` : '';
  const whatItSays = hasSummary
    ? `<div class="section-label">What it says</div><div class="prose">${node.sectionSummaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const proofInOnePage = hasIdea
    ? `<div class="section-label">The proof in one page</div><div class="prose">${node.sectionIdeaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  return `${heading}${whatItSays}${proofInOnePage}`;
}

function renderTheoremNode(node, level) {
  const { data } = state;
  const overview = theoremOverviewHtml(node);
  const summary = Array.isArray(node.summaryHtml) && node.summaryHtml.length
    ? `<div class="section-label">Summary</div><div class="prose">${node.summaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const idea = Array.isArray(node.ideaHtml) && node.ideaHtml.length
    ? `<div class="section-label">Proof idea</div><div class="prose">${node.ideaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';

  let proofSection = '';
  if (node.proofHtml && typeof node.proofHtml === 'object' && node.proofHtml.steps) {
    proofSection = `<div class="section-label" id="proof-anchor">Proof &mdash; steps</div>${idea}${renderStepsHtml(node.proofHtml.steps)}`;
    if (node.proofHtml.fullHtml) {
      proofSection += `<details><summary>Full extracted proof text</summary><div class="prose">${node.proofHtml.fullHtml}</div></details>`;
    }
  } else if (typeof node.proofHtml === 'string') {
    proofSection = `<div class="section-label" id="proof-anchor">Proof</div>${idea}<div class="prose">${node.proofHtml}</div>`;
  } else if (idea) {
    proofSection = `<div id="proof-anchor">${idea}</div>`;
  }

  return `
    <div class="node-head">
      <div class="node-head__eyebrow">
        ${kindBadge(node)}${draftBadge(node)}${auditBadge(node)}
      </div>
      <h2 class="node-head__title">${node.numberHtml ? `<span class="mono">${escapeHtml(htmlToText(node.numberHtml))}</span> ` : ''}${node.titleHtml || ''}</h2>
    </div>
    ${overview}
    ${summary}
    <div class="section-label" id="statement-anchor">Statement</div>
    <div class="prose">${node.statementHtml || '<p>(no statement text)</p>'}</div>
    ${figuresSectionHtml(node, data)}
    ${usesList('Uses', node.uses, data, node.id)}
    ${usesList('Used by', node.usedBy, data)}
    ${proofSection}
  `;
}

function renderPanel(node, level) {
  const panel = document.getElementById('panel-content');
  let html;
  if (node.kind === 'section' || node.kind === 'subsection') html = renderStructuralNode(node);
  else if (node.kind === 'xsrc' && node.companionContent) html = renderCompanionNode(node);
  else if (node.kind === 'xsrc') html = renderXsrcNode(node);
  else if (node.kind === 'xsrc-box') html = renderCompanionBox(node);
  else if (node.kind === 'background') html = renderBackgroundNode(node);
  else if (node.kind === 'external') html = renderExternalNode(node);
  else html = renderTheoremNode(node, level);
  panel.innerHTML = html;
  panel.scrollTop = 0;
  if (level === 'L4') {
    const anchor = document.getElementById('proof-anchor');
    if (anchor) anchor.scrollIntoView({ block: 'start' });
  }
  wireStepToggles(panel);
  mountFigures(panel, state.data);
}

function renderMissing(id) {
  document.getElementById('panel-content').innerHTML = `<div class="panel-empty"><p>No node named <code>${escapeHtml(id)}</code>.</p></div>`;
}

function wireStepToggles(root) {
  root.querySelectorAll('[data-step-toggle]').forEach((head) => {
    head.addEventListener('click', () => {
      const step = head.closest('.step');
      step.dataset.open = step.dataset.open === 'true' ? 'false' : 'true';
    });
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function buildSearchIndex(data) {
  const all = { ...data.nodes, ...data.externalNodes };
  return Object.values(all).map((n) => ({
    id: n.id,
    number: htmlToText(n.numberHtml),
    title: htmlToText(n.titleHtml),
    haystack: `${n.id} ${htmlToText(n.numberHtml)} ${htmlToText(n.titleHtml)}`.toLowerCase(),
  }));
}

function initSearch(data) {
  const index = buildSearchIndex(data);
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  function render(list) {
    if (list.length === 0) { results.hidden = true; results.innerHTML = ''; return; }
    results.innerHTML = list.slice(0, 20).map((r) => `
      <button type="button" class="search-results__item" data-id="${escapeHtml(r.id)}">
        <span class="search-results__num">${escapeHtml(r.number)}</span>${escapeHtml(r.title || r.id)}
      </button>`).join('');
    results.hidden = false;
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { render([]); return; }
    render(index.filter((r) => r.haystack.includes(q)));
  });
  input.addEventListener('focus', () => { if (input.value.trim()) results.hidden = false; });
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    navigate(btn.dataset.id, 'L3');
    showPanelTab();
    results.hidden = true;
    input.value = '';
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar__search')) results.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Notation popovers
// ---------------------------------------------------------------------------
/** Below the clicked symbol, kept inside the window: the popover's width
 * follows the reading text size (tasks/p13-reading-mode.md), so it is
 * measured once shown rather than assumed. */
function placeNotationPopover(pop, el) {
  const rect = el.getBoundingClientRect();
  pop.style.left = '0px';
  pop.style.top = `${rect.bottom + 6}px`;
  pop.hidden = false;
  const w = pop.offsetWidth || 330;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))}px`;
}

function initNotationPopovers(data) {
  const pop = document.getElementById('notation-popover');
  document.getElementById('panel-content').addEventListener('click', (e) => {
    const el = e.target.closest('[class*="nt-"]');
    if (!el) return;
    // Never inside quoted external-source text (tasks/p7a-tooling.md sec.6): its
    // macros differ from the paper's, and it is never wrapped at build time.
    if (el.closest('.xsrc-quote')) return;
    const key = notationKeyFromClassName(el.className);
    if (!key) return;
    const entry = getNotationEntry(data.notation, key);
    pop.innerHTML = renderNotationCard(key, entry);
    placeNotationPopover(pop, el);
    e.stopPropagation();
  });
  pop.addEventListener('click', (e) => {
    // "Go to definition" (site/notation.mjs's renderNotationCard): let the
    // hash change navigate as normal, just close the popover first so it
    // does not float over the freshly-opened node.
    if (e.target.closest('.notation-card__goto')) pop.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('#notation-popover')) pop.hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
}

// ---------------------------------------------------------------------------
// History navigation (a reader asked for "a button to go back a step...
// given how complicated a network it is"): visible Back/Forward buttons
// that simply call history.back()/history.forward(), so they can never
// disagree with the browser's own. An in-app position counter travels in
// history.state as {mainIndex: n}: n=0 on the entry this page loaded with
// (or whatever a same-session reload already carried), and the next n on
// every entry after -- however it was created (navigate(), the brand
// button, navigateWholeMap(), or an ordinary <a href="#/..."> in the panel
// -- every one of them ends in a 'hashchange', the one place this is
// tagged, via syncHistoryIndex). historyIndex/maxHistoryIndex are pure
// bookkeeping: Back is disabled at n <= 0 (the site's own first entry --
// this never navigates the reader off the site, whatever real history sits
// behind it) and Forward at the highest n reached so far; a brand-new entry
// always resets the ceiling to its own index, exactly as the browser itself
// discards any old forward branch the moment a fresh entry is pushed from
// the middle of history.
// ---------------------------------------------------------------------------
let historyIndex = 0;
let maxHistoryIndex = 0;

function updateHistoryNavButtons() {
  const backDisabled = historyIndex <= 0;
  const forwardDisabled = historyIndex >= maxHistoryIndex;
  document.querySelectorAll('[data-history-nav="back"]').forEach((b) => { b.disabled = backDisabled; });
  document.querySelectorAll('[data-history-nav="forward"]').forEach((b) => { b.disabled = forwardDisabled; });
}

/** Run on every hashchange after boot: an entry that already carries a
 * numeric mainIndex is one this app tagged before (a Back/Forward step of
 * ours or the browser's own, or a same-entry replay); one that does not is
 * brand new and gets the next index, tagged in place with replaceState
 * (never a history entry of its own, and never fires hashchange/popstate). */
function syncHistoryIndex() {
  const cur = history.state;
  if (cur && typeof cur.mainIndex === 'number') {
    historyIndex = cur.mainIndex;
    maxHistoryIndex = Math.max(maxHistoryIndex, historyIndex);
  } else {
    historyIndex += 1;
    history.replaceState({ mainIndex: historyIndex }, '', location.href);
    maxHistoryIndex = historyIndex;
  }
  updateHistoryNavButtons();
}

function initHistoryNav() {
  const cur = history.state;
  const tagged = cur && typeof cur.mainIndex === 'number';
  historyIndex = tagged ? cur.mainIndex : 0;
  if (!tagged) history.replaceState({ mainIndex: historyIndex }, '', location.href);
  maxHistoryIndex = historyIndex;
  updateHistoryNavButtons();
  document.querySelectorAll('[data-history-nav="back"]').forEach((b) => b.addEventListener('click', () => history.back()));
  document.querySelectorAll('[data-history-nav="forward"]').forEach((b) => b.addEventListener('click', () => history.forward()));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  initTheme();
  initTabs();
  initReading();
  initBrandHome();
  initGraphHelp();
  initHistoryNav();
  if (state.devMode) document.getElementById('dev-indicator').hidden = false;

  const res = await fetch('data.json');
  const data = await res.json();
  state.data = data;
  applySiteMeta(data);

  initGraph(data);
  initSearch(data);
  initNotationPopovers(data);
  initFigurePopouts();
  buildOutline(data);

  window.addEventListener('hashchange', () => { syncHistoryIndex(); applyRoute(parseHash()); });
  applyRoute(parseHash());
}

// ---------------------------------------------------------------------------
// Outline tree (phone-width fallback for the graph, <=700px -- deliverable 4)
// ---------------------------------------------------------------------------
function buildOutline(data) {
  const root = document.getElementById('outline');
  const byParent = {};
  const all = { ...data.nodes, ...data.externalNodes };
  for (const n of Object.values(all)) {
    const p = n.parent || '__root__';
    (byParent[p] = byParent[p] || []).push(n);
  }
  function renderLevel(parentId) {
    // The paper's setting (data node `setting`) leads the top level.
    const kids = (byParent[parentId] || []).slice().sort((x, y) => (parentId === '__root__' ? (y.setting ? 1 : 0) - (x.setting ? 1 : 0) : 0));
    if (kids.length === 0) return '';
    return `<ul>${kids.map((n) => `
      <li class="${[n.kind === 'external' ? 'outline__ext' : '', n.tier === 'major' ? 'outline__major' : '', n.tier === 'background' && n.kind !== 'external' ? 'outline__background' : ''].filter(Boolean).join(' ')}">
        <button type="button" data-id="${escapeHtml(n.id)}">
          <span class="outline__num">${escapeHtml(plainText(n.numberHtml))}</span>${escapeHtml(plainText(n.titleHtml) || n.id)}${n.tier === 'major' ? '<span class="outline__tag">major</span>' : ''}
        </button>
        ${renderLevel(n.id)}
      </li>`).join('')}</ul>`;
  }
  root.innerHTML = renderLevel('__root__');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    navigate(btn.dataset.id, 'L3');
    showPanelTab();
  });
  // Below the graph breakpoint, the outline replaces the canvas entirely.
  const mq = window.matchMedia('(max-width: 700px)');
  function sync() {
    root.hidden = !mq.matches;
    document.getElementById('cy').hidden = mq.matches;
    if (!mq.matches) withGraph((g) => g.resize());
  }
  mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
  sync();
}

main().catch((err) => {
  console.error(err);
  document.getElementById('panel-content').innerHTML = `<div class="panel-empty"><p>Failed to load data.json: ${escapeHtml(err.message)}</p></div>`;
});
