// Frog: a realistic frog (seen from above, shaded in 3D) that hops after the
// pointer. It turns to face it, crouches, launches on a ballistic arc with its
// legs stretched out, lands with its hands out and folds back up. Zip the
// pointer past its nose and it snaps its tongue out at it like a fly.
(() => {
const F = window.Frog3D;
const TURN = 0.11;              // radians per frame while turning to face the pointer
const CROUCH = 7;               // frames of anticipation before a hop
const LAND = 10;                // frames to absorb a landing
const TONGUE = 16;              // frames for a tongue strike (out, hold, back)
const REACH = 92;               // how far the tongue reaches, px at size 1

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// Facing angle: the frog's nose points along `heading` (screen radians).
const toRot = heading => heading + Math.PI / 2;

window.PROP = {
  cooldownMs: 420,
  defaults: {
    size: 1,
    hop: 150,
    snap: 16,
    species: 'leopard',
  },

  spawn(x, y, k) {
    return {
      x, y, heading: -Math.PI / 2, phase: 'idle', t: 0, cool: 0,
      from: [x, y], to: [x, y], dur: 1, h: 0, z: 0, ext: 0, fore: 0, crouch: 0,
      breath: 0, blink: 0, blinkIn: 120, tongue: 0, tAngle: 0, tLen: 0, fired: false, armed: true,
      model: F.create(17, k.LOOK.species), species: k.LOOK.species,
    };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    if (s.species !== LOOK.species) { s.model = F.create(17, LOOK.species); s.species = LOOK.species; }
    s.breath = Math.sin(k.frame * 0.09);
    // Blinks every few seconds.
    if (s.blinkIn-- <= 0) { s.blink = 1; s.blinkIn = 160 + Math.floor(k.rand(0, 220)); }
    s.blink = Math.max(0, s.blink - 0.12);

    // While dropping it hops away off the bottom of the screen.
    const tx = k.dropping ? s.x : m.x;
    const ty = k.dropping ? k.H + 400 * z : m.y;
    const dx = tx - s.x, dy = ty - s.y, dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const off = wrap(want - s.heading);

    if (m.speed < LOOK.snap * 0.4) s.armed = true;

    if (s.phase === 'idle') {
      s.ext = Math.max(0, s.ext - 0.08);
      s.fore = s.fore * 0.85;
      s.crouch = Math.max(0, s.crouch - 0.12);
      if (s.cool > 0) s.cool--;
      // Watch the pointer: turn toward it (it shuffles round when far away).
      if (dist > 26 * z || k.dropping) s.heading += Math.max(-TURN, Math.min(TURN, off));
      // A fly zipping past in front of it: tongue strike.
      if (!k.dropping && s.armed && m.speed > LOOK.snap && dist < REACH * z && Math.abs(off) < 0.7) {
        s.phase = 'tongue'; s.t = 0; s.fired = false; s.armed = false;
        s.tAngle = off; s.tLen = Math.max(12 * z, dist - 14 * z);
      } else if ((dist > 74 * z || k.dropping) && Math.abs(off) < 0.35 && s.cool <= 0) {
        s.phase = 'crouch'; s.t = 0;
      }
    } else if (s.phase === 'crouch') {
      s.t++;
      s.crouch = Math.min(1, s.t / CROUCH);
      s.heading += Math.max(-TURN, Math.min(TURN, off));
      if (s.t >= CROUCH) {
        // Launch along where it faces; distance and airtime scale with the gap.
        const len = k.dropping ? LOOK.hop * z : Math.max(32 * z, Math.min(dist - 26 * z, LOOK.hop * z));
        s.from = [s.x, s.y];
        s.to = [s.x + Math.cos(s.heading) * len, s.y + Math.sin(s.heading) * len];
        s.dur = Math.round(13 + len / (8.5 * z));
        s.h = 0.55 + Math.min(0.75, len / (260 * z));
        s.phase = 'air'; s.t = 0;
      }
    } else if (s.phase === 'air') {
      s.t++;
      const u = Math.min(1, s.t / s.dur);
      s.x = s.from[0] + (s.to[0] - s.from[0]) * u;
      s.y = s.from[1] + (s.to[1] - s.from[1]) * u;
      s.z = 4 * s.h * u * (1 - u);                       // ballistic height
      s.crouch = Math.max(0, 1 - u * 6);
      s.ext = u < 0.18 ? u / 0.18 : u > 0.72 ? 1 - (u - 0.72) / 0.28 * 0.65 : 1;
      s.fore = u < 0.55 ? -1 : -1 + (u - 0.55) / 0.45 * 2.2;  // tucked, then reaching for the ground
      if (u >= 1) { s.phase = 'land'; s.t = 0; s.z = 0; }
    } else if (s.phase === 'land') {
      s.t++;
      const u = s.t / LAND;
      s.crouch = Math.sin(Math.min(1, u) * Math.PI) * 0.9;  // squash on impact, then recover
      s.ext = Math.max(0, 0.35 * (1 - u));
      s.fore = 1.2 * (1 - u);
      if (s.t >= LAND) { s.phase = 'idle'; s.cool = 4; }
    } else if (s.phase === 'tongue') {
      s.t++;
      const out = s.t <= 5 ? s.t / 5 : s.t <= 7 ? 1 : Math.max(0, 1 - (s.t - 7) / (TONGUE - 7));
      s.tongue = out;
      if (!s.fired && s.t >= 5) {
        // Gated fires (cooldown / spawn grace) just miss; the strike still plays.
        const a = s.heading + s.tAngle;
        k.fire(s.x + Math.cos(a) * (s.tLen + 17 * z), s.y + Math.sin(a) * (s.tLen + 17 * z));
        s.fired = true;
      }
      if (s.t >= TONGUE) { s.phase = 'idle'; s.tongue = 0; s.cool = 6; }
    }
  },

  gone(s, k) {
    return s.y - 60 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    F.draw(ctx, s.model, {
      x: s.x, y: s.y, rot: toRot(s.heading), scale: k.LOOK.size * 1.15,
      z: s.z, ext: s.ext, fore: s.fore, crouch: s.crouch, breath: s.phase === 'idle' ? s.breath : 0, blink: s.blink,
      tongue: s.tongue > 0 ? { len: s.tLen * s.tongue, angle: s.tAngle } : null,
      shadow: true,
    });
  },

  onFire(s, x, y, k) {
    const z = k.LOOK.size;
    k.ring({ x, y, color: 'rgba(255, 190, 205, 0.9)', radius: 26 * z, life: 14, width: 2, blend: 'source-over' });
    k.burst({ x, y, count: 10, colors: ['#ffd6df', '#ffffff', '#ec7d95'], speed: [1, 3.5], life: [10, 20],
      size: [0.8 * z, 1.8 * z], gravity: 0.08, drag: 0.92, shape: 'dot', blend: 'source-over' });
  },

  // A wet tongue snap followed by a low croak.
  sound(v) {
    v.noise({ dur: 0.06, gain: 0.5, filter: 'bandpass', freq: 2400, to: 900, q: 1.4 });
    v.tone({ type: 'sawtooth', freq: 150, to: 118, dur: 0.22, gain: 0.22, delay: 0.07 });
    v.tone({ type: 'sine', freq: 300, to: 236, dur: 0.22, gain: 0.18, delay: 0.07 });
    v.noise({ dur: 0.2, gain: 0.16, filter: 'lowpass', freq: 600, to: 300, delay: 0.07 });
  },
};
})();
