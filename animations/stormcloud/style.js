// Stormcloud: a rain cloud that drifts above the cursor. Shake it and it
// strikes a forked lightning bolt down onto the cursor.
(() => {
const PUFFS = [
  { x: 0, y: -6, r: 22 }, { x: -22, y: 2, r: 16 }, { x: 22, y: 1, r: 17 }, { x: -38, y: 8, r: 11 },
  { x: 39, y: 8, r: 12 }, { x: -10, y: -20, r: 15 }, { x: 12, y: -18, r: 14 }, { x: 0, y: 9, r: 15 },
];
const HOVER = 92;     // cloud height above the cursor, px at size 1
const WINDOW = 45;    // frames in which the shakes must happen
const SHAKES = 3;     // direction reversals that make a shake
const MAX_DROPS = 220;
const BOLT_LIFE = 14;

/** Jagged path from (x0, y0) to (x1, y1) by midpoint displacement; appends to `out`. */
function jag(k, x0, y0, x1, y1, depth, out) {
  if (depth === 0) {
    out.push([x1, y1]);
    return;
  }
  const len = Math.hypot(x1 - x0, y1 - y0);
  const mx = (x0 + x1) / 2 + k.rand(-1, 1) * len * 0.2;
  const my = (y0 + y1) / 2 + k.rand(-1, 1) * len * 0.06;
  jag(k, x0, y0, mx, my, depth - 1, out);
  jag(k, mx, my, x1, y1, depth - 1, out);
}

function makeBolt(k, x0, y0, x1, y1, z) {
  const main = [[x0, y0]];
  jag(k, x0, y0, x1, y1, 5, main);
  const paths = [main];
  for (let b = 0; b < 2; b++) {
    const [bx, by] = main[Math.round(k.rand(8, 22))];
    const branch = [[bx, by]];
    jag(k, bx, by, bx + k.rand(-60, 60) * z, by + k.rand(30, 70) * z, 3, branch);
    paths.push(branch);
  }
  return paths;
}

function puffPath(ctx, z, scale, dy, breathe) {
  ctx.beginPath();
  for (const p of PUFFS) {
    ctx.moveTo(p.x * z + p.r * z * scale * breathe, p.y * z + dy);
    ctx.arc(p.x * z, p.y * z + dy, p.r * z * scale * breathe, 0, Math.PI * 2);
  }
}

window.PROP = {
  defaults: {
    size: 1,
    rain: 2,
    shake: 12,
    cloud: '#8b95a7',
    bolt: '#bcd6ff',
  },

  spawn(x, y, k) {
    return { x, y: y - HOVER * k.LOOK.size, vx: 0, vy: 0, drops: [], flips: [], lastSign: 0, flash: 0, bolt: null, boltLife: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    if (k.dropping) {
      s.vy += 0.5;
    } else {
      s.vx = (s.vx + (m.x - s.x) * 0.08) * 0.8;
      s.vy = (s.vy + (m.y - HOVER * z - s.y) * 0.08) * 0.8;
      for (let n = 0; n < LOOK.rain; n++) {
        if (s.drops.length < MAX_DROPS && Math.random() < 0.6) {
          s.drops.push({ x: s.x + k.rand(-38, 38) * z, y: s.y + 14 * z, vx: s.vx * 0.4 - 0.6, vy: k.rand(7, 10) * z, life: 60 });
        }
      }
    }
    s.x += s.vx;
    s.y += s.vy;
    for (let i = s.drops.length - 1; i >= 0; i--) {
      const d = s.drops[i];
      d.x += d.vx;
      d.y += d.vy;
      if (--d.life <= 0 || d.y > k.H + 20) s.drops.splice(i, 1);
    }
    s.flash = Math.max(0, s.flash - 0.08);
    if (s.boltLife > 0) s.boltLife -= 1;
    if (k.dropping) return;

    // Shake: count direction reversals of fast horizontal movement.
    if (Math.abs(m.vx) > LOOK.shake) {
      const sign = Math.sign(m.vx);
      if (s.lastSign && sign !== s.lastSign) s.flips.push(k.frame);
      s.lastSign = sign;
    }
    s.flips = s.flips.filter(f => k.frame - f < WINDOW);
    if (s.flips.length >= SHAKES && k.fire(m.x, m.y)) {
      s.flips = [];
      s.flash = 1;
      s.bolt = makeBolt(k, s.x + k.rand(-12, 12) * z, s.y + 14 * z, m.x, m.y, z);
      s.boltLife = BOLT_LIFE;
    }
  },

  gone(s, k) {
    return s.y - 60 * k.LOOK.size > k.H && !s.drops.length;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;

    // Rain falls behind the cloud.
    if (s.drops.length) {
      ctx.strokeStyle = 'rgba(169, 200, 255, 0.55)';
      ctx.lineWidth = 1.1 * z;
      ctx.beginPath();
      for (const d of s.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx * 1.5, d.y - d.vy * 1.4);
      }
      ctx.stroke();
    }

    if (s.boltLife > 0 && s.bolt) {
      const a = (s.boltLife / BOLT_LIFE) * (0.6 + 0.4 * Math.random());
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.shadowColor = LOOK.bolt;
      ctx.shadowBlur = 18;
      for (const [w, color] of [[7 * z, k.rgba(LOOK.bolt, 0.45 * a)], [2.4 * z, `rgba(255, 255, 255, ${a})`]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        for (const path of s.bolt) {
          ctx.beginPath();
          ctx.moveTo(path[0][0], path[0][1]);
          for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.translate(s.x, s.y);
    const breathe = 1 + Math.sin(k.time * 1.3) * 0.015;
    // Dark underside, with a soft drop shadow.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = k.shade(LOOK.cloud, -0.45);
    puffPath(ctx, z, 1, 3 * z, breathe);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    // Lit tops.
    const g = ctx.createLinearGradient(0, -40 * z, 0, 22 * z);
    g.addColorStop(0, k.shade(LOOK.cloud, 0.55));
    g.addColorStop(0.55, LOOK.cloud);
    g.addColorStop(1, k.shade(LOOK.cloud, -0.25));
    ctx.fillStyle = g;
    puffPath(ctx, z, 0.94, -1.5 * z, breathe);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (const p of PUFFS.slice(5, 7)) {
      ctx.beginPath();
      ctx.arc(p.x * z - p.r * z * 0.25, p.y * z - p.r * z * 0.35, p.r * z * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lightning lighting the cloud from inside.
    if (s.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 52 * z);
      fg.addColorStop(0, k.rgba(LOOK.bolt, 0.85 * s.flash));
      fg.addColorStop(1, k.rgba(LOOK.bolt, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, 52 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: LOOK.bolt, radius: 60 * z, life: 18, width: 3 });
    k.burst({ x, y, count: 24, colors: ['#ffffff', LOOK.bolt], speed: [3, 10], life: [8, 18],
      size: [1, 2.2], gravity: 0.1, drag: 0.88 });
    // A brief, faint sky flash.
    let t = 0;
    k.effect(c => {
      t += 1;
      if (t > 6) return false;
      c.globalAlpha = (1 - t / 6) * 0.08;
      c.fillStyle = '#dce8ff';
      c.fillRect(0, 0, k.W, k.H);
      return true;
    });
  },

  sound(v) {
    v.noise({ dur: 0.06, gain: 0.6, filter: 'highpass', freq: 3000, to: 1500 });
    v.noise({ dur: 1.4, gain: 0.9, filter: 'lowpass', freq: 900, to: 60, delay: 0.03 });
    v.tone({ type: 'sine', freq: 55, to: 30, dur: 1.2, gain: 0.4 });
  },
};
})();
