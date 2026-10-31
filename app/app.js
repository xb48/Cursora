'use strict';

const api = window.openwhip;

const ui = {
  state: null,
  page: 'library',
  category: 'all',
  query: '',
  sort: 'popular',
  studioId: null,
  recording: false,
  pgCracks: 0,
  cursor: null,      // the cursor design being edited (CursorKit.normalize shape)
  curFill: null,     // open Fill tab: 'colors' | 'patterns' | 'flags'
  xdesign: null,     // crosshair open in the editor
  xeditId: null,     // id of the saved crosshair being edited (null = not saved yet)
  xname: null,       // editor name for a crosshair that is not saved yet
  xscene: 'game',    // editor backdrop
  xzoom: 4,          // editor zoom (1 = actual size)
  xhTag: 'all',      // preset category shown on the Crosshairs page
};

const GITHUB_URL = 'https://github.com/xb48';
const SUPPORT_URL = 'https://discord.gg/qat8yUcYqh';   // Discord server: technical support tickets
const CATEGORY_ICONS = {
  Classic: 'whip', Neon: 'sparkles', Elemental: 'flame', Objects: 'box', Tech: 'cpu', Fluid: 'drop',
  Cosmic: 'orbit', Nature: 'leaf', Art: 'brush', Animals: 'paw', Other: 'layers',
};
const PAGE_TITLES = { library: 'Animations', studio: 'Studio', cursors: 'Cursors', crosshairs: 'Crosshairs', xeditor: 'Crosshair Editor', hotkeys: 'Hotkeys', history: 'History', settings: 'Settings', help: 'Help' };
const DEFAULT_HINTS = ['Move to swing', 'Flick to crack', 'Hotkey toggles it on and off'];

// ── Helpers ─────────────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const num = n => Number(n || 0).toLocaleString();
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

const anims = () => ui.state.animations;
const animById = id => anims().find(a => a.id === id);
const activeAnim = () => animById(ui.state.activeId);
const isFav = id => ui.state.favorites.includes(id);
const usesOf = id => ui.state.stats.byId[id] || 0;
const isMac = () => ui.state.platform === 'darwin';
const modeLabel = a => (a.cursor === 'replace' ? 'Replaces pointer' : 'Follows pointer');

function keyLabels(accel) {
  if (!accel) return [];
  return accel.split('+').map(k => {
    if (k === 'CommandOrControl') return isMac() ? '⌘' : 'Ctrl';
    if (k === 'Super') return isMac() ? '⌘' : 'Win';
    if (k === 'Alt' && isMac()) return '⌥';
    return k;
  });
}
const keys = accel => {
  const parts = keyLabels(accel);
  if (!parts.length) return '<span class="muted">Not set</span>';
  return `<span class="keys">${parts.map(k => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">+</span>')}</span>`;
};

function thumb(a, cls = '') {
  return a.thumbnailUrl
    ? `<img class="${cls}" src="${esc(a.thumbnailUrl)}" alt="" draggable="false">`
    : `<div class="card-fallback ${cls}">${icon('sparkles')}</div>`;
}

function hydrateIcons(root = document) {
  for (const el of $$('[data-icon]', root)) {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute('data-icon');
  }
}

// ── Theme ───────────────────────────────────────────────────────────────────
// 'system' follows Windows; 'dark' and 'light' pin it.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = ui.state ? ui.state.prefs.theme : 'system';
  const resolved = pref === 'dark' || pref === 'light' ? pref : (darkQuery.matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = resolved;
}
darkQuery.addEventListener('change', applyTheme);

// ── Toasts + confirm ────────────────────────────────────────────────────────
function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'info' : 'check')}<span>${esc(message)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove());
  }, kind === 'error' ? 4800 : 2600);
}

function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  const root = $('#modal-root');
  return new Promise(resolve => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          <p>${esc(body)}</p>
          <div class="modal-actions">
            <button class="btn ghost" data-m="0">Cancel</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-m="1">${esc(confirm)}</button>
          </div>
        </div>
      </div>`;
    const close = ok => { root.innerHTML = ''; root.onclick = null; document.removeEventListener('keydown', onKey); resolve(ok); };
    const onKey = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    root.onclick = e => {
      const btn = e.target.closest('[data-m]');
      if (btn) close(btn.dataset.m === '1');
      else if (e.target.classList.contains('modal-backdrop')) close(false);
    };
    $('[data-m="1"]', root).focus();
  });
}

// ── Chrome (rail + top bar) ─────────────────────────────────────────────────
function renderChrome() {
  const a = activeAnim();
  $('#activeName').textContent = a ? a.name : 'None';
  $('#activeThumb').innerHTML = a && a.thumbnailUrl ? `<img src="${esc(a.thumbnailUrl)}" alt="">` : '';
  const on = ui.state.overlayActive;
  const pill = $('#summonPill');
  pill.classList.toggle('on', on);
  $('#summonLabel').textContent = on ? 'On' : 'Off';
  const hk = keyLabels(ui.state.prefs.hotkey).join('+');
  pill.title = `${on ? 'Drop' : 'Summon'} ${a ? a.name : ''}${hk ? ` (${hk})` : ''}`;
  for (const el of $$('.rail [data-page]')) el.classList.toggle('active', el.dataset.page === ui.page);
  $('#pageTitle').textContent = PAGE_TITLES[ui.page] || 'Animations';
  $('#crackTotal').textContent = num(ui.state.stats.total);
  const u = ui.state.update;
  const chip = $('#updateChip');
  chip.hidden = !(u && u.status === 'ready');
  if (!chip.hidden) { $('#updateChipLabel').textContent = 'Restart to update'; chip.title = `Cursora ${u.version} is ready. Restart to install it.`; }
}

function renderActiveMenu() {
  const menu = $('#activeMenu');
  menu.innerHTML = `
    <div class="menu-label">Active animation</div>
    ${anims().map(a => `
      <button class="menu-item" data-action="pick-active" data-id="${esc(a.id)}">
        ${a.thumbnailUrl ? `<img class="menu-thumb" src="${esc(a.thumbnailUrl)}" alt="">` : '<span class="menu-thumb"></span>'}
        <span>${esc(a.name)}</span>
        ${a.id === ui.state.activeId ? icon('check') : ''}
      </button>`).join('')}`;
}

// ── Pages ───────────────────────────────────────────────────────────────────
function render() {
  renderChrome();
  renderPage();
}

function renderPage() {
  const main = $('#main');
  const pages = {
    library: renderLibrary,
    studio: renderStudio,
    cursors: renderCursors,
    crosshairs: renderCrosshairs,
    xeditor: renderXhEditor,
    hotkeys: renderHotkeys,
    history: renderHistory,
    settings: renderSettings,
    help: renderHelp,
  };
  main.innerHTML = (pages[ui.page] || renderLibrary)();
  if (ui.page === 'studio') mountPreview('#pgFrame', () => animById(ui.studioId), 0.36, 0.72);
  if (ui.page === 'library') mountPreview('#heroFrame', activeAnim, 0.5, 0.3);
  if (ui.page === 'cursors') startAnim();
  if (ui.page === 'crosshairs' || ui.page === 'xeditor') { drawXhPreview(); xhLoop(); }
}

// Library ────────────────────────────────────────────────────────────────────
function filteredAnims() {
  const q = ui.query.trim().toLowerCase();
  const c = ui.category;
  return anims().filter(a => {
    if (c === 'saved' && !isFav(a.id)) return false;
    if (c === 'recent' && !ui.state.recent.includes(a.id)) return false;
    if (c.startsWith('cat:') && a.category !== c.slice(4)) return false;
    if (!q) return true;
    return [a.name, a.description, a.author, a.category, ...a.tags].join(' ').toLowerCase().includes(q);
  });
}

function sortAnims(list) {
  const out = [...list];
  if (ui.sort === 'az') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (ui.sort === 'recent') {
    const rank = id => { const i = ui.state.recent.indexOf(id); return i < 0 ? 99 : i; };
    out.sort((a, b) => rank(a.id) - rank(b.id));
  } else out.sort((a, b) => usesOf(b.id) - usesOf(a.id) || a.name.localeCompare(b.name));
  return out;
}

function sortSelect() {
  const opt = (v, l) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`;
  return `<select class="select" id="sortSelect" title="Sort">${opt('popular', 'Most used')}${opt('recent', 'Recently used')}${opt('az', 'A–Z')}</select>`;
}

function filterChip(id, ic, label, count) {
  return `
    <button class="fchip ${ui.category === id ? 'active' : ''}" data-action="category" data-id="${esc(id)}">
      ${icon(ic)}<span>${esc(label)}</span><span class="n">${count}</span>
    </button>`;
}

/** Whether the hero (live preview of the active animation) is shown. */
const showHero = () => !ui.query.trim() && ui.category === 'all';

function renderLibrary() {
  return `
    <div class="page scroll" id="libScroll">
      <div class="doc wide">
        ${showHero() ? renderHero(activeAnim() || sortAnims(anims())[0]) : ''}
        <div class="lib-body" id="libBody">${renderLibraryBody()}</div>
      </div>
    </div>`;
}

function renderLibraryBody() {
  const all = anims();
  const categories = [...new Set(all.map(a => a.category))].sort();
  const list = sortAnims(filteredAnims());
  const heading = ui.query.trim()
    ? `Results for “${esc(ui.query.trim())}”`
    : ui.category.startsWith('cat:') ? esc(ui.category.slice(4))
      : { saved: 'Saved', recent: 'Recently used' }[ui.category] || 'All animations';

  return `
        <div class="toolbar">
          <div class="filters">
            ${filterChip('all', 'grid', 'All', all.length)}
            ${filterChip('saved', 'bookmark', 'Saved', ui.state.favorites.length)}
            ${filterChip('recent', 'clock', 'Recent', ui.state.recent.filter(id => animById(id)).length)}
            ${categories.map(c => filterChip(`cat:${c}`, CATEGORY_ICONS[c] || 'sparkles', c, all.filter(a => a.category === c).length)).join('')}
          </div>
          <label class="search">${icon('search')}<input id="search" type="text" placeholder="Search animations" value="${esc(ui.query)}" spellcheck="false" autocomplete="off"></label>
          ${sortSelect()}
        </div>
        <div class="section-title">${heading}<span class="n">${plural(list.length, 'animation')}</span></div>
        ${list.length
          ? `<div class="grid">${list.map(card).join('')}</div>`
          : ui.category === 'saved' && !ui.query.trim()
            ? emptyState('bookmark', 'No saved animations', 'Tap the bookmark on any animation to keep it here.')
            : emptyState('search', 'Nothing here yet', 'Try another search or category.')}`;
}

