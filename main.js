const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, screen, globalShortcut, shell, clipboard, safeStorage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const http = require('http');
const { execFile } = require('child_process');

// ── Win32 FFI (Windows only) ────────────────────────────────────────────────
let keybd_event, CreateCursor, SetSystemCursor, SystemParametersInfoW, LoadImageW;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    keybd_event = user32.func('void __stdcall keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    CreateCursor = user32.func('void* __stdcall CreateCursor(void* hInst, int xHotSpot, int yHotSpot, int nWidth, int nHeight, const uint8_t* pvANDPlane, const uint8_t* pvXORPlane)');
    SetSystemCursor = user32.func('int __stdcall SetSystemCursor(void* hcur, uint32_t id)');
    SystemParametersInfoW = user32.func('int __stdcall SystemParametersInfoW(uint32_t uiAction, uint32_t uiParam, void* pvParam, uint32_t fWinIni)');
    LoadImageW = user32.func('void* __stdcall LoadImageW(void* hInst, str16 name, uint32_t type, int cx, int cy, uint32_t fuLoad)');
  } catch (e) {
    console.warn('koffi not available – pointer hiding and tray refocus disabled', e.message);
  }
}

// ── Globals ─────────────────────────────────────────────────────────────────
let tray, overlay, mainWindow;
let overlayReady = false;
let overlayAnimId = null;
let pendingSpawn = null;
let overlayLeaving = false;   // dismissed, playing its exit before it hides
let overlayDisplayId = null;
let overlayBounds = null;
let cursorTimer = null;
let isQuitting = false;
let animations = new Map();
let config;

const VK_MENU    = 0x12; // Alt
const VK_TAB     = 0x09;
const KEYUP      = 0x0002;

// Animations ship with the app and are managed by its maintainers only; there is
// deliberately no user folder and no import path.
const ANIM_DIR = path.join(__dirname, 'animations');
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const startHidden = process.argv.includes('--hidden');

/** One Alt+Tab / Cmd+Tab so focus returns to the previously active app after tray click. */
function refocusPreviousApp() {
  const delayMs = 80;
  const run = () => {
    if (process.platform === 'win32') {
      if (!keybd_event) return;
      keybd_event(VK_MENU, 0, 0, 0);
      keybd_event(VK_TAB, 0, 0, 0);
      keybd_event(VK_TAB, 0, KEYUP, 0);
      keybd_event(VK_MENU, 0, KEYUP, 0);
    } else if (process.platform === 'darwin') {
      const script = [
        'tell application "System Events"',
        '  key down command',
        '  key code 48', // Tab
        '  key up command',
        'end tell',
      ].join('\n');
      execFile('osascript', ['-e', script], err => {
        if (err) {
          console.warn('refocus previous app (Cmd+Tab) failed:', err.message);
        }
      });
    } else if (process.platform === 'linux') {
      execFile('xdotool', ['key', '--clearmodifiers', 'alt+Tab'], err => {
        if (err) {
          console.warn('refocus previous app (Alt+Tab) failed. Install xdotool:', err.message);
        }
      });
    }
  };
  setTimeout(run, delayMs);
}

function createTrayIconFallback() {
  const p = path.join(__dirname, 'icon', 'Template.png');
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      if (process.platform === 'darwin') img.setTemplateImage(true);
      return img;
    }
  }
  console.warn('cursora: icon/Template.png missing or invalid');
  return nativeImage.createEmpty();
}

async function tryIcnsTrayImage(icnsPath) {
  const size = { width: 64, height: 64 };
  const thumb = await nativeImage.createThumbnailFromPath(icnsPath, size);
  if (!thumb.isEmpty()) return thumb;
  return null;
}

// macOS: createFromPath does not decode .icns (Electron only loads PNG/JPEG there, ICO on Windows).
// Quick Look thumbnails handle .icns; copy to temp if the file is inside ASAR (QL needs a real path).
async function getTrayIcon() {
  const iconDir = path.join(__dirname, 'icon');
  if (process.platform === 'win32') {
    const file = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) return img;
    }
    return createTrayIconFallback();
  }
  if (process.platform === 'darwin') {
    const file = path.join(iconDir, 'AppIcon.icns');
    if (fs.existsSync(file)) {
      const fromPath = nativeImage.createFromPath(file);
      if (!fromPath.isEmpty()) return fromPath;
      try {
        const t = await tryIcnsTrayImage(file);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns Quick Look thumbnail failed:', e?.message || e);
      }
      const tmp = path.join(os.tmpdir(), 'cursora-tray.icns');
      try {
        fs.copyFileSync(file, tmp);
        const t = await tryIcnsTrayImage(tmp);
        if (t) return t;
      } catch (e) {
        console.warn('AppIcon.icns temp copy + thumbnail failed:', e?.message || e);
      }
    }
    return createTrayIconFallback();
  }
  return createTrayIconFallback();
}

// ── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_PREFS = {
  hotkey: 'CommandOrControl+Alt+W',
  launchAtStartup: false,
  startHidden: true,
  closeToTray: true,
  minimizeOnSummon: true,
  followCursor: true,
  uiSounds: true,
  theme: 'system',
  crosshairHotkey: 'CommandOrControl+Alt+X',
  autoUpdate: true,
};
const THEMES = ['system', 'dark', 'light'];

/** Window background for the current theme, so the window never flashes the wrong colour. */
const themeBackground = () => {
  const t = config && config.prefs.theme;
  const dark = t === 'dark' || (t !== 'light' && nativeTheme.shouldUseDarkColors);
  return dark ? '#0b0c10' : '#f3f4f7';
};

function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    // first run or unreadable config – start fresh
  }
  return {
    activeId: raw.activeId || 'whip',
    prefs: (p => (THEMES.includes(p.theme) ? p : { ...p, theme: DEFAULT_PREFS.theme }))({ ...DEFAULT_PREFS, ...(raw.prefs || {}) }),
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    recent: Array.isArray(raw.recent) ? raw.recent : [],
    settings: raw.settings || {},
    stats: { total: 0, byId: {}, byDay: {}, log: [], ...(raw.stats || {}) },
    crosshair: sanitizeCrosshair(raw.crosshair),
    updates: { notes: validNotes(raw.updates && raw.updates.notes) },
    // Custom Windows cursors: the design is owned by the app window (cursors.js);
    // the generated .cur files live in userData/cursors.
    cursor: {
      enabled: !!(raw.cursor && raw.cursor.enabled),
      design: raw.cursor && raw.cursor.design && typeof raw.cursor.design === 'object' ? raw.cursor.design : null,
    },
  };
}

// ── Migration from the OpenWhip name ────────────────────────────────────────
const APP_ID = 'com.cursora.app';                 // matches appId in scripts/build-win.js
const LEGACY_NAME = 'OpenWhip';                   // old product name = old userData folder
const LEGACY_APP_ID = 'com.openwhip.app';         // old startup (Run) registry value name

