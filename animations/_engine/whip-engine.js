// ══════════════════════════════════════════════════════════════════════════════
//  Cursora whip engine: shared rope physics, crack detection, sound, effects.
//  Loaded by every whip's overlay.html, after that whip's style.js.
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  PHYSICS SETTINGS — TWEAK EVERYTHING HERE
// ══════════════════════════════════════════════════════════════════════════════
const BASE_DEFAULTS = {
  // Rope structure
  segments:       28,     // number of chain links
  segmentLength:  25,     // base length of each link (px)
  taper:          0.6,   // tip segment is this fraction of base length

  // Physics
  gravity:        1.2,   // normal gravity
  dropGravity:    0.95,    // gravity when dropping/despawning
  damping:        0.96,  // velocity retention per frame (1 = no loss)
  constraintIters:20,     // higher = stiffer chain
  maxStretchRatio: 1.2,  // hard cap for per-link stretch during fast whips

  // Dynamic handle aim (target angle + restoring spring, not static lock)
  baseTargetAngle: -1.12, // radians, default "up-right" resting direction
  handleAimByMouseX: 0.4, // horizontal mouse movement influence on target angle
  handleAimByMouseY: 0.2, // vertical mouse movement influence on target angle
  handleAimClamp:    2.0,  // max radians target can deviate from base angle
  handleSpring:      0.7,  // restoring force to target angle
  handleAngularDamping: 0.078, // angular velocity damping
  basePoseSegments: 2,    // how many early segments are strongly guided
  basePoseStiffStart: 0.9, // stiffness near handle
  basePoseStiffEnd:   0.8, // stiffness near end of guided region

  // Elastic bend limits by chain position (handle stiff, tip floppy)
  handleMaxBendDeg: 16,   // max angle between links near handle
  tipMaxBendDeg:   130,   // max angle between links near tip
  bendRigidityStart: 0.8, // correction strength near handle
  bendRigidityEnd:   0.12, // correction strength near tip

  // Screen-edge slap
  wallBounce:      0.42,   // velocity retained after wall hit
  wallFriction:    0.86,   // tangential damping on wall hit

  // Crack detection
  crackSpeed:     340,     // tip velocity threshold to trigger crack
  crackCooldownMs:200,   // min ms between cracks
  firstCrackGraceMs: 350, // no crack until this long after spawn

  // Visuals
  lineWidthHandle: 7,      // rope thickness near handle
  lineWidthTip:    5,      // rope thickness near tip
  outlineWidth:   3,      // white halo on each side of the stroke (approx px)
  handleExtraWidth: 5,    // added core + outline thickness on first handleThickSegments links only
  handleThickSegments: 2, // how many links from the handle get handleExtraWidth
  bgAlpha:        0.011,  // barely-visible bg so window captures mouse events

  // Initial arc shape
  arcWidth:       260,    // how far right the arc extends from mouse
  arcHeight:      185,    // how high the arc goes above mouse
};

// Each whip folder loads its style.js first, which sets window.WHIP_STYLE:
//   physics  - overrides for the numbers above
//   look     - defaults for every non-physics setting (colors, glow, ...)
//   sounds   - crack sound files in _engine/sounds; pitch - [min, max] playback rate
//   sound(v) - optional synth layer (v.tone / v.noise) played with each crack;
//              soundGain - its level relative to the crack (default 0.6)
//   draw(ctx, whip, kit), tick(whip, kit, tipSpeed), onCrack(tip, kit)
// Without a draw hook the classic black-and-white whip is drawn.
const STYLE = window.WHIP_STYLE || {};
const DEFAULTS = { ...BASE_DEFAULTS, ...(STYLE.physics || {}) };

// Live values: DEFAULTS overridden by the user's settings from the app.
let P = { ...DEFAULTS };
const LOOK = { volume: 1, ...(STYLE.look || {}) };
const ENGINE_URL = document.currentScript.src;

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

