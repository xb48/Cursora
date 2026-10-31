// Tesseract: a holographic 4D hypercube hovering over a projector at the
// cursor. Motion spins it through the fourth dimension; spin it hard enough
// and the hologram glitches.
(() => {
const VERTS = [];
for (let i = 0; i < 16; i++) VERTS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const EDGES = [];   // the 32 edges: vertex pairs differing in exactly one axis
for (let i = 0; i < 16; i++) {
  for (let b = 0; b < 4; b++) {
    const j = i ^ (1 << b);
    if (j > i) EDGES.push([i, j]);
  }
}
const SCALE = 115;  // projection scale, px at size 1
const LIFT = 64;    // hover height above the projector (the cursor)
const DAMP = 0.95;

function rotate(p, i, j, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const pi = p[i], pj = p[j];
  p[i] = pi * c - pj * s;
  p[j] = pi * s + pj * c;
}

/** 4D rotation → 3D (perspective along w) → 2D (fixed tilt, perspective along z). */
function project(s, z, ox, oy) {
  const tc = Math.cos(0.45), ts = Math.sin(0.45);
  return VERTS.map(v => {
    const p = v.slice();
    rotate(p, 0, 3, s.xw);
    rotate(p, 1, 3, s.yw);
    rotate(p, 2, 3, s.zw);
    rotate(p, 0, 1, s.xy);
    const f4 = 1 / (3 - p[3]);
    const x3 = p[0] * f4, y3 = p[1] * f4, z3 = p[2] * f4;
    const y = y3 * tc - z3 * ts;
    const d = y3 * ts + z3 * tc;
    const f3 = 1 / (2.6 - d);
    return { x: ox + x3 * f3 * SCALE * z, y: oy + y * f3 * SCALE * z, w: p[3] };
  });
}

function drawEdges(ctx, pts, k, color, z, dx = 0) {
  for (const [a, b] of EDGES) {
    const t = k.clamp(((pts[a].w + pts[b].w) / 2 + 1.6) / 3.2, 0, 1);
    ctx.strokeStyle = color || k.mix([k.LOOK.colorB, k.LOOK.colorA], t, 0.9);
    ctx.lineWidth = (0.9 + 1.4 * t) * z;
    ctx.beginPath();
    ctx.moveTo(pts[a].x + dx, pts[a].y);
    ctx.lineTo(pts[b].x + dx, pts[b].y);
    ctx.stroke();
  }
}

window.PROP = {
  defaults: {
    size: 1,
    gain: 1,
    spin: 0.26,
    colorA: '#3df5ff',
    colorB: '#b46bff',
    projector: true,
  },

  spawn(x, y) {
    return { x, y, vy: 0, xw: 0.3, yw: 0.2, zw: 0, xy: 0.4, oxw: 0, oyw: 0, ozw: 0, armed: true, glitch: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    if (k.dropping) {
      s.vy += 0.6;
      s.y += s.vy;
    } else {
      // Cursor replacer: pinned exactly to the pointer tip (no lag).
      s.x = m.x;
      s.y = m.y;
      const g = 0.0006 * LOOK.gain;
      s.oxw += m.vx * g;
      s.oyw += m.vy * g;
      s.ozw += m.speed * g;
    }
    s.oxw *= DAMP;
    s.oyw *= DAMP;
    s.ozw *= DAMP;
    s.xw += s.oxw + 0.004;
    s.yw += s.oyw;
    s.zw += s.ozw + 0.006;
    s.xy += 0.003;
    s.glitch = Math.max(0, s.glitch - 0.06);

    // Glitch on a hard spin. Hysteresis re-arms once spin drops well below the
    // threshold; a gated trigger (cooldown, spawn grace) stays armed and retries.
    const spin = Math.hypot(s.oxw, s.oyw, s.ozw);
    if (spin < LOOK.spin * 0.7) s.armed = true;
    if (!k.dropping && s.armed && spin > LOOK.spin && k.fire(s.x, s.y - LIFT * LOOK.size)) {
      s.armed = false;
      s.glitch = 1;
      s.oxw *= 0.3;
      s.oyw *= 0.3;
      s.ozw *= 0.3;
    }
  },

  gone(s, k) {
    return s.y - (LIFT + 60) * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const cx = s.x;
    const cy = s.y - LIFT * z;

    if (LOOK.projector && !k.dropping) {
      // Light cone from the emitter up into the hologram.
      const cone = ctx.createLinearGradient(0, s.y, 0, cy);
      cone.addColorStop(0, k.rgba(LOOK.colorA, 0.28));
      cone.addColorStop(1, k.rgba(LOOK.colorA, 0));
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(s.x - 5 * z, s.y);
      ctx.lineTo(cx - 44 * z, cy + 8 * z);
      ctx.lineTo(cx + 44 * z, cy + 8 * z);
      ctx.lineTo(s.x + 5 * z, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b1220';
      ctx.strokeStyle = k.rgba(LOOK.colorA, 0.9);
      ctx.lineWidth = 1.4 * z;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 12 * z, 4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y - 0.5 * z, 1.8 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    const pts = project(s, z, cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.shadowColor = LOOK.colorA;
    ctx.shadowBlur = 8 + 10 * s.glitch;
    drawEdges(ctx, pts, k, null, z);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.7 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hologram scanlines across the object's bounds.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    ctx.fillStyle = k.rgba(LOOK.colorA, 0.06);
    for (let y = minY + (k.frame % 4); y < maxY; y += 4 * z) {
      ctx.fillRect(minX - 6 * z, y, maxX - minX + 12 * z, 1);
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: LOOK.colorA, radius: 90 * z, life: 18, width: 3 });
    k.burst({ x, y, count: 30, colors: [LOOK.colorA, LOOK.colorB, '#ffffff'], speed: [2, 9],
      life: [12, 26], size: [1.2, 2.6], gravity: 0, drag: 0.92, shape: 'dot' });
    // RGB split + scan tears that follow the live hologram for a moment.
    let t = 0;
    k.effect(c => {
      t += 1;
      if (t > 14) return false;
      const pts = project(s, z, s.x, s.y - LIFT * z);
      const off = (1 - t / 14) * 6 * z;
      c.globalAlpha = 0.7 * (1 - t / 14);
      c.lineCap = 'round';
      drawEdges(c, pts, k, '#ff2b5e', z, -off);
      drawEdges(c, pts, k, '#2bfff1', z, off);
      c.fillStyle = k.rgba(LOOK.colorA, 0.5);
      for (let n = 0; n < 3; n++) {
        const p = pts[(t * 5 + n * 7) % 16];
        c.fillRect(p.x - 40 * z, p.y, 80 * z, (1 + (n % 2) * 2) * z);
      }
      return true;
    });
  },

  sound(v) {
    v.tone({ type: 'square', freq: 880, dur: 0.03, gain: 0.2 });
    v.tone({ type: 'square', freq: 1320, dur: 0.03, gain: 0.18, delay: 0.04 });
    v.tone({ type: 'square', freq: 660, dur: 0.03, gain: 0.18, delay: 0.08 });
    v.tone({ type: 'square', freq: 1760, dur: 0.05, gain: 0.16, delay: 0.11 });
    v.noise({ dur: 0.06, gain: 0.3, filter: 'highpass', freq: 5000, to: 3000, delay: 0.02 });
    v.tone({ type: 'sine', freq: 220, to: 110, dur: 0.25, gain: 0.25 });
  },
};
})();