/**
 * First run as Cursora: copy config.json over from the OpenWhip data folder.
 * The old folder is left untouched. Returns the copied config's prefs, or null.
 */
function migrateLegacyConfig() {
  const legacy = path.join(app.getPath('appData'), LEGACY_NAME, 'config.json');
  if (path.resolve(legacy) === path.resolve(configPath())) return null;
  if (fs.existsSync(configPath()) || !fs.existsSync(legacy)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(legacy, 'utf8'));
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.copyFileSync(legacy, configPath(), fs.constants.COPYFILE_EXCL);
    return raw.prefs || {};
  } catch (e) {
    console.warn('cursora: could not carry over OpenWhip settings:', e.message);
    return null;
  }
}

/** Launch-at-startup pointed at the OpenWhip executable: move it to Cursora. */
function migrateLoginItem(legacyPrefs) {
  if (!legacyPrefs || !legacyPrefs.launchAtStartup || process.platform === 'linux') return;
  try {
    if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: false, name: LEGACY_APP_ID });
    applyLoginItem();
  } catch (e) {
    console.warn('cursora: could not move the startup entry:', e.message);
  }
}

// ── Crosshair ───────────────────────────────────────────────────────────────
// The design itself is validated and drawn by app/crosshairs.js; here it is only
// stored, size-limited and handed to the overlay.
const CrosshairKit = require('./app/crosshairs.js');
const XHAIR_WINDOW = 420;   // overlay window, DIP square; grows for designs that reach further
const smallObject = v => v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length <= 4000;
const shortText = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const clampInt = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : 0);
/** Saved release notes ({ version, text }) for the What's New window, or null. */
function validNotes(n) {
  return n && typeof n === 'object' && typeof n.version === 'string' && n.version.length <= 40 && typeof n.text === 'string'
    ? { version: n.version, text: n.text.slice(0, 4000) } : null;
}
function sanitizeCrosshair(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: !!r.enabled,
    design: smallObject(r.design) ? r.design : null,
    offsetX: clampInt(r.offsetX, -2000, 2000),
    offsetY: clampInt(r.offsetY, -2000, 2000),
    saved: (Array.isArray(r.saved) ? r.saved : []).filter(x => x && smallObject(x.design) && typeof x.id === 'string').slice(0, 100)
      .map(x => ({ id: shortText(x.id, 40), name: shortText(x.name, 40) || 'Untitled', design: x.design })),
  };
}

let saveTimer = null;
function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushConfig, 300);
}

function flushConfig() {
  clearTimeout(saveTimer);
  if (!config) return;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) {
    console.warn('cursora: could not save config:', e.message);
  }
}

// ── Animation registry ──────────────────────────────────────────────────────
// An animation is a folder in animations/ with manifest.json + an entry HTML
// page that draws on a transparent full-screen window. See animations/README.md.
function readManifest(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.id)) {
    throw new Error('manifest "id" is missing or has invalid characters');
  }
  const entry = path.join(dir, manifest.entry || 'overlay.html');
  if (!fs.existsSync(entry)) throw new Error(`entry file not found: ${path.basename(entry)}`);
  return { manifest, entry };
}

function loadAnimations() {
  const found = new Map();
  if (fs.existsSync(ANIM_DIR)) {
    for (const ent of fs.readdirSync(ANIM_DIR, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(ANIM_DIR, ent.name);
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
      try {
        const { manifest: m, entry } = readManifest(dir);
        if (found.has(m.id)) {
          console.warn(`cursora: duplicate animation id "${m.id}" in ${dir}, skipped`);
          continue;
        }
        const thumb = m.thumbnail && path.join(dir, m.thumbnail);
        found.set(m.id, {
          id: m.id,
          name: m.name || m.id,
          version: m.version || '1.0.0',
          author: m.author || 'Unknown',
          description: m.description || '',
          category: m.category || 'Other',
          tags: Array.isArray(m.tags) ? m.tags : [],
          accent: m.accent || '#89cff0',
          hints: Array.isArray(m.hints) ? m.hints.slice(0, 3).map(String) : null,
          // 'replace': the animation is the pointer (system cursor hidden);
          // 'follow': it accompanies the normal pointer.
          cursor: m.cursor === 'replace' ? 'replace' : 'follow',
          settings: Array.isArray(m.settings) ? m.settings.filter(s => s && s.key) : [],
          dir,
          entryPath: entry,
          entryUrl: pathToFileURL(entry).href,
          thumbnailUrl: thumb && fs.existsSync(thumb) ? pathToFileURL(thumb).href : null,
        });
      } catch (e) {
        console.warn(`cursora: skipping animation in ${dir}:`, e.message);
      }
    }
  }
  animations = found;
  if (!animations.has(config.activeId)) {
    config.activeId = animations.keys().next().value || null;
  }
}

const activeAnimation = () => animations.get(config.activeId) || null;

function settingsFor(anim) {
  const values = {};
  for (const s of anim.settings) values[s.key] = s.default;
  return { ...values, ...(config.settings[anim.id] || {}) };
}

function snapshot() {
  return {
    version: app.getVersion(),
    platform: process.platform,
    activeId: config.activeId,
    animations: [...animations.values()].map(({ dir, entryPath, ...a }) => ({
      ...a,
      values: settingsFor(a),
    })),
    prefs: config.prefs,
    hotkeyOk,
    favorites: config.favorites,
    recent: config.recent,
    stats: config.stats,
    crosshair: config.crosshair,
    update: updateSnapshot(),
    discord: discordSnapshot(),
    whatsNew: config.updates.notes && config.updates.notes.version === app.getVersion() ? config.updates.notes : null,
    crossHotkeyOk,
    crossScreen: (({ width, height }) => ({ width, height, count: screen.getAllDisplays().length }))(screen.getPrimaryDisplay().size),
    cursor: config.cursor,
    cursorSupported: cursorSupported(),
    overlayActive: isOverlayActive(),
  };
}

function notify(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function setActive(id) {
  if (!animations.has(id) || config.activeId === id) return;
  config.activeId = id;
  saveConfig();
  rebuildTrayMenu();
}

// ── System cursor (Windows) ─────────────────────────────────────────────────
// Cursor-replacing animations hide the system pointer while they are on screen
// by swapping every standard cursor for a blank one. SPI_SETCURSORS reloads the
// user's own cursor scheme, which restores it. Restored on toggle-off, quit,
// sign-out, an overlay crash, and at every startup in case a previous run died.
const OCR_IDS = [32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651];
const SPI_SETCURSORS = 0x0057;
const BLANK_AND = Buffer.alloc(128, 0xff);   // 32×32 monochrome: AND = 1 keeps the screen as is
const BLANK_XOR = Buffer.alloc(128, 0x00);   //                   XOR = 0 draws nothing
let cursorHidden = false;

function hideSystemCursor() {
  if (cursorHidden || !CreateCursor || !SetSystemCursor) return;
  cursorHidden = true;
  for (const id of OCR_IDS) {
    // SetSystemCursor takes ownership of (and destroys) the cursor it is given,
    // so every id gets a fresh blank one.
    const blank = CreateCursor(null, 0, 0, 32, 32, BLANK_AND, BLANK_XOR);
    if (blank) SetSystemCursor(blank, id);
  }
}

function restoreSystemCursor(force = false) {
  if ((!cursorHidden && !force) || !SystemParametersInfoW) return;
  SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0);
  cursorHidden = false;
  customApplied = false;
  // Bring the user's Cursora cursor set back (never while quitting: Windows'
  // own cursors must be left in place then).
  if (!isQuitting) applyCustomCursors();
}

/** On quit, sign-out or exit: leave Windows with its own cursors. */
function resetCursorsForExit() {
  isQuitting = true;
  if ((cursorHidden || customApplied) && SystemParametersInfoW) SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0);
  cursorHidden = false;
  customApplied = false;
}