function applySettings(s) {
  if (!s) return;
  const prevSegments = P.segments;
  for (const [k, v] of Object.entries(s)) {
    if (k in DEFAULTS) {
      if (typeof v === 'number' && Number.isFinite(v)) P[k] = v;
    } else if (k in LOOK && typeof v === typeof LOOK[k]) {
      LOOK[k] = v;
    }
  }
  P.segments = Math.max(3, Math.round(P.segments));
  LOOK.volume = Math.max(0, Math.min(1, LOOK.volume));
  // A different link count needs a fresh chain; respawn it where the handle is.
  if (whip && !dropping && P.segments !== prevSegments) spawnAt(whip[0].x, whip[0].y);
}

// ══════════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;

function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

let mouseX = 0, mouseY = 0;
let prevMouseX = 0, prevMouseY = 0;
let whip = null;
let dropping = false;
let lastCrackTime = 0;
let whipSpawnTime = 0;
let handleAngle = P.baseTargetAngle;
let handleAngVel = 0;

const WHIP_CRACK_SOUNDS = (STYLE.sounds || ['A.mp3', 'B.mp3', 'C.mp3', 'D.mp3', 'E.mp3'])
  .map(name => new URL(`sounds/${name}`, ENGINE_URL).href);

// Crack recordings plus the style's own synth layer (STYLE.sound), decoded and
// loudness-matched once by the shared sound bank (audio.js).
const SOUND = window.OpenWhipAudio.create(() => LOOK.volume);
WHIP_CRACK_SOUNDS.forEach((url, i) => SOUND.sample(`crack${i}`, url));
if (STYLE.sound) SOUND.synth('layer', STYLE.sound);

document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
// The desktop overlay is click-through, so it gets no mouse events of its own:
// the app streams the cursor position instead. Clicking never dismisses it;
// only the hotkey or tray icon does.
if (window.bridge && window.bridge.onCursor) window.bridge.onCursor(p => { mouseX = p.x; mouseY = p.y; });

// ── Whip creation ───────────────────────────────────────────────────────────
function spawnWhip(mx, my) {
  dropping = false;
  lastCrackTime = 0;
  whipSpawnTime = Date.now();
  const pts = [];
  for (let i = 0; i < P.segments; i++) {
    const t = i / (P.segments - 1);
    // Nice upward arc from handle (mouse) to tip
    const x = mx + t * P.arcWidth;
    const y = my - Math.sin(t * Math.PI * 0.75) * P.arcHeight;
    pts.push({ x, y, px: x, py: y });
  }
  return pts;
}

