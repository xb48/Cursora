// Gyroscope: a precision gyroscope whose pivot is the pointer. Three nested
// gimbal rings swing with your motion in true 3D around a spinning rotor; jolt
// it with a hard change of direction and the rings snap and ring out.
(() => {
const R = 26;            // outer ring radius, px at size 1
const RINGS = [          // radius (as a fraction of R), stroke width
  { r: 1.0, w: 2.8 },
  { r: 0.82, w: 2.4 },
  { r: 0.65, w: 2.0 },
];
const SEGS = 56;         // segments per ring
const BASE = [1.15, 1.2, 0.0];   // rest angle of each gimbal axis
const MOM = 0.12;        // momentum smoothing for the jolt detector

// ── 3×3 rotation helpers (row-major arrays) ─────────────────────────────────
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const rotX = t => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = t => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const apply = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** Frames of the outer, middle and inner gimbal (each nested in the previous). */
function frames(s) {
  const tilt = mul(rotX(s.tx), rotY(s.ty));
  const outer = mul(tilt, rotY(s.a[0]));
  const middle = mul(outer, rotX(s.a[1]));
  const inner = mul(middle, rotY(s.a[2]));
  return [outer, middle, inner];
}

window.PROP = {
  defaults: {
    size: 1,
    jolt: 30,
    metal: '#c9ced6',
    accent: '#36d1ff',
    rotor: '#ff7a1a',
  },

  spawn(x, y) {
    return {
      x, y, vx: 0, vy: 0,
      a: BASE.slice(), w: [0, 0, 0],
      tx: 0, ty: 0, spin: 0, spinRate: 0.25,
      mx: 0, my: 0, armed: true, flash: 0,
    };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    s.flash = Math.max(0, s.flash - 0.045);
    s.spin += s.spinRate;
    if (k.dropping) {
      s.vy += 0.7;
      s.x += s.vx;
      s.y += s.vy;
      s.a[0] += 0.08;
      s.a[1] += 0.05;
      return;
    }
    // Cursor replacer: pinned exactly to the pointer tip (no lag).
    s.vx = m.x - s.x;
    s.vy = m.y - s.y;
    s.x = m.x;
    s.y = m.y;

    // Gimbals: damped springs pushed by the motion; the inner one also precesses.
    const push = [s.vx * 0.006, s.vy * 0.006, 0];
    for (let i = 0; i < 3; i++) {
      s.w[i] += push[i] - (i === 2 ? 0 : (s.a[i] - BASE[i]) * 0.05);
      s.w[i] *= 0.9;
      s.a[i] += s.w[i];
    }
    s.a[2] += 0.012;
    s.tx = k.lerp(s.tx, k.clamp(s.vy * 0.02, -0.5, 0.5), 0.15);
    s.ty = k.lerp(s.ty, k.clamp(-s.vx * 0.02, -0.5, 0.5), 0.15);
    s.spinRate = k.lerp(s.spinRate, 0.25 + Math.min(0.6, m.speed * 0.02), 0.08);

    // Jolt: a fast move against the motion it still carries. Hysteresis
    // re-arms it; a gated fire stays armed and retries.
    const speed = m.speed;
    const mom = Math.hypot(s.mx, s.my);
    if (speed < LOOK.jolt * 0.4) s.armed = true;
    if (s.armed && speed > LOOK.jolt && mom > 10 && s.vx * s.mx + s.vy * s.my < -0.3 * speed * mom && k.fire(s.x, s.y)) {
      s.armed = false;
      s.flash = 1;
      s.w[0] += 0.35 * Math.sign(s.vx || 1);
      s.w[1] += 0.3 * Math.sign(s.vy || 1);
      s.spinRate = 0.9;
    }
    s.mx = s.mx * (1 - MOM) + s.vx * MOM;
    s.my = s.my * (1 - MOM) + s.vy * MOM;
  },

  gone(s, k) {
    return s.y - R * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const rad = R * z;
    const fr = frames(s);

    // Every ring segment, sorted later into behind / in front of the rotor.
    const segs = [];
    RINGS.forEach((ring, i) => {
      const r = ring.r * rad;
      for (let j = 0; j < SEGS; j++) {
        const t0 = (j / SEGS) * Math.PI * 2, t1 = ((j + 1) / SEGS) * Math.PI * 2;
        const p = apply(fr[i], Math.cos(t0) * r, Math.sin(t0) * r, 0);
        const q = apply(fr[i], Math.cos(t1) * r, Math.sin(t1) * r, 0);
        segs.push({ i, p, q, d: (p[2] + q[2]) / 2 / r, w: ring.w * z });
      }
    });
    const strokeSegs = list => {
      for (const sg of list) {
        const light = (sg.d + 1) / 2;   // 0 = far side, 1 = facing us
        ctx.strokeStyle = k.mix(['#3a414c', LOOK.metal, '#ffffff'], 0.25 + 0.75 * light);
        ctx.lineWidth = sg.w;
        ctx.beginPath();
        ctx.moveTo(s.x + sg.p[0], s.y + sg.p[1]);
        ctx.lineTo(s.x + sg.q[0], s.y + sg.q[1]);
        ctx.stroke();
        if (s.flash > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = k.rgba(LOOK.accent, 0.8 * s.flash);
          ctx.lineWidth = sg.w + 2 * z;
          ctx.beginPath();
          ctx.moveTo(s.x + sg.p[0], s.y + sg.p[1]);
          ctx.lineTo(s.x + sg.q[0], s.y + sg.q[1]);
          ctx.stroke();
          ctx.restore();
        }
      }
    };
    // Bearings where each gimbal pivots in its parent: outer and inner on
    // their Y axis, middle on its X axis.
    const bearings = front => {
      RINGS.forEach((ring, i) => {
        for (const sx of [-1, 1]) {
          const p = i === 1 ? apply(fr[i], sx * ring.r * rad, 0, 0) : apply(fr[i], 0, sx * ring.r * rad, 0);
          if ((p[2] >= 0) !== front) continue;
          ctx.fillStyle = front ? '#f4f6f9' : '#6b7280';
          ctx.beginPath();
          ctx.arc(s.x + p[0], s.y + p[1], 1.9 * z, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    // Soft shadow so it reads as an object above the desktop.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.filter = `blur(${Math.round(4 * z)}px)`;
    ctx.beginPath();
    ctx.ellipse(s.x + 4 * z, s.y + rad * 1.25, rad * 0.85, rad * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    strokeSegs(segs.filter(sg => sg.d < 0));
    bearings(false);

    // Rotor: a disc spinning on an axle across the inner ring, perpendicular
    // to that ring's pivots (axle along X, disc in the YZ plane).
    const inner = fr[2];
    const rr = rad * 0.46;
    const disc = [];
    for (let j = 0; j < 40; j++) {
      const t = (j / 40) * Math.PI * 2;
      disc.push(apply(inner, 0, Math.cos(t) * rr, Math.sin(t) * rr));
    }
    const g = ctx.createRadialGradient(s.x - rr * 0.3, s.y - rr * 0.3, rr * 0.1, s.x, s.y, rr * 1.2);
    g.addColorStop(0, k.shade(LOOK.rotor, 0.45));
    g.addColorStop(0.6, LOOK.rotor);
    g.addColorStop(1, k.shade(LOOK.rotor, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath();
    disc.forEach((p, j) => (j ? ctx.lineTo(s.x + p[0], s.y + p[1]) : ctx.moveTo(s.x + p[0], s.y + p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 0.9 * z;
    ctx.stroke();
    // Spin marks on the disc face.
    ctx.strokeStyle = 'rgba(30, 12, 0, 0.45)';
    ctx.lineWidth = 1.1 * z;
    for (let j = 0; j < 3; j++) {
      const t = s.spin + (j / 3) * Math.PI * 2;
      const p = apply(inner, 0, Math.cos(t) * rr * 0.92, Math.sin(t) * rr * 0.92);
      const q = apply(inner, 0, Math.cos(t) * rr * 0.35, Math.sin(t) * rr * 0.35);
      ctx.beginPath();
      ctx.moveTo(s.x + q[0], s.y + q[1]);
      ctx.lineTo(s.x + p[0], s.y + p[1]);
      ctx.stroke();
    }
    // Axle through the disc, ending in the inner ring.
    const axA = apply(inner, rad * 0.65, 0, 0), axB = apply(inner, -rad * 0.65, 0, 0);
    ctx.strokeStyle = k.mix(['#3a414c', LOOK.metal], 0.8);
    ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.moveTo(s.x + axA[0], s.y + axA[1]);
    ctx.lineTo(s.x + axB[0], s.y + axB[1]);
    ctx.stroke();

    strokeSegs(segs.filter(sg => sg.d >= 0));
    bearings(true);

    // The pivot: exactly the pointer's hotspot.
    ctx.fillStyle = LOOK.accent;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.6 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.2 * z, 0, Math.PI * 2);
    ctx.fill();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: LOOK.accent, radius: R * 2.6 * z, life: 20, width: 2.4 });
    k.ring({ x, y, color: '#ffffff', radius: R * 1.6 * z, life: 14, width: 1.6 });
    k.burst({ x, y, count: 24, colors: ['#ffffff', LOOK.accent, LOOK.metal], speed: [3, 9], life: [12, 24],
      size: [1, 2.2], gravity: 0, drag: 0.9, shape: 'spark' });
  },

  // A metallic ping with a ringing overtone and a short mechanical click.
  sound(v) {
    v.tone({ type: 'sine', freq: 2093, dur: 0.6, gain: 0.26 });
    v.tone({ type: 'sine', freq: 2793, dur: 0.42, gain: 0.14, delay: 0.005 });
    v.tone({ type: 'triangle', freq: 880, to: 840, dur: 0.3, gain: 0.16 });
    v.noise({ dur: 0.04, gain: 0.35, filter: 'bandpass', freq: 3500, q: 2 });
  },
};
})();
