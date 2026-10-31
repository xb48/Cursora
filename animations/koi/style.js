// Koi: a kohaku koi that swims after the cursor with a living, undulating
// spine. When it catches the cursor at speed, it breaks the surface in a splash.
(() => {
const N = 14;      // spine points, head first
const SEG = 6.2;   // spacing, px at size 1

const widthAt = (t, z) => z * (t < 0.22
  ? 5.5 + 3.5 * Math.sin((t / 0.22) * Math.PI / 2)
  : 9 * Math.pow(1 - (t - 0.22) / 0.78, 1.15) + 0.8);

/** Spine with the swimming wave applied; each point carries its forward angle. */
function bodyPoints(s, k) {
  const z = k.LOOK.size;
  const sp = s.spine;
  const amount = Math.min(1, 0.35 + s.speed * 0.08);
  return sp.map((p, i) => {
    const t = i / (N - 1);
    const a = i === 0 ? s.heading : Math.atan2(sp[i - 1].y - p.y, sp[i - 1].x - p.x);
    const amp = Math.sin(s.phase - i * 0.55) * (0.6 + 3.2 * t) * z * amount;
    return { x: p.x - Math.sin(a) * amp, y: p.y + Math.cos(a) * amp, a };
  });
}

/** Closed outline: left side head→tail, right side tail→head, rounded nose. */
function bodyPath(ctx, pts, z) {
  const left = [], right = [];
  pts.forEach((p, i) => {
    const w = widthAt(i / (N - 1), z);
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  });
  const head = pts[0];
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < N; i++) {
    ctx.quadraticCurveTo(left[i - 1].x, left[i - 1].y, (left[i - 1].x + left[i].x) / 2, (left[i - 1].y + left[i].y) / 2);
  }
  ctx.lineTo(left[N - 1].x, left[N - 1].y);
  ctx.lineTo(right[N - 1].x, right[N - 1].y);
  for (let i = N - 2; i >= 0; i--) {
    ctx.quadraticCurveTo(right[i + 1].x, right[i + 1].y, (right[i + 1].x + right[i].x) / 2, (right[i + 1].y + right[i].y) / 2);
  }
  ctx.lineTo(right[0].x, right[0].y);
  const nose = widthAt(0, z) * 1.7;
  ctx.quadraticCurveTo(head.x + Math.cos(head.a) * nose, head.y + Math.sin(head.a) * nose, left[0].x, left[0].y);
  ctx.closePath();
}

/** A fin: a teardrop from (x, y) pointing along `a`. */
function fin(ctx, x, y, a, len, wide) {
  const ca = Math.cos(a), sa = Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x + ca * len * 0.4 - sa * wide, y + sa * len * 0.4 + ca * wide,
    x + ca * len - sa * wide * 0.6, y + sa * len + ca * wide * 0.6,
    x + ca * len, y + sa * len,
  );
  ctx.bezierCurveTo(
    x + ca * len * 0.8 + sa * wide * 0.3, y + sa * len * 0.8 - ca * wide * 0.3,
    x + ca * len * 0.3 + sa * wide * 0.2, y + sa * len * 0.3 - ca * wide * 0.2,
    x, y,
  );
  ctx.closePath();
}