function segLen(i) {
  const t = i / (whip.length - 1);
  return P.segmentLength * (1 - t * (1 - P.taper));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Point on Catmull–Rom spline (extrapolated ends) for index i in `pts`. */
function catmullPoint(pts, i) {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (i < 0) {
    if (n >= 2) {
      return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    }
    return { x: pts[0].x, y: pts[0].y };
  }
  if (i >= n) {
    if (n >= 2) {
      const a = pts[n - 2], b = pts[n - 1];
      return { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
    }
    return { x: pts[n - 1].x, y: pts[n - 1].y };
  }
  return pts[i];
}

/**
 * Cubic Bézier from p1→p2 matching uniform Catmull–Rom through p0,p1,p2,p3.
 * Control points: C1 = p1 + (p2-p0)/6, C2 = p2 - (p3-p1)/6.
 */
function whipSegmentBezier(pts, i) {
  const p0 = catmullPoint(pts, i - 1);
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = catmullPoint(pts, i + 2);
  return {
    cp1x: p1.x + (p2.x - p0.x) / 6,
    cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6,
    cp2y: p2.y - (p3.y - p1.y) / 6,
    x2: p2.x,
    y2: p2.y,
  };
}
const wrapPi = a => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function playCrackSound() {
  if (!WHIP_CRACK_SOUNDS.length) return;
  const i = Math.floor(Math.random() * WHIP_CRACK_SOUNDS.length);
  const rate = STYLE.pitch ? lerp(STYLE.pitch[0], STYLE.pitch[1], Math.random()) : 1;
  SOUND.play(`crack${i}`, { rate });
  if (STYLE.sound) SOUND.play('layer', { gain: STYLE.soundGain ?? 0.6 });
}

function updateHandleAim() {
  if (dropping) return;
  const mvx = mouseX - prevMouseX;
  const mvy = mouseY - prevMouseY;
  const delta = clamp(
    mvx * P.handleAimByMouseX + mvy * P.handleAimByMouseY,
    -P.handleAimClamp,
    P.handleAimClamp
  );
  const target = P.baseTargetAngle + delta;
  const err = wrapPi(target - handleAngle);
  handleAngVel += err * P.handleSpring;
  handleAngVel *= P.handleAngularDamping;
  handleAngle = wrapPi(handleAngle + handleAngVel);
}

function applyBasePose() {
  if (!whip || dropping) return;
  const dx = Math.cos(handleAngle);
  const dy = Math.sin(handleAngle);
  const guided = Math.min(P.basePoseSegments, whip.length - 1);
  for (let i = 1; i <= guided; i++) {
    const t = (i - 1) / Math.max(guided - 1, 1);
    const stiff = lerp(P.basePoseStiffStart, P.basePoseStiffEnd, t);
    const prev = whip[i - 1];
    const p = whip[i];
    const targetLen = segLen(i - 1);
    const tx = prev.x + dx * targetLen;
    const ty = prev.y + dy * targetLen;
    p.x = lerp(p.x, tx, stiff);
    p.y = lerp(p.y, ty, stiff);
  }
}

function applyBendLimits() {
  if (!whip || whip.length < 3) return;
  for (let i = 1; i < whip.length - 1; i++) {
    const a = whip[i - 1];
    const b = whip[i];
    const c = whip[i + 1];

    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 0.0001;
    const l2 = Math.hypot(v2x, v2y) || 0.0001;
    const n1x = v1x / l1, n1y = v1y / l1;
    const n2x = v2x / l2, n2y = v2y / l2;

    const dot = clamp(n1x * n2x + n1y * n2y, -1, 1);
    const angle = Math.acos(dot);
    const t = i / (whip.length - 2);
    const maxBend = lerp(P.handleMaxBendDeg, P.tipMaxBendDeg, t) * Math.PI / 180;
    const bend = Math.PI - angle; // bend away from a straight line
    if (bend <= maxBend) continue;

    // Clamp to max bend while preserving side/sign of the bend.
    const cross = n1x * n2y - n1y * n2x;
    const sign = cross >= 0 ? 1 : -1;
    const targetAngle = Math.PI - maxBend;
    const targetA = Math.atan2(n1y, n1x) + sign * targetAngle;
    const tx = b.x + Math.cos(targetA) * l2;
    const ty = b.y + Math.sin(targetA) * l2;
    const rigidity = lerp(P.bendRigidityStart, P.bendRigidityEnd, t);

    c.x = lerp(c.x, tx, rigidity);
    c.y = lerp(c.y, ty, rigidity);
  }
}

function capSegmentStretch() {
  if (!whip || whip.length < 2) return;
  for (let i = 0; i < whip.length - 1; i++) {
    const a = whip[i];
    const b = whip[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const maxLen = segLen(i) * P.maxStretchRatio;
    if (dist <= maxLen) continue;
    const k = maxLen / dist;
    b.x = a.x + dx * k;
    b.y = a.y + dy * k;
  }
}

function applyWallCollisions() {
  if (!whip || dropping) return; // disable collisions while dropping
  const start = 1; // keep pinned handle untouched
  for (let i = start; i < whip.length; i++) {
    const p = whip[i];
    let vx = p.x - p.px;
    let vy = p.y - p.py;
    let hit = false;

    if (p.x < 0) {
      p.x = 0;
      if (vx < 0) vx = -vx * P.wallBounce;
      vy *= P.wallFriction;
      hit = true;
    } else if (p.x > W) {
      p.x = W;
      if (vx > 0) vx = -vx * P.wallBounce;
      vy *= P.wallFriction;
      hit = true;
    }

    if (p.y < 0) {
      p.y = 0;
      if (vy < 0) vy = -vy * P.wallBounce;
      vx *= P.wallFriction;
      hit = true;
    } else if (p.y > H) {
      p.y = H;
      if (vy > 0) vy = -vy * P.wallBounce;
      vx *= P.wallFriction;
      hit = true;
    }

    if (hit) {
      p.px = p.x - vx;
      p.py = p.y - vy;
    }
  }
}

// ── Physics step ────────────────────────────────────────────────────────────
function update() {
  if (!whip) return;

  const g = dropping ? P.dropGravity : P.gravity;
  updateHandleAim();

  // Verlet integration
  const start = dropping ? 0 : 1; // if dropping, handle is free too
  for (let i = start; i < whip.length; i++) {
    const p = whip[i];
    const vx = (p.x - p.px) * P.damping;
    const vy = (p.y - p.py) * P.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  // Pin handle to mouse
  if (!dropping) {
    whip[0].x = mouseX;
    whip[0].y = mouseY;
    whip[0].px = mouseX;
    whip[0].py = mouseY;
  }

  // Prevent rubber-band stretching spikes before constraints.
  capSegmentStretch();
  applyWallCollisions();

  // Keep early whip segments posed upward from handle.
  applyBasePose();

  // Distance constraints (multiple iterations for stiffness)
  for (let iter = 0; iter < P.constraintIters; iter++) {
    for (let i = 0; i < whip.length - 1; i++) {
      const a = whip[i], b = whip[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const target = segLen(i);
      const diff = (dist - target) / dist * 0.5;
      const ox = dx * diff, oy = dy * diff;
      if (i === 0 && !dropping) {
        // Handle is pinned – push only the next point
        b.x -= ox * 2;
        b.y -= oy * 2;
      } else {
        a.x += ox; a.y += oy;
        b.x -= ox; b.y -= oy;
      }
    }
    // Clamp bend angle per joint; near handle = stiffer, near tip = floppier.
    applyBendLimits();
    if (!dropping) applyBasePose();
    capSegmentStretch();
    applyWallCollisions();
  }

  // Tip velocity for crack detection
  const tip = whip[whip.length - 1];
  const tipVel = Math.hypot(tip.x - tip.px, tip.y - tip.py);

  if (!dropping && tipVel > P.crackSpeed) {
    const now = Date.now();
    if (now - whipSpawnTime >= P.firstCrackGraceMs && now - lastCrackTime > P.crackCooldownMs) {
      lastCrackTime = now;
      playCrackSound();
      if (STYLE.onCrack) STYLE.onCrack(tip, kit);
      host.trigger();
    }
  }

  if (STYLE.tick) STYLE.tick(whip, kit, tipVel);

  // If dropping, check if everything fell off screen
  if (dropping && whip.every(p => p.y > H + 60)) {
    whip = null;
    dropping = false;
    host.hide();
  }
  prevMouseX = mouseX;
  prevMouseY = mouseY;
}

// ── Effects (sparks, rings, custom) ─────────────────────────────────────────
const fx = [];
const MAX_FX = 700;
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const hexRgb = h => {
  const n = parseInt(String(h).replace('#', '').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

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

// ── Style kit (handed to style.js hooks) ────────────────────────────────────
const kit = {
  get P() { return P; },
  get W() { return W; },
  get H() { return H; },
  LOOK,
  time: 0,
  lerp, clamp, rand, pick: pickOne,
  bezier: whipSegmentBezier,

  /** Begin a smooth path through points from..to (indices); caller strokes it. */
  path(c, pts, from = 0, to = pts.length - 1) {
    c.beginPath();
    c.moveTo(pts[from].x, pts[from].y);
    for (let i = from; i < to; i++) {
      const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i);
      c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    }
  },

  /** Tapered stroke width of link i, including the thicker handle links. */
  width(i, pts) {
    const t = i / Math.max(1, pts.length - 2);
    const extra = i < P.handleThickSegments ? P.handleExtraWidth : 0;
    return lerp(P.lineWidthHandle, P.lineWidthTip, t) + extra;
  },

  /** Stroke every link separately; setup(i, t) styles ctx before each stroke. */
  links(c, pts, setup) {
    for (let i = 0; i < pts.length - 1; i++) {
      setup(i, i / Math.max(1, pts.length - 2));
      const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i);
      c.beginPath();
      c.moveTo(pts[i].x, pts[i].y);
      c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      c.stroke();
    }
  },

  /** Color at t (0-1) across evenly spaced hex stops, as rgba(). */
  mix(stops, t, alpha = 1) {
    if (stops.length === 1) {
      const [r, g, b] = hexRgb(stops[0]);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const a = hexRgb(stops[i]);
    const b = hexRgb(stops[i + 1]);
    const f = x - i;
    const ch = k => Math.round(lerp(a[k], b[k], f));
    return `rgba(${ch(0)},${ch(1)},${ch(2)},${alpha})`;
  },

  /** Handle: a solid grip over the thick links, accent bands and a pommel cap. */
  grip(c, pts, { body, accent, cap = accent }) {
    const n = Math.min(P.handleThickSegments, pts.length - 1);
    if (n < 1) return;
    const w = P.lineWidthHandle + P.handleExtraWidth;
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.lineCap = 'round';
    c.strokeStyle = body;
    c.lineWidth = w + 1;
    kit.path(c, pts, 0, n);
    c.stroke();
    c.strokeStyle = accent;
    c.lineWidth = 2;
    for (let i = 1; i <= n; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * (w / 2 + 1);
      const ny = dx / len * (w / 2 + 1);
      c.beginPath();
      c.moveTo(pts[i].x + nx, pts[i].y + ny);
      c.lineTo(pts[i].x - nx, pts[i].y - ny);
      c.stroke();
    }
    c.fillStyle = cap;
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, w * 0.62, 0, Math.PI * 2);
    c.fill();
    c.restore();
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

// ── Rendering ───────────────────────────────────────────────────────────────
/** The original OpenWhip look; used when a style has no draw hook. */
function drawClassic(ctx, whip) {
  // White: thin halo on full spline, then extra thickness only over handle links.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LOOK.outlineColor;
  if (whip.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(whip[0].x, whip[0].y);
    for (let i = 0; i < whip.length - 1; i++) {
      const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(whip, i);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    }
    ctx.lineWidth = P.lineWidthTip + P.outlineWidth * 2;
    ctx.stroke();

    const thickLinks = Math.min(P.handleThickSegments, whip.length - 1);
    if (thickLinks > 0 && P.handleExtraWidth > 0) {
      ctx.beginPath();
      ctx.moveTo(whip[0].x, whip[0].y);
      for (let i = 0; i < thickLinks; i++) {
        const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(whip, i);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      }
      ctx.lineWidth =
        P.lineWidthHandle + P.handleExtraWidth + P.outlineWidth * 2;
      ctx.stroke();
    }
  }

  ctx.strokeStyle = LOOK.color;
  for (let i = 0; i < whip.length - 1; i++) {
    const t = i / Math.max(1, whip.length - 2);
    const extra = i < P.handleThickSegments ? P.handleExtraWidth : 0;
    ctx.lineWidth = lerp(P.lineWidthHandle, P.lineWidthTip, t) + extra;
    const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(whip, i);
    ctx.beginPath();
    ctx.moveTo(whip[i].x, whip[i].y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Near-invisible fill so the window captures mouse events on Windows
  ctx.fillStyle = `rgba(0,0,0,${P.bgAlpha})`;
  ctx.fillRect(0, 0, W, H);

  if (whip) {
    kit.time = performance.now() / 1000;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    (STYLE.draw || drawClassic)(ctx, whip, kit);
    ctx.restore();
  }
  drawFx();
}

// ── Main loop ───────────────────────────────────────────────────────────────
function loop() {
  update();
  updateFx();
  draw();
  requestAnimationFrame(loop);
}
loop();

// ── Host events ─────────────────────────────────────────────────────────────
function spawnAt(x, y) {
  fx.length = 0;
  whip = spawnWhip(x, y);
  dropping = false;
  prevMouseX = mouseX;
  prevMouseY = mouseY;
  handleAngle = P.baseTargetAngle;
  handleAngVel = 0;
}

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
  if (whip && !dropping) dropping = true;
});

host.onSettings(applySettings);
