// Back / Forward up and down the proof chain (tasks/p18: the authors asked for
// "Up the proof chain" -- Back goes to the statement whose proof uses the current
// one, from a lemma back to the result it serves, whatever order the reader
// clicked in). Shared by the full site (site/app.js imports it) and the compact
// preview (scripts/build_preview.mjs inlines it as window.VP_PROOFBACK, like
// site/readingmode.mjs) -- so this module has no imports, and every export is a
// plain declaration.
//
// The site's own Back/Forward buttons (`[data-history-nav="back"|"forward"]`):
//   - Back on a statement goes up to a result that uses it (the stored edges
//     {from: user, to: used}; the same list as the panel's "Used by"). When some
//     users are results, only those count -- a section or subsection that merely
//     cites the statement is offered only when nothing else uses it. Exactly one
//     user: go there. Several: the statement the reader last came from, if it is
//     one of them; otherwise a small chooser lists them. None (a main theorem, or
//     anything nothing uses), and on the welcome panel or the bare whole map:
//     disabled, with a tooltip saying why.
//   - Forward retraces: it returns down to the statement the last Back went up
//     from (a stack of up-steps). Any other change of statement -- a click in the
//     graph or the panel, search, the browser's own back/forward -- clears it.
//   - Changes of view that keep the same statement open (zoom, "Whole map",
//     Main results / Full graph, Direct links / One step further, toggles) are not
//     steps at all: they neither move Back nor clear Forward.
// Proof steps are not nodes of the graph (they are numbered steps inside a
// statement's own panel), and a named step of a prose proof (a "claim") or a
// labelled estimate is linked to the result it serves by an ordinary `uses`
// edge -- so "used by" already is the way up, with no parent rule needed.
// The browser's own back/forward keep their usual meaning (hash history).

/** A box of the map rather than a statement: a section, a subsection, a
 * companion section box, or the companion manuscript's own region. */
export function isStructuralNode(n) {
  if (!n) return true;
  return n.kind === 'section' || n.kind === 'subsection' || n.kind === 'xsrc-box'
    || (n.kind === 'external' && !!n.cluster);
}

function nodeOf(data, id) {
  if (!data || !id) return null;
  return (data.nodes && data.nodes[id]) || (data.externalNodes && data.externalNodes[id]) || null;
}

/** The statements one step up the proof chain from `id`, in data order: every
 * node with an edge to `id` (its "used by" list), restricted to results when
 * there is at least one result among them. */
export function proofUsers(data, id) {
  if (!nodeOf(data, id)) return [];
  const seen = new Set();
  const users = [];
  for (const e of (data && data.edges) || []) {
    if (e.to !== id || e.from === id || seen.has(e.from) || !nodeOf(data, e.from)) continue;
    seen.add(e.from);
    users.push(e.from);
  }
  const results = users.filter((u) => !isStructuralNode(nodeOf(data, u)));
  return results.length ? results : users;
}

/**
 * What Back does on statement `id`, having last come from `cameFrom`:
 *   {kind: 'none', reason: 'no-statement' | 'main-theorem' | 'unused'}
 *   {kind: 'go', target}
 *   {kind: 'choose', options: [ids]}
 */
export function backDecision(data, id, cameFrom = null) {
  if (!id || !nodeOf(data, id)) return { kind: 'none', reason: 'no-statement' };
  const users = proofUsers(data, id);
  if (!users.length) {
    const main = (data.meta && data.meta.mainTheoremIds) || [];
    return { kind: 'none', reason: main.includes(id) ? 'main-theorem' : 'unused' };
  }
  if (users.length === 1) return { kind: 'go', target: users[0] };
  if (cameFrom && users.includes(cameFrom)) return { kind: 'go', target: cameFrom };
  return { kind: 'choose', options: users };
}

/**
 * The Forward stack after the open statement changes from `prevId` to `newId`.
 * `step` is the site button that caused it, if any: {via: 'up', target} (Back)
 * or {via: 'down', target} (Forward). The same statement (a change of view) keeps
 * the stack; a Back arriving at its target pushes where it came up from; a Forward
 * arriving at the top of the stack pops it; anything else clears it.
 */
export function nextTrail(trail, prevId, newId, step = null) {
  if (newId === prevId) return trail.slice();
  if (step && step.target === newId && newId) {
    if (step.via === 'up' && prevId) return [...trail, prevId];
    if (step.via === 'down' && trail.length && trail[trail.length - 1] === newId) return trail.slice(0, -1);
  }
  return [];
}

export const BACK_LABEL = 'Back up the proof: to the result that uses this one';
const NONE_REASON = {
  'no-statement': 'open a result first',
  'main-theorem': 'this is a main theorem, so nothing further up uses it',
  unused: 'nothing in the paper uses this one',
};

/** The tooltip and accessible name of Back for a decision. */
export function backTitle(decision, nameOf = (id) => id) {
  if (decision.kind === 'none') return { label: `Back up the proof: ${NONE_REASON[decision.reason]}`, title: `Back up the proof: ${NONE_REASON[decision.reason]}` };
  if (decision.kind === 'go') return { label: BACK_LABEL, title: `${BACK_LABEL} (${nameOf(decision.target)})` };
  return { label: BACK_LABEL, title: `${BACK_LABEL} (${decision.options.length} results use it: choose one)` };
}

/** The tooltip and accessible name of Forward. */
export function forwardTitle(trail, nameOf = (id) => id) {
  if (!trail.length) {
    const t = 'Forward: back down to where Back came up from (nothing to retrace)';
    return { label: t, title: t };
  }
  const t = `Forward: back down to ${nameOf(trail[trail.length - 1])}, where you came up from`;
  return { label: t, title: t };
}

