// Sentinel: a hover drone that escorts the cursor, keeps its eye on it, and
// fires a laser at it on a sharp flick. A reticle marks the real pointer.
(() => {
const BODY = 21;          // body radius, px at size 1
const OFFSET_X = -58;     // hover position relative to the cursor
const OFFSET_Y = -54;

window.PROP = {
  defaults: {
    size: 1,
    follow: 0.08,
    zap: 38,
    eye: '#29e0ff',
    shell: '#2c313c',
    reticle: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    return { x: x + OFFSET_X * z, y: y + OFFSET_Y * z, vx: 0, vy: 0, tilt: 0, gaze: 0,
      prevSpeed: 0, charge: 0, power: 1, spin: 0, rotor: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    s.rotor += 0.9 * s.power;
    if (k.dropping) {
      s.power = Math.max(0, s.power - 0.05);
      s.vy += 0.7;
      s.x += s.vx;
      s.y += s.vy;
      s.spin += 0.04;
      return;
    }
    const tx = m.x + OFFSET_X * z;
    const ty = m.y + OFFSET_Y * z + Math.sin(k.time * 2.6) * 3;
    s.vx = (s.vx + (tx - s.x) * LOOK.follow) * 0.8;
    s.vy = (s.vy + (ty - s.y) * LOOK.follow) * 0.8;
    s.x += s.vx;
    s.y += s.vy;
    s.tilt = k.lerp(s.tilt, k.clamp(s.vx * 0.035, -0.45, 0.45), 0.2);
    s.gaze = Math.atan2(m.y - s.y, m.x - s.x);
    s.charge = Math.max(0, s.charge - 0.06);

    // Fire on the rising edge of a fast flick, not during a long fast drag.
    if (m.speed > LOOK.zap && s.prevSpeed <= LOOK.zap && k.fire(m.x, m.y)) s.charge = 1;
    s.prevSpeed = m.speed;
  },

  gone(s, k) {
    return s.y - BODY * 3 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const R = BODY * z;
    const eye = LOOK.eye;

    if (LOOK.reticle && !k.dropping) {
      ctx.save();
      ctx.strokeStyle = k.rgba(eye, 0.85);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 + k.time * 0.8;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(a) * 10, m.y + Math.sin(a) * 10);
        ctx.lineTo(m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 14);
        ctx.stroke();
      }
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.translate(s.x, s.y);

    // Thruster wash below the body.
    if (s.power > 0) {
      const wash = ctx.createRadialGradient(0, R * 1.1, 1, 0, R * 1.1, R * 1.4);
      wash.addColorStop(0, k.rgba(eye, 0.28 * s.power));
      wash.addColorStop(1, k.rgba(eye, 0));
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.ellipse(0, R * 1.1, R * 1.1, R * (0.5 + 0.08 * Math.sin(k.time * 20)), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(s.tilt + s.spin);

    // Rotor arms and spinning discs.
    for (const side of [-1, 1]) {
      const ax = side * R * 1.75;
      ctx.strokeStyle = k.shade(LOOK.shell, -0.2);
      ctx.lineWidth = 4 * z;
      ctx.beginPath();
      ctx.moveTo(side * R * 0.7, -R * 0.15);
      ctx.lineTo(ax, -R * 0.45);
      ctx.stroke();
      ctx.fillStyle = 'rgba(210, 225, 240, 0.16)';
      ctx.beginPath();
      ctx.ellipse(ax, -R * 0.62, R * 0.95, R * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(235, 242, 250, ${0.25 + 0.4 * s.power})`;
      ctx.lineWidth = 1.6 * z;
      const sweep = Math.cos(s.rotor * side) * R * 0.95;
      ctx.beginPath();
      ctx.moveTo(ax - sweep, -R * 0.62);
      ctx.lineTo(ax + sweep, -R * 0.62);
      ctx.stroke();
      ctx.fillStyle = '#1a1d24';
      ctx.beginPath();
      ctx.arc(ax, -R * 0.55, 3 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body: glossy shell with a machined rim.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    const shell = ctx.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.1, 0, 0, R);
    shell.addColorStop(0, k.shade(LOOK.shell, 0.45));
    shell.addColorStop(0.6, LOOK.shell);
    shell.addColorStop(1, k.shade(LOOK.shell, -0.55));
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // End the drop shadow fully: the eye glow reuses shadowColor, not the offset.
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Antenna with a status LED.
    ctx.strokeStyle = k.shade(LOOK.shell, 0.2);
    ctx.lineWidth = 1.5 * z;
    ctx.beginPath();
    ctx.moveTo(R * 0.35, -R * 0.9);
    ctx.lineTo(R * 0.55, -R * 1.4);
    ctx.stroke();
    const blink = s.power > 0 && (k.time % 1.2) < 0.15;
    ctx.fillStyle = blink ? '#ff4d5e' : '#4a2328';
    ctx.beginPath();
    ctx.arc(R * 0.55, -R * 1.42, 2.4 * z, 0, Math.PI * 2);
    ctx.fill();

    // Visor and the eye, which tracks the cursor.
    ctx.fillStyle = '#07080b';
    ctx.beginPath();
    ctx.ellipse(0, R * 0.05, R * 0.72, R * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = s.gaze - s.tilt - s.spin;
    const ex = Math.cos(g) * R * 0.22;
    const ey = R * 0.05 + Math.sin(g) * R * 0.14;
    const er = R * 0.3;
    const lit = s.power * (0.75 + 0.25 * s.charge);
    ctx.shadowColor = eye;
    ctx.shadowBlur = (10 + 16 * s.charge) * s.power;
    const iris = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    iris.addColorStop(0, `rgba(255, 255, 255, ${lit})`);
    iris.addColorStop(0.35, k.rgba(eye, lit));
    iris.addColorStop(1, k.rgba(eye, 0.12 * lit));
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.3, -R * 0.5, R * 0.26, R * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const g = Math.atan2(y - s.y, x - s.x);
    const sx = s.x + Math.cos(g) * BODY * 0.5 * z;
    const sy = s.y + Math.sin(g) * BODY * 0.5 * z;
    let t = 0;
    k.effect(c => {
      t += 1;
      if (t > 10) return false;
      const a = 1 - t / 10;
      c.lineCap = 'round';
      c.globalAlpha = a;
      c.shadowColor = LOOK.eye;
      c.shadowBlur = 18;
      c.strokeStyle = LOOK.eye;
      c.lineWidth = 7 * a + 1;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(x, y);
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2 * a + 0.5;
      c.stroke();
      return true;
    });
    k.ring({ x, y, color: LOOK.eye, radius: 46, life: 16, width: 3 });
    k.burst({ x, y, count: 18, colors: [LOOK.eye, '#ffffff'], speed: [3, 9], life: [8, 18],
      size: [1, 2.2], gravity: 0.05, drag: 0.88 });
  },

  // Laser: a falling zap with a sustained triangle body, so it carries
  // as much loudness as the other animations without a spiky peak.
  sound(v) {
    v.tone({ type: 'sawtooth', freq: 2400, to: 160, dur: 0.18, gain: 0.1 });
    v.tone({ type: 'triangle', freq: 1100, to: 240, dur: 0.24, gain: 0.32 });
    v.tone({ type: 'square', freq: 1200, to: 90, dur: 0.12, gain: 0.05 });
    v.noise({ dur: 0.14, gain: 0.2, filter: 'highpass', freq: 3000, to: 800 });
  },
};
})();
