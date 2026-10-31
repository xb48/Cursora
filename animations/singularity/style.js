// Singularity: a pocket black hole with a lensed accretion disk. Circle the
// cursor around it to feed it; complete the orbits and it collapses in a burst.
(() => {
const HOLE = 16;        // event-horizon radius, px at size 1
const TILT = 0.32;      // vertical squash of the disk (viewing angle)
const DEBRIS = 70;
const DECAY = 0.985;    // feeding fades when you stop circling

/** (Re)place one debris particle on an outer orbit. */
function seed(s, k, i, outer = false) {
  const R = HOLE * k.LOOK.size;
  const d = s.debris[i] || (s.debris[i] = {});
  d.r = outer ? R * k.rand(3, 3.5) : R * k.rand(1.6, 3.4);
  d.a = k.rand(0, Math.PI * 2);
  d.w = k.rand(0.02, 0.05);
  d.size = k.rand(0.6, 1.8);
}

window.PROP = {
  defaults: {
    size: 1,
    loops: 1.5,
    hot: '#ffb36b',
    halo: '#8f6bff',
  },

  spawn(x, y, k) {
    const s = { x, y, vx: 0, vy: 0, spin: 0, winding: 0, heading: null, charge: 0, flash: 0, debris: [] };
    for (let i = 0; i < DEBRIS; i++) seed(s, k, i);
    return s;
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const R = HOLE * LOOK.size;
    if (k.dropping) {
      s.vy += 0.6;
      s.x += s.vx;
      s.y += s.vy;
      s.spin += 0.05;
      return;
    }
    const px = s.x;
    const py = s.y;
    // Cursor replacer: pinned exactly to the pointer tip (no lag).
    s.x = m.x;
    s.y = m.y;
    s.vx = s.x - px;
    s.vy = s.y - py;

    // Winding: how far the cursor's direction has turned while moving.
    // Big jumps (reversals, jitter) are ignored, so only real circles count.
    if (m.speed > 2.5) {
      const a = Math.atan2(m.vy, m.vx);
      if (s.heading !== null) {
        const d = k.wrapPi(a - s.heading);
        if (Math.abs(d) < 1.2) s.winding += d;
      }
      s.heading = a;
    } else {
      s.heading = null;
    }
    s.winding *= DECAY;
    s.charge = k.clamp(Math.abs(s.winding) / (Math.PI * 2 * LOOK.loops), 0, 1);
    const dir = s.winding < 0 ? -1 : 1;
    s.spin += (0.015 + s.charge * 0.12) * dir;
    s.flash = Math.max(0, s.flash - 0.05);

    for (let i = 0; i < DEBRIS; i++) {
      const d = s.debris[i];
      d.a += d.w * (1 + s.charge * 4) * dir;
      d.r -= (0.04 + s.charge * 0.35) * LOOK.size;
      if (d.r < R * 1.15) seed(s, k, i, true);
    }

    if (s.charge >= 1 && k.fire(s.x, s.y)) {
      s.winding = 0;
      s.flash = 1;
    }
  },

  gone(s, k) {
    return s.y - HOLE * 5 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const R = HOLE * z;
    const c = s.charge;
    ctx.translate(s.x, s.y);

    // Halo of scattered light.
    const halo = ctx.createRadialGradient(0, 0, R, 0, 0, R * 7);
    halo.addColorStop(0, k.rgba(LOOK.halo, Math.min(1, 0.28 + 0.3 * c + 0.4 * s.flash)));
    halo.addColorStop(1, k.rgba(LOOK.halo, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 7, 0, Math.PI * 2);
    ctx.fill();

    // Accretion disk. Drawn whole first; its front half is redrawn over the hole.
    const disk = front => {
      ctx.save();
      ctx.scale(1, TILT);
      const g = ctx.createRadialGradient(0, 0, R * 1.2, 0, 0, R * 3.6);
      g.addColorStop(0, '#fff6e6');
      g.addColorStop(0.25, LOOK.hot);
      g.addColorStop(0.6, k.rgba(LOOK.halo, 0.55));
      g.addColorStop(1, k.rgba(LOOK.halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      if (front) {
        ctx.arc(0, 0, R * 3.6, 0, Math.PI);
        ctx.arc(0, 0, R * 1.2, Math.PI, 0, true);
      } else {
        ctx.arc(0, 0, R * 3.6, 0, Math.PI * 2);
        ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2, true);
      }
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.4 * z;
      ctx.strokeStyle = `rgba(255, 240, 220, ${0.25 + 0.35 * c})`;
      for (let i = 0; i < 14; i++) {
        const r = R * (1.4 + (i % 7) * 0.3);
        const len = 0.5 + (i % 3) * 0.25;
        const a0 = s.spin * (1.6 - r / (R * 4)) + i * 2.399;
        if (front && Math.sin(a0 + len / 2) < 0) continue;
        ctx.beginPath();
        ctx.arc(0, 0, r, a0, a0 + len);
        ctx.stroke();
      }
      for (const d of s.debris) {
        if (front && Math.sin(d.a) < 0) continue;
        ctx.fillStyle = d.size > 1.3 ? '#fff1d6' : k.rgba(LOOK.hot, 0.85);
        ctx.beginPath();
        ctx.arc(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r, d.size * z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    disk(false);

    // Gravitational lensing: the far side of the disk bent up over the hole.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lens = ctx.createLinearGradient(0, -R * 1.9, 0, 0);
    lens.addColorStop(0, k.rgba(LOOK.hot, 0));
    lens.addColorStop(0.5, k.rgba(LOOK.hot, 0.55 + 0.3 * c));
    lens.addColorStop(1, 'rgba(255, 246, 230, 0.9)');
    ctx.strokeStyle = lens;
    ctx.lineWidth = R * 0.45;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.55, R * 1.45, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Event horizon and photon ring.
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 236, 210, ${0.7 + 0.3 * s.flash})`;
    ctx.lineWidth = 1.3 * z;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.06, 0, Math.PI * 2);
    ctx.stroke();

    disk(true);

    // Feeding gauge: how much of the required orbits are done.
    if (c > 0.02) {
      const ccw = s.winding < 0;
      const a0 = -Math.PI / 2;
      ctx.strokeStyle = k.rgba(LOOK.halo, 0.75);
      ctx.lineWidth = 2 * z;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, R * 4.3, a0, a0 + Math.PI * 2 * c * (ccw ? -1 : 1), ccw);
      ctx.stroke();
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: '#ffffff', radius: 150 * z, life: 22, width: 3 });
    k.ring({ x, y, color: LOOK.halo, radius: 110 * z, life: 28, width: 5 });
    k.ring({ x, y, color: LOOK.hot, radius: 70 * z, life: 16, width: 2 });
    k.burst({ x, y, count: 46, colors: ['#ffffff', '#fff1d6', LOOK.hot, LOOK.halo], speed: [3, 12],
      life: [16, 34], size: [1, 2.6], gravity: 0, drag: 0.93 });
    // Gravitational waves: two more rings, a beat apart.
    let t = 0;
    k.effect(() => {
      t += 1;
      if (t === 8 || t === 16) k.ring({ x, y, color: k.rgba(LOOK.halo, 0.8), radius: (120 + t * 6) * z, life: 24, width: 2 });
      return t < 17;
    });
  },

  sound(v) {
    v.tone({ type: 'sine', freq: 72, to: 28, dur: 1.0, gain: 0.6 });
    v.noise({ dur: 0.7, gain: 0.5, filter: 'bandpass', freq: 120, to: 1800, q: 0.8 });
    v.tone({ type: 'sine', freq: 1760, to: 55, dur: 0.5, gain: 0.1 });
  },
};
})();
