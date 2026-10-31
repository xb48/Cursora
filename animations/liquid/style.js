// Liquid: a glossy soft-body gel that rides the cursor. Shape matching keeps
// it round; inertia makes it wobble; shake it hard enough and it splats.
(() => {
const RADIUS = 30;      // rest radius, px at size 1
const N = 18;           // rim points
const DRAG = 0.9;
const GRAVITY = 0.12;

/** Rest offsets around the center for a given radius. */
const ring = r => Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2;
  return { ox: Math.cos(a) * r, oy: Math.sin(a) * r };
});

/** Closed Catmull–Rom path through the rim points. */
function blobPath(ctx, pts) {
  const p = i => pts[(i + N) % N];
  ctx.beginPath();
  ctx.moveTo(p(0).x, p(0).y);
  for (let i = 0; i < N; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    );
  }
  ctx.closePath();
}

window.PROP = {
  defaults: {
    size: 1,
    firmness: 0.12,
    splat: 0.3,
    color: '#7c5cff',
    shine: '#d9ceff',
  },

  spawn(x, y, k) {
    const rest = ring(RADIUS * k.LOOK.size);
    const pts = rest.map(o => ({ x: x + o.ox, y: y + o.oy, px: x + o.ox, py: y + o.oy }));
    return { cx: x, cy: y, cvy: 0, pts, deform: 0, squash: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const R = RADIUS * LOOK.size;
    const rest = ring(R);
    if (k.dropping) {
      s.cvy += 0.8;
      s.cy += s.cvy;
    } else {
      // Cursor replacer: pinned exactly to the pointer tip (no lag).
      s.cx = m.x;
      s.cy = m.y;
    }

    // Verlet step, then pull every rim point toward its rest place (shape matching).
    let dev = 0;
    for (let i = 0; i < N; i++) {
      const p = s.pts[i];
      const vx = (p.x - p.px) * DRAG;
      const vy = (p.y - p.py) * DRAG;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
      const tx = s.cx + rest[i].ox;
      const ty = s.cy + rest[i].oy;
      p.x += (tx - p.x) * LOOK.firmness;
      p.y += (ty - p.y) * LOOK.firmness;
      dev += Math.hypot(p.x - tx, p.y - ty);
    }
    // Neighbor spacing keeps the membrane smooth.
    const span = 2 * R * Math.sin(Math.PI / N);
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < N; i++) {
        const a = s.pts[i];
        const b = s.pts[(i + 1) % N];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const f = ((d - span) / d) * 0.25;
        a.x += dx * f; a.y += dy * f;
        b.x -= dx * f; b.y -= dy * f;
      }
    }
    s.deform = dev / N / R;
    s.squash = Math.max(0, s.squash - 0.05);

    if (!k.dropping && s.deform > LOOK.splat) {
      // Splat from the rim point that's flying outward fastest.
      let best = s.pts[0], bestOut = -Infinity;
      for (const p of s.pts) {
        const out = (p.x - p.px) * (p.x - s.cx) + (p.y - p.py) * (p.y - s.cy);
        if (out > bestOut) { bestOut = out; best = p; }
      }
      if (k.fire(best.x, best.y)) {
        s.squash = 1;
        for (let i = 0; i < N; i++) {
          // Snap back with a little overshoot for a satisfying jiggle.
          const p = s.pts[i];
          p.px = p.x;
          p.py = p.y;
          p.x = k.lerp(p.x, s.cx + rest[i].ox * 1.12, 0.6);
          p.y = k.lerp(p.y, s.cy + rest[i].oy * 1.12, 0.6);
        }
      }
    }
  },

  gone(s, k) {
    return s.cy - RADIUS * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const R = RADIUS * LOOK.size;
    const base = LOOK.color;

    // Body with a soft drop shadow.
    ctx.shadowColor = 'rgba(8, 4, 24, 0.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const body = ctx.createRadialGradient(s.cx - R * 0.35, s.cy - R * 0.45, R * 0.1, s.cx, s.cy, R * 1.25);
    body.addColorStop(0, LOOK.shine);
    body.addColorStop(0.35, k.shade(base, 0.15));
    body.addColorStop(0.8, base);
    body.addColorStop(1, k.shade(base, -0.45));
    ctx.fillStyle = body;
    blobPath(ctx, s.pts);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    // Inner rim for depth, then a crisp outline.
    ctx.save();
    blobPath(ctx, s.pts);
    ctx.clip();
    ctx.strokeStyle = k.rgba('#000000', 0.22);
    ctx.lineWidth = R * 0.28;
    blobPath(ctx, s.pts);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = k.rgba('#ffffff', 0.35);
    ctx.lineWidth = 1.2;
    blobPath(ctx, s.pts);
    ctx.stroke();

    // Specular highlights follow the gel's lean (rim centroid vs. center).
    const mx = s.pts.reduce((sum, p) => sum + p.x, 0) / N;
    const lean = k.clamp((mx - s.cx) / R, -0.4, 0.4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(s.cx - R * 0.32 + lean * R * 0.3, s.cy - R * 0.46, R * 0.3, R * 0.15, -0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(s.cx + R * 0.05, s.cy - R * 0.62, R * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const out = Math.atan2(y - s.cy, x - s.cx);
    k.burst({ x, y, count: 16, colors: [LOOK.color, k.shade(LOOK.color, 0.25), LOOK.shine],
      speed: [2, 7], life: [26, 46], size: [2.4 * z, 5 * z], gravity: 0.32, drag: 0.98,
      shape: 'dot', angle: out, spread: 1.8, blend: 'source-over' });
    k.ring({ x: s.cx, y: s.cy, color: LOOK.shine, radius: RADIUS * 2.2 * z, life: 16, width: 2 });
  },

  sound(v) {
    v.tone({ type: 'sine', freq: 620, to: 150, dur: 0.17, gain: 0.55 });
    v.tone({ type: 'sine', freq: 1300, to: 320, dur: 0.08, gain: 0.2, delay: 0.025 });
    v.noise({ dur: 0.09, gain: 0.18, filter: 'lowpass', freq: 900, to: 300, delay: 0.01 });
  },
};
})();