// ── Custom Windows cursors ──────────────────────────────────────────────────
// Each role is written as a 32-bit .cur file and installed with SetSystemCursor.
const CURSOR_ROLES = {
  normal: 32512, ibeam: 32513, wait: 32514, cross: 32515, up: 32516,
  sizenwse: 32642, sizenesw: 32643, sizewe: 32644, sizens: 32645, sizeall: 32646,
  no: 32648, hand: 32649, appstarting: 32650, help: 32651,
};
const IMAGE_CURSOR = 2;
const LR_LOADFROMFILE = 0x0010;
const cursorDir = () => path.join(app.getPath('userData'), 'cursors');
const cursorSupported = () => process.platform === 'win32' && !!(LoadImageW && SetSystemCursor && SystemParametersInfoW);
let customApplied = false;

/** A .cur file: one 32-bit BGRA image (bottom-up DIB plus an empty AND mask). */
function curFile({ w, h, hx, hy, rgba }) {
  const maskRow = Math.ceil(w / 32) * 4;
  const dib = Buffer.alloc(40 + w * h * 4 + maskRow * h);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(w, 4);
  dib.writeInt32LE(h * 2, 8);          // colour + mask
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(w * h * 4 + maskRow * h, 20);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = 40 + ((h - 1 - y) * w + x) * 4;
      dib[dst] = rgba[src + 2]; dib[dst + 1] = rgba[src + 1]; dib[dst + 2] = rgba[src]; dib[dst + 3] = rgba[src + 3];
    }
  }
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(2, 2);            // type 2 = cursor
  head.writeUInt16LE(1, 4);
  head.writeUInt8(w >= 256 ? 0 : w, 6);
  head.writeUInt8(h >= 256 ? 0 : h, 7);
  head.writeUInt16LE(hx, 10);          // hotspot instead of planes / bit count
  head.writeUInt16LE(hy, 12);
  head.writeUInt32LE(dib.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, dib]);
}

/**
 * An animated cursor (.ani): a RIFF "ACON" with an anih header and one .cur
 * image per frame. rate is the delay per frame in jiffies (1/60 s).
 */
function aniFile(img) {
  const chunk = (id, data) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'ascii');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const anih = Buffer.alloc(36);
  anih.writeUInt32LE(36, 0);                    // cbSize
  anih.writeUInt32LE(img.frames.length, 4);     // frames
  anih.writeUInt32LE(img.frames.length, 8);     // steps (played in order)
  anih.writeUInt32LE(img.rate, 28);             // default delay per step
  anih.writeUInt32LE(1, 32);                    // AF_ICON: frames are icon/cursor data
  const icons = img.frames.map(rgba => chunk('icon', curFile({ ...img, rgba })));
  const list = Buffer.concat([Buffer.from('fram', 'ascii'), ...icons]);
  const body = Buffer.concat([Buffer.from('ACON', 'ascii'), chunk('anih', anih), chunk('LIST', list)]);
  return chunk('RIFF', body);
}

/** Pixel size of an .ani file, read from its first frame (0 if it cannot be read). */
function aniSize(file) {
  try {
    const b = fs.readFileSync(file);
    const at = b.indexOf(Buffer.from('icon', 'ascii'));
    // icon chunk: id(4) + size(4), then the .cur: ICONDIR (6) + entry width byte.
    return at >= 0 && b.length > at + 14 ? (b[at + 14] || 256) : 0;
  } catch {
    return 0;
  }
}

/** Validates one rendered role sent by the app window (static, or animated with frames). */
function validCursorImage(img) {
  if (!img || !Object.prototype.hasOwnProperty.call(CURSOR_ROLES, img.role)) return false;
  const { w, h, hx, hy, rgba } = img;
  const int = v => Number.isInteger(v);
  const size = w * h * 4;
  const base = int(w) && int(h) && w >= 16 && h >= 16 && w <= 128 && h <= 128 &&
    int(hx) && int(hy) && hx >= 0 && hy >= 0 && hx < w && hy < h &&
    rgba instanceof Uint8Array && rgba.length === size;
  if (!base || img.frames === undefined) return base;
  return Array.isArray(img.frames) && img.frames.length >= 2 && img.frames.length <= 32 &&
    img.frames.every(f => f instanceof Uint8Array && f.length === size) &&
    int(img.rate) && img.rate >= 1 && img.rate <= 240;
}

/** Installs the saved .cur files (if enabled). A missing role keeps Windows' own. */
function applyCustomCursors() {
  if (!config || !config.cursor.enabled || !cursorSupported() || cursorHidden) return;
  let applied = 0;
  for (const [role, id] of Object.entries(CURSOR_ROLES)) {
    const ani = path.join(cursorDir(), `${role}.ani`);
    const file = fs.existsSync(ani) ? ani : path.join(cursorDir(), `${role}.cur`);
    if (!fs.existsSync(file)) continue;
    try {
      // SetSystemCursor takes ownership of the handle, so each role loads its own.
      // An .ani must be loaded at its own size: without one, Windows scales it to 32 px.
      const size = file === ani ? aniSize(file) : 0;
      const h = LoadImageW(null, file, IMAGE_CURSOR, size, size, LR_LOADFROMFILE);
      if (h && SetSystemCursor(h, id)) applied++;
    } catch (e) {
      console.warn(`cursora: could not apply the ${role} cursor:`, e.message);
    }
  }
  customApplied = applied > 0;
}

/** Back to the user's Windows cursors (the Cursora set was switched off). */
function removeCustomCursors() {
  if (customApplied && !cursorHidden && SystemParametersInfoW) SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0);
  customApplied = false;
}

