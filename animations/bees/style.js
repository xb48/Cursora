// Swarm: a dozen honeybees orbiting a honeycomb cell at your cursor. Fast
// movement makes them angry (they speed up and glow red); push them far
// enough and the whole swarm dives in to sting.
(() => {
const COUNT = 12;
const DECAY = 0.985;   // anger cools when you slow down
const CALM = 8;        // cursor speed (px/frame) below which they don't get angry

window.PROP = {
  defaults: {
    size: 1,
    temper: 1,
    color: '#ffc83d',
    hive: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const bees = Array.from({ length: COUNT }, (_, i) => ({
      x: x + k.rand(-30, 30) * z, y: y + k.rand(-30, 30) * z, vx: 0, vy: 0,
      a: (i / COUNT) * Math.PI * 2, r: k.rand(22, 44), flap: k.rand(0, 6), ang: 0,
    }));
    return { bees, anger: 0, sting: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    if (!k.dropping && m.speed > CALM) s.anger += (Math.min(m.speed, 60) - CALM) * 0.0009 * LOOK.temper;
    s.anger *= DECAY;
    s.sting = Math.max(0, s.sting - 1 / 24);
    if (!k.dropping && s.anger >= 1 && k.fire(m.x, m.y)) {
      s.anger = 0;
      s.sting = 1;
    }
    const rage = Math.min(1, s.anger);
    const diving = s.sting > 0.55;

    for (const b of s.bees) {
      let tx, ty;
      if (k.dropping) {
        tx = b.x + b.vx * 10;
        ty = k.H + 300;
      } else if (diving) {
        tx = m.x;
        ty = m.y;
      } else {
        const a = b.a + k.time * (1.2 + rage * 1.5);
        tx = m.x + Math.cos(a) * b.r * z;
        ty = m.y + Math.sin(a * 1.3) * b.r * z * 0.7;
      }
      // Seek with limited steering, plus a little wander and separation.
      const max = (k.dropping ? 6 : diving ? 10 : 3.2 + rage * 3) * z;
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(max, d * 0.15 + 0.5 * z);
      let sx = (dx / d) * sp - b.vx;
      let sy = (dy / d) * sp - b.vy;
      const lim = 0.5 * z * (1 + rage);
      const sl = Math.hypot(sx, sy);
      if (sl > lim) { sx = (sx / sl) * lim; sy = (sy / sl) * lim; }
      b.vx += sx + k.rand(-0.25, 0.25) * z;
      b.vy += sy + k.rand(-0.25, 0.25) * z;
      for (const o of s.bees) {
        if (o === b) continue;
        const ox = b.x - o.x, oy = b.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od > 0 && od < 9 * z) {
          b.vx += (ox / od) * 0.15 * z;
          b.vy += (oy / od) * 0.15 * z;
        }
      }
      b.x += b.vx;
      b.y += b.vy;
      if (Math.hypot(b.vx, b.vy) > 0.2) b.ang = Math.atan2(b.vy, b.vx);
      b.flap += 1.7;
    }
  },

  gone(s, k) {
    return s.bees.every(b => b.y - 20 > k.H);
  },

  draw(ctx, s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const rage = Math.min(1, s.anger);

    if (LOOK.hive && !k.dropping) {
      // Honeycomb cell at the cursor; it warms toward red as the swarm gets angry.
      const r = 6.5 * z * (1 + 0.08 * rage * Math.sin(k.time * 12));
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = m.x + Math.cos(a) * r, py = m.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = k.mix(['#ffb300', '#ff3b2f'], rage, 0.25);
      ctx.fill();
      ctx.strokeStyle = k.mix(['#ffb300', '#ff3b2f'], rage, 0.95);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    const body = k.mix([LOOK.color, '#ff6a3d'], rage * 0.65);
    const dark = '#231709';
    for (const b of s.bees) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      ctx.scale(z, z);   // bee units, facing +x; the abdomen trails at -x

      // Six jointed legs dangling from the thorax; the hind pair carry pollen.
      ctx.strokeStyle = 'rgba(35, 23, 9, 0.85)';
      ctx.lineWidth = 0.45;
      ctx.lineCap = 'round';
      const twitch = Math.sin(b.flap * 0.3) * 0.25;
      for (const side of [-1, 1]) {
        for (const [ax, knee, foot] of [[2.2, [3.6, 2.6], [4.6, 3.8]], [1.2, [1.2, 3.4], [0.6, 4.8]], [0.2, [-1.6, 3.4], [-3.4, 4.6]]]) {
          ctx.beginPath();
          ctx.moveTo(ax, side * 1.2);
          ctx.lineTo(knee[0], side * (knee[1] + twitch));
          ctx.lineTo(foot[0], side * (foot[1] + twitch));
          ctx.stroke();
        }
        ctx.fillStyle = '#f0a020';
        ctx.beginPath();
        ctx.ellipse(-2.4, side * 3.9, 0.9, 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Abdomen: fuzzy gold with dark bands, ending in the stinger.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-6.4, -0.6);
      ctx.lineTo(-8.2, 0);
      ctx.lineTo(-6.4, 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(-3.2, 0, 3.8, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = dark;
      for (const bx of [-1.8, -3.9, -6]) ctx.fillRect(bx, -3, 1.1, 6);
      ctx.fillStyle = 'rgba(255, 245, 210, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-2.6, -1.2, 2.4, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Thorax: brown and hairy.
      ctx.fillStyle = '#6b4416';
      ctx.beginPath();
      ctx.arc(1.2, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = k.rgba(LOOK.color, 0.75);
      ctx.lineWidth = 0.35;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(1.2 + Math.cos(a) * 1.9, Math.sin(a) * 1.9);
        ctx.lineTo(1.2 + Math.cos(a) * 3, Math.sin(a) * 3);
        ctx.stroke();
      }

      // Head with big compound eyes and elbowed antennae.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(4.3, 0, 1.7, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = rage > 0.6 ? k.mix(['#3a2a1a', '#ff3c28'], (rage - 0.6) / 0.4) : '#3a2a1a';
        ctx.beginPath();
        ctx.ellipse(4.2, side * 1.35, 1.1, 0.75, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(4.5, side * 1.2, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(5.4, side * 0.5);
        ctx.lineTo(6.6, side * 1.2);
        ctx.lineTo(7.8, side * 0.7);
        ctx.stroke();
      }

      // Wings on top: veined fore- and hindwings, blurring as they beat.
      const beat = Math.abs(Math.sin(b.flap));
      for (const side of [-1, 1]) {
        for (const [cx, cy, rx, ry, rot, alpha] of [[0.2, 3.6, 4.4, 1.9, 0.35, 0.5], [-1.4, 3, 3, 1.3, 0.6, 0.4]]) {
          ctx.save();
          ctx.translate(cx, side * cy * (0.65 + 0.35 * beat));
          ctx.rotate(side * rot);
          const sheen = ctx.createLinearGradient(-rx, 0, rx, 0);
          sheen.addColorStop(0, `rgba(210, 235, 255, ${alpha * (1 - 0.45 * beat)})`);
          sheen.addColorStop(0.6, `rgba(235, 215, 255, ${alpha * 0.8 * (1 - 0.45 * beat)})`);
          sheen.addColorStop(1, `rgba(200, 255, 235, ${alpha * 0.6 * (1 - 0.45 * beat)})`);
          ctx.fillStyle = sheen;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(60, 50, 40, ${0.35 * (1 - beat * 0.6)})`;
          ctx.lineWidth = 0.25;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-rx * 0.9, 0);
          ctx.lineTo(rx * 0.8, -ry * 0.3);
          ctx.moveTo(-rx * 0.3, 0);
          ctx.lineTo(rx * 0.3, ry * 0.7);
          ctx.moveTo(0.2 * rx, -ry * 0.1);
          ctx.lineTo(0.7 * rx, ry * 0.5);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: '#ffb300', radius: 46 * z, life: 18, width: 3 });
    k.ring({ x, y, color: '#ffffff', radius: 26 * z, life: 12, width: 1.5 });
    k.burst({ x, y, count: 22, colors: ['#ffe08a', LOOK.color, '#ffffff'], speed: [2, 7], life: [10, 22],
      size: [1, 2], gravity: 0, drag: 0.9 });
  },

  // An angry buzz (two detuned saws beating) and a sharp zap.
  sound(v) {
    v.tone({ type: 'sawtooth', freq: 220, to: 240, dur: 0.38, gain: 0.2 });
    v.tone({ type: 'sawtooth', freq: 233, to: 226, dur: 0.38, gain: 0.18 });
    v.noise({ dur: 0.3, gain: 0.2, filter: 'bandpass', freq: 1500, to: 1800, q: 2 });
    v.tone({ type: 'square', freq: 880, to: 440, dur: 0.06, gain: 0.15, delay: 0.3 });
  },
};
})();
