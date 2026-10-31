// Prism: a cut-glass prism whose apex is the pointer. Moving it splits light
// into a spectrum that fans out behind it; a sharp flick fires a burst of rays.
(() => {
const LEN = 30;                 // apex to base, px at size 1
const HALF = 12.5;              // half the base width, px at size 1
const REST = 0.95;              // body direction at rest: down-right, like an arrow
const TRAIL = 46;               // trail points kept
const LIFE = 22;                // frames a trail point lives
const SPECTRUM = ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#30b8ff', '#8a5cff'];

/** Shortest-path angle blend. */
const turnTo = (a, b, t, k) => a + k.wrapPi(b - a) * t;

window.PROP = {
  defaults: {
    size: 1,
    flick: 34,
    spread: 1,
    trail: true,
    glass: '#dff4ff',
  },

  spawn(x, y) {
    return { x, y, vx: 0, vy: 0, ang: REST, trail: [], armed: true, flash: 0, spin: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    for (let i = s.trail.length - 1; i >= 0; i--) if (++s.trail[i].age > LIFE) s.trail.splice(i, 1);
    s.flash = Math.max(0, s.flash - 0.06);
    if (k.dropping) {
      s.vy += 0.7;
      s.x += s.vx;
      s.y += s.vy;
      s.spin += 0.09;
      s.ang += s.spin * 0.1;
      return;
    }
    // Cursor replacer: pinned exactly to the pointer tip (no lag).
    s.vx = m.x - s.x;
    s.vy = m.y - s.y;
    s.x = m.x;
    s.y = m.y;
    const speed = m.speed;

    // The body swings to trail the motion, and settles back to an arrow at rest.
    if (speed > 1.5) s.ang = turnTo(s.ang, Math.atan2(-s.vy, -s.vx), Math.min(0.35, speed / 40), k);
    else s.ang = turnTo(s.ang, REST, 0.06, k);

    if (LOOK.trail && speed > 0.6) {
      const nx = -s.vy / (speed || 1), ny = s.vx / (speed || 1);
      s.trail.unshift({ x: s.x, y: s.y, nx, ny, sp: speed, age: 0 });
      if (s.trail.length > TRAIL) s.trail.length = TRAIL;
    }

    // Rising edge with hysteresis; a gated fire stays armed and retries.
    if (speed < LOOK.flick * 0.4) s.armed = true;
    if (s.armed && speed > LOOK.flick && k.fire(s.x, s.y)) {
      s.armed = false;
      s.flash = 1;
    }
  },

  gone(s, k) {
    return s.y - LEN * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;

    // Spectrum: six bands that leave the prism together and fan apart with age.
    if (s.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt';   // round caps would overlap and bead at every joint
      ctx.lineWidth = 2.2 * z;
      for (let b = 0; b < SPECTRUM.length; b++) {
        const off = (b - (SPECTRUM.length - 1) / 2) * 3.2 * z * LOOK.spread;
        for (let i = 1; i < s.trail.length; i++) {
          const p = s.trail[i - 1], q = s.trail[i];
          const fanP = Math.min(1, p.age / LIFE * 2.2) * off, fanQ = Math.min(1, q.age / LIFE * 2.2) * off;
          const a = (1 - q.age / LIFE) * Math.min(1, q.sp / 12) * 0.8;
          if (a <= 0.01) continue;
          ctx.strokeStyle = k.rgba(SPECTRUM[b], a);
          ctx.beginPath();
          ctx.moveTo(p.x + p.nx * fanP, p.y + p.ny * fanP);
          ctx.lineTo(q.x + q.nx * fanQ, q.y + q.ny * fanQ);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // The prism, apex at the pointer, body along `ang`.
    const L = LEN * z, Hh = HALF * z;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    const A = [0, 0], B = [L, -Hh], C = [L, Hh], M = [L * 0.86, 0];

    ctx.shadowColor = 'rgba(0, 10, 30, 0.35)';
    ctx.shadowBlur = 10 * z;
    ctx.shadowOffsetX = 2 * z;
    ctx.shadowOffsetY = 5 * z;
    ctx.fillStyle = k.rgba(LOOK.glass, 0.22);
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Two facets meeting at a ridge: one catches the light, one is in shade.
    const lit = ctx.createLinearGradient(0, -Hh, L, 0);
    lit.addColorStop(0, k.rgba('#ffffff', 0.75));
    lit.addColorStop(1, k.rgba(LOOK.glass, 0.25));
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...M); ctx.closePath();
    ctx.fill();
    const dim = ctx.createLinearGradient(0, Hh, L, 0);
    dim.addColorStop(0, k.rgba(LOOK.glass, 0.5));
    dim.addColorStop(1, k.mix([LOOK.glass, '#1d3550'], 0.55, 0.45));
    ctx.fillStyle = dim;
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...M); ctx.lineTo(...C); ctx.closePath();
    ctx.fill();

    // A faint spectrum caught inside the base.
    const inner = ctx.createLinearGradient(L * 0.7, -Hh, L * 0.7, Hh);
    SPECTRUM.forEach((c, i) => inner.addColorStop(i / (SPECTRUM.length - 1), k.rgba(c, 0.35 + 0.4 * s.flash)));
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(L * 0.62, -Hh * 0.62); ctx.lineTo(L * 0.95, -Hh * 0.92); ctx.lineTo(L * 0.95, Hh * 0.92); ctx.lineTo(L * 0.62, Hh * 0.62);
    ctx.closePath();
    ctx.fill();

    // Crisp edges, the ridge, and a specular glint at the apex.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.2 * z;
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.9 * z;
    ctx.beginPath();
    ctx.moveTo(...A); ctx.lineTo(...M); ctx.lineTo(...B);
    ctx.moveTo(...M); ctx.lineTo(...C);
    ctx.stroke();
    ctx.restore();

    if (s.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 46 * z);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.55 * s.flash})`);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 46 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.4 * z, 0, Math.PI * 2);
    ctx.fill();
  },

  onFire(s, x, y, k) {
    const z = k.LOOK.size;
    // Rays leave in the direction of the flick, fanned by wavelength.
    const dir = Math.atan2(s.vy, s.vx);
    let t = 0;
    k.effect(ctx => {
      t += 1;
      const life = 26;
      const grow = Math.min(1, t / 7);
      const a = 1 - t / life;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      SPECTRUM.forEach((c, i) => {
        const ang = dir + (i - (SPECTRUM.length - 1) / 2) * 0.09 * k.LOOK.spread;
        const len = 240 * z * grow;
        const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.addColorStop(0, k.rgba(c, 0.9 * a));
        g.addColorStop(1, k.rgba(c, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 3.2 * z * a + 0.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      });
      ctx.restore();
      return t < life;
    });
    k.ring({ x, y, color: '#ffffff', radius: 54 * z, life: 18, width: 2 });
    k.burst({ x, y, count: 30, colors: SPECTRUM, speed: [2, 9], life: [16, 30], size: [1, 2.4],
      gravity: 0, drag: 0.92, shape: 'spark', angle: dir, spread: 1.4 });
  },

  // A struck-glass chime with a bright shimmer.
  sound(v) {
    v.tone({ type: 'sine', freq: 1568, dur: 0.55, gain: 0.34 });
    v.tone({ type: 'sine', freq: 2349, dur: 0.45, gain: 0.2, delay: 0.02 });
    v.tone({ type: 'triangle', freq: 3136, dur: 0.28, gain: 0.08, delay: 0.04 });
    v.noise({ dur: 0.18, gain: 0.18, filter: 'highpass', freq: 7000, to: 4000 });
  },
};
})();