function renderHero(a) {
  if (!a) {
    return emptyState('sparkles', 'No animations available', 'This copy of Cursora shipped without animations. Reinstall or update it.');
  }
  const live = ui.state.overlayActive;
  return `
    <section class="hero glass">
      <div class="hero-stage">
        <iframe id="heroFrame" src="${esc(a.entryUrl)}?preview=1" title="${esc(a.name)} live preview"></iframe>
        <span class="stage-tag"><i></i>LIVE PREVIEW</span>
        <span class="stage-hint">Move your mouse here to try it</span>
      </div>
      <div class="hero-info">
        <div class="eyebrow" id="heroStatus">${live ? '<span class="live">On screen now</span>' : 'Active animation'}</div>
        <h1>${esc(a.name)}</h1>
        <p>${esc(a.description)}</p>
        <div class="hero-chips">
          <span class="chip">${icon(CATEGORY_ICONS[a.category] || 'sparkles')}${esc(a.category)}</span>
          <span class="chip">${icon('mouse')}${modeLabel(a)}</span>
          <span class="chip">${icon('flame')}${num(usesOf(a.id))}</span>
        </div>
        <div class="hero-actions">
          <button class="btn primary" id="heroSummon" data-action="summon">${icon('zap')}${live ? 'Turn off' : 'Summon now'}</button>
          <button class="btn ghost" data-action="open-studio" data-id="${esc(a.id)}">${icon('sliders')}Customize</button>
          ${ui.state.prefs.hotkey ? `<span class="hero-hint">or press ${keys(ui.state.prefs.hotkey)} anywhere</span>` : ''}
        </div>
      </div>
    </section>`;
}

function card(a) {
  const active = a.id === ui.state.activeId;
  const fav = isFav(a.id);
  return `
    <article class="card ${active ? 'is-active' : ''}" data-action="open-studio" data-id="${esc(a.id)}" tabindex="0">
      <div class="card-media">
        ${thumb(a)}
        <div class="card-badges">${active ? `<span class="badge accent">${icon('check')}Active</span>` : ''}</div>
        <div class="card-actions">
          <button class="card-btn ${fav ? 'on' : ''}" data-action="favorite" data-id="${esc(a.id)}" title="${fav ? 'Remove from saved' : 'Save'}">${icon('bookmark')}</button>
          <button class="card-btn play" data-action="summon-id" data-id="${esc(a.id)}" title="Summon">${icon('play')}</button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-text">
          <div class="card-title">${esc(a.name)}</div>
          <div class="card-meta">${esc(a.category)}<span class="dot">·</span>${modeLabel(a)}</div>
        </div>
        <div class="card-uses" title="Times triggered">${icon('flame')}${num(usesOf(a.id))}</div>
      </div>
    </article>`;
}