// ── Overlay window ──────────────────────────────────────────────────────────
function createOverlay(anim) {
  const win = new BrowserWindow({
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  overlay = win;
  overlayAnimId = anim.id;
  overlayReady = false;
  win.setAlwaysOnTop(true, 'screen-saver');
  // Click-through: clicks reach the apps underneath and never dismiss it.
  win.setIgnoreMouseEvents(true);
  win.loadFile(anim.entryPath);
  win.webContents.on('render-process-gone', () => restoreSystemCursor());
  win.webContents.on('did-finish-load', () => {
    overlayReady = true;
    if (pendingSpawn && win.isVisible()) {
      win.webContents.send('overlay:spawn', pendingSpawn);
    }
    pendingSpawn = null;
  });
  win.on('closed', () => {
    if (overlay !== win) return;
    stopCursorFeed();
    restoreSystemCursor();
    overlay = null;
    overlayAnimId = null;
    overlayReady = false;
    pendingSpawn = null;
    notify('overlay:state', false);
  });
}

function destroyOverlay() {
  if (!overlay) return;
  stopCursorFeed();
  restoreSystemCursor();
  const win = overlay;
  overlay = null;
  overlayAnimId = null;
  overlayReady = false;
  win.destroy();
}

/** Cover the display under the cursor (or the primary one); returns cursor in window coords. */
function placeOverlay() {
  const cursor = screen.getCursorScreenPoint();
  const display = config.prefs.followCursor
    ? screen.getDisplayNearestPoint(cursor)
    : screen.getPrimaryDisplay();
  const { bounds } = display;
  overlay.setBounds(bounds);
  overlayBounds = bounds;
  overlayDisplayId = display.id;
  return { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
}

/**
 * The overlay is click-through, so it gets no mouse events of its own: the
 * cursor is polled here (~125 Hz) and streamed to it while it is on screen.
 * Moving to another monitor re-summons the animation there.
 */
function startCursorFeed() {
  stopCursorFeed();
  let lastX = NaN, lastY = NaN;
  cursorTimer = setInterval(() => {
    if (!overlay || !overlayReady || !overlay.isVisible() || !overlayBounds) return;
    const pt = screen.getCursorScreenPoint();
    if (config.prefs.followCursor && !overlayLeaving && screen.getDisplayNearestPoint(pt).id !== overlayDisplayId) {
      const anim = animations.get(overlayAnimId);
      if (anim) overlay.webContents.send('overlay:spawn', { cursor: placeOverlay(), settings: settingsFor(anim) });
      lastX = lastY = NaN;
      return;
    }
    if (pt.x === lastX && pt.y === lastY) return;
    lastX = pt.x;
    lastY = pt.y;
    overlay.webContents.send('overlay:cursor', { x: pt.x - overlayBounds.x, y: pt.y - overlayBounds.y });
  }, 8);
}

function stopCursorFeed() {
  clearInterval(cursorTimer);
  cursorTimer = null;
}

const isOverlayActive = () => !!(overlay && overlay.isVisible());

/** Summon the active animation, or drop it if it is already on screen. */
function summon({ refocus = false } = {}) {
  if (isOverlayActive()) {
    if (!overlayLeaving) {
      // Toggle off: give the pointer back at once while the animation exits.
      overlayLeaving = true;
      restoreSystemCursor();
      overlay.webContents.send('overlay:drop');
    }
    return;
  }
  const anim = activeAnimation();
  if (!anim) return;
  if (overlay && overlayAnimId !== anim.id) destroyOverlay();
  if (!overlay) createOverlay(anim);

  const payload = { cursor: placeOverlay(), settings: settingsFor(anim) };
  overlayLeaving = false;
  overlay.showInactive();
  if (overlayReady) overlay.webContents.send('overlay:spawn', payload);
  else pendingSpawn = payload;
  startCursorFeed();
  if (anim.cursor === 'replace') hideSystemCursor();
  if (refocus) refocusPreviousApp();

  config.recent = [anim.id, ...config.recent.filter(id => id !== anim.id)].slice(0, 8);
  saveConfig();
  notify('overlay:state', true);
}

function recordTrigger(id) {
  const s = config.stats;
  const day = new Date().toISOString().slice(0, 10);
  s.total += 1;
  s.byId[id] = (s.byId[id] || 0) + 1;
  s.byDay[day] = (s.byDay[day] || 0) + 1;
  s.log.unshift({ t: Date.now(), id });
  if (s.log.length > 250) s.log.length = 250;
  saveConfig();
  notify('stats', s);
}

// ── IPC: overlay ────────────────────────────────────────────────────────────
const fromOverlay = e => overlay && e.sender === overlay.webContents;

ipcMain.on('overlay:trigger', e => {
  if (!fromOverlay(e)) return;
  const anim = animations.get(overlayAnimId);
  if (!anim) return;
  recordTrigger(anim.id);
});

ipcMain.on('overlay:hide', e => {
  if (!fromOverlay(e)) return;
  stopCursorFeed();
  restoreSystemCursor();
  overlayLeaving = false;
  overlay.hide();
  notify('overlay:state', false);
});

// ── IPC: app window ─────────────────────────────────────────────────────────
function updateOverlaySettings(anim) {
  if (overlay && overlayReady && overlayAnimId === anim.id) {
    overlay.webContents.send('overlay:settings', settingsFor(anim));
  }
}

ipcMain.handle('app:state', () => snapshot());

ipcMain.handle('anim:activate', (_e, id) => {
  setActive(id);
  return snapshot();
});

ipcMain.handle('anim:summon', (_e, id) => {
  if (id) setActive(id);
  if (!isOverlayActive() && config.prefs.minimizeOnSummon && mainWindow && mainWindow.isVisible()) {
    // Minimizing hands focus back to the window underneath (e.g. the terminal).
    mainWindow.minimize();
  }
  summon();
  return snapshot();
});

ipcMain.handle('anim:settings', (_e, id, patch) => {
  const anim = animations.get(id);
  if (!anim || !patch) return snapshot();
  const known = new Set(anim.settings.map(s => s.key));
  const current = config.settings[id] || {};
  for (const [k, v] of Object.entries(patch)) {
    if (known.has(k)) current[k] = v;
  }
  config.settings[id] = current;
  saveConfig();
  updateOverlaySettings(anim);
  return snapshot();
});

ipcMain.handle('anim:reset', (_e, id) => {
  const anim = animations.get(id);
  if (!anim) return snapshot();
  delete config.settings[id];
  saveConfig();
  updateOverlaySettings(anim);
  return snapshot();
});

ipcMain.handle('anim:favorite', (_e, id) => {
  config.favorites = config.favorites.includes(id)
    ? config.favorites.filter(x => x !== id)
    : [...config.favorites, id];
  saveConfig();
  return snapshot();
});

ipcMain.handle('prefs:set', (_e, patch) => {
  let error = null;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_PREFS) || typeof v !== typeof DEFAULT_PREFS[k]) continue;
    if (k === 'theme' && !THEMES.includes(v)) continue;
    if (k === 'hotkey' && v && v === config.prefs.crosshairHotkey) {
      error = 'That shortcut already toggles the crosshair. Pick a different one.';
      continue;
    }
    if (k === 'hotkey' && !registerHotkey(v)) {
      error = `Couldn't register ${v}. Another app may already use it.`;
      registerHotkey(config.prefs.hotkey);
      continue;
    }
    if (k === 'crosshairHotkey' && !registerHotkeys(config.prefs.hotkey, v).crossHotkeyOk) {
      error = v === config.prefs.hotkey ? 'That shortcut already summons animations. Pick a different one.' : `Couldn't register ${v}. Another app may already use it.`;
      registerHotkeys(config.prefs.hotkey, config.prefs.crosshairHotkey);
      continue;
    }
    config.prefs[k] = v;
  }
  applyLoginItem();
  applyUpdatePrefs();
  saveConfig();
  rebuildTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(themeBackground());
  return { state: snapshot(), error };
});

