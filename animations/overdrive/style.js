// Overdrive: a precision turbine that rides the cursor. Movement spins it up;
// fill the gauge and it vents in an overdrive burst.
(() => {
const RADIUS = 34;         // housing radius, px at size 1
const BLADES = 9;
const LIMIT = 0.62;        // rad/frame that fills the gauge at revLimit 1
const SPIN_DOWN = 0.988;
const IDLE = 0.012;
const MAX_INPUT = 60;      // px/frame of cursor speed that still adds spin

const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

window.PROP = {
  cooldownMs: 650,         // venting takes a moment before it can fire again
  defaults: {
    size: 1,
    gain: 1,
    revLimit: 1,
    accent: '#ff7a1a',
    housing: '#2b2f38',
    gauge: true,
  },

  spawn(x, y) {
    return { x, y, vx: 0, vy: 0, angle: 0, omega: IDLE, flash: 0, roll: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    if (k.dropping) {
      s.vy += 0.8;
      s.vx *= 0.99;
      s.x += s.vx;
      s.y += s.vy;
      s.omega *= 0.995;
      s.angle += s.omega;
      return;
    }
    // Cursor replacer: pinned exactly to the pointer tip (no lag).
    s.vx = m.x - s.x;
    s.vy = m.y - s.y;
    s.x = m.x;
    s.y = m.y;

    // Cap per-frame input so wild shaking can't refill the gauge instantly.
    s.omega = Math.max(IDLE, s.omega * SPIN_DOWN + Math.min(m.speed, MAX_INPUT) * 0.0011 * LOOK.gain);
    s.angle = (s.angle + s.omega) % (Math.PI * 2);
    s.flash = Math.max(0, s.flash - 0.04);

    if (s.omega >= LIMIT * LOOK.revLimit && k.fire(s.x, s.y)) {
      s.omega *= 0.3;
      s.flash = 1;
    }
  },

  gone(s, k) {
    return s.y - RADIUS * 1.6 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const R = RADIUS * z;
    const charge = k.clamp(s.omega / (LIMIT * LOOK.revLimit), 0, 1);
    const accent = LOOK.accent;
    ctx.translate(s.x, s.y);

    // Housing with a machined rim.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    const shell = ctx.createRadialGradient(-R * 0.4, -R * 0.5, R * 0.1, 0, 0, R);
    shell.addColorStop(0, k.shade(LOOK.housing, 0.35));
    shell.addColorStop(1, k.shade(LOOK.housing, -0.45));
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // End the drop shadow fully: later glows reuse shadowColor, not the offset.
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    const rim = ctx.createLinearGradient(0, -R, 0, R);
    rim.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    rim.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2 * z;
    ctx.stroke();

    // Intake well.
    ctx.fillStyle = '#0a0b0f';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.84, 0, Math.PI * 2);
    ctx.fill();

    // Swept blades; they ghost out into a motion-blur disc as RPM rises.
    ctx.save();
    ctx.rotate(s.angle);
    ctx.globalAlpha = 1 - charge * 0.55;
    const metal = ctx.createLinearGradient(-R, -R, R, R);
    metal.addColorStop(0, '#e9edf3');
    metal.addColorStop(1, '#6d7380');
    ctx.fillStyle = metal;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.8;
    for (let b = 0; b < BLADES; b++) {
      const a = (b / BLADES) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(...polar(R * 0.3, a));
      ctx.quadraticCurveTo(...polar(R * 0.6, a + 0.32), ...polar(R * 0.8, a + 0.52));
      ctx.lineTo(...polar(R * 0.8, a + 0.66));
      ctx.quadraticCurveTo(...polar(R * 0.52, a + 0.44), ...polar(R * 0.3, a + 0.3));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    if (charge > 0.05) {
      ctx.fillStyle = `rgba(220, 228, 240, ${0.22 * charge})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
      ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2, true);
      ctx.fill();
    }

    // Hub with an accent ring that heats up with RPM.
    const hub = ctx.createRadialGradient(-R * 0.08, -R * 0.1, 1, 0, 0, R * 0.3);
    hub.addColorStop(0, '#f5f7fa');
    hub.addColorStop(1, '#4a505c');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6 + 18 * Math.max(charge, s.flash);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2 * z;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (!LOOK.gauge) return;
    // HUD gauge: 270° sweep with ticks, plus a tachometer readout.
    const g0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const gr = R + 8 * z;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.arc(0, 0, gr, g0, g0 + sweep);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= 10; t++) {
      const a = g0 + (t / 10) * sweep;
      ctx.beginPath();
      ctx.moveTo(...polar(gr + 4 * z, a));
      ctx.lineTo(...polar(gr + (t % 5 ? 6 : 8) * z, a));
      ctx.stroke();
    }
    if (charge > 0.01) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = charge > 0.75 ? 12 : 0;
      ctx.strokeStyle = charge > 0.85 ? k.shade(accent, 0.35) : accent;
      ctx.lineWidth = 3 * z;
      ctx.beginPath();
      ctx.arc(0, 0, gr, g0, g0 + sweep * charge);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const rpm = (s.omega * 60 * 60) / (Math.PI * 2);
    ctx.font = `600 ${Math.round(10 * z)}px "Cascadia Mono", Consolas, ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10, 10, 14, 0.75)';
    const label = rpm >= 1000 ? `${(rpm / 1000).toFixed(1)}k RPM` : `${Math.round(rpm)} RPM`;
    const tw = ctx.measureText(label).width + 12 * z;
    ctx.beginPath();
    ctx.roundRect(-tw / 2, gr + 2 * z, tw, 15 * z, 7.5 * z);
    ctx.fill();
    ctx.fillStyle = charge > 0.85 ? k.shade(accent, 0.35) : '#e7e9ee';
    ctx.fillText(label, 0, gr + 9.5 * z);
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const R = RADIUS * LOOK.size;
    k.ring({ x, y, color: LOOK.accent, radius: R * 2.8, life: 22, width: 4 });
    k.ring({ x, y, color: '#ffffff', radius: R * 1.8, life: 14, width: 2 });
    k.burst({ x, y, count: 30, colors: [LOOK.accent, '#ffffff', k.shade(LOOK.accent, 0.4)],
      speed: [6, 14], life: [10, 20], size: [1.2, 2.4], gravity: 0, drag: 0.88 });
  },

  sound(v) {
    v.tone({ type: 'sawtooth', freq: 180, to: 1600, dur: 0.22, gain: 0.12 });
    v.noise({ dur: 0.32, gain: 0.45, filter: 'bandpass', freq: 600, to: 5000, q: 0.8 });
    v.tone({ type: 'sine', freq: 1760, to: 1650, dur: 0.3, gain: 0.12, delay: 0.16 });
  },
};
})();
