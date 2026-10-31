// The Gavel: a walnut-and-brass gavel held at the cursor. It swings as a rigid
// pendulum driven by your hand's acceleration; swing hard enough to slam.
(() => {
const ROD = 62;          // hand → head center, px at size 1
const REST = -2.15;      // resting angle: head up and to the left of the hand
const GRAVITY = 0.55;
const WRIST = 0.075;     // how firmly the wrist pulls back to REST
const DAMP = 0.86;

/** Rounded-rect path (centered on y = 0 along the local x axis). */
function bar(ctx, x0, x1, half, r) {
  ctx.beginPath();
  ctx.roundRect(x0, -half, x1 - x0, half * 2, r);
}

window.PROP = {
  defaults: {
    size: 1,
    swing: 1,
    slam: 22,
    wood: '#6a4026',
    brass: '#d1a64a',
    stamp: true,
    stampText: 'ORDER!',
  },

  spawn(x, y) {
    return { x, y, theta: REST, omega: 0, pvx: 0, pvy: 0, vx: 0, vy: 0, falling: false };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const L = ROD * LOOK.size;
    if (k.dropping) {
      if (!s.falling) {
        s.falling = true;
        s.vx = s.pvx * 0.4;
        s.vy = Math.min(0, s.pvy * 0.4) - 3;
      }
      s.vy += 0.9;
      s.x += s.vx;
      s.y += s.vy;
      s.omega *= 0.99;
      s.theta += s.omega + 0.03;
      return;
    }
    // Pendulum with an accelerating pivot: L·θ'' = (g − ay)·cosθ + ax·sinθ
    const ax = m.vx - s.pvx;
    const ay = m.vy - s.pvy;
    s.pvx = m.vx;
    s.pvy = m.vy;
    s.x = m.x;
    s.y = m.y;
    const drive = ((GRAVITY - ay * LOOK.swing) * Math.cos(s.theta) + ax * LOOK.swing * Math.sin(s.theta)) / L;
    s.omega += drive + k.wrapPi(REST - s.theta) * WRIST;
    s.omega = k.clamp(s.omega * DAMP, -0.9, 0.9);
    s.theta = k.wrapPi(s.theta + s.omega);

    if (Math.abs(s.omega) * L > LOOK.slam) {
      // Strike with the face leading the swing.
      const side = Math.sign(s.omega) || 1;
      const hx = s.x + Math.cos(s.theta) * L - Math.sin(s.theta) * side * 30 * LOOK.size;
      const hy = s.y + Math.sin(s.theta) * L + Math.cos(s.theta) * side * 30 * LOOK.size;
      if (k.fire(hx, hy)) s.omega *= -0.35; // rebound off the "bench"
    }
  },

  gone(s, k) {
    return s.y - ROD * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const L = ROD * z;
    const wood = LOOK.wood;
    const brass = LOOK.brass;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.theta);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;

    // Handle: tapered walnut with a brass pommel and ferrule.
    const across = ctx.createLinearGradient(0, -5 * z, 0, 5 * z);
    across.addColorStop(0, k.shade(wood, 0.35));
    across.addColorStop(0.45, wood);
    across.addColorStop(1, k.shade(wood, -0.55));
    ctx.fillStyle = across;
    ctx.beginPath();
    ctx.moveTo(-10 * z, -4.6 * z);
    ctx.lineTo(L - 12 * z, -3.4 * z);
    ctx.lineTo(L - 12 * z, 3.4 * z);
    ctx.lineTo(-10 * z, 4.6 * z);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    const metal = ctx.createLinearGradient(0, -6 * z, 0, 6 * z);
    metal.addColorStop(0, k.shade(brass, 0.55));
    metal.addColorStop(0.5, brass);
    metal.addColorStop(1, k.shade(brass, -0.5));
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.arc(-11 * z, 0, 5.6 * z, 0, Math.PI * 2);
    ctx.fill();
    bar(ctx, L - 20 * z, L - 14 * z, 4.4 * z, 1.5 * z);
    ctx.fill();

    // Head: a turned cylinder across the handle, brass-banded at both faces.
    const hw = 13 * z;   // half width along the handle
    const hl = 32 * z;   // half length across it
    ctx.save();
    ctx.translate(L, 0);
    ctx.rotate(Math.PI / 2);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5; // device space: same light direction as the handle
    const turn = ctx.createLinearGradient(0, -hw, 0, hw);
    turn.addColorStop(0, k.shade(wood, -0.45));
    turn.addColorStop(0.3, k.shade(wood, 0.3));
    turn.addColorStop(0.55, wood);
    turn.addColorStop(1, k.shade(wood, -0.6));
    ctx.fillStyle = turn;
    bar(ctx, -hl, hl, hw, 6 * z);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    const band = ctx.createLinearGradient(0, -hw, 0, hw);
    band.addColorStop(0, k.shade(brass, -0.4));
    band.addColorStop(0.3, k.shade(brass, 0.6));
    band.addColorStop(0.6, brass);
    band.addColorStop(1, k.shade(brass, -0.55));
    ctx.fillStyle = band;
    for (const end of [-1, 1]) {
      const x0 = end < 0 ? -hl : hl - 7 * z;
      bar(ctx, x0, x0 + 7 * z, hw + 0.6 * z, 3 * z);
      ctx.fill();
    }
    // Turned grooves and a specular stripe.
    ctx.strokeStyle = k.rgba('#000000', 0.28);
    ctx.lineWidth = 1.2 * z;
    for (const gx of [-9, 0, 9]) {
      ctx.beginPath();
      ctx.moveTo(gx * z, -hw + 1.5 * z);
      ctx.lineTo(gx * z, hw - 1.5 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 244, 225, 0.35)';
    ctx.lineWidth = 2 * z;
    ctx.beginPath();
    ctx.moveTo(-hl + 9 * z, -hw * 0.45);
    ctx.lineTo(hl - 9 * z, -hw * 0.45);
    ctx.stroke();
    ctx.restore();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    k.ring({ x, y, color: '#ffffff', radius: 70 * LOOK.size, life: 16, width: 3 });
    k.ring({ x, y, color: LOOK.brass, radius: 44 * LOOK.size, life: 12, width: 2 });
    k.burst({ x, y, count: 18, colors: ['#f3e2c2', '#c9ad86', '#ffffff'], speed: [1.5, 5],
      life: [14, 28], size: [1.4, 3], gravity: 0.08, drag: 0.9, shape: 'dot', blend: 'source-over' });
    if (!LOOK.stamp) return;
    // Courtroom stamp: pops in, holds, then floats up and fades.
    let t = 0;
    const size = Math.round(30 * LOOK.size);
    k.effect(c => {
      t += 1;
      if (t > 46) return false;
      const pop = t < 6 ? 0.7 + (t / 6) * 0.38 : t < 10 ? 1.08 - ((t - 6) / 4) * 0.08 : 1;
      c.globalAlpha = t < 30 ? 1 : 1 - (t - 30) / 16;
      c.translate(x, y - 34 * LOOK.size - t * 0.5);
      c.rotate(-0.08);
      c.scale(pop, pop);
      c.font = `900 ${size}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(20, 10, 4, 0.85)';
      c.strokeText(LOOK.stampText, 0, 0);
      c.fillStyle = '#fff6e6';
      c.fillText(LOOK.stampText, 0, 0);
      return true;
    }, 'source-over');
  },

  sound(v) {
    v.noise({ dur: 0.18, gain: 0.9, filter: 'lowpass', freq: 1400, to: 160 });
    v.tone({ type: 'sine', freq: 150, to: 55, dur: 0.24, gain: 0.8 });
    v.tone({ type: 'triangle', freq: 2200, to: 700, dur: 0.035, gain: 0.18 });
  },
};
})();