ipcMain.handle('hotkey:suspend', (_e, suspended) => {
  if (suspended) globalShortcut.unregisterAll();
  else registerHotkey(config.prefs.hotkey);
});

ipcMain.handle('cursor:set', (_e, payload) => {
  const p = payload || {};
  if (!cursorSupported()) return { state: snapshot(), error: 'Custom cursors are only available on Windows.' };
  if (Array.isArray(p.images)) {
    const roles = new Set(p.images.map(i => i && i.role));
    if (p.images.length !== Object.keys(CURSOR_ROLES).length || roles.size !== p.images.length || !p.images.every(validCursorImage)) {
      return { state: snapshot(), error: 'The cursor set could not be created.' };
    }
    try {
      fs.mkdirSync(cursorDir(), { recursive: true });
      for (const img of p.images) {
        // Animated roles are .ani, still ones .cur; the other kind is removed so it can't win.
        const animated = Array.isArray(img.frames);
        const file = path.join(cursorDir(), `${img.role}.${animated ? 'ani' : 'cur'}`);
        const other = path.join(cursorDir(), `${img.role}.${animated ? 'cur' : 'ani'}`);
        fs.writeFileSync(file + '.tmp', animated ? aniFile(img) : curFile(img));
        fs.renameSync(file + '.tmp', file);
        fs.rmSync(other, { force: true });
      }
    } catch (e) {
      console.warn('cursora: could not save cursors:', e.message);
      return { state: snapshot(), error: 'The cursor files could not be saved.' };
    }
  }
  if (p.design && typeof p.design === 'object') config.cursor.design = p.design;
  if (typeof p.enabled === 'boolean') config.cursor.enabled = p.enabled;
  saveConfig();
  if (config.cursor.enabled) {
    // Start from Windows' set, so a role that fails to load is never left stale.
    if (customApplied && !cursorHidden) SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0);
    applyCustomCursors();
  } else {
    removeCustomCursors();
  }
  return { state: snapshot(), error: null };
});

ipcMain.handle('crosshair:set', (_e, patch) => {
  const p = patch && typeof patch === 'object' ? patch : {};
  const c = config.crosshair;
  if (p.design !== undefined) { if (!smallObject(p.design)) return { state: snapshot(), error: 'That crosshair could not be saved.' }; c.design = p.design; }
  if (p.offsetX !== undefined) c.offsetX = clampInt(p.offsetX, -2000, 2000);
  if (p.offsetY !== undefined) c.offsetY = clampInt(p.offsetY, -2000, 2000);
  if (p.saved !== undefined) c.saved = sanitizeCrosshair({ saved: p.saved }).saved;
  if (typeof p.enabled === 'boolean') c.enabled = p.enabled;
  saveConfig();
  updateCrosshair();
  rebuildTrayMenu();
  return { state: snapshot(), error: null };
});

ipcMain.handle('clipboard:write', (_e, text) => { if (typeof text === 'string' && text.length <= 5000) clipboard.writeText(text); });
ipcMain.handle('clipboard:read', () => clipboard.readText().slice(0, 5000));

ipcMain.handle('stats:clear', () => {
  config.stats = { total: 0, byId: {}, byDay: {}, log: [] };
  saveConfig();
  return snapshot();
});

ipcMain.handle('app:open-data-folder', () => shell.openPath(app.getPath('userData')));

ipcMain.on('window:control', (e, action) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  else if (action === 'close') win.close();
});

ipcMain.on('shell:open', (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
});

// ── Hotkey, login item, tray ────────────────────────────────────────────────
let hotkeyOk = true;
let crossHotkeyOk = true;
/** (Re)registers both global shortcuts; the crosshair one may not repeat the summon one. */
function registerHotkeys(summonAccel, crossAccel) {
  globalShortcut.unregisterAll();
  const reg = (accel, fn) => {
    if (!accel) return true;
    try { return globalShortcut.register(accel, fn); } catch { return false; }
  };
  hotkeyOk = reg(summonAccel, () => summon());
  crossHotkeyOk = crossAccel && crossAccel === summonAccel ? false : reg(crossAccel, () => toggleCrosshair());
  return { hotkeyOk, crossHotkeyOk };
}
function registerHotkey(accel) {
  return registerHotkeys(accel, config.prefs.crosshairHotkey).hotkeyOk;
}

function applyLoginItem() {
  if (process.platform === 'linux') return;
  // Unpackaged (npm start / CLI) the exe is electron itself, so pass the app path.
  const args = app.isPackaged ? [] : [path.resolve(app.getAppPath())];
  if (config.prefs.startHidden) args.push('--hidden');
  app.setLoginItemSettings({
    openAtLogin: config.prefs.launchAtStartup,
    path: process.execPath,
    args,
  });
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Cursora', click: showMainWindow },
      {
        label: 'Summon / drop',
        accelerator: config.prefs.hotkey || undefined,
        registerAccelerator: false,
        click: () => summon(),
      },
      {
        label: 'Crosshair',
        type: 'checkbox',
        checked: config.crosshair.enabled,
        accelerator: config.prefs.crosshairHotkey || undefined,
        registerAccelerator: false,
        click: () => toggleCrosshair(),
      },
      { type: 'separator' },
      {
        label: 'Active animation',
        submenu: [...animations.values()].map(a => ({
          label: a.name,
          type: 'radio',
          checked: a.id === config.activeId,
          click: () => {
            setActive(a.id);
            notify('state', snapshot());
          },
        })),
      },
      { type: 'separator' },
      ...(updateState.status === 'ready' ? [{ label: `Restart to update to ${updateState.version}`, click: installUpdate }, { type: 'separator' }] : []),
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ])
  );
}

