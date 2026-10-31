// Afterburner: a sleek rocket that flies the cursor's path, nose along its
// heading, with a live exhaust plume. Dash hard to light the afterburner.
(() => {
const UP = -Math.PI / 2;

window.PROP = {
  defaults: {
    size: 1,
    agility: 0.12,
    boost: 30,
    hull: '#eef1f6',
    accent: '#ff5a36',
    flame: '#ffb347',
    smoke: true,
  },

  spawn(x, y) {
    return { x, y, vx: 0, vy: 0, angle: UP, spin: 0, prevSpeed: 0, burn: 0, thrust: 0.2 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    if (k.dropping) {
      s.thrust = Math.max(0, s.thrust - 0.08);
      s.vy += 0.7;
      s.x += s.vx;
      s.y += s.vy;
      s.spin += 0.012;
      s.angle += s.spin;
      return;
    }
    s.vx = (s.vx + (m.x - s.x) * LOOK.agility) * 0.78;
    s.vy = (s.vy + (m.y - s.y) * LOOK.agility) * 0.78;
    s.x += s.vx;
    s.y += s.vy;
    const speed = Math.hypot(s.vx, s.vy);
    const heading = speed > 1.2 ? Math.atan2(s.vy, s.vx) : UP;
    s.angle += k.wrapPi(heading - s.angle) * (speed > 1.2 ? 0.25 : 0.06);
    s.thrust = k.lerp(s.thrust, k.clamp(speed / 16, 0.18, 1), 0.2);
    s.burn = Math.max(0, s.burn - 0.035);

    // Exhaust: flame from the nozzle, a little smoke behind it.
    const back = s.angle + Math.PI;
    const nx = s.x + Math.cos(back) * 30 * z;
    const ny = s.y + Math.sin(back) * 30 * z;
    const plume = 1 + Math.round(s.thrust * 2 + s.burn * 3);
    k.burst({ x: nx, y: ny, count: plume, colors: [LOOK.flame, '#ffe9b0', k.shade(LOOK.flame, -0.2)],
      speed: [1.5, 3.5 + 3 * s.thrust], life: [8, 16 + 8 * s.thrust], size: [1.5 * z, 3.5 * z],
      gravity: -0.02, drag: 0.92, shape: 'dot', angle: back, spread: 0.45, vx: s.vx * 0.3, vy: s.vy * 0.3 });
    if (LOOK.smoke && k.frame % 3 === 0) {
      k.burst({ x: nx, y: ny, count: 1, colors: ['rgba(150, 156, 168, 0.35)', 'rgba(120, 126, 138, 0.3)'],
        speed: [0.6, 1.6], life: [30, 50], size: [3 * z, 6 * z], gravity: -0.03, drag: 0.96,
        shape: 'dot', angle: back, spread: 0.8, blend: 'source-over' });
    }

    // Light the afterburner on the rising edge of a hard dash.
    if (speed > LOOK.boost && s.prevSpeed <= LOOK.boost && k.fire(nx, ny)) {
      s.burn = 1;
      s.vx += Math.cos(s.angle) * 6;
      s.vy += Math.sin(s.angle) * 6;
    }
    s.prevSpeed = speed;
  },

  gone(s, k) {
    return s.y - 60 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);

    // Plume: layered teardrops, longer with thrust and the afterburner.
    if (s.thrust > 0.02) {
      const len = (16 + 30 * s.thrust + 40 * s.burn) * z * (0.9 + 0.1 * Math.sin(k.time * 40));
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, l, c0, c1] of [
        [7.5, 1, LOOK.flame, LOOK.accent],
        [4.5, 0.65, '#fff4d6', LOOK.flame],
        [2.2, 0.35, '#ffffff', '#cfe8ff'],
      ]) {
        const g = ctx.createLinearGradient(-30 * z, 0, -30 * z - len * l, 0);
        g.addColorStop(0, c0);
        g.addColorStop(1, k.rgba(c1, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-30 * z, -w * z);
        ctx.quadraticCurveTo(-30 * z - len * l * 0.55, -w * z * 0.9, -30 * z - len * l, 0);
        ctx.quadraticCurveTo(-30 * z - len * l * 0.55, w * z * 0.9, -30 * z, w * z);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;

    // Fins (swept), drawn under the fuselage.
    const fin = ctx.createLinearGradient(0, -22 * z, 0, 22 * z);
    fin.addColorStop(0, k.shade(LOOK.accent, 0.2));
    fin.addColorStop(0.5, LOOK.accent);
    fin.addColorStop(1, k.shade(LOOK.accent, -0.4));
    ctx.fillStyle = fin;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-12 * z, side * 9 * z);
      ctx.lineTo(-30 * z, side * 21 * z);
      ctx.lineTo(-33 * z, side * 19 * z);
      ctx.lineTo(-28 * z, side * 8 * z);
      ctx.closePath();
      ctx.fill();
    }

    // Fuselage: cylinder shading with an ogive nose.
    const hull = ctx.createLinearGradient(0, -11 * z, 0, 11 * z);
    hull.addColorStop(0, '#ffffff');
    hull.addColorStop(0.3, LOOK.hull);
    hull.addColorStop(0.75, k.shade(LOOK.hull, -0.25));
    hull.addColorStop(1, k.shade(LOOK.hull, -0.5));
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-28 * z, -9 * z);
    ctx.lineTo(10 * z, -10.5 * z);
    ctx.quadraticCurveTo(28 * z, -9.5 * z, 37 * z, 0);
    ctx.quadraticCurveTo(28 * z, 9.5 * z, 10 * z, 10.5 * z);
    ctx.lineTo(-28 * z, 9 * z);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Nose cap and a livery stripe in the accent color.
    ctx.fillStyle = LOOK.accent;
    ctx.beginPath();
    ctx.moveTo(25 * z, -8.2 * z);
    ctx.quadraticCurveTo(31 * z, -6 * z, 37 * z, 0);
    ctx.quadraticCurveTo(31 * z, 6 * z, 25 * z, 8.2 * z);
    ctx.quadraticCurveTo(27 * z, 0, 25 * z, -8.2 * z);
    ctx.fill();
    ctx.fillRect(-8 * z, -9.9 * z, 4 * z, 19.8 * z);

    // Porthole.
    const glass = ctx.createRadialGradient(10 * z, -1.5 * z, 0.5, 11 * z, 0, 4.5 * z);
    glass.addColorStop(0, '#9fd8ff');
    glass.addColorStop(1, '#13314d');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(11 * z, 0, 4.2 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9dee8';
    ctx.lineWidth = 1.6 * z;
    ctx.stroke();

    // Nozzle.
    const bell = ctx.createLinearGradient(0, -7 * z, 0, 7 * z);
    bell.addColorStop(0, '#6b717d');
    bell.addColorStop(0.5, '#2a2e36');
    bell.addColorStop(1, '#14161a');
    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(-28 * z, -6 * z);
    ctx.lineTo(-33 * z, -7.5 * z);
    ctx.lineTo(-33 * z, 7.5 * z);
    ctx.lineTo(-28 * z, 6 * z);
    ctx.closePath();
    ctx.fill();

    // Specular stripe along the top of the hull.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.4 * z;
    ctx.beginPath();
    ctx.moveTo(-24 * z, -6 * z);
    ctx.lineTo(18 * z, -7.2 * z);
    ctx.stroke();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const back = s.angle + Math.PI;
    k.ring({ x, y, color: '#ffffff', radius: 60 * z, life: 14, width: 3 });
    k.ring({ x, y, color: LOOK.flame, radius: 90 * z, life: 22, width: 2 });
    k.burst({ x, y, count: 34, colors: ['#ffffff', '#ffe9b0', LOOK.flame, LOOK.accent],
      speed: [3, 10], life: [12, 26], size: [1.6 * z, 4 * z], gravity: 0, drag: 0.9,
      shape: 'dot', angle: back, spread: 1.1 });
    // Shock diamonds trailing the nozzle.
    let t = 0;
    const cos = Math.cos(back);
    const sin = Math.sin(back);
    k.effect(c => {
      t += 1;
      if (t > 16) return false;
      c.globalAlpha = 1 - t / 16;
      c.fillStyle = '#fff4d6';
      for (let d = 1; d <= 4; d++) {
        const cx = x + cos * d * 14 * z;
        const cy = y + sin * d * 14 * z;
        const r = (5 - d) * 1.6 * z;
        c.beginPath();
        c.moveTo(cx + cos * r * 1.6, cy + sin * r * 1.6);
        c.lineTo(cx - sin * r, cy + cos * r);
        c.lineTo(cx - cos * r * 1.6, cy - sin * r * 1.6);
        c.lineTo(cx + sin * r, cy - cos * r);
        c.closePath();
        c.fill();
      }
      return true;
    });
  },

  sound(v) {
    v.noise({ dur: 0.5, gain: 0.85, filter: 'lowpass', freq: 2200, to: 140 });
    v.tone({ type: 'sine', freq: 95, to: 38, dur: 0.45, gain: 0.6 });
    v.noise({ dur: 0.08, gain: 0.3, filter: 'highpass', freq: 4000, to: 2000 });
  },
};
})();