function emptyState(ic, title, text, action = '') {
  return `
    <div class="empty">
      <div class="empty-icon">${icon(ic)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

// Studio ─────────────────────────────────────────────────────────────────────
function renderStudio() {
  const a = animById(ui.studioId) || activeAnim();
  if (!a) {
    return `<div class="page"><div class="doc">${emptyState('sliders', 'Nothing to customize', 'No animations are available in this copy of Cursora.')}</div></div>`;
  }
  ui.studioId = a.id;
  const active = a.id === ui.state.activeId;
  const groups = new Map();
  for (const s of a.settings) {
    const g = s.group || 'General';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const groupIcons = { Physics: 'whip', Crack: 'zap', Look: 'sparkles', Sound: 'zap', Feel: 'mouse', Motion: 'mouse', Trigger: 'zap' };

  return `
    <div class="page">
      <div class="studio-head">
        <button class="icon-btn" data-action="nav" data-page="library" title="Back to animations">${icon('chevron-left')}</button>
        <div class="studio-thumb">${thumb(a)}</div>
        <div class="studio-title">
          <h2>${esc(a.name)}</h2>
          <div class="chips">
            <span class="chip">${icon(CATEGORY_ICONS[a.category] || 'sparkles')}${esc(a.category)}</span>
            <span class="chip">${icon('mouse')}${modeLabel(a)}</span>
            <span class="chip">v${esc(a.version)}</span>
          </div>
        </div>
        <div class="studio-actions">
          <button class="icon-btn ${isFav(a.id) ? 'fav-on' : ''}" data-action="favorite" data-id="${esc(a.id)}" title="${isFav(a.id) ? 'Remove from saved' : 'Save'}">${icon('bookmark')}</button>
          ${active
            ? `<span class="chip accent">${icon('check')}Active</span>`
            : `<button class="btn ghost" data-action="activate" data-id="${esc(a.id)}">Set active</button>`}
          <button class="btn primary" data-action="summon-id" data-id="${esc(a.id)}">${icon('zap')}${active && ui.state.overlayActive ? 'Turn off' : 'Summon'}</button>
        </div>
      </div>
      <div class="studio-body">
        <section class="playground glass">
          <div class="pg-bar">
            <div class="pg-title">${icon('mouse')}Playground<span>Try changes live before taking it to your desktop</span></div>
            <div class="pg-meta">
              <span class="pg-count" id="pgCount">${icon('flame')}<span>${plural(ui.pgCracks, 'crack')}</span></span>
              <button class="icon-btn" data-action="pg-respawn" title="Respawn">${icon('rotate')}</button>
            </div>
          </div>
          <div class="pg-stage">
            <iframe id="pgFrame" src="${esc(a.entryUrl)}?preview=1" title="${esc(a.name)} preview"></iframe>
            <div class="pg-flash" id="pgFlash"></div>
            <div class="pg-hint">${(a.hints || DEFAULT_HINTS).map(h => {
              const [verb, ...rest] = h.split(' ');
              return `<span><b>${esc(verb)}</b> ${esc(rest.join(' '))}</span>`;
            }).join('')}</div>
          </div>
        </section>
        <aside class="inspector glass">
          ${[...groups].map(([g, list]) => `
            <div class="group">
              <div class="group-head">${icon(groupIcons[g] || 'sliders')}${esc(g)}</div>
              ${list.map(s => field(a, s)).join('')}
            </div>`).join('')}
          <button class="btn ghost wide" data-action="reset-settings" data-id="${esc(a.id)}">${icon('rotate')}Restore defaults</button>
        </aside>
      </div>
    </div>`;
}

function fmtSetting(s, v) {
  if (s.type !== 'range') return String(v);
  if (s.unit === '%') return `${Math.round(v * 100)}%`;
  const decimals = String(s.step ?? 1).split('.')[1]?.length || 0;
  return `${Number(v).toFixed(decimals)}${s.unit && s.unit !== '%' ? s.unit : ''}`;
}

const rangePct = (s, v) => `${((v - s.min) / ((s.max - s.min) || 1)) * 100}%`;

function field(a, s) {
  const v = a.values[s.key] ?? s.default;
  const id = `f-${s.key}`;
  const hint = s.hint ? `<div class="hint">${esc(s.hint)}</div>` : '';
  if (s.type === 'color') {
    return `
      <div class="field inline">
        <label for="${id}">${esc(s.label)}</label>
        <label class="swatch"><input id="${id}" type="color" value="${esc(v)}" data-setting="${esc(s.key)}"><i style="background:${esc(v)}"></i><code>${esc(v)}</code></label>
      </div>`;
  }
  if (s.type === 'toggle') {
    return `
      <div class="field">
        <div class="field-top toggle-row">
          <label for="${id}">${esc(s.label)}</label>
          <label class="switch"><input id="${id}" type="checkbox" ${v ? 'checked' : ''} data-setting="${esc(s.key)}"><span></span></label>
        </div>
        ${hint}
      </div>`;
  }
  if (s.type === 'select') {
    return `
      <div class="field">
        <label for="${id}">${esc(s.label)}</label>
        <select class="select" id="${id}" data-setting="${esc(s.key)}">
          ${(s.options || []).map(o => {
            const [val, label] = typeof o === 'object' ? [o.value, o.label] : [o, o];
            return `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(label)}</option>`;
          }).join('')}
        </select>${hint}
      </div>`;
  }
  return `
    <div class="field">
      <div class="field-top"><label for="${id}">${esc(s.label)}</label><output id="o-${esc(s.key)}">${esc(fmtSetting(s, v))}</output></div>
      <input id="${id}" type="range" min="${s.min}" max="${s.max}" step="${s.step ?? 1}" value="${v}" style="--p:${rangePct(s, v)}" data-setting="${esc(s.key)}">
      ${hint}
    </div>`;
}

// Live previews (Studio playground and the Animations hero) ─────────────────
/** Spawns the animation in a preview iframe once it loads, at (fx, fy) of its size. */
function mountPreview(sel, getAnim, fx, fy) {
  const frame = $(sel);
  if (!frame) return;
  frame.addEventListener('load', () => spawnIn(frame, getAnim(), fx, fy));
}

function spawnIn(frame, a, fx, fy) {
  if (!frame || !frame.contentWindow || !a) return;
  frame.contentWindow.postMessage({
    type: 'spawn',
    payload: { settings: a.values, cursor: { x: Math.round(frame.clientWidth * fx), y: Math.round(frame.clientHeight * fy) } },
  }, '*');
}

function postPreview(type, payload) {
  const frame = $('#pgFrame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type, payload }, '*');
}

const spawnPreview = () => spawnIn($('#pgFrame'), animById(ui.studioId), 0.36, 0.72);

window.addEventListener('message', e => {
  const frame = $('#pgFrame');
  if (!frame || e.source !== frame.contentWindow || !e.data) return;
  if (e.data.type === 'openwhip:trigger') {
    ui.pgCracks += 1;
    const count = $('#pgCount');
    count.querySelector('span').textContent = plural(ui.pgCracks, 'crack');
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    const flash = $('#pgFlash');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  }
});

// Settings writes are debounced; the UI and playground update immediately.
const pendingSettings = new Map();
let settingsTimer = null;
function queueSetting(id, key, value) {
  const patch = pendingSettings.get(id) || {};
  patch[key] = value;
  pendingSettings.set(id, patch);
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(flushSettings, 180);
}
async function flushSettings() {
  const entries = [...pendingSettings];
  pendingSettings.clear();
  for (const [id, patch] of entries) ui.state = await api.updateSettings(id, patch);
}

// Cursors ────────────────────────────────────────────────────────────────────
const CK = window.CursorKit;
const curDesign = () => ui.cursor || (ui.cursor = CK.normalize(ui.state.cursor && ui.state.cursor.design || CK.DEFAULT_DESIGN));
// Rendered frames are cached by design + role + size: { urls, hx, hy, rate }.
const frameCache = new Map();
function curFrames(design, role, size) {
  const key = JSON.stringify([CK.normalize(design), role, size || 0]);
  let f = frameCache.get(key);
  if (!f) {
    if (frameCache.size > 600) frameCache.clear();
    const r = CK.renderRoleFrames(design, role, size);
    f = { key, urls: r.frames.map(c => c.toDataURL('image/png')), hx: r.hx, hy: r.hy, rate: r.rate };
    frameCache.set(key, f);
  }
  return f;
}
/** <img> of a role; animated roles carry data-anim and are played by the animator. */
const curImg = (design, role, size, cls = '') => {
  const f = curFrames(design, role, size);
  const anim = f.urls.length > 1 ? ` data-anim="${esc(f.key)}"` : '';
  return `<img class="${cls}" src="${f.urls[0]}" width="${size}" height="${size}" alt="" draggable="false"${anim}>`;
};
/** Inline style + attributes giving an element this role as its (animated) cursor. */
const curCursorAttrs = (design, role, fallback) => {
  const f = curFrames(design, role);
  const anim = f.urls.length > 1 ? ` data-anim="${esc(f.key)}" data-fb="${fallback}"` : '';
  return `style="cursor:url(${f.urls[0]}) ${f.hx} ${f.hy}, ${fallback}"${anim}`;
};

// Plays animated previews at their real frame rate (1/60 s units, like Windows).
let animRaf = 0;
function animTick(now) {
  animRaf = 0;
  if (ui.page !== 'cursors') return;
  for (const el of $$('[data-anim]')) {
    const f = frameCache.get(el.dataset.anim);
    if (!f || f.urls.length < 2) continue;
    const i = Math.floor(now / (f.rate * 1000 / 60)) % f.urls.length;
    if (el.__frame === i) continue;
    el.__frame = i;
    if (el.tagName === 'IMG') el.src = f.urls[i];
    else el.style.cursor = `url(${f.urls[i]}) ${f.hx} ${f.hy}, ${el.dataset.fb}`;
  }
  animRaf = requestAnimationFrame(animTick);
}
const startAnim = () => { if (!animRaf) animRaf = requestAnimationFrame(animTick); };
const sameDesign = (a, b) => a.shape === b.shape && a.finish === b.finish && a.color === b.color;
const fillTabOf = color => (color.startsWith('f:') ? 'flags' : color.startsWith('p:') ? 'patterns' : 'colors');
const swatchCache = new Map();
/** Pattern / flag thumbnail (cached: the art never changes). */
const fillSwatch = (id, w, h) => {
  const key = `${id}@${w}x${h}`;
  if (!swatchCache.has(key)) swatchCache.set(key, CK.renderFill(id, w, h));
  return swatchCache.get(key);
};

function renderFillPicker(d) {
  const tab = ui.curFill || (ui.curFill = fillTabOf(d.color));
  const tabBtn = (id, ic, label) => `<button class="${tab === id ? 'on' : ''}" data-action="cur-filltab" data-id="${id}">${icon(ic)}${label}</button>`;
  let body;
  if (tab === 'patterns') {
    body = `<div class="art-grid">${CK.PATTERNS.map(p => `
      <button class="art-chip ${d.color === 'p:' + p.id ? 'active' : ''}" data-action="cur-color" data-id="p:${p.id}" title="${esc(p.name)}">
        <img src="${fillSwatch('p:' + p.id, 60, 38)}" alt=""><span>${esc(p.name)}</span>
      </button>`).join('')}</div>`;
  } else if (tab === 'flags') {
    body = `<div class="flag-grid">${CK.FLAGS.map(f => `
      <button class="flag-chip ${d.color === 'f:' + f.id ? 'active' : ''}" data-action="cur-color" data-id="f:${f.id}" title="${esc(f.name)}">
        <img src="${fillSwatch('f:' + f.id, 42, 28)}" alt=""><span>${esc(f.name)}</span>
      </button>`).join('')}</div>`;
  } else {
    body = `<div class="swatches">
      ${CK.COLORS.map(c => `<button class="swatch-dot ${d.color === c.id ? 'active' : ''}" data-action="cur-color" data-id="${c.id}" title="${esc(c.name)}" style="background:${swatchBg(c.value)}"></button>`).join('')}
      <label class="swatch-dot custom ${d.color === 'custom' ? 'active' : ''}" title="Custom colour" style="background:${d.color === 'custom' ? d.custom : 'conic-gradient(#ff5a5a, #ffd23f, #3ddc84, #22d3ee, #8b5cf6, #ff5a5a)'}">
        <input type="color" id="curCustom" value="${esc(d.custom)}">
      </label>
    </div>`;
  }
  return `
    <div class="seg fill-tabs">${tabBtn('colors', 'drop', 'Colours')}${tabBtn('patterns', 'layers', 'Patterns')}${tabBtn('flags', 'compass', 'Flags')}</div>
    <div class="fill-body">${body}</div>`;
}
const swatchBg = c => (Array.isArray(c) ? `linear-gradient(135deg, ${c.join(', ')})` : c);

function renderCursors() {
  const supported = ui.state.cursorSupported;
  const on = !!(ui.state.cursor && ui.state.cursor.enabled);
  return `
    <div class="page scroll" id="curScroll">
      <div class="doc wide">
        <div class="page-head">
          <div><h1>Cursors</h1><p>Design your Windows pointer: every cursor, from the arrow to the resize handles, in one matching style.</p></div>
          <div class="cur-apply glass ${on ? 'on' : ''}">
            <div class="prow-text"><b>Use on Windows</b><span id="curStatus">${!supported ? 'Available on Windows only' : on ? 'Active across your desktop' : 'Off: Windows cursors in use'}</span></div>
            <label class="switch ${supported ? '' : 'disabled-block'}"><input type="checkbox" id="curEnabled" ${on ? 'checked' : ''} ${supported ? '' : 'disabled'}><span></span></label>
          </div>
        </div>
        <div id="curBody">${renderCursorBody()}</div>
      </div>
    </div>`;
}

function renderCursorBody() {
  const d = curDesign();
  const tile = (action, id, active, inner, label, note = '') => `
    <button class="cur-tile ${active ? 'active' : ''}" data-action="${action}" data-id="${esc(id)}" ${note ? `title="${esc(note)}"` : ''}>
      <span class="cur-tile-art">${inner}</span><span class="cur-tile-name">${esc(label)}</span>
    </button>`;
  return `
    <section class="cur-hero glass" id="curPreview">${renderCursorPreview()}</section>

    <div class="section-title">Packs<span class="n">${CK.PACKS.length} complete themed sets</span></div>
    <div class="pack-grid">
      ${CK.PACKS.map(p => {
        const active = d.pack === p.id;
        return `
          <button class="pack glass ${active ? 'active' : ''}" data-action="cur-pack" data-id="${esc(p.id)}">
            <span class="pack-art">${['normal', 'cross', 'wait', 'ibeam', 'sizeall', 'hand', 'no', 'help', 'appstarting'].map(r => curImg({ ...d, pack: p.id }, r, 32)).join('')}</span>
            <span class="preset-name">${esc(p.name)}${active ? icon('check') : ''}</span>
          </button>`;
      }).join('')}
    </div>

    <div class="section-title">Presets<span class="n">${CK.PRESETS.length} designer sets</span></div>
    <div class="preset-grid">
      ${CK.PRESETS.map(p => {
        const pd = { ...d, ...p.design, pack: null };
        const active = !d.pack && sameDesign(d, p.design);
        return `
          <button class="preset glass ${active ? 'active' : ''}" data-action="cur-preset" data-id="${esc(p.id)}">
            <span class="preset-art">${['normal', 'hand', 'ibeam'].map(r => curImg(pd, r, 34)).join('')}</span>
            <span class="preset-name">${esc(p.name)}${active ? icon('check') : ''}</span>
          </button>`;
      }).join('')}
    </div>

    <div class="cur-custom">
      <section class="glass cur-panel">
        <div class="panel-title">Shape</div>
        <div class="tile-grid six">${CK.SHAPES.map(sh => tile('cur-shape', sh.id, !d.pack && d.shape === sh.id, curImg({ ...d, pack: null, shape: sh.id }, 'normal', 40), sh.name)).join('')}</div>
        <div class="panel-title">Finish</div>
        <div class="tile-grid four">${CK.FINISHES.map(f => tile('cur-finish', f.id, !d.pack && d.finish === f.id, curImg({ ...d, pack: null, finish: f.id }, 'normal', 40), f.name, f.note)).join('')}</div>
      </section>
      <section class="glass cur-panel">
        <div class="panel-title">Fill</div>
        ${renderFillPicker(d)}
        <div class="panel-title">Size</div>
        <div class="field cur-field">
          <div class="field-top"><label for="curSize">Pointer size</label><output id="curSizeOut">${d.size}px</output></div>
          <input id="curSize" type="range" min="${CK.SIZES.min}" max="${CK.SIZES.max}" step="${CK.SIZES.step}" value="${d.size}" style="--p:${((d.size - CK.SIZES.min) / (CK.SIZES.max - CK.SIZES.min)) * 100}%">
        </div>
        <div class="prow cur-row">
          <div class="prow-text"><b>Soft shadow</b><span>A subtle drop shadow that lifts the pointer off the page.</span></div>
          <label class="switch"><input type="checkbox" id="curShadow" ${d.shadow ? 'checked' : ''}><span></span></label>
        </div>
        <button class="btn ghost wide" data-action="cur-reset">${icon('rotate')}Restore the default design</button>
      </section>
    </div>`;
}

/** Live test area (the real pointer takes the design here) and the full role sheet. */
function renderCursorPreview() {
  const d = curDesign();
  const css = (role, fb) => curCursorAttrs(d, role, fb);
  return `
    <div class="cur-stage" ${css('normal', 'default')}>
      <span class="stage-tag"><i></i>TRY IT HERE</span>
      <div class="cur-zones">
        <button class="cur-zone link" ${css('hand', 'pointer')}>${icon('external')}Hover a link</button>
        <input class="cur-zone text" ${css('ibeam', 'text')} value="Select this text" spellcheck="false">
        <div class="cur-zone" ${css('wait', 'wait')}>${icon('rotate')}Busy</div>
        <div class="cur-zone" ${css('appstarting', 'progress')}>${icon('clock')}Working</div>
        <div class="cur-zone" ${css('cross', 'crosshair')}>${icon('plus')}Precision</div>
        <div class="cur-zone" ${css('sizeall', 'move')}>${icon('grid')}Move</div>
        <div class="cur-zone" ${css('no', 'not-allowed')}>${icon('x')}Unavailable</div>
        <div class="cur-zone" ${css('help', 'help')}>${icon('help')}Help</div>
        <div class="cur-zone" ${css('sizenwse', 'nwse-resize')}>${icon('win-max')}Resize</div>
      </div>
    </div>
    <div class="cur-sheet">
      ${CK.ROLES.map(r => `<div class="role" title="${esc(r.name)}">${curImg(d, r.id, 32)}<span>${esc(r.name)}</span></div>`).join('')}
    </div>`;
}

/** Re-render the editor (keeping scroll) and push the change to Windows if on. */
function cursorChanged({ full = true, save = true } = {}) {
  ui.cursor = CK.normalize(ui.cursor);
  const scroller = $('#curScroll');
  const top = scroller ? scroller.scrollTop : 0;
  if (full) { const body = $('#curBody'); if (body) body.innerHTML = renderCursorBody(); }
  else { const pv = $('#curPreview'); if (pv) pv.innerHTML = renderCursorPreview(); }
  if (scroller) scroller.scrollTop = top;
  startAnim();
  if (save) scheduleCursorSave();
}

let cursorSaveTimer = null;
function scheduleCursorSave() {
  clearTimeout(cursorSaveTimer);
  cursorSaveTimer = setTimeout(() => saveCursor({}), 250);
}

/** Saves the design; regenerates the Windows cursor files whenever the set is on. */
async function saveCursor({ enabled }) {
  if (!ui.state.cursorSupported) return;
  const on = typeof enabled === 'boolean' ? enabled : !!(ui.state.cursor && ui.state.cursor.enabled);
  const payload = { design: curDesign() };
  if (typeof enabled === 'boolean') payload.enabled = enabled;
  if (on) payload.images = CK.buildSet(payload.design);
  const res = await api.setCursor(payload);
  ui.state = res.state;
  if (res.error) toast(res.error, 'error');
  const status = $('#curStatus');
  if (status) {
    const nowOn = !!ui.state.cursor.enabled;
    status.textContent = nowOn ? 'Active across your desktop' : 'Off: Windows cursors in use';
    const box = status.closest('.cur-apply');
    if (box) box.classList.toggle('on', nowOn);
    const sw = $('#curEnabled');
    if (sw) sw.checked = nowOn;
  }
}

// Crosshairs ─────────────────────────────────────────────────────────────────
const XK = window.CrosshairKit;
const xhState = () => ui.state.crosshair;
/** The design on screen (the overlay draws CrosshairKit.DEFAULT until one is chosen). */
const xhActive = () => XK.normalize(xhState().design);
const XH_SCENES = [['game', 'Game'], ['dark', 'Dark'], ['light', 'Light'], ['bright', 'Bright']];
const XH_SWATCHES = ['#00ff88', '#00ffff', '#ffffff', '#ff3b5c', '#ffe14d', '#ff7a1a', '#c084fc', '#39ff14', '#000000'];
const XH_OFFSET = 300;

/** A test backdrop, so a crosshair can be judged against real-world contrast. */
function xhScene(g, w, h, scene) {
  if (scene === 'dark') { g.fillStyle = '#121317'; g.fillRect(0, 0, w, h); return; }
  if (scene === 'light') { g.fillStyle = '#eef0f3'; g.fillRect(0, 0, w, h); return; }
  if (scene === 'bright') {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9fd3ff'); sky.addColorStop(1, '#eaf6ff');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const [x, y, r] of [[0.2, 0.3, 0.09], [0.28, 0.27, 0.07], [0.7, 0.62, 0.11], [0.8, 0.58, 0.08]]) {
      g.beginPath(); g.arc(x * w, y * h, r * w, 0, Math.PI * 2); g.fill();
    }
    return;
  }
  // "Game": sky, a skyline of buildings, dusty ground.
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#6f97ba'); sky.addColorStop(0.5, '#c8b590'); sky.addColorStop(1, '#5c6845');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40, 46, 52, 0.75)';
  const blocks = [[0, 0.42, 0.12, 0.2], [0.1, 0.36, 0.08, 0.26], [0.2, 0.46, 0.14, 0.16], [0.62, 0.4, 0.1, 0.22], [0.74, 0.33, 0.07, 0.29], [0.84, 0.44, 0.16, 0.18]];
  for (const [x, y, bw, bh] of blocks) g.fillRect(x * w, y * h, bw * w, bh * h);
  g.fillStyle = 'rgba(255, 220, 150, 0.35)';
  for (let i = 0; i < 14; i++) g.fillRect(((i * 0.071) % 1) * w, (0.4 + (i % 3) * 0.05) * h, 0.012 * w, 0.02 * h);
}

/** Zoom that shows a design comfortably in a box of the given size. */
const xhFitZoom = (d, box) => { const z = box / 2 / (XK.extent(d) + 2); return z >= 1 ? Math.min(6, Math.floor(z)) : z; };
const xhThumbCache = new Map();
/** Card preview (data URL): the design on the game scene, zoomed to fit. */
function xhThumb(design, w = 220, h = 124) {
  const key = `${w}x${h}:${JSON.stringify(design)}`;
  if (!xhThumbCache.has(key)) {
    if (xhThumbCache.size > 400) xhThumbCache.clear();
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    xhScene(g, c.width, c.height, 'game');
    XK.render(g, design, Math.floor(c.width / 2), Math.floor(c.height / 2), xhFitZoom(design, c.height));
    xhThumbCache.set(key, c.toDataURL('image/png'));
  }
  return xhThumbCache.get(key);
}

/** A global-shortcut card with its recorder (pref: 'hotkey' | 'crosshairHotkey'). */
function hotkeyCard(pref, title, text, okFlag, iconName) {
  const hk = ui.state.prefs[pref];
  const recording = ui.recording === pref;
  const short = pref === 'hotkey' ? 'hotkey' : 'xhotkey';
  return `
    ${hk && !ui.state[okFlag] ? `<div class="warn">${icon('info')}<span>${keyLabels(hk).join('+')} couldn't be registered. Another app is probably using it, so pick a different combo.</span></div>` : ''}
    <section class="hk-hero glass">
      <span class="prow-icon">${icon(iconName)}</span>
      <div class="hk-copy"><h2>${title}</h2><p>${text}</p></div>
      <div class="hotkey-box ${recording ? 'recording' : ''}">${recording ? 'Press a key combo… (Esc to cancel)' : keys(hk)}</div>
      <button class="btn ghost" data-action="record-${short}">${recording ? 'Cancel' : 'Change'}</button>
      ${hk && !recording ? `<button class="icon-btn" data-action="clear-${short}" title="Remove hotkey">${icon('x')}</button>` : ''}
    </section>`;
}

function renderCrosshairs() {
  const c = xhState();
  const d = xhActive();
  const activeKey = JSON.stringify(d);
  const tags = [...new Set(XK.PRESETS.map(p => p.tags))].map(t => [t, t, XK.PRESETS.filter(p => p.tags === t).length]);
  const tag = tags.some(([id]) => id === ui.xhTag) ? ui.xhTag : 'all';
  const shown = tag === 'all' ? XK.PRESETS : XK.PRESETS.filter(p => p.tags === tag);
  const card = (design, name, sub, actions, attrs) => `
    <article class="xh-card glass ${JSON.stringify(design) === activeKey ? 'active' : ''}" ${attrs}>
      <img src="${xhThumb(design)}" alt="" draggable="false">
      <div class="xh-card-body"><div class="xh-card-text"><b>${esc(name)}</b><span>${esc(sub)}</span></div><div class="xh-card-actions">${actions}</div></div>
    </article>`;
  const offset = k => `
    <div class="field">
      <div class="field-top"><label for="xh-${k}">${k === 'offsetX' ? 'Horizontal offset' : 'Vertical offset'}</label><output id="xho-${k}">${c[k]}px</output></div>
      <input id="xh-${k}" type="range" min="${-XH_OFFSET}" max="${XH_OFFSET}" step="1" value="${c[k]}" style="--p:${((c[k] + XH_OFFSET) / (2 * XH_OFFSET)) * 100}%" data-xhoff="${k}">
    </div>`;
  return `
    <div class="page scroll">
      <div class="doc wide">
        <div class="page-head">
          <div><h1>Crosshairs</h1><p>A pixel-precise overlay that stays on top of your games and apps. Clicks pass straight through it.</p></div>
          <div class="cur-apply glass ${c.enabled ? 'on' : ''}">
            <div class="prow-text"><b>Show crosshair</b><span>${c.enabled ? 'On screen now' : 'Off'}</span></div>
            <label class="switch"><input type="checkbox" id="xhEnabled" ${c.enabled ? 'checked' : ''}><span></span></label>
          </div>
        </div>
        <section class="xh-hero glass">
          <div class="xh-stage"><canvas id="xhCanvas"></canvas><span class="xh-tag">Active · actual size</span></div>
          <div class="xh-side">
            <div class="xh-display">
              <span class="prow-icon">${icon('monitor')}</span>
              <div class="prow-text"><b>Main display</b><span>${ui.state.crossScreen.width}×${ui.state.crossScreen.height}${ui.state.crossScreen.count > 1 ? ` · stays here with ${ui.state.crossScreen.count} monitors connected` : ''}</span></div>
            </div>
            ${offset('offsetX')}${offset('offsetY')}
            <div class="xh-side-actions">
              <button class="btn ghost sm" data-action="xh-center">${icon('rotate')}Re-centre</button>
              <button class="btn primary sm" data-action="xh-edit-active">${icon('pencil')}Customize</button>
            </div>
          </div>
        </section>
        ${hotkeyCard('crosshairHotkey', 'Crosshair on / off', 'Shows or hides the crosshair from anywhere, even mid-game.', 'crossHotkeyOk', 'target')}
        <section class="glass xh-import">
          <span class="prow-icon">${icon('download')}</span>
          <div class="prow-text"><b>Import a crosshair code</b><span>Paste a code someone shared with you. It starts with CRX1-.</span></div>
          <input class="xh-code" id="xhImport" placeholder="CRX1-…" spellcheck="false" autocomplete="off" maxlength="5000">
          <button class="btn ghost sm" data-action="xh-paste">Paste</button>
          <button class="btn primary sm" data-action="xh-import">Open</button>
        </section>
        ${c.saved.length ? `
          <div class="section-title">My crosshairs<span class="n">${c.saved.length}</span></div>
          <div class="xh-grid">${c.saved.map(x => card(XK.normalize(x.design), x.name, XK.isAnimated(x.design) ? 'Custom · Animated' : 'Custom',
            `<button class="icon-btn" data-action="xh-edit-saved" data-id="${esc(x.id)}" title="Edit">${icon('pencil')}</button>
             <button class="icon-btn" data-action="xh-copy-saved" data-id="${esc(x.id)}" title="Copy code">${icon('copy')}</button>
             <button class="icon-btn" data-action="xh-delete" data-id="${esc(x.id)}" title="Delete">${icon('trash')}</button>`,
            `data-action="xh-apply-saved" data-id="${esc(x.id)}" tabindex="0"`)).join('')}</div>` : ''}
        <div class="section-title">Presets<span class="n">${shown.length === XK.PRESETS.length ? XK.PRESETS.length : `${shown.length} of ${XK.PRESETS.length}`}</span></div>
        <div class="filters xh-filters">${[['all', 'All', XK.PRESETS.length], ...tags].map(([id, label, n]) => `
          <button class="fchip ${tag === id ? 'active' : ''}" data-action="xh-tag" data-id="${esc(id)}"><span>${esc(label)}</span><span class="n">${n}</span></button>`).join('')}</div>
        <div class="xh-grid">${shown.map(p => card(XK.normalize(p.design), p.name, p.tags,
          `<button class="icon-btn" data-action="xh-edit-preset" data-id="${esc(p.id)}" title="Customize">${icon('pencil')}</button>`,
          `data-action="xh-apply" data-id="${esc(p.id)}" tabindex="0"`)).join('')}</div>
        <p class="xh-note">${icon('info')}<span>Shows over windowed and borderless-fullscreen games. Games in exclusive fullscreen cover every other window, so switch them to borderless.</span></p>
      </div>
    </div>`;
}

// Crosshair Editor ───────────────────────────────────────────────────────────
const xhGet = (d, path) => path.split('.').reduce((o, k) => o[k], d);
const xhSet = (d, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], d)[last] = v; };
const xhEdit = () => ui.xdesign || (ui.xdesign = xhActive());
const xhFmt = (v, unit) => (unit === '%' ? `${Math.round(v * 100)}%` : unit === 'auto' ? (v ? `${v}` : 'Auto') : `${v}${unit}`);

const XH_LABELS = {
  colorMode: { solid: 'Solid', twotone: 'Two-tone', gradient: 'Gradient', spectrum: 'Spectrum' },
  'anim.type': { none: 'None', pulse: 'Pulse', breathe: 'Breathe', spin: 'Spin', rainbow: 'Rainbow' },
  'dot.shape': { square: 'Square', round: 'Round', diamond: 'Diamond', ring: 'Ring', triangle: 'Triangle', cross: 'Cross' },
  arms: { four: 'Plus', h: 'Horizontal', v: 'Vertical', three: 'Tri', six: 'Hex', eight: 'Star' },
  cap: { square: 'Square', round: 'Round', taper: 'Taper' },
  'circle.style': { solid: 'Solid', dashed: 'Dashed', dots: 'Dots', brackets: 'Brackets', square: 'Square', diamond: 'Diamond', triangle: 'Triangle', hexagon: 'Hexagon', double: 'Double' },
  'chevron.style': { line: 'Line', filled: 'Filled' },
  'chevron.place': { below: 'Below', above: 'Above', both: 'Both', four: 'Four sides' },
};

function renderXhEditor() {
  const d = xhEdit();
  const saved = ui.xeditId && xhState().saved.find(x => x.id === ui.xeditId);
  const range = (path, label, unit = 'px', step = 1) => {
    const [lo, hi] = XK.RANGES[path];
    const v = xhGet(d, path);
    return `
      <div class="field">
        <div class="field-top"><label>${label}</label><output id="xo-${path.replace('.', '-')}">${xhFmt(v, unit)}</output></div>
        <input type="range" min="${lo}" max="${hi}" step="${step}" value="${v}" style="--p:${((v - lo) / (hi - lo)) * 100}%" data-xk="${path}" data-unit="${unit}" aria-label="${label}">
      </div>`;
  };
  const toggle = (path, label) => `
    <div class="field-top xh-toggle"><label>${label}</label><label class="switch"><input type="checkbox" ${xhGet(d, path) ? 'checked' : ''} data-xk="${path}" aria-label="${label || path}"><span></span></label></div>`;
  const seg = (path, opts, label) => `
    ${label ? `<div class="xh-seg-label">${label}</div>` : ''}
    <div class="seg xh-seg">${opts.map(([v, l]) => `<button class="${String(xhGet(d, path)) === String(v) ? 'on' : ''}" data-action="xh-seg" data-key="${path}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const enumSeg = (path, labels, label) => seg(path, Object.entries(labels), label);
  const colour = (path, label) => `
    <div class="field-top xh-toggle"><label>${label}</label>
      <label class="xh-color"><input type="color" value="${xhGet(d, path)}" data-xk="${path}" aria-label="${label}"><i style="background:${xhGet(d, path)}"></i><code>${xhGet(d, path)}</code></label></div>`;
  const group = (title, ic, on, body) => `
    <div class="xh-group">
      <div class="xh-group-head">${icon(ic)}<b>${title}</b>${on ? `<label class="switch"><input type="checkbox" ${xhGet(d, on) ? 'checked' : ''} data-xk="${on}" aria-label="${title}"><span></span></label>` : ''}</div>
      ${!on || xhGet(d, on) ? `<div class="xh-group-body">${body}</div>` : ''}
    </div>`;
  const lines = part => `
    ${enumSeg(`${part}.arms`, XH_LABELS.arms, 'Layout')}
    ${enumSeg(`${part}.cap`, XH_LABELS.cap, 'Line ends')}
    ${range(`${part}.length`, 'Length')}${range(`${part}.thickness`, 'Thickness')}${range(`${part}.gap`, 'Gap')}${range(`${part}.opacity`, 'Opacity', '%', 0.05)}`;
  const mode = d.colorMode;
  return `
    <div class="page scroll">
      <div class="doc wide">
        <div class="page-head xh-edit-head">
          <div class="xh-title">
            <button class="icon-btn" data-action="nav" data-page="crosshairs" title="Back to Crosshairs">${icon('chevron-left')}</button>
            <div>
              <input class="xh-name" id="xhName" value="${esc(ui.xname || (saved && saved.name) || 'My crosshair')}" maxlength="40" spellcheck="false" aria-label="Crosshair name">
              <p>${saved ? 'Editing a saved crosshair' : 'New crosshair, not saved yet'} · reaches ${XK.extent(d)}px from the centre${XK.isAnimated(d) ? ' · animated' : ''}</p>
            </div>
          </div>
          <div class="xh-edit-actions">
            <button class="btn ghost sm" data-action="xh-copy">${icon('copy')}Copy code</button>
            <button class="btn ghost sm" data-action="xh-save">${icon('save')}${saved ? 'Save changes' : 'Save'}</button>
            ${saved ? '<button class="btn ghost sm" data-action="xh-save-new">Save as new</button>' : ''}
            <button class="btn primary sm" data-action="xh-apply-edit">${icon('target')}Use on screen</button>
          </div>
        </div>
        <div class="xh-editor">
          <section class="xh-preview glass">
            <div class="xh-preview-bar">
              <div class="seg">${XH_SCENES.map(([v, l]) => `<button class="${ui.xscene === v ? 'on' : ''}" data-action="xh-scene" data-val="${v}">${l}</button>`).join('')}</div>
              <div class="seg">${[1, 2, 4, 8].map(z => `<button class="${ui.xzoom === z ? 'on' : ''}" data-action="xh-zoom" data-val="${z}">×${z}</button>`).join('')}</div>
            </div>
            <div class="xh-stage big"><canvas id="xhCanvas"></canvas><span class="xh-tag">${ui.xzoom === 1 ? 'Actual size' : `Zoom ×${ui.xzoom}`}</span></div>
          </section>
          <aside class="xh-inspector glass" id="xhInspector">
            ${group('Style', 'sparkles', null, `
              ${colour('color', mode === 'solid' || mode === 'spectrum' ? 'Colour' : mode === 'twotone' ? 'Inner colour' : 'Centre colour')}
              <div class="xh-swatches">${XH_SWATCHES.map(c => `<button class="xh-dot ${d.color === c ? 'on' : ''}" style="background:${c}" data-action="xh-swatch" data-val="${c}" title="${c}"></button>`).join('')}</div>
              ${enumSeg('colorMode', XH_LABELS.colorMode, 'Colour mode')}
              ${mode === 'twotone' ? colour('color2', 'Outer colour') : mode === 'gradient' ? colour('color2', 'Edge colour') : ''}
              ${mode === 'twotone' ? '<p class="xh-hint">Inner lines and the dot use the inner colour; outer lines, the circle and chevrons use the outer one.</p>' : ''}
              ${mode === 'spectrum' ? '<p class="xh-hint">A full colour wheel around the centre, starting from your colour.</p>' : ''}
              ${range('opacity', 'Opacity', '%', 0.05)}${range('rotation', 'Rotation', '°')}
              ${seg('scale', [1, 2, 3, 4].map(v => [v, `×${v}`]), 'Size (for high-resolution screens)')}
              ${toggle('tstyle', 'T-shape (no top line)')}`)}
            ${group('Animation', 'play', null, `
              ${enumSeg('anim.type', XH_LABELS['anim.type'])}
              ${d.anim.type !== 'none' ? range('anim.speed', 'Speed', '') : '<p class="xh-hint">Pulse fades in and out, Breathe opens the gaps, Spin turns the design and Rainbow cycles the colours.</p>'}`)}
            ${group('Outline', 'box', 'outline.on', `${range('outline.thickness', 'Thickness')}${colour('outline.color', 'Colour')}${range('outline.opacity', 'Opacity', '%', 0.05)}`)}
            ${group('Glow', 'flame', 'glow.on', `${range('glow.strength', 'Strength')}${toggle('glow.custom', 'Own glow colour')}${d.glow.custom ? colour('glow.color', 'Glow colour') : ''}`)}
            ${group('Drop shadow', 'layers', 'shadow.on', `${range('shadow.x', 'Offset X')}${range('shadow.y', 'Offset Y')}${range('shadow.blur', 'Blur')}${colour('shadow.color', 'Colour')}${range('shadow.opacity', 'Opacity', '%', 0.05)}`)}
            ${group('Centre dot', 'target', 'dot.on', `${enumSeg('dot.shape', XH_LABELS['dot.shape'], 'Shape')}${range('dot.size', 'Size')}${range('dot.opacity', 'Opacity', '%', 0.05)}`)}
            ${group('Inner lines', 'plus', 'inner.on', lines('inner'))}
            ${group('Outer lines', 'plus', 'outer.on', lines('outer'))}
            ${group('Circle', 'orbit', 'circle.on', `
              ${enumSeg('circle.style', XH_LABELS['circle.style'], 'Style')}
              ${range('circle.radius', 'Radius')}${range('circle.thickness', 'Thickness')}
              ${d.circle.style === 'dashed' || d.circle.style === 'dots' ? range('circle.segments', d.circle.style === 'dots' ? 'Dots' : 'Dashes', 'auto') : ''}
              ${range('circle.opacity', 'Opacity', '%', 0.05)}`)}
            ${group('Chevron', 'chevron-down', 'chevron.on', `
              ${enumSeg('chevron.style', XH_LABELS['chevron.style'], 'Style')}
              ${enumSeg('chevron.place', XH_LABELS['chevron.place'], 'Placement')}
              ${range('chevron.count', 'Stacked', '')}${range('chevron.size', 'Size')}
              ${d.chevron.style === 'line' ? range('chevron.thickness', 'Thickness') : ''}
              ${range('chevron.gap', 'Gap')}${range('chevron.opacity', 'Opacity', '%', 0.05)}`)}
            <button class="btn ghost sm xh-blank" data-action="xh-blank">${icon('rotate')}Start from scratch</button>
          </aside>
        </div>
      </div>
    </div>`;
}

let xhFrame = 0;
/** Keeps the preview animating while the design shown is animated. */
function xhLoop() {
  if (xhFrame) return;
  const step = now => {
    xhFrame = 0;
    if (ui.page !== 'crosshairs' && ui.page !== 'xeditor') return;
    drawXhPreview(now);
    if (XK.isAnimated(ui.page === 'xeditor' ? xhEdit() : xhActive())) xhFrame = requestAnimationFrame(step);
  };
  xhFrame = requestAnimationFrame(step);
}

/** Draws the preview canvas (Crosshairs hero or the editor) in device pixels, at time t. */
function drawXhPreview(t = performance.now()) {
  const canvas = $('#xhCanvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  const editing = ui.page === 'xeditor';
  xhScene(g, w, h, editing ? ui.xscene : 'game');
  // ×1 is exactly what the overlay draws on a display at this scale.
  XK.render(g, editing ? xhEdit() : xhActive(), Math.floor(w / 2), Math.floor(h / 2), editing ? ui.xzoom : 1, t);
}

async function xhPatch(patch, message) {
  const res = await api.setCrosshair(patch);
  ui.state = res.state;
  if (res.error) toast(res.error, 'error');
  else if (message) toast(message);
  return !res.error;
}
function openXhEditor(design, id = null, name = null) {
  goto('xeditor', { xdesign: XK.normalize(design), xeditId: id, xname: name });
}
let xhOffsetTimer = null;
/** Re-renders the editor, keeping the inspector's scroll position. */
function xhRefresh() {
  const scroller = $('.page.scroll');
  const top = scroller ? scroller.scrollTop : 0;
  renderPage();
  const next = $('.page.scroll');
  if (next) next.scrollTop = top;
}
/** Saves the edited crosshair to My crosshairs (updating it, or as a new one). */
async function xhSaveEdit(asNew) {
  const name = (($('#xhName') && $('#xhName').value) || '').trim().slice(0, 40) || 'My crosshair';
  const design = XK.normalize(xhEdit());
  const list = xhState().saved.slice();
  const i = !asNew && ui.xeditId ? list.findIndex(x => x.id === ui.xeditId) : -1;
  if (i < 0 && list.length >= 100) { toast('You can keep up to 100 crosshairs. Delete one first.', 'error'); return; }
  let id = ui.xeditId;
  if (i >= 0) list[i] = { ...list[i], name, design };
  else { id = `x${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; list.push({ id, name, design }); }
  if (await xhPatch({ saved: list }, i >= 0 ? 'Changes saved' : `Saved to My crosshairs as ${name}`)) {
    ui.xeditId = id;
    ui.xname = name;
    xhRefresh();
  }
}

// Hotkeys ────────────────────────────────────────────────────────────────────
function renderHotkeys() {
  const tile = (ic, title, text, chip) => `
    <div class="tile glass">
      <div class="tile-top"><span class="prow-icon">${icon(ic)}</span>${chip}</div>
      <b>${title}</b>
      <p>${text}</p>
    </div>`;
  return `
    <div class="page scroll">
      <div class="doc">
        <div class="page-head"><div><h1>Hotkeys</h1><p>Work from anywhere, even while another app has focus.</p></div></div>
        ${hotkeyCard('hotkey', 'Summon / turn off', 'Toggles the active animation on the display under your cursor.', 'hotkeyOk', 'zap')}
        ${hotkeyCard('crosshairHotkey', 'Crosshair on / off', 'Shows or hides the crosshair overlay.', 'crossHotkeyOk', 'target')}
        <div class="section-title">While an animation is on screen</div>
        <div class="tiles">
          ${tile('mouse', 'Move the mouse', 'Some animations replace your pointer (the arrow is hidden); others follow it.', '<span class="chip">Pointer</span>')}
          ${tile('flame', 'Flick, slam or overload it', 'Each animation has its own trigger, with its own sound and effect.', '<span class="chip accent">Trigger</span>')}
          ${tile('mouse', 'Click as usual', 'Clicks pass straight through to the app underneath; they never dismiss the animation.', '<span class="chip">Click-through</span>')}
          ${tile('tray', 'Click the tray icon', 'Toggles the animation on and off, then returns focus to the app you were using.', '<span class="chip">Toggle</span>')}
        </div>
      </div>
    </div>`;
}

function acceleratorFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push(isMac() ? 'CommandOrControl' : 'Super');
  const code = e.code;
  let key = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (/^Numpad\d$/.test(code)) key = `num${code.slice(6)}`;
  else {
    key = {
      Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete',
    }[code] || null;
  }
  if (!key) return null;
  const unique = [...new Set(mods)];
  if (!unique.length && !/^F\d/.test(key)) return null; // bare keys would hijack typing
  return [...unique, key].join('+');
}

async function setRecording(on) {
  ui.recording = on;
  await api.suspendHotkey(on);
  renderPage();
}

// History ────────────────────────────────────────────────────────────────────
function renderHistory() {
  const { stats } = ui.state;
  const day = d => d.toISOString().slice(0, 10);
  const today = stats.byDay[day(new Date())] || 0;
  let week = 0;
  for (let i = 0; i < 7; i++) week += stats.byDay[day(new Date(Date.now() - i * 86400000))] || 0;
  const [topId, topCount] = Object.entries(stats.byId).sort((a, b) => b[1] - a[1])[0] || [];
  const top = topId && animById(topId);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rows = stats.log.map(entry => {
    const a = animById(entry.id);
    return `
      <tr>
        <td class="t">${esc(fmt.format(new Date(entry.t)))}</td>
        <td><div class="anim-cell">${a && a.thumbnailUrl ? `<img src="${esc(a.thumbnailUrl)}" alt="">` : ''}${esc(a ? a.name : entry.id)}</div></td>
      </tr>`;
  }).join('');
  return `
    <div class="page scroll">
      <div class="doc">
        <div class="page-head">
          <div>
            <h1>History</h1>
            <p>Every crack, logged. When the robots take over, we'll know who was nice.</p>
          </div>
          ${stats.log.length ? `<button class="btn ghost" data-action="clear-history">${icon('trash')}Clear history</button>` : ''}
        </div>
        <div class="tiles">
          <div class="stat glass accent"><small>All time</small><strong>${num(stats.total)}</strong><span>cracks delivered</span></div>
          <div class="stat glass"><small>Today</small><strong>${num(today)}</strong><span>${num(week)} in the last 7 days</span></div>
          <div class="stat glass"><small>Most used</small><strong>${top ? esc(top.name) : '—'}</strong><span>${top ? plural(topCount, 'crack') : 'Nothing yet'}</span></div>
        </div>
        ${stats.log.length
          ? `<div class="section-title">Recent activity<span class="n">last ${num(stats.log.length)}</span></div>
             <section class="panel glass"><table class="log"><thead><tr><th>When</th><th>Animation</th></tr></thead><tbody>${rows}</tbody></table></section>`
          : `<section class="glass">${emptyState('clock', 'No cracks yet', 'Summon an animation and flick it to fill this up.', `<button class="btn primary" data-action="summon">${icon('zap')}Summon now</button>`)}</section>`}
      </div>
    </div>`;
}

// Settings ───────────────────────────────────────────────────────────────────
/** The Updates panel in Settings (also refreshed in place as an update progresses). */
function updatePanelBody() {
  const u = ui.state.update || { supported: false, status: 'idle' };
  const v = ui.state.version;
  if (!u.supported) {
    return `
      <div class="panel-title">Updates</div>
      <div class="prow">
        <span class="prow-icon">${icon('download')}</span>
        <div class="prow-text"><b>Cursora ${esc(v)}</b><span>This copy doesn't update itself (it is the portable app or a development copy). The installed app keeps itself up to date.</span></div>
      </div>`;
  }
  const status = {
    idle: 'Checks for new versions automatically.',
    checking: 'Checking for updates…',
    none: "You're up to date.",
    available: `Cursora ${esc(u.version)} is available.`,
    downloading: `Downloading Cursora ${esc(u.version || '')}… ${u.percent}%`,
    ready: `Cursora ${esc(u.version)} is ready. Restart to install it.`,
    error: `Couldn't update: ${esc(u.error || 'unknown error')}`,
  }[u.status] || '';
  const button = u.status === 'ready' ? `<button class="btn primary sm" data-action="update-install">${icon('refresh')}Restart to update</button>`
    : u.status === 'available' ? `<button class="btn primary sm" data-action="update-download">${icon('download')}Download</button>`
      : `<button class="btn ghost sm" data-action="update-check" ${u.status === 'checking' || u.status === 'downloading' ? 'disabled' : ''}>${icon('refresh')}Check for updates</button>`;
  return `
    <div class="panel-title">Updates</div>
    <div class="prow">
      <span class="prow-icon">${icon('download')}</span>
      <div class="prow-text"><b>Cursora ${esc(v)}</b><span class="update-status ${u.status === 'error' ? 'err' : ''}">${status}</span>
        ${u.status === 'downloading' ? `<div class="update-bar"><i style="width:${u.percent}%"></i></div>` : ''}</div>
      ${button}
    </div>
    <div class="prow">
      <span class="prow-icon">${icon('refresh')}</span>
      <div class="prow-text"><b>Update automatically</b><span>Download new versions in the background and install them when Cursora restarts.</span></div>
      <label class="switch"><input type="checkbox" data-pref="autoUpdate" ${ui.state.prefs.autoUpdate ? 'checked' : ''}><span></span></label>
    </div>`;
}

/** Shows the notes of the version that was just installed, once. */
let whatsNewShown = false;
function showWhatsNew() {
  const n = ui.state.whatsNew;
  if (!n || whatsNewShown) return;
  whatsNewShown = true;
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal whats-new" role="dialog" aria-modal="true" aria-labelledby="wnTitle">
        <div class="wn-head"><span class="prow-icon">${icon('sparkles')}</span><div><small>What's new</small><h3 id="wnTitle">Cursora ${esc(n.version)}</h3></div></div>
        <div class="wn-body">${n.text ? esc(n.text) : 'Cursora was updated to the latest version.'}</div>
        <div class="modal-actions"><button class="btn primary" data-wn="ok">Got it</button></div>
      </div>
    </div>`;
  root.querySelector('[data-wn="ok"]').addEventListener('click', async () => {
    root.innerHTML = '';
    ui.state = await api.dismissWhatsNew();
  });
}

function renderSettings() {
  const p = ui.state.prefs;
  const toggleRow = (ic, key, title, text, disabled = false) => `
    <div class="prow ${disabled ? 'disabled-block' : ''}">
      <span class="prow-icon">${icon(ic)}</span>
      <div class="prow-text"><b>${title}</b><span>${text}</span></div>
      <label class="switch"><input type="checkbox" data-pref="${key}" ${p[key] ? 'checked' : ''}><span></span></label>
    </div>`;
  const themeBtn = (id, ic, label) => `<button class="${p.theme === id ? 'on' : ''}" data-action="theme" data-id="${id}">${icon(ic)}${label}</button>`;
  const startup = ui.state.platform !== 'linux';
  return `
    <div class="page scroll">
      <div class="doc">
        <div class="page-head"><div><h1>Settings</h1><p>How Cursora looks and behaves on your desktop.</p></div></div>
        <section class="panel glass">
          <div class="panel-title">Appearance</div>
          <div class="prow">
            <span class="prow-icon">${icon('sun')}</span>
            <div class="prow-text"><b>Theme</b><span>System follows your Windows setting.</span></div>
            <div class="seg">${themeBtn('system', 'monitor', 'System')}${themeBtn('dark', 'moon', 'Dark')}${themeBtn('light', 'sun', 'Light')}</div>
          </div>
          ${toggleRow('volume', 'uiSounds', 'Interface sounds', 'Soft sounds when you hover, click and choose options in this window.')}
        </section>
        <section class="panel glass">
          <div class="panel-title">General</div>
          ${startup ? toggleRow('power', 'launchAtStartup', 'Launch at startup', 'Start Cursora when you sign in.') : ''}
          ${startup ? toggleRow('tray', 'startHidden', 'Start in the tray', 'When launched at startup, stay in the tray instead of opening this window.', !p.launchAtStartup) : ''}
          ${toggleRow('x', 'closeToTray', 'Close to tray', 'Closing the window keeps Cursora running so the hotkey and tray icon still work.')}
        </section>
        <section class="panel glass">
          <div class="panel-title">Overlay</div>
          ${toggleRow('terminal', 'minimizeOnSummon', 'Minimize when summoning from here', 'Gets this window out of the way so you can see the animation.')}
          ${toggleRow('monitor', 'followCursor', 'Follow the cursor across displays', 'Summon on the monitor your mouse is on, instead of the primary one.')}
        </section>
        <section class="panel glass" id="updatePanel">${updatePanelBody()}</section>
        <section class="panel glass">
          <div class="panel-title">Data</div>
          <div class="prow">
            <span class="prow-icon">${icon('folder')}</span>
            <div class="prow-text"><b>App data</b><span>Your settings and history live here.</span></div>
            <button class="btn ghost sm" data-action="open-data">${icon('external')}Open</button>
          </div>
          <div class="prow">
            <span class="prow-icon">${icon('trash')}</span>
            <div class="prow-text"><b>Clear history</b><span>Resets the crack counter and log.</span></div>
            <button class="btn danger sm" data-action="clear-history">Clear</button>
          </div>
        </section>
        <section class="panel glass">
          <div class="prow">
            <span class="prow-icon">${icon('mouse')}</span>
            <div class="prow-text"><b>Cursora ${esc(ui.state.version)}</b><span>MIT licensed · Electron ${esc(navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || '')}</span></div>
            <button class="btn ghost sm" data-action="external" data-url="${GITHUB_URL}">${icon('github')}GitHub</button>
          </div>
        </section>
      </div>
    </div>`;
}

// Help ───────────────────────────────────────────────────────────────────────
function renderHelp() {
  const hk = ui.state.prefs.hotkey;
  const faq = [
    ['Can I add my own whips?', 'No. The whip collection is curated by the Cursora maintainers, and new whips arrive with app updates. You can fully restyle any whip in the Studio.'],
  ];
  return `
    <div class="page scroll">
      <div class="doc">
        <div class="page-head"><div><h1>Help</h1><p>Three steps to bring your pointer to life.</p></div></div>
        <div class="help-grid">
          <div class="step glass"><span class="step-num">1</span><b>Pick an animation</b><p>Choose one in Animations and make it active.</p></div>
          <div class="step glass"><span class="step-num">2</span><b>Summon</b><p>Press ${keys(hk)} or click the tray icon.</p></div>
          <div class="step glass"><span class="step-num">3</span><b>Play with it</b><p>Move the mouse to set it off. Press the hotkey again when you're done.</p></div>
        </div>
        <section class="panel glass faq">
          ${faq.map(([q, a]) => `<details><summary>${esc(q)}${icon('chevron-right')}</summary><p>${esc(a)}</p></details>`).join('')}
        </section>
        <section class="panel glass">
          <div class="prow">
            <span class="prow-icon">${icon('discord')}</span>
            <div class="prow-text"><b>Found a bug?</b><span>Open a technical support ticket on our Discord server.</span></div>
            <button class="btn ghost sm" data-action="external" data-url="${SUPPORT_URL}">${icon('external')}Report</button>
          </div>
        </section>
      </div>
    </div>`;
}

// ── Events ──────────────────────────────────────────────────────────────────
function goto(page, extra = {}) {
  Object.assign(ui, { page }, extra);
  if (ui.recording) setRecording(false);
  if (page === 'studio') ui.pgCracks = 0;
  $('#activeMenu').hidden = true;
  render();
}

async function handleResult(res, okMessage) {
  ui.state = res.state;
  if (res.error) toast(res.error, 'error');
  else if (okMessage) toast(okMessage);
  render();
}

/**
 * Re-render the library below the hero. The hero (and its live preview) is only
 * rebuilt when it appears or disappears; scroll position is kept either way.
 */
function refreshLibrary() {
  const scroller = $('#libScroll');
  const body = $('#libBody');
  if (!scroller || !body || showHero() !== !!$('#heroFrame')) {
    renderPage();
    return;
  }
  const top = scroller.scrollTop;
  body.innerHTML = renderLibraryBody();
  scroller.scrollTop = top;
}

const actions = {
  nav: el => goto(el.dataset.page, el.dataset.page === 'studio' ? { studioId: ui.state.activeId } : {}),
  category: el => { ui.category = el.dataset.id; refreshLibrary(); },
  'open-studio': el => goto('studio', { studioId: el.dataset.id }),
  win: el => api.windowControl(el.dataset.win),
  external: el => api.openExternal(el.dataset.url),
  'active-menu': () => {
    const menu = $('#activeMenu');
    if (menu.hidden) renderActiveMenu();
    menu.hidden = !menu.hidden;
  },
  'pick-active': async el => {
    $('#activeMenu').hidden = true;
    ui.state = await api.activate(el.dataset.id);
    toast(`${animById(el.dataset.id).name} is now active`);
    render();
  },
  summon: async () => { ui.state = await api.summon(); render(); },
  'summon-id': async el => { ui.state = await api.summon(el.dataset.id); render(); },
  activate: async el => {
    ui.state = await api.activate(el.dataset.id);
    toast(`${animById(el.dataset.id).name} is now active`);
    render();
  },
  favorite: async el => {
    ui.state = await api.toggleFavorite(el.dataset.id);
    if (ui.page === 'library') { renderChrome(); refreshLibrary(); } else render();
  },
  theme: async el => {
    const res = await api.setPrefs({ theme: el.dataset.id });
    ui.state = res.state;
    applyTheme();
    renderPage();
  },
  'open-data': () => api.openDataFolder(),
  'reset-settings': async el => {
    ui.state = await api.resetSettings(el.dataset.id);
    toast('Defaults restored');
    renderPage();
  },
  'pg-respawn': () => spawnPreview(),
  'update-check': async () => { ui.state.update = await api.checkUpdates(); refreshUpdateUI(); },
  'update-download': async () => { ui.state.update = await api.downloadUpdate(); refreshUpdateUI(); },
  'update-install': () => api.installUpdate(),
  'xh-apply': el => {
    const p = XK.PRESETS.find(x => x.id === el.dataset.id);
    if (p) xhPatch({ design: XK.normalize(p.design) }, `${p.name} is now your crosshair`).then(xhRefresh);
  },
  'xh-apply-saved': el => {
    const x = xhState().saved.find(v => v.id === el.dataset.id);
    if (x) xhPatch({ design: XK.normalize(x.design) }, `${x.name} is now your crosshair`).then(xhRefresh);
  },
  'xh-edit-active': () => openXhEditor(xhActive()),
  'xh-edit-preset': el => { const p = XK.PRESETS.find(x => x.id === el.dataset.id); if (p) openXhEditor(p.design, null, p.name); },
  'xh-edit-saved': el => { const x = xhState().saved.find(v => v.id === el.dataset.id); if (x) openXhEditor(x.design, x.id, x.name); },
  'xh-copy-saved': async el => {
    const x = xhState().saved.find(v => v.id === el.dataset.id);
    if (x) { await api.copyText(XK.encode(x.design)); toast('Code copied'); }
  },
  'xh-delete': async el => {
    const x = xhState().saved.find(v => v.id === el.dataset.id);
    if (!x) return;
    const ok = await confirmDialog({ title: `Delete ${x.name}?`, body: 'It is removed from My crosshairs. The crosshair on screen stays as it is.', confirm: 'Delete', danger: true });
    if (ok && await xhPatch({ saved: xhState().saved.filter(v => v.id !== x.id) }, 'Crosshair deleted')) xhRefresh();
  },
  'xh-center': () => xhPatch({ offsetX: 0, offsetY: 0 }, 'Crosshair re-centred').then(xhRefresh),
  'xh-paste': async () => {
    const text = await api.readText();
    const input = $('#xhImport');
    if (input) { input.value = String(text || '').trim(); input.focus(); }
  },
  'xh-import': () => {
    const d = XK.decode($('#xhImport') ? $('#xhImport').value : '');
    if (!d) { toast('That is not a valid crosshair code', 'error'); return; }
    openXhEditor(d, null, 'Imported crosshair');
    toast('Code imported. Save it or use it on screen');
  },
  'xh-tag': el => { ui.xhTag = el.dataset.id; xhRefresh(); },
  'xh-scene': el => { ui.xscene = el.dataset.val; xhRefresh(); },
  'xh-zoom': el => { ui.xzoom = Number(el.dataset.val); xhRefresh(); },
  'xh-seg': el => { xhSet(xhEdit(), el.dataset.key, el.dataset.val); ui.xdesign = XK.normalize(ui.xdesign); xhRefresh(); },
  'xh-swatch': el => { xhEdit().color = el.dataset.val; ui.xdesign = XK.normalize(ui.xdesign); xhRefresh(); },
  'xh-blank': () => {
    ui.xdesign = XK.normalize({ outline: { on: false }, inner: { on: true, length: 5, thickness: 2, gap: 3 } });
    ui.xeditId = null;
    ui.xname = 'My crosshair';
    xhRefresh();
    toast('Blank canvas: build your crosshair up from here');
  },
  'xh-copy': async () => { await api.copyText(XK.encode(xhEdit())); toast('Code copied. Paste it on the Crosshairs page to import it'); },
  'xh-apply-edit': () => xhPatch({ design: XK.normalize(xhEdit()) },
    xhState().enabled ? 'Now on screen' : 'Set as your crosshair. Turn it on from the Crosshairs page or with its hotkey'),
  'xh-save': () => xhSaveEdit(false),
  'xh-save-new': () => xhSaveEdit(true),
  'record-xhotkey': () => setRecording(ui.recording ? false : 'crosshairHotkey'),
  'clear-xhotkey': async () => handleResult(await api.setPrefs({ crosshairHotkey: '' }), 'Crosshair hotkey removed'),
  'cur-shape': el => { Object.assign(curDesign(), { shape: el.dataset.id, pack: null }); cursorChanged(); },
  'cur-finish': el => { Object.assign(curDesign(), { finish: el.dataset.id, pack: null }); cursorChanged(); },
  'cur-color': el => { Object.assign(curDesign(), { color: el.dataset.id, pack: null }); cursorChanged(); },
  'cur-pack': el => {
    const p = CK.PACKS.find(x => x.id === el.dataset.id);
    if (!p) return;
    curDesign().pack = p.id;
    cursorChanged();
    toast(`${p.name} pack applied`);
  },
  'cur-filltab': el => { ui.curFill = el.dataset.id; cursorChanged({ save: false }); },
  'cur-preset': el => {
    const p = CK.PRESETS.find(x => x.id === el.dataset.id);
    if (!p) return;
    Object.assign(curDesign(), p.design, { pack: null });
    ui.curFill = fillTabOf(p.design.color);
    cursorChanged();
    toast(`${p.name} applied`);
  },
  'cur-reset': () => { ui.cursor = CK.normalize(CK.DEFAULT_DESIGN); ui.curFill = 'colors'; cursorChanged(); toast('Default design restored'); },
  'record-hotkey': () => setRecording(ui.recording ? false : 'hotkey'),
  'clear-hotkey': async () => handleResult(await api.setPrefs({ hotkey: '' }), 'Hotkey removed'),
  'clear-history': async () => {
    const ok = await confirmDialog({ title: 'Clear history?', body: 'This resets the crack counter and deletes the log. It can’t be undone.', confirm: 'Clear history', danger: true });
    if (!ok) return;
    ui.state = await api.clearHistory();
    toast('History cleared');
    render();
  },
};

document.addEventListener('click', e => {
  if (!e.target.closest('.active-select')) $('#activeMenu').hidden = true;
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  actions[el.dataset.action](el);
});

document.addEventListener('keydown', e => {
  if (ui.recording) {
    e.preventDefault();
    if (e.key === 'Escape') { setRecording(false); return; }
    const accel = acceleratorFromEvent(e);
    if (!accel) return;
    const pref = ui.recording;
    ui.recording = false;
    api.setPrefs({ [pref]: accel }).then(async res => {
      await api.suspendHotkey(false);
      handleResult(res, !res.error && `${pref === 'hotkey' ? 'Hotkey' : 'Crosshair hotkey'} set to ${keyLabels(accel).join('+')}`);
    });
    return;
  }
  if (e.key === 'Escape') $('#activeMenu').hidden = true;
  const cardEl = e.target.closest('.card[data-action], .xh-card[data-action]');
  if (cardEl && (e.key === 'Enter' || e.key === ' ') && e.target === cardEl) {
    e.preventDefault();
    cardEl.click();
  }
});

let searchTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') {
    ui.query = t.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      refreshLibrary();
      const input = $('#search');
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }, 160);
    return;
  }
  if (t.id === 'xhName') { ui.xname = t.value; return; }
  if (t.dataset.xk && t.type === 'range') {
    const path = t.dataset.xk;
    xhSet(xhEdit(), path, Number(t.value));
    ui.xdesign = XK.normalize(ui.xdesign);
    const v = xhGet(ui.xdesign, path), [lo, hi] = XK.RANGES[path];
    t.style.setProperty('--p', `${((v - lo) / (hi - lo)) * 100}%`);
    const out = $(`#xo-${path.replace('.', '-')}`);
    if (out) out.textContent = xhFmt(v, t.dataset.unit);
    drawXhPreview();
    xhLoop();
    return;
  }
  if (t.dataset.xk && t.type === 'color') {
    xhSet(xhEdit(), t.dataset.xk, t.value);
    ui.xdesign = XK.normalize(ui.xdesign);
    const sw = t.closest('.xh-color');
    sw.querySelector('i').style.background = t.value;
    sw.querySelector('code').textContent = t.value;
    drawXhPreview();
    xhLoop();
    return;
  }
  if (t.dataset.xhoff) {
    const k = t.dataset.xhoff, v = Number(t.value);
    t.style.setProperty('--p', `${((v + XH_OFFSET) / (2 * XH_OFFSET)) * 100}%`);
    $(`#xho-${k}`).textContent = `${v}px`;
    clearTimeout(xhOffsetTimer);
    xhOffsetTimer = setTimeout(() => xhPatch({ [k]: v }), 120);
    return;
  }
  if (t.id === 'curSize') {
    curDesign().size = Number(t.value);
    t.style.setProperty('--p', `${((t.value - CK.SIZES.min) / (CK.SIZES.max - CK.SIZES.min)) * 100}%`);
    $('#curSizeOut').textContent = `${t.value}px`;
    cursorChanged({ full: false });
    return;
  }
  if (t.id === 'curCustom') {
    // Live while the picker is open; the full editor refreshes on 'change'.
    Object.assign(curDesign(), { color: 'custom', custom: t.value, pack: null });
    const dot = t.closest('.swatch-dot');
    if (dot) dot.style.background = t.value;
    cursorChanged({ full: false });
    return;
  }
  if (t.dataset.setting) {
    const a = animById(ui.studioId);
    const s = a && a.settings.find(x => x.key === t.dataset.setting);
    if (!s) return;
    let value = t.value;
    if (s.type === 'range') {
      value = Number(t.value);
      t.style.setProperty('--p', rangePct(s, value));
      const out = $(`#o-${CSS.escape(s.key)}`);
      if (out) out.textContent = fmtSetting(s, value);
    } else if (s.type === 'toggle') {
      value = t.checked;
    } else if (s.type === 'color') {
      const sw = t.closest('.swatch');
      sw.querySelector('i').style.background = value;
      sw.querySelector('code').textContent = value;
    }
    a.values[s.key] = value;
    postPreview('settings', a.values);
    queueSetting(a.id, s.key, value);
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'sortSelect') { ui.sort = t.value; refreshLibrary(); return; }
  if (t.id === 'curEnabled') { saveCursor({ enabled: t.checked }); return; }
  if (t.id === 'xhEnabled') { xhPatch({ enabled: t.checked }, t.checked ? 'Crosshair on' : 'Crosshair off').then(xhRefresh); return; }
  if (t.dataset.xk && t.type === 'checkbox') { xhSet(xhEdit(), t.dataset.xk, t.checked); ui.xdesign = XK.normalize(ui.xdesign); xhRefresh(); return; }
  if (t.dataset.xk && t.type === 'color') { xhRefresh(); return; }
  if (t.id === 'curShadow') { curDesign().shadow = t.checked; cursorChanged(); return; }
  if (t.id === 'curCustom') { cursorChanged(); return; }
  if (t.id === 'curSize') { cursorChanged(); return; }
  if (t.dataset.pref) {
    const res = await api.setPrefs({ [t.dataset.pref]: t.checked });
    ui.state = res.state;
    if (res.error) toast(res.error, 'error');
    renderPage();
  }
});