// ── Crosshair overlay ───────────────────────────────────────────────────────
let crossWin = null;
let crossReady = false;
/** A small click-through window centred on the primary display (plus the offset). */
function crossBounds() {
  const d = screen.getPrimaryDisplay();
  // extent() is in device pixels; the window is sized in DIPs, with a margin.
  const reach = CrosshairKit.extent(config.crosshair.design) / (d.scaleFactor || 1);
  const size = Math.max(XHAIR_WINDOW, 2 * Math.ceil(reach + 8));
  const cx = d.bounds.x + d.bounds.width / 2 + config.crosshair.offsetX;
  const cy = d.bounds.y + d.bounds.height / 2 + config.crosshair.offsetY;
  return { x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), width: size, height: size };
}
function sendCrosshair() {
  if (crossWin && crossReady) crossWin.webContents.send('crosshair:design', config.crosshair.design);
}
function updateCrosshair() {
  if (!config.crosshair.enabled) {
    if (crossWin && !crossWin.isDestroyed()) crossWin.destroy();
    crossWin = null; crossReady = false;
    return;
  }
  if (!crossWin || crossWin.isDestroyed()) {
    const win = new BrowserWindow({
      ...crossBounds(), show: false, transparent: true, frame: false, resizable: false, movable: false,
      focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true, fullscreenable: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'app', 'crosshair-preload.js'), backgroundThrottling: false },
    });
    crossWin = win;
    crossReady = false;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    // Handlers act only while this window is still the current one (a toggle can replace it).
    win.webContents.on('did-finish-load', () => {
      if (crossWin !== win) return;
      crossReady = true;
      sendCrosshair();
      win.showInactive();
    });
    win.webContents.on('render-process-gone', () => {
      if (crossWin === win) { crossWin = null; crossReady = false; }
      if (!win.isDestroyed()) win.destroy();
    });
    win.on('closed', () => { if (crossWin === win) { crossWin = null; crossReady = false; } });
    win.loadFile(path.join(__dirname, 'app', 'crosshair-overlay.html'));
    return;
  }
  crossWin.setBounds(crossBounds());
  sendCrosshair();
  if (!crossWin.isVisible()) crossWin.showInactive();
}
function toggleCrosshair() {
  config.crosshair.enabled = !config.crosshair.enabled;
  saveConfig();
  updateCrosshair();
  rebuildTrayMenu();
  notify('state', snapshot());
}

/** Monitors added, removed, rearranged or a new main display: keep the crosshair on the primary one. */
let lastCrossScreen = '';
function onDisplaysChanged() {
  if (crossWin) updateCrosshair();
  const state = snapshot();
  const key = JSON.stringify(state.crossScreen);
  if (key !== lastCrossScreen) { lastCrossScreen = key; notify('state', state); }
}

// ── Automatic updates ───────────────────────────────────────────────────────
// The installed app checks GitHub Releases (xb48/Cursora, from the
// app-update.yml written at build time), downloads new versions in the
// background and installs them silently on restart or quit. Downloads are
// checked against the SHA-512 in the release's latest.yml before installing.
// The portable build and unpackaged dev copies never update themselves.
const UPDATE_FIRST_CHECK_MS = 15 * 1000;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
let autoUpdater = null;
const updateState = { status: 'idle', version: null, percent: 0, error: null };
const updatesSupported = () => process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
const updateSnapshot = () => ({ supported: !!autoUpdater, ...updateState });

