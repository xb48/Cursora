// Inferno: a molten lash that cools to charcoal at the handle, sheds embers
// as it moves and bursts into flame on a crack.
window.WHIP_STYLE = {
  physics: { lineWidthHandle: 7, lineWidthTip: 4, handleExtraWidth: 5 },
  look: {
    ember: '#d42a0c',
    flame: '#ffd27a',
    glow: 0.75,
    embers: true,
    particles: true,
  },
  pitch: [0.85, 1.0],
  // Inferno whoosh: a rising burst of flame with a deep body.
  sound(v) {
    v.noise({ dur: 0.38, gain: 0.6, filter: 'bandpass', freq: 350, to: 2600, q: 0.7 });
    v.tone({ type: 'sine', freq: 95, to: 48, dur: 0.32, gain: 0.35 });
  },

  tick(whip, k, tipSpeed) {
    if (!k.LOOK.embers || tipSpeed < 18) return;
    const count = Math.min(4, Math.floor(tipSpeed / 40) + 1);
    for (let n = 0; n < count; n++) {
      const p = whip[whip.length - 1 - Math.floor(k.rand(0, 5))];
      k.burst({ x: p.x, y: p.y, count: 1, colors: ['#ffb020', '#ff6a00', k.LOOK.flame],
        speed: [0.2, 1.4], life: [24, 52], size: [1, 2.3], gravity: -0.04, drag: 0.97,
        shape: 'dot', vx: (p.x - p.px) * 0.12, vy: (p.y - p.py) * 0.12 });
    }
  },

  draw(ctx, whip, k) {
    const { LOOK } = k;
    const stops = ['#2a0e05', LOOK.ember, '#ff6a00', LOOK.flame];

    const tip = whip[whip.length - 1];

    // Opaque per-link layers, translucent glow as one path: no beads at joints.
    ctx.strokeStyle = '#170500';
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) + 3; });

    if (LOOK.glow > 0) {
      const glow = ctx.createLinearGradient(whip[0].x, whip[0].y, tip.x, tip.y);
      // Pure fire hues (not the charcoal stop) so the halo stays saturated.
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        glow.addColorStop(t, `rgba(255, ${Math.round(70 + 100 * t)}, 0, ${0.4 * LOOK.glow * t})`);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#ff5a00';
      ctx.shadowBlur = 18 * LOOK.glow;
      ctx.strokeStyle = glow;
      ctx.lineWidth = k.P.lineWidthHandle * 1.9;
      k.path(ctx, whip);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    k.links(ctx, whip, (i, t) => {
      const flicker = 1 + 0.12 * Math.sin(k.time * 18 + i * 1.3) * t;
      ctx.lineWidth = k.width(i, whip) * flicker;
      ctx.strokeStyle = k.mix(stops, t);
    });
    // White-hot core along the outer two thirds only.
    k.links(ctx, whip, (i, t) => {
      ctx.lineWidth = Math.max(0.8, k.width(i, whip) * 0.3);
      ctx.strokeStyle = t < 0.35 ? 'rgba(0, 0, 0, 0)' : k.mix(['#ff9a3c', '#fff1cc'], (t - 0.35) / 0.65);
    });

    k.grip(ctx, whip, { body: '#1c0d07', accent: '#ff6a00', cap: '#3a1a0c' });
  },

  onCrack(tip, k) {
    const { LOOK } = k;
    k.ring({ x: tip.x, y: tip.y, color: '#ff6a00', radius: 60, life: 18, width: 3 });
    k.burst({ x: tip.x, y: tip.y, count: 34, colors: ['#fff3b0', LOOK.flame, '#ff8a00', LOOK.ember],
      speed: [1.5, 6], life: [18, 40], size: [1.6, 3.6], gravity: -0.07, drag: 0.92, shape: 'dot' });
    k.burst({ x: tip.x, y: tip.y, count: 14, colors: ['#ffe8a0', '#ffffff'],
      speed: [5, 11], life: [8, 16], size: [1, 2], gravity: 0.1, drag: 0.9 });
  },
};
