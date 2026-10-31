// Sumi: a bamboo calligraphy brush. Slow strokes are full and wet, fast ones
// break into dry "flying white" streaks; a hard slash splatters ink and
// stamps a red seal. Ink thins away instead of fading, so it never leaves ghosts.
(() => {
const MAX_MARKS = 900;
const HANDLE = 58;   // bamboo handle length, px at size 1

const life = k => Math.max(30, k.LOOK.persist * 60);

window.PROP = {
  defaults: {
    size: 1,
    weight: 12,
    persist: 3,
    splash: 30,
    ink: '#141210',
    halo: true,
    paper: '#f3ecdf',
    seal: true,
    sealChar: '速',
    sealColor: '#c8102e',
  },

  spawn(x, y) {
    return { x, y, vx: 0, vy: 0, w: 0, lx: x, ly: y, marks: [], prevSpeed: 0, bend: 0, falling: false };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    for (let i = s.marks.length - 1; i >= 0; i--) {
      const mk = s.marks[i];
      mk.age += 1;
      if (mk.age > life(k) * (mk.type === 'seal' ? 1.4 : 1)) s.marks.splice(i, 1);
    }
    if (k.dropping) {
      if (!s.falling) { s.falling = true; s.vy = Math.min(s.vy, 0) - 2; }
      s.vy += 0.8;
      s.x += s.vx;
      s.y += s.vy;
      return;
    }
    // Cursor replacer: pinned exactly to the pointer tip (no lag).
    s.vx = m.x - s.x;
    s.vy = m.y - s.y;
    s.x = m.x;
    s.y = m.y;
    const speed = Math.hypot(s.vx, s.vy);
    s.bend = k.lerp(s.bend, k.clamp(-s.vx * 0.02, -0.6, 0.6), 0.3);

    // Pressure: slow strokes are full, fast ones thin out.
    const target = LOOK.weight * z * k.clamp(1.15 - speed / 38, 0.18, 1.1);
    s.w = k.lerp(s.w, target, 0.3);
    if (Math.hypot(s.x - s.lx, s.y - s.ly) > 0.8 && s.marks.length < MAX_MARKS) {
      s.marks.push({ type: 'stroke', x0: s.lx, y0: s.ly, x1: s.x, y1: s.y, w: s.w, dry: speed > 22, age: 0 });
      s.lx = s.x;
      s.ly = s.y;
    }

    if (speed > LOOK.splash && s.prevSpeed <= LOOK.splash) k.fire(s.x, s.y);
    s.prevSpeed = speed;
  },

  gone(s, k) {
    return s.y - HANDLE * 1.5 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const L = life(k);
    const thin = mk => Math.pow(Math.max(0, 1 - mk.age / L), 0.7);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Ink is opaque and shrinks with age, so overlapping joints never stack up.
    const pass = paper => {
      for (const mk of s.marks) {
        if (mk.type === 'seal') continue;
        const f = thin(mk);
        if (f <= 0) continue;
        if (mk.type === 'blot') {
          ctx.fillStyle = paper ? LOOK.paper : LOOK.ink;
          ctx.beginPath();
          mk.pts.forEach(([a, r], i) => {
            // Halo in proportion to the drop, so tiny drops don't turn into rings.
            const rr = r * f + (paper ? Math.min(2.5 * z, r * f * 0.35) : 0);
            const px = mk.x + Math.cos(a) * rr, py = mk.y + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
          continue;
        }
        const w = mk.w * f;
        if (paper) {
          ctx.strokeStyle = LOOK.paper;
          ctx.lineWidth = w + 5 * z;
          ctx.beginPath();
          ctx.moveTo(mk.x0, mk.y0);
          ctx.lineTo(mk.x1, mk.y1);
          ctx.stroke();
          continue;
        }
        ctx.strokeStyle = LOOK.ink;
        if (!mk.dry) {
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(mk.x0, mk.y0);
          ctx.lineTo(mk.x1, mk.y1);
          ctx.stroke();
          continue;
        }
        // Flying white: the brush splits into separate bristle streaks.
        const dx = mk.x1 - mk.x0, dy = mk.y1 - mk.y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        ctx.lineWidth = Math.max(0.6, w * 0.26);
        for (const o of [-0.36, 0, 0.36]) {
          ctx.beginPath();
          ctx.moveTo(mk.x0 + nx * w * o, mk.y0 + ny * w * o);
          ctx.lineTo(mk.x1 + nx * w * o, mk.y1 + ny * w * o);
          ctx.stroke();
        }
      }
    };
    if (LOOK.halo) pass(true);
    pass(false);

    // Seals fade (each is a single shape, so alpha is safe here).
    for (const mk of s.marks) {
      if (mk.type !== 'seal') continue;
      const a = Math.max(0, 1 - mk.age / (L * 1.4));
      const r = 13 * z;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(mk.x, mk.y);
      ctx.rotate(mk.rot);
      ctx.fillStyle = LOOK.sealColor;
      ctx.beginPath();
      ctx.roundRect(-r, -r, r * 2, r * 2, 3 * z);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 246, 238, 0.55)';
      ctx.lineWidth = 1 * z;
      ctx.strokeRect(-r + 2.5 * z, -r + 2.5 * z, r * 2 - 5 * z, r * 2 - 5 * z);
      ctx.fillStyle = '#fff6ee';
      ctx.font = `600 ${Math.round(17 * z)}px "Yu Mincho", "YuMincho", "SimSun", "MS Mincho", "Microsoft YaHei", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mk.char, 0, 1 * z);
      ctx.restore();
    }

    // The brush: hair tuft at the cursor, bone ferrule, bamboo handle, red cord.
    const ang = -1.05 + s.bend;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    const tuft = 16 * z;
    const curl = -s.bend * 10 * z;
    ctx.fillStyle = LOOK.ink;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(tuft * 0.5, -3.2 * z + curl, tuft, -2.6 * z);
    ctx.lineTo(tuft, 2.6 * z);
    ctx.quadraticCurveTo(tuft * 0.5, 3.2 * z + curl, 0, 0);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;
    const ferrule = ctx.createLinearGradient(0, -3 * z, 0, 3 * z);
    ferrule.addColorStop(0, '#f2ead8');
    ferrule.addColorStop(1, '#a89c80');
    ctx.fillStyle = ferrule;
    ctx.fillRect(tuft, -2.9 * z, 5 * z, 5.8 * z);
    const bamboo = ctx.createLinearGradient(0, -2.3 * z, 0, 2.3 * z);
    bamboo.addColorStop(0, '#e9d49c');
    bamboo.addColorStop(0.45, '#c8a865');
    bamboo.addColorStop(1, '#7d6232');
    ctx.fillStyle = bamboo;
    ctx.beginPath();
    ctx.roundRect(tuft + 5 * z, -2.3 * z, HANDLE * z, 4.6 * z, 2 * z);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 50, 20, 0.55)';
    ctx.lineWidth = 1.2 * z;
    for (const nx of [0.38, 0.72]) {
      const x = tuft + 5 * z + HANDLE * z * nx;
      ctx.beginPath();
      ctx.moveTo(x, -2.3 * z);
      ctx.lineTo(x, 2.3 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = LOOK.sealColor;
    ctx.lineWidth = 1.2 * z;
    const end = tuft + 5 * z + HANDLE * z;
    ctx.beginPath();
    ctx.ellipse(end + 3 * z, 0, 3.5 * z, 2.2 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    const dir = Math.atan2(s.vy, s.vx);
    const r = LOOK.weight * z * 1.3;
    const blot = (bx, by, br) => ({
      type: 'blot', x: bx, y: by, age: 0,
      pts: Array.from({ length: 14 }, (_, i) => [(i / 14) * Math.PI * 2, br * k.rand(0.72, 1.25)]),
    });
    s.marks.push(blot(x, y, r));
    // Satellite drops thrown along the slash, shrinking with distance.
    const drops = Math.round(k.rand(6, 9));
    for (let i = 0; i < drops; i++) {
      const d = (14 + i * 7 + k.rand(0, 6)) * z;
      const a = dir + k.rand(-0.35, 0.35);
      s.marks.push(blot(x + Math.cos(a) * d, y + Math.sin(a) * d, r * k.rand(0.12, 0.35) * (1 - i / (drops + 2))));
    }
    if (LOOK.seal) {
      s.marks.push({ type: 'seal', x: x + k.rand(-30, 30) * z, y: y + k.rand(24, 46) * z, rot: k.rand(-0.2, 0.2), char: LOOK.sealChar, age: 0 });
    }
    k.ring({ x, y, color: k.rgba(LOOK.ink, 0.6), radius: 40 * z, life: 14, width: 2, blend: 'source-over' });
  },

  // Brush swish, then the wooden thock of the seal.
  sound(v) {
    v.noise({ dur: 0.22, gain: 0.55, filter: 'bandpass', freq: 900, to: 3200, q: 1.2 });
    v.tone({ type: 'triangle', freq: 520, to: 470, dur: 0.08, gain: 0.5, delay: 0.14 });
    v.noise({ dur: 0.06, gain: 0.3, filter: 'lowpass', freq: 1500, to: 400, delay: 0.14 });
  },
};
})();