/** Release notes (HTML or Markdown, or a list of them) as plain text. */
function notesText(notes) {
  const raw = Array.isArray(notes) ? notes.map(n => (n && n.note) || '').join('\n\n') : String(notes || '');
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|li|pre)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    // Markdown: headings, bullets, emphasis, code and links become plain text.
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
}
/** A short, human message for an updater error. */
function updateError(err) {
  const msg = String((err && err.message) || err || 'Unknown error');
  if (/net::ERR_|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|socket hang up/i.test(msg)) return "Couldn't reach the update server. Check your connection.";
  if (/\b404\b|Cannot find latest|No published versions|Unable to find latest version/i.test(msg)) return NO_RELEASE;
  if (/sha512 checksum mismatch/i.test(msg)) return 'The download was damaged, so it was discarded. It will be retried.';
  return msg.split('\n')[0].slice(0, 160);
}
const NO_RELEASE = 'No release is published yet.';
/** Records an updater failure. With no release published there is nothing newer, so that reads as up to date. */
function updateFailed(err) {
  if (updateState.status === 'ready') return;
  const msg = updateError(err);
  if (msg === NO_RELEASE) setUpdate({ status: 'none', version: null, percent: 0, error: null });
  else setUpdate({ status: 'error', error: msg });
}
function setUpdate(patch) {
  Object.assign(updateState, patch);
  notify('update', updateSnapshot());
}
function applyUpdatePrefs() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = config.prefs.autoUpdate;
  autoUpdater.autoInstallOnAppQuit = config.prefs.autoUpdate;
}
function checkForUpdates() {
  if (!autoUpdater || ['checking', 'downloading', 'ready'].includes(updateState.status)) return;
  autoUpdater.checkForUpdates().catch(updateFailed);
}
function downloadUpdate() {
  if (!autoUpdater || updateState.status !== 'available') return;
  setUpdate({ status: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch(updateFailed);
}
/** Quits, installs the downloaded update silently and starts the new version. */
function installUpdate() {
  if (!autoUpdater || updateState.status !== 'ready') return;
  isQuitting = true;
  autoUpdater.quitAndInstall(true, true);
}
function setupUpdates() {
  // Release notes belong to the version they describe; drop them once it is not the one running.
  if (config.updates.notes && config.updates.notes.version !== app.getVersion() && !updatesSupported()) config.updates.notes = null;
  if (!updatesSupported()) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('cursora: automatic updates are unavailable:', e.message);
    return;
  }
  if (config.updates.notes && config.updates.notes.version !== app.getVersion()) { config.updates.notes = null; saveConfig(); }
  autoUpdater.logger = null;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  applyUpdatePrefs();
  // For testing an update end to end on this machine: a local feed (loopback only).
  const feed = process.env.CURSORA_UPDATE_FEED;
  if (feed) {
    try {
      const u = new URL(feed);
      if (/^https?:$/.test(u.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    } catch { /* not a URL: ignored */ }
  }
  let lastPercent = -1;
  autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => setUpdate({ status: 'none', version: null, percent: 0 }));
  autoUpdater.on('update-available', info => {
    lastPercent = -1;
    setUpdate({ status: autoUpdater.autoDownload ? 'downloading' : 'available', version: info.version, percent: 0 });
  });
  autoUpdater.on('download-progress', p => {
    const pct = Math.floor(p.percent || 0);
    if (pct !== lastPercent) { lastPercent = pct; setUpdate({ status: 'downloading', percent: pct }); }
  });
  autoUpdater.on('update-downloaded', info => {
    config.updates.notes = { version: info.version, text: notesText(info.releaseNotes) };
    saveConfig();
    setUpdate({ status: 'ready', version: info.version, percent: 100 });
    rebuildTrayMenu();
  });
  autoUpdater.on('error', updateFailed);
  setTimeout(function tick() {
    if (config.prefs.autoUpdate) checkForUpdates();
    setTimeout(tick, UPDATE_INTERVAL_MS);
  }, UPDATE_FIRST_CHECK_MS);
}

ipcMain.handle('update:check', () => { checkForUpdates(); return updateSnapshot(); });
ipcMain.handle('update:download', () => { downloadUpdate(); return updateSnapshot(); });
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('update:seen', () => {
  config.updates.notes = null;
  saveConfig();
  return snapshot();
});

// ── Discord account (optional) ──────────────────────────────────────────────
// Links the user's Discord account to show their profile in Settings. Sign-in
// happens in the system browser with OAuth2 authorization code + PKCE, so no
// client secret ships with the app and Cursora never sees the Discord password.
// Discord redirects back to a short-lived listener on 127.0.0.1. Tokens and the
// profile are stored encrypted with the OS (DPAPI on Windows) in discord.json.
// Requires, in the Discord Developer Portal (OAuth2): the redirect URI below and
// "Public Client" turned on.
const DISCORD_CLIENT_ID = '1566214286429134931';
const DISCORD_PORT = 47819;
const DISCORD_REDIRECT = `http://127.0.0.1:${DISCORD_PORT}/callback`;
const DISCORD_SCOPES = 'identify email';
const DISCORD_LINK_TIMEOUT_MS = 5 * 60 * 1000;
const discordBase = (() => {
  // For testing against a local mock of Discord (loopback only).
  const test = process.env.CURSORA_DISCORD_TEST_BASE;
  if (test) {
    try {
      const u = new URL(test);
      if (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) {
        return { site: test.replace(/\/$/, ''), api: `${test.replace(/\/$/, '')}/api/v10`, cdn: `${test.replace(/\/$/, '')}/cdn` };
      }
    } catch { /* not a URL: ignored */ }
  }
  return { site: 'https://discord.com', api: 'https://discord.com/api/v10', cdn: 'https://cdn.discordapp.com' };
})();
const discordFile = () => path.join(app.getPath('userData'), 'discord.json');
let discordAccount = null;                // { tokens: {...}, profile: {...} } once linked
const discordState = { status: 'idle', error: null }; // idle | linking | refreshing | error
let discordLink = null;                   // the sign-in in progress: { server, timer }

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const discordSnapshot = () => ({
  ...discordState,
  linked: !!discordAccount,
  needsReconnect: !!(discordAccount && discordAccount.needsReconnect),
  canStore: safeStorage.isEncryptionAvailable(),
  profile: discordAccount ? discordAccount.profile : null,
});
function setDiscord(patch) {
  Object.assign(discordState, patch);
  notify('discord', discordSnapshot());
}

function saveDiscord() {
  try {
    if (!discordAccount) { fs.rmSync(discordFile(), { force: true }); return; }
    // Never written in the clear: without OS encryption the link lasts until Cursora quits.
    if (!safeStorage.isEncryptionAvailable()) return;
    const blob = safeStorage.encryptString(JSON.stringify(discordAccount)).toString('base64');
    fs.writeFileSync(discordFile(), JSON.stringify({ v: 1, data: blob }));
  } catch (e) {
    console.warn('cursora: could not save the Discord account:', e.message);
  }
}
function loadDiscord() {
  try {
    if (!fs.existsSync(discordFile()) || !safeStorage.isEncryptionAvailable()) return;
    const raw = JSON.parse(fs.readFileSync(discordFile(), 'utf8'));
    const acc = JSON.parse(safeStorage.decryptString(Buffer.from(raw.data, 'base64')));
    if (acc && acc.tokens && acc.tokens.access_token && acc.profile && acc.profile.id) discordAccount = acc;
  } catch (e) {
    console.warn('cursora: the saved Discord account could not be read; it was removed:', e.message);
    fs.rmSync(discordFile(), { force: true });
  }
}

/** A Discord API call with a timeout; throws an Error with .status on failure. */
async function discordFetch(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await net.fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) {
      const err = new Error((body && (body.error_description || body.message || body.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body && body.error;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
const form = obj => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj).toString() });
const withExpiry = t => ({ access_token: t.access_token, refresh_token: t.refresh_token || null, scope: t.scope || '', expires_at: Date.now() + (Number(t.expires_in) || 604800) * 1000 });

/** The signed-in user's profile, with the avatar downloaded as a data URL. */
async function fetchDiscordProfile(accessToken) {
  const u = await discordFetch(`${discordBase.api}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!u || typeof u.id !== 'string') throw new Error('Discord returned no profile.');
  const legacy = u.discriminator && u.discriminator !== '0';
  const avatarUrl = u.avatar
    ? `${discordBase.cdn}/avatars/${u.id}/${u.avatar}.png?size=128`
    : `${discordBase.cdn}/embed/avatars/${legacy ? Number(u.discriminator) % 5 : Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  let avatar = null;
  try {
    const res = await net.fetch(avatarUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2 * 1024 * 1024) avatar = `data:${res.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
    }
  } catch { /* no avatar: the panel shows initials */ }
  return {
    id: u.id,
    username: String(u.username || ''),
    globalName: u.global_name ? String(u.global_name) : null,
    discriminator: legacy ? String(u.discriminator) : null,
    email: typeof u.email === 'string' ? u.email : null,
    verified: !!u.verified,
    avatar,
    updatedAt: Date.now(),
  };
}

function finishLink() {
  if (!discordLink) return;
  clearTimeout(discordLink.timer);
  // Stop listening and drop idle keep-alive sockets, so a later attempt can't be
  // answered by this (stale) listener.
  try { discordLink.server.close(); discordLink.server.closeIdleConnections(); } catch { /* already closed */ }
  discordLink = null;
}
const callbackPage = (title, text, ok) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c10;color:#eceef3;font:16px "Segoe UI",system-ui,sans-serif}
  .c{text-align:center;padding:40px 48px;border-radius:20px;background:#15161c;border:1px solid rgba(255,255,255,.08);max-width:420px}
  .i{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;font-size:28px;background:${ok ? 'rgba(137,207,240,.15);color:#89cff0' : 'rgba(255,90,106,.12);color:#ff5a6a'}}
  h1{font-size:22px;margin:0 0 8px}p{color:#9aa3b2;margin:0;line-height:1.5}</style></head>
  <body><div class="c"><div class="i">${ok ? '&#10003;' : '!'}</div><h1>${title}</h1><p>${text}</p></div></body></html>`;

/** Starts linking: opens Discord's consent page in the browser and waits for its redirect. */
function linkDiscord() {
  if (discordLink) return;
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, DISCORD_REDIRECT);
    // Every reply closes its connection: browsers would otherwise reuse it for the next attempt.
    if (url.pathname !== '/callback') { res.writeHead(404, { Connection: 'close' }); res.end(); return; }
    const reply = (code, title, text, ok) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' }); res.end(callbackPage(title, text, ok)); };
    if (url.searchParams.get('state') !== state) { reply(400, 'Link expired', 'This sign-in link is no longer valid. Start again from Cursora.', false); return; }
    finishLink();
    const denied = url.searchParams.get('error');
    if (denied) {
      reply(200, 'Linking cancelled', 'Your Discord account was not linked. You can close this tab.', false);
      setDiscord({ status: 'idle', error: denied === 'access_denied' ? null : `Discord refused the request: ${denied}` });
      return;
    }
    try {
      const tokens = await discordFetch(`${discordBase.api}/oauth2/token`, form({
        grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: DISCORD_REDIRECT,
        client_id: DISCORD_CLIENT_ID, code_verifier: verifier,
      }));
      const granted = String(tokens.scope || '').split(' ');
      const profile = await fetchDiscordProfile(tokens.access_token);
      discordAccount = { tokens: withExpiry(tokens), profile, needsReconnect: false };
      saveDiscord();
      reply(200, 'Discord account linked', 'You can close this tab and return to Cursora.', true);
      setDiscord({ status: 'idle', error: granted.includes('email') ? null : 'Linked without email access, so your email is not shown.' });
      showMainWindow();
    } catch (e) {
      const msg = e.code === 'invalid_client' || /client_secret|public client/i.test(e.message)
        ? 'Discord rejected the sign-in: turn on "Public Client" for this app in the Discord Developer Portal.'
        : e.code === 'invalid_grant' ? 'Discord rejected the sign-in code. Please try again.'
          : `Couldn't link Discord: ${e.message}`;
      reply(200, "Couldn't link Discord", msg, false);
      setDiscord({ status: 'error', error: msg });
    }
  });
  server.on('error', e => {
    finishLink();
    setDiscord({ status: 'error', error: e.code === 'EADDRINUSE' ? `Port ${DISCORD_PORT} is in use by another app, so Discord can't reach Cursora.` : `Couldn't start linking: ${e.message}` });
  });
  server.listen(DISCORD_PORT, '127.0.0.1', () => {
    const q = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: DISCORD_REDIRECT, scope: DISCORD_SCOPES,
      state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'consent',
    });
    shell.openExternal(`${discordBase.site}/oauth2/authorize?${q}`);
  });
  discordLink = {
    server,
    timer: setTimeout(() => { finishLink(); setDiscord({ status: 'error', error: 'Linking timed out. Try again when you are ready.' }); }, DISCORD_LINK_TIMEOUT_MS),
  };
  setDiscord({ status: 'linking', error: null });
}

/** A valid access token, refreshing it first when it is close to expiring. */
async function discordToken() {
  const t = discordAccount.tokens;
  if (t.expires_at - Date.now() > 24 * 3600 * 1000) return t.access_token;
  if (!t.refresh_token) throw Object.assign(new Error('expired'), { status: 401 });
  const fresh = await discordFetch(`${discordBase.api}/oauth2/token`, form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: DISCORD_CLIENT_ID }));
  discordAccount.tokens = withExpiry({ ...fresh, refresh_token: fresh.refresh_token || t.refresh_token });
  saveDiscord();
  return discordAccount.tokens.access_token;
}
/** Re-reads the profile (and keeps the token fresh); a revoked link asks to reconnect. */
async function refreshDiscord() {
  if (!discordAccount || discordState.status === 'refreshing') return;
  setDiscord({ status: 'refreshing', error: null });
  try {
    discordAccount.profile = await fetchDiscordProfile(await discordToken());
    discordAccount.needsReconnect = false;
    saveDiscord();
    setDiscord({ status: 'idle', error: null });
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      discordAccount.needsReconnect = true;
      saveDiscord();
      setDiscord({ status: 'idle', error: 'Discord access has expired or was removed. Reconnect to update your profile.' });
    } else setDiscord({ status: 'error', error: "Couldn't reach Discord. Check your connection." });
  }
}
async function unlinkDiscord() {
  finishLink();
  const acc = discordAccount;
  discordAccount = null;
  saveDiscord();
  setDiscord({ status: 'idle', error: null });
  if (acc) {
    // Best effort: also end the authorization on Discord's side.
    discordFetch(`${discordBase.api}/oauth2/token/revoke`, form({ token: acc.tokens.refresh_token || acc.tokens.access_token, token_type_hint: acc.tokens.refresh_token ? 'refresh_token' : 'access_token', client_id: DISCORD_CLIENT_ID })).catch(() => {});
  }
}

