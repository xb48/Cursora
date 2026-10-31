// ══════════════════════════════════════════════════════════════════════════════
//  Cursora prop engine: host bridge, cursor tracking, trigger gating, sound
//  and effects for animations that are not ropes. Loaded by a prop's
//  overlay.html after its style.js, which defines window.PROP:
//
//    defaults               every setting the prop understands (number/string/bool)
//    spawn(x, y, kit)       -> state object for a new prop at the cursor
//    update(state, kit)     one frame of motion; call kit.fire(x, y) to trigger
//    draw(ctx, state, kit)  render one frame (ctx is saved/restored around it)
//    gone(state, kit)       optional: true once a dropped prop has left the screen
//    onFire(state, x, y, kit)  optional reaction (effects)
//    sound(v)               optional synth recipe: v.tone({...}), v.noise({...})
// ══════════════════════════════════════════════════════════════════════════════

const PROP = window.PROP || {};
const LOOK = { volume: 1, particles: true, ...(PROP.defaults || {}) };
const ENGINE_URL = document.currentScript.src;

const FIRE_COOLDOWN_MS = PROP.cooldownMs || 280;
const FIRST_FIRE_GRACE_MS = 350;  // no trigger right after spawning
const BG_ALPHA = 0.011;           // barely-visible bg so the window captures mouse events

// ── Host bridge ─────────────────────────────────────────────────────────────
// In the desktop overlay, preload.js provides window.bridge. Inside the app's
// playground (an iframe with ?preview) we talk to the parent via postMessage.
const PREVIEW = new URLSearchParams(location.search).has('preview');
const hostHandlers = {};
const host = window.bridge || {
  trigger: () => parent.postMessage({ type: 'openwhip:trigger' }, '*'),
  hide: () => parent.postMessage({ type: 'openwhip:hidden' }, '*'),
  onSpawn: fn => { hostHandlers.spawn = fn; },
  onDrop: fn => { hostHandlers.drop = fn; },
  onSettings: fn => { hostHandlers.settings = fn; },
};
if (!window.bridge) {
  window.addEventListener('message', e => {
    const d = e.data;
    if (d && hostHandlers[d.type]) hostHandlers[d.type](d.payload);
  });
}

// ── Canvas + input ──────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;

function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

let mouseX = 0, mouseY = 0;
let prevMouseX = 0, prevMouseY = 0;
let state = null;
let dropping = false;
let spawnTime = 0;
let lastFire = 0;
let frame = 0;