/**
 * Wire the site's Back/Forward buttons. Everything is looked up in `doc` and
 * skipped when missing. `getData()` -> the app's data; `navigate(id)` opens a
 * statement (a hash change); `nameOf(id)` -> "Lemma 2.3"; `titleOf(id)` -> its
 * plain-text title. The app calls `onRoute(id)` -- the statement now open, or
 * null on the welcome panel / bare whole map -- on boot and on every route.
 */
export function initProofBack({
  doc = document, win = window, getData, navigate, nameOf = (id) => id, titleOf = () => '',
} = {}) {
  const st = {
    current: null, cameFrom: null, trail: [], pending: null, decision: { kind: 'none', reason: 'no-statement' },
  };
  const backs = () => [...doc.querySelectorAll('[data-history-nav="back"]')];
  const forwards = () => [...doc.querySelectorAll('[data-history-nav="forward"]')];
  let chooser = null;
  let chooserOpener = null;

  function sync() {
    st.decision = backDecision(getData(), st.current, st.cameFrom);
    const b = backTitle(st.decision, nameOf);
    for (const btn of backs()) {
      btn.disabled = st.decision.kind === 'none';
      btn.setAttribute('aria-label', b.label);
      btn.title = b.title;
      if (st.decision.kind === 'choose') btn.setAttribute('aria-haspopup', 'dialog');
      else { btn.removeAttribute('aria-haspopup'); btn.removeAttribute('aria-expanded'); }
    }
    const f = forwardTitle(st.trail, nameOf);
    for (const btn of forwards()) {
      btn.disabled = st.trail.length === 0;
      btn.setAttribute('aria-label', f.label);
      btn.title = f.title;
    }
  }

  function closeChooser({ restoreFocus = true } = {}) {
    if (!chooser || chooser.hidden) return;
    chooser.hidden = true;
    if (chooserOpener) {
      chooserOpener.setAttribute('aria-expanded', 'false');
      if (restoreFocus && typeof chooserOpener.focus === 'function') chooserOpener.focus();
    }
    chooserOpener = null;
  }

  function goUp(target) {
    closeChooser({ restoreFocus: false });
    st.pending = { via: 'up', target };
    navigate(target);
  }

  function ensureChooser() {
    if (chooser) return chooser;
    chooser = doc.createElement('div');
    chooser.className = 'proof-back-chooser';
    chooser.id = 'proof-back-chooser';
    chooser.setAttribute('role', 'dialog');
    chooser.setAttribute('aria-labelledby', 'proof-back-chooser-title');
    chooser.hidden = true;
    doc.body.appendChild(chooser);
    chooser.addEventListener('click', (e) => {
      const item = e.target.closest('[data-proof-back-target]');
      if (item) goUp(item.dataset.proofBackTarget);
    });
    chooser.addEventListener('keydown', (e) => {
      const items = [...chooser.querySelectorAll('[data-proof-back-target]')];
      const i = items.indexOf(doc.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChooser(); } else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Tab') {
        // Keep focus inside while open; Tab past the ends closes it.
        if ((e.shiftKey && i <= 0) || (!e.shiftKey && i === items.length - 1)) closeChooser();
      }
    });
    doc.addEventListener('click', (e) => {
      if (!chooser.hidden && !chooser.contains(e.target) && !(chooserOpener && chooserOpener.contains(e.target))) closeChooser({ restoreFocus: false });
    });
    return chooser;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openChooser(btn, options) {
    const el = ensureChooser();
    el.innerHTML = `<p class="proof-back-chooser__title" id="proof-back-chooser-title">Several results use this one. Go back up to:</p>
      <ul class="proof-back-chooser__list">${options.map((id) => {
    const t = titleOf(id);
    const n = nameOf(id);
    return `<li><button type="button" class="proof-back-chooser__item" data-proof-back-target="${esc(id)}"><span class="proof-back-chooser__num">${esc(n)}</span>${t && t !== n ? `<span class="proof-back-chooser__name">${esc(t)}</span>` : ''}</button></li>`;
  }).join('')}</ul>`;
    el.hidden = false;
    chooserOpener = btn;
    btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect();
    const vw = win.innerWidth || doc.documentElement.clientWidth || 1024;
    const vh = win.innerHeight || doc.documentElement.clientHeight || 768;
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 200;
    el.style.left = `${Math.max(8, Math.min(r.left, vw - w - 8))}px`;
    el.style.top = `${r.bottom + 6 + h > vh - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
    const first = el.querySelector('[data-proof-back-target]');
    if (first) first.focus();
  }

  function back(btn) {
    const d = st.decision;
    if (d.kind === 'go') goUp(d.target);
    else if (d.kind === 'choose') {
      if (chooser && !chooser.hidden && chooserOpener === btn) closeChooser();
      else openChooser(btn, d.options);
    }
  }

  function forward() {
    if (!st.trail.length) return;
    const target = st.trail[st.trail.length - 1];
    st.pending = { via: 'down', target };
    navigate(target);
  }

  backs().forEach((b) => b.addEventListener('click', () => back(b)));
  forwards().forEach((b) => b.addEventListener('click', () => forward()));

  function onRoute(id) {
    const next = id && nodeOf(getData(), id) ? id : null;
    const step = st.pending;
    st.pending = null;
    if (next !== st.current) {
      st.trail = nextTrail(st.trail, st.current, next, step);
      if (st.current) st.cameFrom = st.current;
      st.current = next;
      closeChooser({ restoreFocus: false });
    }
    sync();
  }

  sync();
  return {
    onRoute,
    get state() {
      return {
        current: st.current, cameFrom: st.cameFrom, trail: st.trail.slice(), decision: st.decision,
      };
    },
  };
}
