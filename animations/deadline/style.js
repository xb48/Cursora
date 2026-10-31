// Deadline: a brass hourglass hanging from the cursor on a cord, with sand
// that really flows. Swing it right over the top and time's up.
(() => {
const CORD = 26;      // pivot → top cap, px at size 1
const HALF = 32;      // half height of the hourglass body
const GRAVITY = 0.9;
const DAMP = 0.985;
const ARM = 1.2;      // |angle| below which a new flip is armed
const FLIP = 2.6;     // |angle| (near upside down) that counts as a flip

/** Hourglass glass outline in local coordinates (neck at 0, axis along y). */
function glassPath(ctx, z) {
  const h = HALF * z - 3 * z;
  ctx.beginPath();
  ctx.moveTo(-17 * z, -h);
  ctx.bezierCurveTo(-17 * z, -h * 0.35, -3 * z, -6 * z, -2.2 * z, 0);
  ctx.bezierCurveTo(-3 * z, 6 * z, -17 * z, h * 0.35, -17 * z, h);
  ctx.lineTo(17 * z, h);
  ctx.bezierCurveTo(17 * z, h * 0.35, 3 * z, 6 * z, 2.2 * z, 0);
  ctx.bezierCurveTo(3 * z, -6 * z, 17 * z, -h * 0.35, 17 * z, -h);
  ctx.closePath();
}

window.PROP = {
  defaults: {
    size: 1,
    swing: 1,
    flow: 1,
    frame: '#c9a13b',
    sand: '#f0c27b',
    stamp: true,
    stampText: "TIME'S UP",
  },

  spawn(x, y) {
    return { x, y, theta: 0, omega: 0, pvx: 0, pvy: 0, vx: 0, vy: 0, top: 1, bottom: 0, armed: true, falling: false };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const L = (CORD + HALF) * z;
    if (k.dropping) {
      if (!s.falling) {
        s.falling = true;
        s.vx = s.pvx * 0.4;
        s.vy = Math.min(0, s.pvy * 0.4) - 2;
      }
      s.vy += 0.8;
      s.x += s.vx;
      s.y += s.vy;
      s.theta += s.omega * 0.99 + 0.02;
    } else {
      // Pendulum on a moving pivot: L·θ'' = −g·sinθ − (ax·cosθ − ay·sinθ)
      const ax = m.vx - s.pvx;
      const ay = m.vy - s.pvy;
      s.pvx = m.vx;
      s.pvy = m.vy;
      s.x = m.x;
      s.y = m.y;
      const drive = (-GRAVITY * Math.sin(s.theta) - (ax * Math.cos(s.theta) - ay * Math.sin(s.theta)) * LOOK.swing) / L;
      s.omega = k.clamp((s.omega + drive) * DAMP, -0.5, 0.5);
      s.theta = k.wrapPi(s.theta + s.omega);
    }

    // Sand runs toward whichever bulb is lower, slower when the glass lies flat.
    const down = Math.cos(s.theta) > 0;
    const rate = 0.004 * LOOK.flow * Math.min(1, Math.abs(Math.cos(s.theta)) * 1.4);
    if (down && s.top > 0) {
      const d = Math.min(rate, s.top);
      s.top -= d;
      s.bottom += d;
    } else if (!down && s.bottom > 0) {
      const d = Math.min(rate, s.bottom);
      s.bottom -= d;
      s.top += d;
    }

    if (k.dropping) return;
    const a = Math.abs(s.theta);
    if (a < ARM) s.armed = true;
    if (s.armed && a > FLIP) {
      const cx = s.x + Math.sin(s.theta) * L;
      const cy = s.y + Math.cos(s.theta) * L;
      // Stay armed if the trigger was gated (cooldown), so the flip still counts.
      s.armed = !k.fire(cx, cy);
    }
  },

  gone(s, k) {
    return s.y - (CORD + HALF * 2) * 1.5 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const H2 = HALF * z;
    const capW = 22 * z;
    const capH = 6 * z;
    const metal = LOOK.frame;

    ctx.translate(s.x, s.y);
    // Hanging ring at the cursor.
    ctx.strokeStyle = metal;
    ctx.lineWidth = 1.8 * z;
    ctx.beginPath();
    ctx.arc(0, 0, 4 * z, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(-s.theta);   // local +y now points from the pivot to the glass
    ctx.strokeStyle = 'rgba(45, 32, 20, 0.9)';
    ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.moveTo(0, 4 * z);
    ctx.lineTo(0, CORD * z - capH / 2);
    ctx.stroke();

    ctx.translate(0, (CORD + HALF) * z);
    const across = (x0, x1) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, k.shade(metal, -0.45));
      g.addColorStop(0.35, k.shade(metal, 0.5));
      g.addColorStop(0.6, metal);
      g.addColorStop(1, k.shade(metal, -0.5));
      return g;
    };

    // Pillars behind the glass, casting the frame's shadow.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    for (const px of [-capW * 0.82, capW * 0.82]) {
      ctx.fillStyle = across(px - 1.6 * z, px + 1.6 * z);
      ctx.fillRect(px - 1.6 * z, -H2, 3.2 * z, H2 * 2);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    // Sand, clipped to the glass. Each bulb's pile sits at its world-lower end.
    const down = Math.cos(s.theta) > 0;
    const span = H2 - 4 * z;
    const sandFill = ctx.createLinearGradient(-17 * z, 0, 17 * z, 0);
    sandFill.addColorStop(0, k.shade(LOOK.sand, -0.25));
    sandFill.addColorStop(0.4, k.shade(LOOK.sand, 0.2));
    sandFill.addColorStop(1, k.shade(LOOK.sand, -0.3));
    ctx.save();
    glassPath(ctx, z);
    ctx.clip();
    ctx.fillStyle = sandFill;
    let surface = 0;   // where the falling stream lands
    if (s.top > 0.002) {
      const near = span * Math.pow(s.top, 0.6), far = span * Math.pow(s.top, 0.8);
      if (down) ctx.fillRect(-20 * z, -near, 40 * z, near);
      else { ctx.fillRect(-20 * z, -H2, 40 * z, far); surface = -H2 + far; }
    }
    if (s.bottom > 0.002) {
      const near = span * Math.pow(s.bottom, 0.6), far = span * Math.pow(s.bottom, 0.8);
      if (down) { ctx.fillRect(-20 * z, H2 - far, 40 * z, far); surface = H2 - far; }
      else ctx.fillRect(-20 * z, 0, 40 * z, near);
    }
    const flowing = down ? s.top > 0.002 : s.bottom > 0.002;
    if (flowing) {
      const end = surface || (down ? H2 - 4 * z : -H2 + 4 * z);
      ctx.strokeStyle = LOOK.sand;
      ctx.lineWidth = 1.2 * z;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, end);
      ctx.stroke();
      ctx.fillStyle = k.shade(LOOK.sand, 0.35);
      for (let g = 0; g < 4; g++) {
        const t = (k.time * 2.2 + g / 4) % 1;
        ctx.beginPath();
        ctx.arc(Math.sin(g * 7.3) * 0.8 * z, end * t, 0.9 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Glass with a highlight.
    ctx.fillStyle = 'rgba(200, 230, 255, 0.1)';
    glassPath(ctx, z);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.2 * z;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.6 * z;
    ctx.beginPath();
    ctx.moveTo(-12 * z, -H2 * 0.75);
    ctx.quadraticCurveTo(-13 * z, -H2 * 0.4, -6 * z, -8 * z);
    ctx.stroke();

    // Caps.
    for (const cy of [-H2, H2]) {
      ctx.fillStyle = across(-capW, capW);
      ctx.beginPath();
      ctx.roundRect(-capW, cy - capH / 2, capW * 2, capH, 2 * z);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 245, 210, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-capW + 2 * z, cy - capH / 2 + 1.2 * z);
      ctx.lineTo(capW - 2 * z, cy - capH / 2 + 1.2 * z);
      ctx.stroke();
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: LOOK.frame, radius: 80 * z, life: 22, width: 3 });
    k.ring({ x, y, color: '#fff6d8', radius: 50 * z, life: 14, width: 2 });
    k.burst({ x, y, count: 24, colors: ['#fff6d8', LOOK.frame, k.shade(LOOK.frame, 0.4)], speed: [2, 8],
      life: [14, 28], size: [1, 2.2], gravity: 0.05, drag: 0.9 });
    k.burst({ x, y, count: 18, colors: [LOOK.sand, k.shade(LOOK.sand, -0.2)], speed: [1, 4],
      life: [20, 36], size: [1, 2], gravity: 0.2, drag: 0.96, shape: 'dot', blend: 'source-over' });
    if (!LOOK.stamp) return;
    let t = 0;
    const size = Math.round(26 * z);
    k.effect(c => {
      t += 1;
      if (t > 50) return false;
      const pop = t < 6 ? 0.7 + (t / 6) * 0.38 : t < 10 ? 1.08 - ((t - 6) / 4) * 0.08 : 1;
      c.globalAlpha = t < 32 ? 1 : 1 - (t - 32) / 18;
      c.translate(x, y - 58 * z - t * 0.45);
      c.scale(pop, pop);
      c.font = `900 ${size}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(30, 20, 4, 0.85)';
      c.strokeText(LOOK.stampText, 0, 0);
      c.fillStyle = '#fff4d0';
      c.fillText(LOOK.stampText, 0, 0);
      return true;
    }, 'source-over');
  },

  // Clock chime: a two-note "ding-dong" with bell overtones.
  sound(v) {
    v.tone({ type: 'sine', freq: 1046.5, dur: 1.1, gain: 0.32 });
    v.tone({ type: 'sine', freq: 2093, dur: 0.6, gain: 0.1 });
    v.tone({ type: 'sine', freq: 3136, dur: 0.3, gain: 0.05 });
    v.tone({ type: 'sine', freq: 784, dur: 1.3, gain: 0.32, delay: 0.32 });
    v.tone({ type: 'sine', freq: 1568, dur: 0.7, gain: 0.1, delay: 0.32 });
  },
};
})();
