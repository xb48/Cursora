// Volt: an electric cable wrapped in flickering filaments; cracks throw
// branching lightning bolts.
(() => {
let filaments = [];
let frame = 0;

/** Points offset sideways from the rope by a random amount (a jittery strand). */
function strand(whip, k, amp) {
  const out = [];
  for (let i = 0; i < whip.length; i++) {
    const a = whip[Math.max(0, i - 1)];
    const b = whip[Math.min(whip.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const off = i < 2 ? 0 : k.rand(-1, 1) * amp * (0.4 + i / whip.length);
    out.push({ x: whip[i].x + nx * off, y: whip[i].y + ny * off });
  }
  return out;
}

/** Jagged bolt from (x, y) heading at `angle`, as a list of points. */
function bolt(k, x, y, angle, length) {
  const pts = [{ x, y }];
  const steps = 7;
  for (let s = 1; s <= steps; s++) {
    const d = (length * s) / steps;
    const j = k.rand(-0.45, 0.45);
    pts.push({ x: x + Math.cos(angle + j) * d, y: y + Math.sin(angle + j) * d });
  }
  return pts;
}

window.WHIP_STYLE = {
  physics: { segments: 30, lineWidthHandle: 6, lineWidthTip: 3, handleExtraWidth: 5 },
  look: {
    core: '#a8e6ff',
    glowColor: '#2f7bff',
    glow: 0.9,
    filaments: true,
    particles: true,
  },
  pitch: [1.2, 1.4],
  // Volt crackle: sizzling noise over a low electric buzz.
  sound(v) {
    v.noise({ dur: 0.2, gain: 0.5, filter: 'highpass', freq: 6000, to: 1800 });
    v.tone({ type: 'square', freq: 110, to: 55, dur: 0.18, gain: 0.16 });
    v.tone({ type: 'sawtooth', freq: 3200, to: 380, dur: 0.09, gain: 0.14 });
  },

  tick(whip, k) {
    // Re-roll the filaments every few frames for a crackling flicker.
    if (frame++ % 3 === 0) filaments = [strand(whip, k, 5), strand(whip, k, 7)];
  },

  draw(ctx, whip, k) {
    const { LOOK } = k;
    // Opaque per-link layers, translucent glow as one path: no beads at joints.
    ctx.strokeStyle = '#050a1a';
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) + 3; });

    if (LOOK.glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = LOOK.glowColor;
      ctx.shadowBlur = 20 * LOOK.glow;
      ctx.strokeStyle = k.mix([LOOK.glowColor], 0, 0.35 * LOOK.glow);
      ctx.lineWidth = k.P.lineWidthHandle * 2.6;
      k.path(ctx, whip);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = LOOK.core;
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) * 0.7; });
    ctx.strokeStyle = '#ffffff';
    k.links(ctx, whip, i => { ctx.lineWidth = Math.max(0.8, k.width(i, whip) * 0.25); });

    if (LOOK.filaments && filaments.length) {
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(217, 243, 255, 0.75)';
      ctx.shadowColor = LOOK.glowColor;
      ctx.shadowBlur = 8;
      for (const f of filaments) {
        if (f.length !== whip.length) continue; // link count just changed
        ctx.beginPath();
        ctx.moveTo(f[0].x, f[0].y);
        for (let i = 1; i < f.length; i++) ctx.lineTo(f[i].x, f[i].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    k.grip(ctx, whip, { body: '#0a1124', accent: LOOK.core, cap: LOOK.glowColor });
  },

  onCrack(tip, k) {
    const { LOOK } = k;
    const bolts = [];
    const count = Math.round(k.rand(3, 5));
    for (let n = 0; n < count; n++) {
      const main = bolt(k, tip.x, tip.y, k.rand(0, Math.PI * 2), k.rand(70, 140));
      bolts.push(main);
      const fork = main[Math.round(k.rand(2, 4))];
      bolts.push(bolt(k, fork.x, fork.y, k.rand(0, Math.PI * 2), k.rand(25, 55)));
    }
    let life = 12;
    k.effect((ctx) => {
      if (life-- <= 0) return false;
      ctx.globalAlpha = life / 12;
      ctx.shadowColor = LOOK.glowColor;
      ctx.shadowBlur = 14;
      ctx.lineJoin = 'round';
      for (const [w, color] of [[3, LOOK.glowColor], [1.2, '#ffffff']]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        for (const pts of bolts) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      return true;
    });
    k.ring({ x: tip.x, y: tip.y, color: LOOK.core, radius: 56, life: 14, width: 2 });
    k.burst({ x: tip.x, y: tip.y, count: 16, colors: [LOOK.core, '#ffffff'],
      speed: [4, 11], life: [8, 16], size: [1, 2], gravity: 0, drag: 0.88 });
  },
};
})();