// ── Interface sounds ────────────────────────────────────────────────────────
// Hover ticks on anything clickable; clicks tap; choosing an option (filters,
// menus, switches, dropdowns, themes, FAQ entries) chimes instead.
const SOUND_TARGETS = 'button, [data-action], select, .switch, summary, .swatch';
const CHOOSE_ACTIONS = new Set(['category', 'pick-active', 'activate', 'favorite', 'theme', 'cur-shape', 'cur-finish', 'cur-color', 'cur-preset', 'cur-filltab', 'cur-pack', 'xh-apply', 'xh-apply-saved', 'xh-seg', 'xh-scene', 'xh-zoom', 'xh-swatch', 'xh-tag']);
const soundTarget = node => {
  const el = node instanceof Element ? node.closest(SOUND_TARGETS) : null;
  return el && !el.disabled && !el.closest('.disabled-block') ? el : null;
};

let hoveredEl = null;
let moveX = NaN, moveY = NaN;
document.addEventListener('pointermove', e => { moveX = e.clientX; moveY = e.clientY; }, { passive: true });
document.addEventListener('pointerover', e => {
  const el = soundTarget(e.target);
  if (el === hoveredEl) return;
  hoveredEl = el;
  // A re-render can put a new element under a pointer that has not moved
  // (the event then carries the last move position); that is not a hover.
  const still = e.clientX === moveX && e.clientY === moveY;
  if (el && !still) UISound.hover();
});

