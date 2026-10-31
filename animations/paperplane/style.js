// Paper Plane: an origami dart that glides after the pointer, banking into its
// turns and drawing a contrail. Fly it round in tight loops and it pulls off a
// barrel roll.
(() => {
const LEN = 30;           // nose to tail, px at size 1
const SPAN = 17;          // half wingspan, px at size 1
const TRAIL = 34;         // contrail points per wingtip
const ROLL_FRAMES = 42;   // length of the barrel-roll stunt

window.PROP = {
  defaults: {
    size: 1,
    agility: 1,
    loop: 0.07,
    paper: '#f4f1ea',
    crease: '#bdb6a6',
    trail: true,
  },

  spawn(x, y) {
    return { x, y, heading: -0.4, speed: 0, roll: 0, turn: 0, winding: 0, stunt: 0, armed: true, trail: [] };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    let tx = m.x, ty = m.y;
    let idle = false;
    if (k.dropping) {
      tx = s.x + Math.cos(s.heading) * 40;
      ty = k.H + 600;
    } else if (Math.hypot(m.x - s.x, m.y - s.y) < 70 * z && m.speed < 1 && s.speed < 4 * z) {
      // Resting pointer: circle it lazily, like a glider riding a thermal.
      idle = true;
      const a = k.time * 1.1;
      tx = m.x + Math.cos(a) * 58 * z;
      ty = m.y + Math.sin(a) * 58 * z;
    }
    // Turn rate falls with size, so a bigger plane flies the same loops, not wider ones.
    const maxTurn = 0.12 * LOOK.agility / Math.sqrt(z);
    const before = s.heading;
    s.heading += k.clamp(k.wrapPi(Math.atan2(ty - s.y, tx - s.x) - s.heading), -maxTurn, maxTurn);
    s.turn = k.wrapPi(s.heading - before);
    const want = k.dropping ? 13 * z : k.clamp(Math.hypot(tx - s.x, ty - s.y) * 0.08, 1.2, 11 * Math.sqrt(z));
    s.speed = k.lerp(s.speed, want, want > s.speed ? 0.1 : 0.04);
    s.x += Math.cos(s.heading) * s.speed;
    s.y += Math.sin(s.heading) * s.speed;

    // Bank into the turn; the stunt adds a full roll on top.
    s.roll = k.lerp(s.roll, k.clamp(s.turn * 9, -1.05, 1.05), 0.15);
    if (s.stunt > 0) s.stunt = Math.max(0, s.stunt - 1 / ROLL_FRAMES);

    if (LOOK.trail) {
      // Wingtips sit either side of the tail, along the normal (-sin, cos).
      const n = -Math.sin(s.heading), c = Math.cos(s.heading);
      const span = SPAN * z * Math.abs(Math.cos(s.roll + s.stunt * Math.PI * 2));
      const tail = LEN * z * 0.5;
      s.trail.unshift({
        lx: s.x - c * tail + n * span, ly: s.y - Math.sin(s.heading) * tail + c * span,
        rx: s.x - c * tail - n * span, ry: s.y - Math.sin(s.heading) * tail - c * span,
        sp: s.speed,
      });
      if (s.trail.length > TRAIL) s.trail.length = TRAIL;
    } else {
      s.trail.length = 0;
    }
    if (k.dropping) {
      s.roll += 0.12;
      return;
    }

    // Loops: only tight, fast turning that you are steering winds up (never its
    // own lazy circling round a resting pointer); anything gentler unwinds.
    const steering = !idle && m.speed > 3;
    if (steering && Math.abs(s.turn) > LOOK.loop / Math.sqrt(z) && s.speed > 6 * Math.sqrt(z)) s.winding += s.turn;
    else s.winding *= 0.97;
    if (Math.abs(s.winding) < Math.PI) s.armed = true;
    if (s.armed && Math.abs(s.winding) >= Math.PI * 2 && k.fire(s.x, s.y)) {
      s.armed = false;
      s.winding = 0;
      s.stunt = 1;
    }
  },

  gone(s, k) {
    return s.y - LEN * 2 * k.LOOK.size > k.H;
  },

  draw(ctx, s, k) {
    const { LOOK } = k;
    const z = LOOK.size;

    // Contrail: two fading lines from the wingtips.
    if (s.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.lineWidth = 1.1 * z;
      for (let i = 1; i < s.trail.length; i++) {
        const p = s.trail[i - 1], q = s.trail[i];
        const a = (1 - i / s.trail.length) * Math.min(1, q.sp / (8 * z)) * 0.5;
        if (a <= 0.01) continue;
        ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
        ctx.beginPath();
        ctx.moveTo(p.lx, p.ly); ctx.lineTo(q.lx, q.ly);
        ctx.moveTo(p.rx, p.ry); ctx.lineTo(q.rx, q.ry);
        ctx.stroke();
      }
      ctx.restore();
    }

    const roll = s.roll + s.stunt * Math.PI * 2;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const L = LEN * z, half = SPAN * z;
    const lift = 1 + 0.25 * Math.sin(s.stunt * Math.PI);   // climbs toward us mid-roll
    // Wing tips foreshorten with the roll; the keel swings to the low side.
    const span = half * cr;
    const keel = 5 * z * sr;
    const nose = [L * 0.55, 0];
    const tailL = [-L * 0.45, -span];
    const tailR = [-L * 0.45, span];
    const root = [-L * 0.3, 0];
    const keelTail = [-L * 0.38, keel];

    // Shadow on the desktop below.
    ctx.save();
    ctx.translate(s.x + 7 * z * lift, s.y + 14 * z * lift);
    ctx.rotate(s.heading);
    ctx.filter = `blur(${Math.round(3 * z)}px)`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(-L * 0.45, -half * Math.abs(cr)); ctx.lineTo(...root); ctx.lineTo(-L * 0.45, half * Math.abs(cr));
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.heading);
    ctx.scale(lift, lift);
    const top = cr >= 0;   // upside down mid-roll shows the underside
    const paper = LOOK.paper;
    const shadeOf = t => {
      // t: -1 (in shadow) .. 1 (lit), mixed toward a cool grey or white.
      return t >= 0 ? k.mix([paper, '#ffffff'], t * 0.6) : k.mix([paper, '#8d96a6'], -t * 0.55);
    };
    // Keel (the folded fuselage), visible as the plane banks.
    ctx.fillStyle = shadeOf(-0.6);
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(...keelTail); ctx.lineTo(...root);
    ctx.closePath();
    ctx.fill();
    // Wings: the one tipped toward the light is brighter.
    const wings = [[tailL, sr * 0.6 + (top ? 0.25 : -0.4)], [tailR, -sr * 0.6 + (top ? 0.1 : -0.5)]];
    for (const [tip, light] of wings) {
      ctx.fillStyle = shadeOf(light);
      ctx.beginPath();
      ctx.moveTo(...nose); ctx.lineTo(...tip); ctx.lineTo(...root);
      ctx.closePath();
      ctx.fill();
    }
    // Folds and crisp edges.
    ctx.strokeStyle = LOOK.crease;
    ctx.lineWidth = 0.8 * z;
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(...root);
    ctx.moveTo(nose[0] * 0.55, nose[1]); ctx.lineTo(tailL[0] * 0.9, tailL[1] * 0.42);
    ctx.moveTo(nose[0] * 0.55, nose[1]); ctx.lineTo(tailR[0] * 0.9, tailR[1] * 0.42);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40, 36, 30, 0.35)';
    ctx.lineWidth = 0.7 * z;
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(...tailL); ctx.lineTo(...root); ctx.lineTo(...tailR); ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: 'rgba(255, 255, 255, 0.85)', radius: 64 * z, life: 22, width: 1.6, blend: 'source-over' });
    k.burst({ x, y, count: 22, colors: [LOOK.paper, '#ffffff', LOOK.crease], speed: [1.5, 5], life: [26, 44],
      size: [1.2 * z, 2.6 * z], gravity: 0.06, drag: 0.95, shape: 'dot', blend: 'source-over' });
  },

  // A paper whoosh through the air with a light flutter.
  sound(v) {
    v.noise({ dur: 0.5, gain: 0.6, filter: 'bandpass', freq: 600, to: 2600, q: 0.8 });
    v.noise({ dur: 0.2, gain: 0.25, filter: 'highpass', freq: 3500, to: 6000, delay: 0.18 });
    v.tone({ type: 'sine', freq: 480, to: 860, dur: 0.32, gain: 0.12 });
  },
};
})();
