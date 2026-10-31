// Jellyfish: a translucent moon jelly that swims after the pointer by pulsing
// its bell, trailing physics-driven tentacles and frilled oral arms. Whip the
// pointer through it fast and it flares with a bioluminescent sting.
(() => {
const BELL_W = 32;        // bell half-width, px at size 1
const BELL_H = 24;        // bell height, px at size 1
const TENTACLES = 10;
const T_PTS = 13;         // points per tentacle
const T_SEG = 6.5;        // tentacle segment, px at size 1 (times "length")
const ARMS = 4;
const A_PTS = 8;
const A_SEG = 5;
const PULSE = 1 / 72;     // pulse cycles per frame (~1.2 s)
const SQUEEZE = 0.28;     // fraction of the cycle spent contracting (the thrust)

/** Bell contraction 0..1 over a pulse: a quick squeeze, then a slow release. */
const contraction = p => (p < SQUEEZE
  ? Math.sin((p / SQUEEZE) * Math.PI / 2)
  : Math.cos(((p - SQUEEZE) / (1 - SQUEEZE)) * Math.PI / 2));

/** World position of a point in the bell frame: f along the dome axis, w across it. */
const toWorld = (s, f, w) => {
  const ux = Math.cos(s.heading), uy = Math.sin(s.heading);
  return { x: s.x + ux * f - uy * w, y: s.y + uy * f + ux * w };
};

const chain = (x, y, n) => Array.from({ length: n }, () => ({ x, y, px: x, py: y }));

/** Bell size at the current contraction. */
const bellSize = (s, z) => ({ w: BELL_W * z * (1 - 0.16 * s.c), h: BELL_H * z * (1 + 0.12 * s.c) });

/** Rim anchor of tentacle j, across the bell margin. */
const tentacleAnchor = (s, j, z) => {
  const { w } = bellSize(s, z);
  return toWorld(s, -1.5 * z, (j / (TENTACLES - 1) * 2 - 1) * w * 0.88);
};
const armAnchor = (s, j, z) => toWorld(s, -2 * z, (j - (ARMS - 1) / 2) * 4.2 * z);

/** Verlet step for one hanging chain: drift behind the bell, sway, keep spacing. */
function stepChain(pts, anchor, seg, s, k, j, drag, pull) {
  const bx = -Math.cos(s.heading), by = -Math.sin(s.heading);
  pts[0].x = anchor.x; pts[0].y = anchor.y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag;
    p.px = p.x; p.py = p.y;
    const sway = Math.sin(k.time * 2.1 + i * 0.55 + j * 1.3) * 0.16 * k.LOOK.size;
    p.x += vx + bx * pull - by * sway;
    p.y += vy + by * pull + bx * sway;
  }
  for (let it = 0; it < 2; it++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      b.x = a.x + (dx / d) * seg;
      b.y = a.y + (dy / d) * seg;
    }
  }
}