document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
// The desktop overlay is click-through, so it gets no mouse events of its own:
// the app streams the cursor position instead. Clicking never dismisses it;
// only the hotkey or tray icon does.
if (window.bridge && window.bridge.onCursor) window.bridge.onCursor(p => { mouseX = p.x; mouseY = p.y; });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const wrapPi = a => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const hexRgb = h => {
  const n = parseInt(String(h).replace('#', '').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ── Sound ───────────────────────────────────────────────────────────────────
// PROP.sound(v) is a synth recipe (v.tone / v.noise) rendered once by the shared
// sound bank (audio.js); props without one use the crack recordings.
const SAMPLES = (PROP.samples || ['A.mp3', 'B.mp3', 'C.mp3', 'D.mp3', 'E.mp3'])
  .map(name => new URL(`sounds/${name}`, ENGINE_URL).href);
const SOUND = window.OpenWhipAudio.create(() => LOOK.volume);
if (PROP.sound) SOUND.synth('fire', PROP.sound);
else SAMPLES.forEach((url, i) => SOUND.sample(`s${i}`, url));

function playFireSound() {
  // Slight random pitch so repeated triggers don't sound mechanical.
  if (PROP.sound) SOUND.play('fire', { rate: rand(0.96, 1.04) });
  else if (SAMPLES.length) SOUND.play(`s${Math.floor(Math.random() * SAMPLES.length)}`);
}

// ── Effects (sparks, rings, custom) ─────────────────────────────────────────
const fx = [];
const MAX_FX = 700;

function updateFx() {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    if (f.kind === 'custom') continue;
    f.life -= 1;
    if (f.life <= 0) { fx.splice(i, 1); continue; }
    if (f.kind === 'p') {
      f.vx *= f.drag;
      f.vy = f.vy * f.drag + f.gravity;
      f.x += f.vx;
      f.y += f.vy;
    }
  }
}

function drawFx() {
  if (!fx.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = f.blend || 'lighter';
    if (f.kind === 'custom') {
      if (f.fn(ctx, kit) === false) fx.splice(i, 1);
      continue;
    }
    const a = f.life / f.max;
    ctx.globalAlpha = a;
    if (f.kind === 'ring') {
      const r = f.radius * (1 - a * a * a);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.width * a + 0.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(0.1, r), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.shape === 'spark') {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.size;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - f.vx * 2.2, f.y - f.vy * 2.2);
      ctx.stroke();
    } else {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Kit (handed to every PROP hook) ─────────────────────────────────────────
const kit = {
  get W() { return W; },
  get H() { return H; },
  get dropping() { return dropping; },
  LOOK,
  time: 0,
  frame: 0,
  mouse: { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
  lerp, clamp, rand, pick: pickOne, wrapPi,

  /** Trigger at (x, y): sound, onFire effects and the History entry. False while gated. */
  fire(x, y) {
    const now = Date.now();
    if (dropping || now - spawnTime < FIRST_FIRE_GRACE_MS || now - lastFire < FIRE_COOLDOWN_MS) return false;
    lastFire = now;
    playFireSound();
    if (PROP.onFire) PROP.onFire(state, x, y, kit);
    host.trigger();
    return true;
  },

  /** Color at t (0-1) across evenly spaced hex stops, as rgba(). */
  mix(stops, t, alpha = 1) {
    if (stops.length === 1) return kit.rgba(stops[0], alpha);
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const a = hexRgb(stops[i]);
    const b = hexRgb(stops[i + 1]);
    const f = x - i;
    const ch = k => Math.round(lerp(a[k], b[k], f));
    return `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha})`;
  },

  /** Hex color with alpha, as rgba(). */
  rgba(hex, alpha = 1) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  /** Lighten (amount > 0) or darken (amount < 0) a hex color, as rgb(). */
  shade(hex, amount) {
    const [r, g, b] = hexRgb(hex);
    const ch = v => Math.round(amount >= 0 ? lerp(v, 255, amount) : lerp(v, 0, -amount));
    return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
  },

  /** Particle burst. shape: 'spark' (streak) or 'dot'. Ranges are [min, max]. */
  burst({ x, y, count = 20, colors = ['#ffffff'], speed = [2, 8], life = [20, 40], size = [1, 3],
          gravity = 0.15, drag = 0.94, shape = 'spark', angle, spread = Math.PI * 2,
          vx = 0, vy = 0, blend }) {
    if (LOOK.particles === false) return;
    for (let n = 0; n < count && fx.length < MAX_FX; n++) {
      const a = angle === undefined ? Math.random() * Math.PI * 2 : angle + rand(-spread / 2, spread / 2);
      const sp = rand(speed[0], speed[1]);
      const l = rand(life[0], life[1]);
      fx.push({
        kind: 'p', x, y,
        vx: Math.cos(a) * sp + vx, vy: Math.sin(a) * sp + vy,
        life: l, max: l, size: rand(size[0], size[1]),
        color: pickOne(colors), drag, gravity, shape, blend,
      });
    }
  },

  /** Expanding shockwave ring. */
  ring({ x, y, color = '#ffffff', radius = 60, life = 18, width = 3, blend }) {
    if (LOOK.particles === false || fx.length >= MAX_FX) return;
    fx.push({ kind: 'ring', x, y, color, radius, life, max: life, width, blend });
  },

  /** Custom effect: fn(ctx, kit) draws one frame and returns false when done. */
  effect(fn, blend) {
    if (LOOK.particles === false || fx.length >= MAX_FX) return;
    fx.push({ kind: 'custom', fn, blend });
  },
};

// ── Settings + lifecycle ────────────────────────────────────────────────────
function applySettings(s) {
  if (!s) return;
  for (const [k, v] of Object.entries(s)) {
    if (k in LOOK && typeof v === typeof LOOK[k] && (typeof v !== 'number' || Number.isFinite(v))) LOOK[k] = v;
  }
  LOOK.volume = clamp(LOOK.volume, 0, 1);
}

function spawnAt(x, y) {
  fx.length = 0;
  dropping = false;
  spawnTime = Date.now();
  lastFire = 0;
  prevMouseX = mouseX;
  prevMouseY = mouseY;
  state = PROP.spawn ? PROP.spawn(x, y, kit) : { x, y };
}

function isGone() {
  return PROP.gone ? PROP.gone(state, kit) : state.y > H + 200;
}

function update() {
  const m = kit.mouse;
  m.x = mouseX;
  m.y = mouseY;
  m.vx = mouseX - prevMouseX;
  m.vy = mouseY - prevMouseY;
  m.speed = Math.hypot(m.vx, m.vy);
  if (state) {
    if (PROP.update) PROP.update(state, kit);
    if (dropping && isGone()) {
      state = null;
      dropping = false;
      host.hide();
    }
  }
  prevMouseX = mouseX;
  prevMouseY = mouseY;
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Near-invisible fill so the window captures mouse events on Windows
  ctx.fillStyle = `rgba(0,0,0,${BG_ALPHA})`;
  ctx.fillRect(0, 0, W, H);

  if (state && PROP.draw) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    PROP.draw(ctx, state, kit);
    ctx.restore();
  }
  drawFx();
}

function loop() {
  kit.time = performance.now() / 1000;
  kit.frame = frame++;
  update();
  updateFx();
  draw();
  requestAnimationFrame(loop);
}
loop();

// ── Host events ─────────────────────────────────────────────────────────────
host.onSpawn(({ cursor, settings } = {}) => {
  SOUND.warm();
  applySettings(settings);
  if (cursor) {
    mouseX = prevMouseX = cursor.x;
    mouseY = prevMouseY = cursor.y;
  }
  spawnAt(mouseX || W / 2, mouseY || H / 2);
});

host.onDrop(() => {
  if (state && !dropping) dropping = true;
});

host.onSettings(applySettings);
