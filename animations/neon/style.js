// Neon Lash: a glowing gas tube with a white-hot core, fading from one
// neon color at the handle to another at the tip.
//
// Translucent layers are drawn as one continuous path; per-link (tapered)
// layers are opaque, so overlapping joints never show up as beads.
window.WHIP_STYLE = {
  physics: { lineWidthHandle: 6, lineWidthTip: 3.5, handleExtraWidth: 4 },
  look: {
    colorA: '#00e5ff',
    colorB: '#ff2bd6',
    glow: 0.8,
    particles: true,
  },
  pitch: [1.1, 1.25],
  // Neon zing: a bright saw sweep with a glassy shimmer on top.
  sound(v) {
    v.tone({ type: 'sawtooth', freq: 700, to: 2100, dur: 0.12, gain: 0.18 });
    v.tone({ type: 'sine', freq: 2637, to: 2600, dur: 0.32, gain: 0.22, delay: 0.02 });
    v.tone({ type: 'sine', freq: 3951, to: 3900, dur: 0.2, gain: 0.1, delay: 0.04 });
  },

  draw(ctx, whip, k) {
    const { LOOK } = k;
    const tip = whip[whip.length - 1];
    const grad = ctx.createLinearGradient(whip[0].x, whip[0].y, tip.x, tip.y);
    grad.addColorStop(0, LOOK.colorA);
    grad.addColorStop(1, LOOK.colorB);

    // Dark casing keeps the tube readable on bright backgrounds.
    ctx.strokeStyle = '#07071a';
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) + 3; });

    if (LOOK.glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = LOOK.colorA;
      ctx.shadowBlur = 26 * LOOK.glow;
      ctx.globalAlpha = 0.12 + 0.3 * LOOK.glow;
      ctx.strokeStyle = grad;
      ctx.lineWidth = k.P.lineWidthHandle * 2.4;
      k.path(ctx, whip);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = grad;
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip); });
    ctx.strokeStyle = '#effcff';
    k.links(ctx, whip, i => { ctx.lineWidth = Math.max(1, k.width(i, whip) * 0.32); });

    k.grip(ctx, whip, { body: '#0d0f1c', accent: LOOK.colorA, cap: LOOK.colorB });
  },

  onCrack(tip, k) {
    const { LOOK } = k;
    k.ring({ x: tip.x, y: tip.y, color: LOOK.colorA, radius: 70, life: 20, width: 3 });
    k.ring({ x: tip.x, y: tip.y, color: LOOK.colorB, radius: 42, life: 14, width: 2 });
    k.burst({ x: tip.x, y: tip.y, count: 26, colors: [LOOK.colorA, LOOK.colorB, '#ffffff'],
      speed: [3, 10], life: [14, 28], size: [1.2, 2.4], gravity: 0.05, drag: 0.9 });
  },
};