window.PROP = {
  defaults: {
    size: 1,
    sting: 18,
    length: 1,
    bell: '#8fe3ff',
    glow: '#d48cff',
  },

  spawn(x, y, k) {
    const s = { x, y, vx: 0, vy: 0, heading: -Math.PI / 2, phase: 0, c: 0, armed: true, flare: 0, tentacles: [], arms: [] };
    const z = k.LOOK.size;
    for (let j = 0; j < TENTACLES; j++) {
      const a = tentacleAnchor(s, j, z);
      s.tentacles.push(chain(a.x, a.y, T_PTS));
    }
    for (let j = 0; j < ARMS; j++) {
      const a = armAnchor(s, j, z);
      s.arms.push(chain(a.x, a.y, A_PTS));
    }
    return s;
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    s.flare = Math.max(0, s.flare - 0.03);
    s.phase = (s.phase + PULSE) % 1;
    s.c = contraction(s.phase);
    const squeezing = s.phase < SQUEEZE;

    if (k.dropping) {
      // Stops swimming and sinks, turning dome-up as it goes.
      s.heading += k.wrapPi(-Math.PI / 2 - s.heading) * 0.04;
      s.vx *= 0.97;
      s.vy = s.vy * 0.98 + 0.16 * z;
    } else {
      const dx = m.x - s.x, dy = m.y - s.y;
      const dist = Math.hypot(dx, dy);
      // Turn the dome toward the pointer gracefully, and push only while squeezing.
      s.heading += k.clamp(k.wrapPi(Math.atan2(dy, dx) - s.heading), -0.05, 0.05);
      const near = k.clamp((dist - 34 * z) / (70 * z), 0, 1);
      if (squeezing) {
        const thrust = 0.62 * z * near * (1 + Math.min(1.5, dist / 300));
        s.vx += Math.cos(s.heading) * thrust;
        s.vy += Math.sin(s.heading) * thrust;
      }
      s.vx *= 0.965;
      s.vy *= 0.965;
      // A gentle bob while it hovers by a resting pointer.
      s.vy += Math.sin(k.time * 1.6) * 0.015 * z * (1 - near);
    }
    s.x += s.vx;
    s.y += s.vy;

    const seg = T_SEG * z * LOOK.length;
    s.tentacles.forEach((t, j) => stepChain(t, tentacleAnchor(s, j, z), seg, s, k, j, 0.86, 0.32 * z));
    s.arms.forEach((t, j) => stepChain(t, armAnchor(s, j, z), A_SEG * z, s, k, j + 7, 0.84, 0.28 * z));
    if (k.dropping) return;

    // Sting: the pointer whipping through the bell or its tentacles.
    const speed = m.speed;
    if (speed < LOOK.sting * 0.4) s.armed = true;
    if (s.armed && speed > LOOK.sting) {
      let touching = Math.hypot(m.x - s.x, m.y - s.y) < 52 * z;
      for (let j = 0; j < TENTACLES && !touching; j++) {
        for (let i = 2; i < T_PTS; i += 2) {
          const p = s.tentacles[j][i];
          if (Math.hypot(m.x - p.x, m.y - p.y) < 12 * z) { touching = true; break; }
        }
      }
      if (touching && k.fire(m.x, m.y)) {
        s.armed = false;
        s.flare = 1;
        s.phase = 0;   // startled: an immediate squeeze
        const away = Math.atan2(s.y - m.y, s.x - m.x);
        s.vx += Math.cos(away) * 3 * z;
        s.vy += Math.sin(away) * 3 * z;
      }
    }
  },

  gone(s, k) {
    const tail = s.tentacles.reduce((top, t) => Math.min(top, t[t.length - 1].y), Infinity);
    return Math.min(tail, s.y) - BELL_H * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const { w, h } = bellSize(s, z);
    const flare = s.flare;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Tentacles: fine, tapering, slightly brighter at the root.
    // One smooth path each (no per-segment caps to bead at the joints),
    // fading from the root to the tip.
    const smooth = (t, upto) => {
      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y);
      for (let i = 1; i < upto - 1; i++) ctx.quadraticCurveTo(t[i].x, t[i].y, (t[i].x + t[i + 1].x) / 2, (t[i].y + t[i + 1].y) / 2);
      ctx.lineTo(t[upto - 1].x, t[upto - 1].y);
    };
    for (const t of s.tentacles) {
      const tip = t[t.length - 1];
      const g = ctx.createLinearGradient(t[0].x, t[0].y, tip.x, tip.y);
      g.addColorStop(0, k.mix([LOOK.bell, LOOK.glow], flare * 0.8, 0.55 * (1 + flare)));
      g.addColorStop(1, k.mix([LOOK.bell, LOOK.glow], 0.3 + flare * 0.7, 0.04));
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.9 * z;
      smooth(t, t.length);
      ctx.stroke();
      ctx.lineWidth = 1.8 * z;   // thicker near the margin
      smooth(t, Math.ceil(t.length / 3));
      ctx.stroke();
    }

    // Oral arms: frilled ribbons from the centre of the bell.
    for (const t of s.arms) {
      const left = [], right = [];
      for (let i = 0; i < t.length; i++) {
        const a = t[Math.max(0, i - 1)], b = t[Math.min(t.length - 1, i + 1)];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const f = i / (t.length - 1);
        const wid = (3.6 * (1 - f * 0.7) + Math.sin(k.time * 5 + i * 1.7) * 1.1) * z;
        left.push([t[i].x - Math.sin(ang) * wid, t[i].y + Math.cos(ang) * wid]);
        right.push([t[i].x + Math.sin(ang) * wid, t[i].y - Math.cos(ang) * wid]);
      }
      ctx.fillStyle = k.mix([LOOK.glow, '#ffffff'], flare * 0.5, 0.28 + 0.3 * flare);
      ctx.beginPath();
      ctx.moveTo(...left[0]);
      for (let i = 1; i < left.length; i++) ctx.lineTo(...left[i]);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(...right[i]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Bell, in its own frame: dome toward the heading, scalloped margin behind.
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading - Math.PI / 2);   // local +y now points along the heading (dome axis)
    const lobes = 8;
    const bellPath = () => {
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w, h * 0.75, -w * 0.55, h, 0, h);
      ctx.bezierCurveTo(w * 0.55, h, w, h * 0.75, w, 0);
      for (let j = lobes - 1; j >= 0; j--) {
        const x0 = -w + (2 * w * j) / lobes;
        ctx.quadraticCurveTo(x0 + w / lobes, -3.2 * z * (1 - 0.5 * s.c), x0, 0);
      }
      ctx.closePath();
    };
    const body = ctx.createRadialGradient(0, h * 0.55, h * 0.1, 0, h * 0.3, w * 1.15);
    body.addColorStop(0, k.rgba('#ffffff', 0.5 + 0.3 * flare));
    body.addColorStop(0.35, k.mix([LOOK.bell, LOOK.glow], flare, 0.42));
    body.addColorStop(1, k.mix([LOOK.bell, LOOK.glow], flare, 0.12));
    ctx.fillStyle = body;
    bellPath();
    ctx.fill();
    ctx.strokeStyle = k.mix([LOOK.bell, '#ffffff'], 0.5, 0.65);
    ctx.lineWidth = 1.1 * z;
    bellPath();
    ctx.stroke();

    // Four horseshoe gonads seen through the bell, and the inner canal ring.
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 4; j++) {
      const cx = (j - 1.5) * w * 0.3;
      const cy = h * (0.38 + 0.06 * Math.cos((j - 1.5) * 1.2));
      const r = w * 0.17;
      const lobe = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      lobe.addColorStop(0, k.rgba(LOOK.glow, 0.5 + 0.4 * flare));
      lobe.addColorStop(0.55, k.rgba(LOOK.glow, 0.22 + 0.3 * flare));
      lobe.addColorStop(1, k.rgba(LOOK.glow, 0));
      ctx.fillStyle = lobe;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = k.rgba(LOOK.bell, 0.35);
    ctx.lineWidth = 0.8 * z;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.3, w * 0.7, h * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Bioluminescent dots along the margin.
    for (let j = 0; j <= lobes; j++) {
      const x = -w + (2 * w * j) / lobes;
      const tw = 0.55 + 0.45 * Math.sin(k.time * 3 + j * 1.9);
      ctx.fillStyle = k.mix([LOOK.bell, LOOK.glow], 0.5 + 0.5 * flare, 0.5 * tw + 0.5 * flare);
      ctx.beginPath();
      ctx.arc(x, 0, (1.3 + 1.2 * flare) * z, 0, Math.PI * 2);
      ctx.fill();
    }
    // A soft highlight across the top of the dome.
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, h * 0.68, w * 0.5, h * 0.22, 0, Math.PI * 1.1, Math.PI * 1.75);
    ctx.stroke();
    ctx.restore();

    if (flare > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 90 * z);
      g.addColorStop(0, k.rgba(LOOK.glow, 0.45 * flare));
      g.addColorStop(1, k.rgba(LOOK.glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 90 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x: s.x, y: s.y, color: LOOK.glow, radius: 80 * z, life: 26, width: 2 });
    k.ring({ x, y, color: '#ffffff', radius: 34 * z, life: 14, width: 1.4 });
    k.burst({ x, y, count: 26, colors: ['#ffffff', LOOK.glow, LOOK.bell], speed: [1, 4], life: [26, 46],
      size: [1, 2.4], gravity: -0.02, drag: 0.96, shape: 'dot' });
  },

  // A soft electric shimmer over a low, watery pulse.
  sound(v) {
    v.tone({ type: 'sine', freq: 180, to: 120, dur: 0.4, gain: 0.4 });
    v.noise({ dur: 0.35, gain: 0.32, filter: 'bandpass', freq: 5200, to: 2600, q: 3 });
    v.tone({ type: 'triangle', freq: 1320, to: 1760, dur: 0.22, gain: 0.12, delay: 0.02 });
    v.tone({ type: 'sine', freq: 2640, to: 2200, dur: 0.3, gain: 0.08, delay: 0.05 });
  },
};
})();