window.PROP = {
  defaults: {
    size: 1,
    agility: 1,
    catchSpeed: 7,
    body: '#f6f2ea',
    patch: '#ff5a1f',
    fin: '#ffd9c2',
    ripples: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const spine = [];
    for (let i = 0; i < N; i++) spine.push({ x: x - i * SEG * z, y });
    return { spine, heading: 0, speed: 0, phase: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const head = s.spine[0];
    let tx = m.x, ty = m.y;
    if (k.dropping) {
      tx = head.x;
      ty = k.H + 400;
    } else if (Math.hypot(m.x - head.x, m.y - head.y) < 60 * z && m.speed < 1 && s.speed < 3 * z) {
      // Idle (only once it has slowed down, so a dart still reaches the cursor):
      // circle lazily around a resting cursor instead of hovering on it.
      const a = k.time * 0.9;
      tx = m.x + Math.cos(a) * 48 * z;
      ty = m.y + Math.sin(a) * 48 * z;
    }
    const turn = 0.11 * LOOK.agility;
    s.heading += k.clamp(k.wrapPi(Math.atan2(ty - head.y, tx - head.x) - s.heading), -turn, turn);
    const want = k.dropping ? 12 * z : k.clamp(Math.hypot(tx - head.x, ty - head.y) * 0.09, 0.6, 15 * z);
    // Quick to accelerate, slow to brake: a dart glides on into the catch.
    s.speed = k.lerp(s.speed, want, want > s.speed ? 0.14 : 0.05);
    head.x += Math.cos(s.heading) * s.speed;
    head.y += Math.sin(s.heading) * s.speed;
    s.phase += 0.14 + s.speed * 0.035;

    // Follow-the-leader spine at fixed spacing.
    for (let i = 1; i < N; i++) {
      const a = s.spine[i - 1], b = s.spine[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * SEG * z;
      b.y = a.y + (dy / d) * SEG * z;
    }
    if (k.dropping) return;

    if (LOOK.ripples && s.speed > 2 && k.frame % 14 === 0) {
      k.ring({ x: head.x, y: head.y, color: 'rgba(190, 230, 255, 0.55)', radius: 22 * z, life: 30, width: 1.2, blend: 'source-over' });
    }
    // Catch: reaching the real cursor while swimming fast.
    if (Math.hypot(m.x - head.x, m.y - head.y) < 16 * z && s.speed / z > LOOK.catchSpeed && k.fire(head.x, head.y)) {
      s.speed *= 0.35;
      s.heading += k.rand(-1.2, 1.2);
    }
  },

  gone(s, k) {
    return s.spine[N - 1].y - 30 > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const pts = bodyPoints(s, k);
    const head = pts[0];
    const tail = pts[N - 1];

    // Soft shadow on the pond floor.
    ctx.save();
    ctx.translate(5 * z, 9 * z);
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = 'rgba(0, 25, 45, 0.28)';
    bodyPath(ctx, pts, z);
    ctx.fill();
    ctx.restore();

    // Fins under the body: pectorals flap, tail fans out and sways.
    const flap = Math.sin(s.phase * 0.7) * 0.25;
    ctx.fillStyle = k.rgba(LOOK.fin, 0.72);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 0.8;
    const p2 = pts[2];
    for (const side of [-1, 1]) {
      const nx = -Math.sin(p2.a) * side, ny = Math.cos(p2.a) * side;
      const w = widthAt(2 / (N - 1), z) * 0.85;
      fin(ctx, p2.x + nx * w, p2.y + ny * w, p2.a + Math.PI - side * (0.9 + flap), 11 * z, 4.5 * z * side);
      ctx.fill();
      ctx.stroke();
    }
    const back = tail.a + Math.PI;
    const sway = Math.sin(s.phase - N * 0.55) * 0.25;
    for (const side of [-1, 1]) {
      fin(ctx, tail.x, tail.y, back + side * 0.45 + sway, 15 * z, 5 * z * side);
      ctx.fill();
      ctx.stroke();
    }

    // Body with kohaku patches, clipped to the outline.
    const shade = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 90 * z);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.5, LOOK.body);
    shade.addColorStop(1, k.shade(LOOK.body, -0.12));
    ctx.fillStyle = shade;
    bodyPath(ctx, pts, z);
    ctx.fill();
    ctx.save();
    bodyPath(ctx, pts, z);
    ctx.clip();
    ctx.fillStyle = LOOK.patch;
    for (const [i, side, r] of [[1, 0.25, 6], [5, -0.35, 7.5], [8, 0.3, 5.5], [10, -0.2, 3.5]]) {
      const p = pts[i];
      const off = widthAt(i / (N - 1), z) * side;
      ctx.beginPath();
      ctx.ellipse(p.x - Math.sin(p.a) * off, p.y + Math.cos(p.a) * off, r * z * 1.25, r * z, p.a, 0, Math.PI * 2);
      ctx.fill();
    }
    // Inner edge shading for roundness, plus a dorsal highlight.
    ctx.strokeStyle = 'rgba(80, 40, 20, 0.14)';
    ctx.lineWidth = 3.5 * z;
    bodyPath(ctx, pts, z);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.4 * z;
    ctx.beginPath();
    ctx.moveTo(pts[1].x, pts[1].y);
    for (let i = 2; i < N - 3; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(70, 35, 15, 0.35)';
    ctx.lineWidth = 0.8;
    bodyPath(ctx, pts, z);
    ctx.stroke();

    // Eyes.
    for (const side of [-1, 1]) {
      const ex = head.x - Math.cos(head.a) * 1.5 * z - Math.sin(head.a) * 3.8 * z * side;
      const ey = head.y - Math.sin(head.a) * 1.5 * z + Math.cos(head.a) * 3.8 * z * side;
      ctx.fillStyle = '#16120f';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.4 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(ex - 0.4 * z, ey - 0.4 * z, 0.45 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  onFire(s, x, y, k) {
    const z = k.LOOK.size;
    k.ring({ x, y, color: '#d8f1ff', radius: 46 * z, life: 22, width: 2.5, blend: 'source-over' });
    let t = 0;
    k.effect(() => {
      t += 1;
      if (t === 7) k.ring({ x, y, color: 'rgba(216, 241, 255, 0.8)', radius: 72 * z, life: 26, width: 1.6, blend: 'source-over' });
      return t < 8;
    });
    k.burst({ x, y, count: 26, colors: ['#ffffff', '#cdeeff', '#8fd3ff'], speed: [2, 6], life: [18, 32],
      size: [1.2 * z, 2.8 * z], gravity: 0.28, drag: 0.97, shape: 'dot', angle: -Math.PI / 2, spread: 2.6, blend: 'source-over' });
  },

  sound(v) {
    v.noise({ dur: 0.35, gain: 0.7, filter: 'bandpass', freq: 1800, to: 600, q: 0.9 });
    v.tone({ type: 'sine', freq: 420, to: 160, dur: 0.12, gain: 0.35 });
    v.noise({ dur: 0.25, gain: 0.2, filter: 'highpass', freq: 6000, to: 3000, delay: 0.05 });
  },
};
})();
