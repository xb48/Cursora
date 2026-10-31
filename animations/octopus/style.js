// Octopus: floats on your cursor with eight soft, curling tentacles that
// trail behind as you move. Shake it and it squirts a cloud of ink.
(() => {
const ARMS = 8;
const LINKS = 10;                 // segments per tentacle
const LINK = 5.2;                 // segment length, px at size 1
const ANCHORS = [-14, -10, -6, -2, 2, 6, 10, 14];
const BACK = [0, 1, 6, 7];        // outer arms are drawn behind the mantle
const WINDOW = 45;                // frames in which the shakes must happen
const SHAKES = 3;                 // direction reversals that make a shake

const anchor = (s, i, z) => ({ x: s.x + ANCHORS[i] * z, y: s.y + 11 * z });

window.PROP = {
  defaults: {
    size: 1,
    wiggle: 1,
    shake: 12,
    skin: '#e0567a',
    suckers: '#ffd1dc',
    ink: '#1d1430',
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const s = { x, y, vx: 0, vy: 0, arms: [], flips: [], lastSign: 0, squash: 0 };
    for (let i = 0; i < ARMS; i++) {
      const a = anchor(s, i, z);
      const pts = [];
      for (let j = 0; j <= LINKS; j++) pts.push({ x: a.x, y: a.y + j * LINK * z, px: a.x, py: a.y + j * LINK * z });
      s.arms.push(pts);
    }
    return s;
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    if (k.dropping) {
      s.vy += 0.7;
      s.x += s.vx;
      s.y += s.vy;
    } else {
      const px = s.x, py = s.y;
      s.x = k.lerp(s.x, m.x, 0.25);
      s.y = k.lerp(s.y, m.y, 0.25);
      s.vx = s.x - px;
      s.vy = s.y - py;
    }
    s.squash = Math.max(0, s.squash - 0.06);

    // Tentacles: verlet chains hanging from the mantle, with a gentle curl
    // that grows toward the tips and a slight outward splay.
    for (let i = 0; i < ARMS; i++) {
      const pts = s.arms[i];
      const a = anchor(s, i, z);
      pts[0].x = a.x;
      pts[0].y = a.y;
      const splay = ANCHORS[i] / 14;
      for (let j = 1; j <= LINKS; j++) {
        const p = pts[j];
        const t = j / LINKS;
        const vx = (p.x - p.px) * 0.9;
        const vy = (p.y - p.py) * 0.9;
        p.px = p.x;
        p.py = p.y;
        // Wave + outward splay near the base, with the tips curling back in.
        p.x += vx + Math.sin(k.time * 2.2 + i * 0.9 + j * 0.5) * 0.18 * LOOK.wiggle * z * t
          + splay * 0.05 * z * j - splay * 0.16 * z * t * t * t * LOOK.wiggle;
        p.y += vy + 0.22 * z;
      }
      for (let iter = 0; iter < 3; iter++) {
        for (let j = 1; j <= LINKS; j++) {
          const p0 = pts[j - 1], p1 = pts[j];
          const dx = p1.x - p0.x, dy = p1.y - p0.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const target = LINK * z * (1 - (j / LINKS) * 0.35);
          const f = (d - target) / d;
          if (j === 1) {
            p1.x -= dx * f;
            p1.y -= dy * f;
          } else {
            p0.x += dx * f * 0.5; p0.y += dy * f * 0.5;
            p1.x -= dx * f * 0.5; p1.y -= dy * f * 0.5;
          }
        }
      }
    }
    if (k.dropping) return;

    // Shake: direction reversals of fast horizontal movement.
    if (Math.abs(m.vx) > LOOK.shake) {
      const sign = Math.sign(m.vx);
      if (s.lastSign && sign !== s.lastSign) s.flips.push(k.frame);
      s.lastSign = sign;
    }
    s.flips = s.flips.filter(f => k.frame - f < WINDOW);
    if (s.flips.length >= SHAKES && k.fire(s.x, s.y + 14 * z)) {
      s.flips = [];
      s.squash = 1;
    }
  },

  gone(s, k) {
    return s.y - 30 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const skin = LOOK.skin;
    ctx.lineCap = 'round';

    // Opaque per-segment strokes: tapered, with no doubled joints.
    const arm = (i, color, suckers) => {
      const pts = s.arms[i];
      ctx.strokeStyle = color;
      for (let j = 0; j < LINKS; j++) {
        ctx.lineWidth = k.lerp(5.4, 1.1, j / LINKS) * z;
        ctx.beginPath();
        ctx.moveTo(pts[j].x, pts[j].y);
        ctx.lineTo(pts[j + 1].x, pts[j + 1].y);
        ctx.stroke();
      }
      if (!suckers) return;
      // Two rows of rimmed suckers along the arm, shrinking toward the tip.
      for (let j = 1; j < LINKS - 1; j++) {
        const p = pts[j], q = pts[j + 1];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const t = j / LINKS;
        const r = k.lerp(1.25, 0.4, t) * z;
        for (const [f, side] of [[0.25, 1], [0.75, -1]]) {
          const off = side * k.lerp(1.5, 0.45, t) * z;
          const sx = p.x + dx * f - (dy / d) * off, sy = p.y + dy * f + (dx / d) * off;
          ctx.fillStyle = LOOK.suckers;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = k.rgba(skin, 0.9);
          ctx.lineWidth = 0.5 * z;
          ctx.stroke();
          ctx.fillStyle = k.rgba(skin, 0.5);
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    const shadow = k.shade(skin, -0.3);
    for (const i of BACK) arm(i, shadow, false);
    // Webbing between the bases of the front arms.
    ctx.fillStyle = k.rgba(skin, 0.6);
    const front = [2, 3, 4, 5];
    for (let n = 0; n < front.length - 1; n++) {
      const A = s.arms[front[n]], B = s.arms[front[n + 1]];
      ctx.beginPath();
      ctx.moveTo(A[0].x, A[0].y);
      ctx.lineTo(A[2].x, A[2].y);
      ctx.quadraticCurveTo((A[2].x + B[2].x) / 2, (A[1].y + B[1].y) / 2, B[2].x, B[2].y);
      ctx.lineTo(B[0].x, B[0].y);
      ctx.closePath();
      ctx.fill();
    }

    // Mantle, squashing as it squirts.
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(z * (1 + s.squash * 0.12), z * (1 - s.squash * 0.15));
    const dome = ctx.createRadialGradient(-6, -16, 2, 0, -6, 26);
    dome.addColorStop(0, k.shade(skin, 0.35));
    dome.addColorStop(0.6, skin);
    dome.addColorStop(1, k.shade(skin, -0.25));
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(0, -7, 17.5, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 7, 16.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Chromatophore spots that slowly pulse, like real octopus skin.
    for (const [x, y, r, ph] of [[-7, -17, 2.2, 0], [5, -21, 1.6, 1.3], [9, -12, 2, 2.1], [-2, -9, 1.3, 3.4], [-10, -6, 1.4, 4.2], [2, -14, 1.1, 5.1], [-12, -14, 1.2, 0.7]]) {
      ctx.fillStyle = k.mix([skin, '#5a1022'], 0.45 + 0.25 * Math.sin(k.time * 1.4 + ph));
      ctx.beginPath();
      ctx.arc(x, y, r * (0.85 + 0.15 * Math.sin(k.time * 1.1 + ph)), 0, Math.PI * 2);
      ctx.fill();
    }
    // Papillae: tiny raised bumps catching the light.
    ctx.fillStyle = 'rgba(255, 235, 240, 0.4)';
    for (const [x, y] of [[-4, -24], [3, -25], [-11, -20], [10, -19], [-14, -9], [13, -8], [-6, -11], [7, -6], [0, -19], [-9, -2]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    // Siphon on the side of the mantle.
    ctx.fillStyle = k.shade(skin, -0.12);
    ctx.save();
    ctx.translate(15, 4);
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.roundRect(-2, -1.6, 6.5, 3.2, 1.6);
    ctx.fill();
    ctx.fillStyle = k.shade(skin, -0.45);
    ctx.beginPath();
    ctx.ellipse(4.2, 0, 0.8, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-6, -19, 5, 3, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes with horizontal pupils, glancing along the motion.
    const look = k.clamp(s.vx * 0.3, -1.3, 1.3);
    for (const side of [-1, 1]) {
      const ex = side * 7.5, ey = 3;
      ctx.fillStyle = '#fff2c2';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 4.6, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14101a';
      ctx.beginPath();
      ctx.roundRect(ex - 2.6 + look, ey - 0.9, 5.2, 1.8, 0.9);
      ctx.fill();
      ctx.strokeStyle = k.shade(skin, -0.25);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ex, ey, 4.8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      // Raised ridge over the eye.
      ctx.fillStyle = k.shade(skin, 0.1);
      ctx.beginPath();
      ctx.ellipse(ex + side * 1.5, ey - 5.6, 1.8, 1.2, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i < ARMS; i++) if (!BACK.includes(i)) arm(i, skin, true);
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    // Ink jets away from the direction of travel (down when still).
    const moving = Math.hypot(s.vx, s.vy) > 1;
    const dir = moving ? Math.atan2(-s.vy, -s.vx) : Math.PI / 2;
    const blobs = Array.from({ length: 8 }, (_, i) => ({
      d: (8 + i * 7) * z, off: k.rand(-0.5, 0.5), r: k.rand(6, 11) * z, grow: k.rand(0.5, 0.9) * z,
    }));
    let t = 0;
    k.effect(c => {
      t += 1;
      if (t > 40) return false;
      const a = 1 - t / 40;
      c.fillStyle = LOOK.ink;
      for (const b of blobs) {
        const reach = b.d * Math.min(1, t / 8);
        c.globalAlpha = 0.85 * a;
        c.beginPath();
        c.arc(x + Math.cos(dir + b.off) * reach, y + Math.sin(dir + b.off) * reach, b.r + b.grow * t, 0, Math.PI * 2);
        c.fill();
      }
      return true;
    }, 'source-over');
    k.burst({ x, y, count: 14, colors: [LOOK.ink, k.shade(LOOK.ink, 0.25)], speed: [2, 6], life: [18, 34],
      size: [1.5 * z, 3 * z], gravity: 0.05, drag: 0.94, shape: 'dot', angle: dir, spread: 1.2, blend: 'source-over' });
    k.ring({ x: s.x, y: s.y, color: LOOK.suckers, radius: 40 * z, life: 14, width: 2 });
  },

  // Squirt: a jet whoosh with a watery bloop.
  sound(v) {
    v.noise({ dur: 0.35, gain: 0.7, filter: 'lowpass', freq: 1200, to: 150 });
    v.tone({ type: 'sine', freq: 300, to: 90, dur: 0.25, gain: 0.35 });
    v.noise({ dur: 0.15, gain: 0.2, filter: 'bandpass', freq: 2500, to: 800, delay: 0.05 });
  },
};
})();
