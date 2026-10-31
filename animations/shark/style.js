// Shark: a top-down shark hunting the little bait fish at your cursor. It
// chases, then circles once it's close. Charge straight at its head and it bites.
(() => {
const N = 16;      // spine points, head first
const SEG = 7;     // spacing, px at size 1
const ORBIT = 80;  // circling radius around the bait

const widthAt = (t, z) => z * (t < 0.12
  ? 1.5 + 6.5 * Math.sin((t / 0.12) * Math.PI / 2)
  : t < 0.38
    ? 8 + 2.2 * Math.sin(((t - 0.12) / 0.26) * Math.PI / 2)
    : 10.2 * Math.pow(1 - (t - 0.38) / 0.62, 1.4) + 0.9);

/** Spine with a tail-driven swimming wave; each point carries its forward angle. */
function bodyPoints(s, k) {
  const z = k.LOOK.size;
  const sp = s.spine;
  const amount = Math.min(1, 0.4 + s.speed * 0.07);
  return sp.map((p, i) => {
    const t = i / (N - 1);
    const a = i === 0 ? s.heading : Math.atan2(sp[i - 1].y - p.y, sp[i - 1].x - p.x);
    const amp = Math.sin(s.phase - i * 0.45) * (0.2 + 3.6 * t * t) * z * amount;
    return { x: p.x - Math.sin(a) * amp, y: p.y + Math.cos(a) * amp, a };
  });
}

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
  const snout = widthAt(0, z) * 2.6;
  ctx.quadraticCurveTo(head.x + Math.cos(head.a) * snout, head.y + Math.sin(head.a) * snout, left[0].x, left[0].y);
  ctx.closePath();
}

/** A fin: a swept teardrop from (x, y) pointing along `a`; `wide` sets which side it bows to. */
function fin(ctx, x, y, a, len, wide) {
  const ca = Math.cos(a), sa = Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x + ca * len * 0.35 - sa * wide, y + sa * len * 0.35 + ca * wide,
    x + ca * len - sa * wide * 0.4, y + sa * len + ca * wide * 0.4,
    x + ca * len, y + sa * len,
  );
  ctx.bezierCurveTo(
    x + ca * len * 0.7 + sa * wide * 0.15, y + sa * len * 0.7 - ca * wide * 0.15,
    x + ca * len * 0.3 + sa * wide * 0.1, y + sa * len * 0.3 - ca * wide * 0.1,
    x, y,
  );
  ctx.closePath();
}

