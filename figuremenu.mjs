// Figures menu (tasks/p18 builder E): every entry of data.figures -- a
// TikZ/D3 figure or any later kind (an animation, say) -- with where it sits
// in the paper, so a reader can find a figure without first opening the
// exact box it is attached to. Pure data helpers (test/figuremenu.test.mjs)
// plus the HTML for the top-bar menu and a section page's list; site/app.js
// wires the clicks (navigate, scroll, highlight).

const STRUCTURAL = new Set(['section', 'subsection']);

function allNodes(data) {
  return { ...((data && data.nodes) || {}), ...((data && data.externalNodes) || {}) };
}

function text(html) {
  return String(html || '').replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** HTML -> plain text. The page passes its own DOM-based helper
 * (setPlainText; math reads once, from KaTeX's MathML); the fallback, for
 * tests and non-DOM callers, drops KaTeX's MathML copy and keeps the visual. */
let plain = (html) => text(String(html || '').replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, ''));
export function setPlainText(fn) { if (typeof fn === 'function') plain = fn; }

function titleText(n) {
  return n ? plain(n.titleHtml) : '';
}

function attachTargets(fig) {
  if (!fig) return [];
  return Array.isArray(fig.attachTo) ? fig.attachTo : (fig.attachTo ? [fig.attachTo] : []);
}

/** The node a figure's menu entry opens: its first attachment that is a
 * result/definition (not a whole section), else its first attachment. */
export function figurePrimaryTarget(data, fig) {
  const all = allNodes(data);
  const targets = attachTargets(fig).filter((id) => all[id]);
  return targets.find((id) => !STRUCTURAL.has(all[id].kind)) || targets[0] || null;
}

/** The nearest section/subsection holding `id` (itself if structural). */
export function enclosingSection(data, id) {
  const all = allNodes(data);
  const seen = new Set();
  for (let p = id; p && all[p] && !seen.has(p); p = all[p].parent) {
    seen.add(p);
    if (STRUCTURAL.has(all[p].kind)) return p;
  }
  return null;
}

/** "§6.2 · Visits to a velocity interval"; "§2 · Proposition 2.2 Contraction
 * of …"; a section itself: "§2 · Döblin–Fourier cancellation"; the paper's
 * setting (no section): "Setting · Kinetic cylinders …". */
export function figureLocationLabel(data, id) {
  const all = allNodes(data);
  const n = all[id];
  if (!n) return '';
  const secId = enclosingSection(data, id);
  const where = secId ? plain(all[secId].numberHtml) : (n.setting ? 'Setting' : '');
  const num = STRUCTURAL.has(n.kind) ? '' : plain(n.numberHtml);
  const what = [num, titleText(n)].filter(Boolean).join(' ');
  return [where, what].filter(Boolean).join(' · ');
}

function sectionKey(label) {
  const m = /§([\d.]+)/.exec(label || '');
  return m ? m[1].split('.').map(Number) : [];
}

/** The menu's entries, in paper order (the setting first, then by section
 * number, then by the nodes' own order in data.nodes):
 * [{id, title, kind, renderer, target, location, also, thumb, thumbDark}]. */
export function figureMenuEntries(data) {
  const all = allNodes(data);
  const order = new Map(Object.keys(all).map((id, i) => [id, i]));
  const entries = [];
  for (const fig of Object.values((data && data.figures) || {})) {
    if (!fig || !fig.id) continue;
    const target = figurePrimaryTarget(data, fig);
    if (!target) continue;
    const others = attachTargets(fig).filter((id) => id !== target && all[id]);
    const also = [...new Set(others.map((id) => {
      const s = enclosingSection(data, id);
      return s ? plain(all[s].numberHtml) : figureLocationLabel(data, id);
    }))].filter((s) => s && s !== plain((all[enclosingSection(data, target)] || {}).numberHtml));
    let thumb = null;
    let thumbDark = null;
    if (fig.thumbnail || fig.poster) thumb = fig.thumbnail || fig.poster;
    else if (fig.renderer === 'tikz') {
      thumb = `figures/${encodeURIComponent(fig.id)}.svg`;
      thumbDark = `figures/${encodeURIComponent(fig.id)}.dark.svg`;
    }
    entries.push({
      id: fig.id,
      title: plain(fig.titleHtml) || fig.id,
      titleHtml: fig.titleHtml || null,
      kind: fig.kind || null,
      renderer: fig.renderer || null,
      target,
      location: figureLocationLabel(data, target),
      also,
      thumb,
      thumbDark,
      sortKey: [all[target].setting && !enclosingSection(data, target) ? 0 : 1,
        sectionKey(figureLocationLabel(data, target)), order.get(target) ?? 1e9],
    });
  }
  const cmpArr = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const d = (a[i] ?? -1) - (b[i] ?? -1);
      if (d) return d;
    }
    return 0;
  };
  entries.sort((x, y) => (x.sortKey[0] - y.sortKey[0]) || cmpArr(x.sortKey[1], y.sortKey[1])
    || (x.sortKey[2] - y.sortKey[2]) || x.id.localeCompare(y.id));
  return entries.map(({ sortKey, ...e }) => e);
}

/** Entries whose primary or any attachment lies inside `sectionId` (a
 * section or subsection), leaving out `exclude` (figures the section's own
 * page already shows as cards). */
export function figuresInside(data, sectionId, exclude = []) {
  const all = allNodes(data);
  const skip = new Set(exclude);
  const inside = (id) => {
    const seen = new Set();
    for (let p = id; p && all[p] && !seen.has(p); p = all[p].parent) {
      seen.add(p);
      if (p === sectionId) return true;
    }
    return false;
  };
  return figureMenuEntries(data).filter((e) => !skip.has(e.id)
    && attachTargets(data.figures[e.id]).some(inside))
    .map((e) => {
      const t = attachTargets(data.figures[e.id]).find((id) => inside(id) && !STRUCTURAL.has(all[id].kind))
        || attachTargets(data.figures[e.id]).find(inside);
      return t === e.target ? e : { ...e, target: t, location: figureLocationLabel(data, t) };
    });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One link: `#/<target>/L3`, with data-figure-jump for the click handler. */
export function figureLinkHtml(e, { thumbs = true, richTitle = true } = {}) {
  const href = `#/${encodeURIComponent(e.target)}/L3`;
  const thumb = !thumbs ? '' : e.thumb
    ? `<span class="fig-menu__thumb" aria-hidden="true"><img class="fig-menu__img${e.thumbDark ? ' fig-menu__img--light' : ''}" src="${esc(e.thumb)}" alt="" loading="lazy">${e.thumbDark ? `<img class="fig-menu__img fig-menu__img--dark" src="${esc(e.thumbDark)}" alt="" loading="lazy">` : ''}</span>`
    : `<span class="fig-menu__thumb fig-menu__thumb--none" aria-hidden="true">${e.renderer === 'd3' ? 'Interactive' : esc(e.kind || 'Figure')}</span>`;
  const also = e.also && e.also.length ? ` <span class="fig-menu__also">(also ${e.also.map(esc).join(', ')})</span>` : '';
  return `<a class="fig-menu__link" href="${href}" data-figure-jump="${esc(e.id)}" data-figure-target="${esc(e.target)}">${thumb}`
    + `<span class="fig-menu__text"><span class="fig-menu__title">${(richTitle && e.titleHtml) || esc(e.title)}</span>`
    + `<span class="fig-menu__where">${esc(e.location)}${also}</span></span></a>`;
}

export function figureMenuListHtml(entries) {
  return entries.map((e) => `<li>${figureLinkHtml(e)}</li>`).join('');
}