ipcMain.handle('discord:link', () => { linkDiscord(); return discordSnapshot(); });
ipcMain.handle('discord:cancel', () => { finishLink(); setDiscord({ status: 'idle', error: null }); return discordSnapshot(); });
ipcMain.handle('discord:refresh', async () => { await refreshDiscord(); return discordSnapshot(); });
ipcMain.handle('discord:unlink', async () => { await unlinkDiscord(); return discordSnapshot(); });

// ── App window ──────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: themeBackground(),
    title: 'Cursora',
    icon: path.join(__dirname, 'icon', process.platform === 'win32' ? 'app.ico' : 'Template.png'),
    webPreferences: {
      preload: path.join(__dirname, 'app', 'preload.js'),
      // Interface sounds play on hover, which can come before any click.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });
  mainWindow.on('maximize', () => notify('window:maximized', true));
  mainWindow.on('unmaximize', () => notify('window:maximized', false));
  mainWindow.on('close', e => {
    if (isQuitting) return;
    if (config.prefs.closeToTray) {
      e.preventDefault();
      mainWindow.hide();
    } else {
      isQuitting = true;
      app.quit();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', e => e.preventDefault());
}

function showMainWindow() {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── App lifecycle ───────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
    // If a previous run ever died while the pointer was hidden, bring it back.
    restoreSystemCursor(true);
    const legacyPrefs = migrateLegacyConfig();
    config = loadConfig();
    migrateLoginItem(legacyPrefs);
    applyCustomCursors();
    loadAnimations();

    tray = new Tray(await getTrayIcon());
    tray.setToolTip('Cursora - click to toggle');
    tray.on('click', () => summon({ refocus: true }));
    rebuildTrayMenu();

    setupUpdates();
    loadDiscord();
    if (discordAccount) setTimeout(refreshDiscord, 8000);
    updateCrosshair();
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, onDisplaysChanged);
    if (!registerHotkey(config.prefs.hotkey)) {
      console.warn(`cursora: could not register hotkey ${config.prefs.hotkey}`);
    }
    createMainWindow();
  });

  app.on('activate', showMainWindow); // macOS dock click
  app.on('before-quit', () => { finishLink(); resetCursorsForExit(); flushConfig(); });
  app.on('will-quit', () => { resetCursorsForExit(); globalShortcut.unregisterAll(); });
  app.on('session-end', () => resetCursorsForExit());
  process.on('exit', () => resetCursorsForExit());
  app.on('window-all-closed', e => e.preventDefault()); // keep alive in tray
}