window.PROP = {
  defaults: {
    size: 1,
    agility: 1,
    bite: 20,
    skin: '#5b6f86',
    edge: '#c9d6e3',
    bait: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const spine = [];
    for (let i = 0; i < N; i++) spine.push({ x: x - (ORBIT + i * SEG) * z, y: y + 40 * z });
    return { spine, heading: 0, speed: 0, phase: 0, baitAngle: 0, circle: 1 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const head = s.spine[0];
    let tx = m.x, ty = m.y;
    if (k.dropping) {
      tx = head.x;
      ty = k.H + 400;
    } else if (Math.hypot(m.x - head.x, m.y - head.y) < (ORBIT + 15) * z) {
      // Close in: circle the bait instead of ramming it.
      const around = Math.atan2(head.y - m.y, head.x - m.x) + 0.6 * s.circle;
      tx = m.x + Math.cos(around) * ORBIT * z;
      ty = m.y + Math.sin(around) * ORBIT * z;
    }
    const turn = 0.085 * LOOK.agility;
    s.heading += k.clamp(k.wrapPi(Math.atan2(ty - head.y, tx - head.x) - s.heading), -turn, turn);
    const want = k.dropping ? 12 * z : k.clamp(Math.hypot(tx - head.x, ty - head.y) * 0.07, 1.2 * z, 12 * z);
    s.speed = k.lerp(s.speed, want, want > s.speed ? 0.1 : 0.05);
    head.x += Math.cos(s.heading) * s.speed;
    head.y += Math.sin(s.heading) * s.speed;
    s.phase += 0.1 + s.speed * 0.03;
    for (let i = 1; i < N; i++) {
      const a = s.spine[i - 1], b = s.spine[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * SEG * z;
      b.y = a.y + (dy / d) * SEG * z;
    }
    if (m.speed > 0.5) s.baitAngle = Math.atan2(m.vy, m.vx);
    if (k.dropping) return;

    // Bite: the bait charges straight at the shark's head.
    const dx = m.x - head.x, dy = m.y - head.y;
    const d = Math.hypot(dx, dy) || 1;
    const closing = -(m.vx * dx + m.vy * dy) / d;
    if (d < 85 * z && closing > LOOK.bite && k.fire(head.x + (dx / d) * 8 * z, head.y + (dy / d) * 8 * z)) {
      s.heading = Math.atan2(dy, dx);
      s.speed = Math.max(s.speed, 9 * z);
      s.circle = -s.circle;
    }
  },

  gone(s, k) {
    return s.spine[N - 1].y - 30 > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;

    if (LOOK.bait && !k.dropping) {
      // Bait fish at the cursor, wriggling along its direction of travel.
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(s.baitAngle + Math.sin(k.time * 14) * 0.12);
      const silver = ctx.createLinearGradient(0, -3 * z, 0, 3 * z);
      silver.addColorStop(0, '#f4f8fc');
      silver.addColorStop(1, '#8a9bb0');
      ctx.fillStyle = silver;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6 * z, 2.6 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5 * z, 0);
      ctx.lineTo(-10 * z, -3 * z);
      ctx.lineTo(-10 * z, 3 * z);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1b2430';
      ctx.beginPath();
      ctx.arc(3.4 * z, -0.6 * z, 0.8 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const pts = bodyPoints(s, k);
    const head = pts[0];
    const tail = pts[N - 1];
    const skin = LOOK.skin;

    // Shadow on the sea floor.
    ctx.save();
    ctx.translate(6 * z, 11 * z);
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = 'rgba(0, 18, 35, 0.3)';
    bodyPath(ctx, pts, z);
    ctx.fill();
    ctx.restore();

    // Fins under the body: sickle-shaped pectorals (with a dark trailing edge
    // and a slow flex), small pelvic fins, then the forked tail.
    const finFill = k.shade(skin, -0.15);
    const flex = Math.sin(s.phase * 0.5) * 0.08;
    const p4 = pts[4];
    for (const side of [-1, 1]) {
      const nx = -Math.sin(p4.a) * side, ny = Math.cos(p4.a) * side;
      const w = widthAt(4 / (N - 1), z) * 0.9;
      fin(ctx, p4.x + nx * w, p4.y + ny * w, p4.a + Math.PI - side * (1.05 + flex), 24 * z, 7.5 * z * side);
      ctx.fillStyle = finFill;
      ctx.fill();
      ctx.strokeStyle = k.rgba('#0b1622', 0.35);
      ctx.lineWidth = 1.2 * z;
      ctx.stroke();
    }
    const p10 = pts[10];
    ctx.fillStyle = finFill;
    for (const side of [-1, 1]) {
      const nx = -Math.sin(p10.a) * side, ny = Math.cos(p10.a) * side;
      const w = widthAt(10 / (N - 1), z) * 0.85;
      fin(ctx, p10.x + nx * w, p10.y + ny * w, p10.a + Math.PI - side * 0.9, 8 * z, 3 * z * side);
      ctx.fill();
    }
    const back = tail.a + Math.PI;
    const sway = Math.sin(s.phase - N * 0.45) * 0.2;
    fin(ctx, tail.x, tail.y, back - 0.55 + sway, 17 * z, -6 * z);
    ctx.fill();
    fin(ctx, tail.x, tail.y, back + 0.5 + sway, 12 * z, 5 * z);
    ctx.fill();

    // Body with a pale edge (countershading seen from above).
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 120 * z);
    g.addColorStop(0, k.shade(skin, 0.25));
    g.addColorStop(0.6, skin);
    g.addColorStop(1, k.shade(skin, -0.2));
    ctx.fillStyle = g;
    bodyPath(ctx, pts, z);
    ctx.fill();
    ctx.save();
    bodyPath(ctx, pts, z);
    ctx.clip();
    ctx.strokeStyle = k.rgba(LOOK.edge, 0.55);
    ctx.lineWidth = 3.5 * z;
    bodyPath(ctx, pts, z);
    ctx.stroke();
    // Countershading: a darker back along the spine, fading to the pale flanks.
    ctx.lineCap = 'round';
    for (const [wf, alpha] of [[1.1, 0.16], [0.7, 0.18], [0.35, 0.2]]) {
      ctx.strokeStyle = k.rgba('#0e1a28', alpha);
      for (let i = 1; i < N - 2; i++) {
        ctx.lineWidth = widthAt(i / (N - 1), z) * wf;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }
    }
    // Lateral lines along each flank.
    ctx.strokeStyle = k.rgba(LOOK.edge, 0.3);
    ctx.lineWidth = 0.7 * z;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 3; i < N - 2; i++) {
        const p = pts[i];
        const w = widthAt(i / (N - 1), z) * 0.55 * side;
        const x = p.x - Math.sin(p.a) * w, y = p.y + Math.cos(p.a) * w;
        if (i === 3) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Five gill slits per side, curving with the body.
    ctx.strokeStyle = 'rgba(15, 25, 40, 0.5)';
    ctx.lineWidth = 0.9 * z;
    for (let gIdx = 0; gIdx < 5; gIdx++) {
      const f = 2.3 + gIdx * 0.32;
      const i0 = Math.floor(f), frac = f - i0;
      const p = pts[i0], q = pts[i0 + 1];
      const x = p.x + (q.x - p.x) * frac, y = p.y + (q.y - p.y) * frac;
      const w = widthAt(f / (N - 1), z);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      const bx = Math.cos(p.a) * 0.8 * z, by = Math.sin(p.a) * 0.8 * z;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + nx * side * w * 0.5, y + ny * side * w * 0.5);
        ctx.quadraticCurveTo(x + nx * side * w * 0.75 - bx, y + ny * side * w * 0.75 - by, x + nx * side * w * 0.97, y + ny * side * w * 0.97);
        ctx.stroke();
      }
    }
    // Caustic light rippling over the back.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(190, 230, 255, 0.07)';
    ctx.lineWidth = 2.2 * z;
    const head0 = pts[0];
    for (let c = 0; c < 5; c++) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const x = head0.x - 120 * z + u * 240 * z;
        const y = head0.y - 60 * z + c * 26 * z + Math.sin(u * 9 + k.time * 1.6 + c * 1.3) * 6 * z + (k.time * 12 % 26) * z;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Dorsal fin, seen edge-on from above.
    ctx.fillStyle = k.shade(skin, -0.4);
    const d0 = pts[5], d1 = pts[8];
    ctx.beginPath();
    ctx.moveTo(d0.x - Math.sin(d0.a) * 2.6 * z, d0.y + Math.cos(d0.a) * 2.6 * z);
    ctx.quadraticCurveTo(pts[7].x, pts[7].y, d1.x, d1.y);
    ctx.quadraticCurveTo(pts[6].x, pts[6].y, d0.x + Math.sin(d0.a) * 2.6 * z, d0.y - Math.cos(d0.a) * 2.6 * z);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Small second dorsal fin near the tail.
    const e0 = pts[11], e1 = pts[12];
    ctx.fillStyle = k.shade(skin, -0.4);
    ctx.beginPath();
    ctx.moveTo(e0.x - Math.sin(e0.a) * 1.1 * z, e0.y + Math.cos(e0.a) * 1.1 * z);
    ctx.lineTo(e1.x, e1.y);
    ctx.lineTo(e0.x + Math.sin(e0.a) * 1.1 * z, e0.y - Math.cos(e0.a) * 1.1 * z);
    ctx.closePath();
    ctx.fill();

    // Eyes with a catch-light, and nostrils near the snout.
    const p1 = pts[1];
    for (const side of [-1, 1]) {
      const w = widthAt(1 / (N - 1), z) * 0.75;
      const ex = p1.x - Math.sin(p1.a) * w * side, ey = p1.y + Math.cos(p1.a) * w * side;
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.4 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(p1.a) * 0.4 * z, ey + Math.sin(p1.a) * 0.4 * z, 0.45 * z, 0, Math.PI * 2);
      ctx.fill();
      const nx0 = head.x + Math.cos(head.a) * 2 * z - Math.sin(head.a) * 1.6 * z * side;
      const ny0 = head.y + Math.sin(head.a) * 2 * z + Math.cos(head.a) * 1.6 * z * side;
      ctx.strokeStyle = 'rgba(15, 25, 40, 0.55)';
      ctx.lineWidth = 0.7 * z;
      ctx.beginPath();
      ctx.moveTo(nx0, ny0);
      ctx.lineTo(nx0 + Math.cos(head.a) * 1.6 * z, ny0 + Math.sin(head.a) * 1.6 * z);
      ctx.stroke();
    }
  },

  onFire(s, x, y, k) {
    const z = k.LOOK.size;
    const a = s.heading;
    k.ring({ x, y, color: '#d8f1ff', radius: 54 * z, life: 20, width: 2.5, blend: 'source-over' });
    k.burst({ x, y, count: 20, colors: ['#ffffff', '#cdeeff'], speed: [1.5, 5], life: [16, 30],
      size: [1 * z, 2.6 * z], gravity: -0.03, drag: 0.95, shape: 'dot', blend: 'source-over' });
    // Jaws: two curved rows of teeth snap shut on the bite line, then fade.
    let t = 0;
    const half = 16 * z;
    k.effect(c => {
      t += 1;
      if (t > 22) return false;
      const gap = k.lerp(13, 1.5, Math.min(1, t / 6)) * z;
      c.globalAlpha = t < 14 ? 1 : 1 - (t - 14) / 8;
      c.translate(x, y);
      c.rotate(a);
      for (const side of [-1, 1]) {           // -1: upper jaw, 1: lower jaw
        const rowY = xx => side * (gap + 5 * z * (xx / half) * (xx / half));
        c.strokeStyle = 'rgba(40, 52, 68, 0.9)';
        c.lineWidth = 3 * z;
        c.beginPath();
        for (let i = 0; i <= 12; i++) {
          const xx = -half + (i / 12) * half * 2;
          if (i === 0) c.moveTo(xx, rowY(xx) + side * 2.5 * z);
          else c.lineTo(xx, rowY(xx) + side * 2.5 * z);
        }
        c.stroke();
        c.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const xx = -13.5 * z + i * 5.4 * z;
          const base = rowY(xx);
          c.beginPath();
          c.moveTo(xx - 2.4 * z, base);
          c.lineTo(xx + 2.4 * z, base);
          c.lineTo(xx, base - side * 6 * z);  // points toward the bite line
          c.closePath();
          c.fill();
        }
      }
      return true;
    }, 'source-over');
  },

  // Chomp: jaw clack over a heavy splash.
  sound(v) {
    v.noise({ dur: 0.12, gain: 0.7, filter: 'lowpass', freq: 900, to: 200 });
    v.tone({ type: 'square', freq: 180, to: 60, dur: 0.08, gain: 0.3 });
    v.noise({ dur: 0.32, gain: 0.5, filter: 'bandpass', freq: 1500, to: 500, q: 0.9, delay: 0.04 });
  },
};
})();
