// Aurora: a ribbon of light whose spectrum flows from handle to tip.
//
// Translucent layers are drawn as one continuous path; per-link (tapered)
// layers are opaque, so overlapping joints never show up as beads.
window.WHIP_STYLE = {
  physics: { segments: 32, segmentLength: 22, lineWidthHandle: 7, lineWidthTip: 3 },
  look: {
    hue: 150,      // starting hue at the handle
    spread: 220,   // degrees of spectrum along the whip
    flow: 1,       // how fast the colors travel
    glow: 0.7,
    particles: true,
  },
  pitch: [1.0, 1.15],
  // Aurora chime: a soft three-note bell.
  sound(v) {
    v.tone({ type: 'sine', freq: 1318.5, dur: 0.7, gain: 0.3 });
    v.tone({ type: 'sine', freq: 1975.5, dur: 0.55, gain: 0.22, delay: 0.05 });
    v.tone({ type: 'triangle', freq: 2637, dur: 0.4, gain: 0.12, delay: 0.1 });
  },

  draw(ctx, whip, k) {
    const { LOOK } = k;
    const base = (LOOK.hue + k.time * 60 * LOOK.flow) % 360;
    const hueAt = t => (base + t * LOOK.spread) % 360;
    const tip = whip[whip.length - 1];

    ctx.strokeStyle = '#0a0c1d';
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) + 3; });

    if (LOOK.glow > 0) {
      const glow = ctx.createLinearGradient(whip[0].x, whip[0].y, tip.x, tip.y);
      for (let s = 0; s <= 6; s++) glow.addColorStop(s / 6, `hsla(${hueAt(s / 6)}, 100%, 60%, ${0.3 * LOOK.glow})`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow;
      ctx.lineWidth = k.P.lineWidthHandle * 2.6;
      k.path(ctx, whip);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    k.links(ctx, whip, (i, t) => {
      ctx.lineWidth = k.width(i, whip);
      ctx.strokeStyle = `hsl(${hueAt(t)}, 95%, 62%)`;
    });
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(0.8, k.P.lineWidthTip * 0.35);
    k.path(ctx, whip, Math.min(k.P.handleThickSegments, whip.length - 2));
    ctx.stroke();

    k.grip(ctx, whip, { body: '#10121f', accent: `hsl(${hueAt(0)}, 90%, 65%)` });
  },

  onCrack(tip, k) {
    const base = (k.LOOK.hue + k.time * 60 * k.LOOK.flow) % 360;
    const colors = [0, 50, 100, 150, 200, 250].map(d => `hsl(${(base + d) % 360}, 100%, 65%)`);
    k.ring({ x: tip.x, y: tip.y, color: '#ffffff', radius: 64, life: 22, width: 2.5 });
    k.burst({ x: tip.x, y: tip.y, count: 34, colors, speed: [2, 8], life: [20, 40],
      size: [1.4, 3], gravity: 0.03, drag: 0.93, shape: 'dot' });
  },
};