document.addEventListener('click', e => {
  const el = soundTarget(e.target);
  // Switches and dropdowns chime from their change event instead.
  if (!el || el.closest('.switch') || el.matches('select')) return;
  if (el.matches('summary')) { UISound.choose(!el.parentElement.open); return; }
  const action = el.dataset.action;
  if (action === 'favorite') UISound.choose(!ui.state.favorites.includes(el.dataset.id));
  else if (CHOOSE_ACTIONS.has(action)) UISound.choose(true);
  else UISound.click();
}, true);

document.addEventListener('change', e => {
  const t = e.target;
  if (!soundTarget(t)) return;
  if (t.dataset.pref === 'uiSounds') {
    // Turning sounds on confirms with the chime; turning them off plays it last.
    if (t.checked) UISound.setEnabled(true);
    UISound.choose(t.checked);
    if (!t.checked) UISound.setEnabled(false);
    return;
  }
  if (t.matches('input[type="checkbox"]')) UISound.choose(t.checked);
  else if (t.matches('select')) UISound.choose(true);
}, true);

window.addEventListener('resize', () => { if (ui.page === 'crosshairs' || ui.page === 'xeditor') drawXhPreview(); });

/** Refreshes the update chip and, on Settings, the Updates panel, without re-rendering the page. */
function refreshUpdateUI() {
  renderChrome();
  const panel = $('#updatePanel');
  if (panel) panel.innerHTML = updatePanelBody();
}

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  hydrateIcons();
  ui.state = await api.getState();
  applyTheme();
  UISound.setEnabled(ui.state.prefs.uiSounds !== false);
  ui.studioId = ui.state.activeId;
  document.body.dataset.platform = ui.state.platform;

  api.on('overlay:state', active => {
    ui.state.overlayActive = active;
    renderChrome();
    // Update the hero in place, so its live preview keeps running.
    const status = $('#heroStatus');
    if (status) status.innerHTML = active ? '<span class="live">On screen now</span>' : 'Active animation';
    const btn = $('#heroSummon');
    if (btn) btn.innerHTML = `${icon('zap')}${active ? 'Turn off' : 'Summon now'}`;
  });
  api.on('stats', stats => {
    ui.state.stats = stats;
    renderChrome();
    const meter = $('.crack-meter');
    meter.classList.remove('bump'); void meter.offsetWidth; meter.classList.add('bump');
    if (ui.page === 'history') renderPage();
  });
  api.on('state', state => { ui.state = state; applyTheme(); render(); });
  api.on('window:maximized', max => document.body.classList.toggle('maximized', max));
  api.on('update', u => {
    const before = ui.state.update && ui.state.update.status;
    ui.state.update = u;
    refreshUpdateUI();
    if (u.status === 'ready' && before !== 'ready') toast(`Cursora ${u.version} is ready. Restart to install it`);
  });

  render();
  showWhatsNew();
}

boot();
