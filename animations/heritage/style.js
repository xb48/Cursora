// Heritage: a hand-braided leather stockwhip with a brass-capped handle and
// a frayed cracker at the tip.
window.WHIP_STYLE = {
  physics: { segments: 30, lineWidthHandle: 8, lineWidthTip: 3.5, handleExtraWidth: 6, gravity: 1.35 },
  look: {
    leather: '#6b3f1d',
    tipLeather: '#a8773f',
    hardware: '#d4a54a',
    outlineColor: '#f2e4cc',
    braid: true,
    particles: true,
  },
  pitch: [0.92, 1.02],
  // Heritage thwack: the dull body of leather meeting air.
  sound(v) {
    v.noise({ dur: 0.12, gain: 0.55, filter: 'lowpass', freq: 2400, to: 300 });
    v.tone({ type: 'sine', freq: 190, to: 70, dur: 0.16, gain: 0.4 });
  },

  draw(ctx, whip, k) {
    const { LOOK } = k;
    const tip = whip[whip.length - 1];
    const prev = whip[whip.length - 2];

    // Light halo, like the classic whip, so it reads on dark windows too.
    ctx.strokeStyle = LOOK.outlineColor;
    k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) + 3.5; });

    k.links(ctx, whip, (i, t) => {
      ctx.lineWidth = k.width(i, whip);
      ctx.strokeStyle = k.mix([LOOK.leather, LOOK.tipLeather], t);
    });
    if (LOOK.braid) {
      ctx.lineCap = 'butt';
      ctx.setLineDash([2.2, 2.8]);
      ctx.strokeStyle = 'rgba(30, 14, 4, 0.5)';
      k.links(ctx, whip, i => { ctx.lineWidth = k.width(i, whip) * 0.72; });
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
    }
    // Sheen as one continuous path, so translucent joints don't double up.
    ctx.strokeStyle = 'rgba(255, 228, 185, 0.25)';
    ctx.lineWidth = 1.2;
    k.path(ctx, whip, Math.min(k.P.handleThickSegments, whip.length - 2));
    ctx.stroke();

    // Cracker: a short frayed tuft continuing past the tip.
    const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    ctx.strokeStyle = '#f7efe2';
    ctx.lineWidth = 1.4;
    for (const off of [-0.32, 0, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x + Math.cos(ang + off) * 11, tip.y + Math.sin(ang + off) * 11);
      ctx.stroke();
    }

    k.grip(ctx, whip, { body: '#2b1a10', accent: LOOK.hardware, cap: LOOK.hardware });
  },

  onCrack(tip, k) {
    k.ring({ x: tip.x, y: tip.y, color: '#fff4e0', radius: 44, life: 14, width: 2 });
    k.burst({ x: tip.x, y: tip.y, count: 22, colors: ['#e8d5b5', '#cbb08a', '#f7efe2'],
      speed: [0.8, 3.6], life: [18, 34], size: [1.5, 3.4], gravity: 0.02, drag: 0.9,
      shape: 'dot', blend: 'source-over' });
    k.burst({ x: tip.x, y: tip.y, count: 8, colors: ['#ffffff'],
      speed: [5, 9], life: [6, 12], size: [1, 1.6], gravity: 0, drag: 0.85 });
  },
};
