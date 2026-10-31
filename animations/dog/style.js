// Biscuit: a Pembroke corgi, drawn side-on with a real legged gait, who plays
// fetch. You hold the tennis ball at the cursor; flick to throw it. The ball
// arcs, bounces and rolls; Biscuit runs it down, dips to pick it up, carries it
// back and barks when he delivers it to your cursor. He sits while he waits.
(() => {
const Q = window.OpenWhipQuadruped;
const SPEC = {
  body: 58, hipHeight: 24, shoulderHeight: 23, sitHipHeight: 8, sitShoulderHeight: 26, sitSpine: 0.62,
  hind: { upper: 11.5, lower: 11.5, foot: 7, angle: 1.1, swingAngle: 0.55, rest: 2, sitRest: 9 },
  fore: { upper: 12, lower: 12, foot: 4, angle: 1.45, swingAngle: 2.5, rest: -1 },
  gaits: {                                                      // offsets: LH, LF, RH, RF
    walk: { offsets: [0, 0.25, 0.5, 0.75], duty: 0.62, stride: 16, strideK: 2.5 },
    trot: { offsets: [0, 0.5, 0.5, 0], duty: 0.5, stride: 20, strideK: 2.5 },
    gallop: { offsets: [0, 0.6, 0.1, 0.7], duty: 0.34, stride: 26, strideK: 3 },
  },
  gaitSpeeds: [2, 5.2], lift: 4.5, accel: 0.07, brake: 0.12, turnSlack: 22, minPeriod: 6,
  turnDelay: 5, turnCooldown: 18,
};
const GROUND = 46;       // ground line below the cursor, px at size 1
const BALL_R = 5.5;
const GRAVITY = 0.45;
const BOUNCE = 0.55;
const ROLL = 0.975;
const MAX_SPEED = 9;
const SIT_AFTER = 120;
const TAIL = 8;
const DROP_FRAMES = 150; // longest a drop may take

/** Filled tapered limb segment from p (width w1) to q (width w2), with round ends. */
function limb(c, p, q, w1, w2) {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len, ny = dx / len;
  c.beginPath();
  c.moveTo(p.x + nx * w1 / 2, p.y + ny * w1 / 2);
  c.lineTo(q.x + nx * w2 / 2, q.y + ny * w2 / 2);
  // Caps sweep anticlockwise from +n to −n, i.e. around the outside of each end.
  c.arc(q.x, q.y, w2 / 2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
  c.lineTo(p.x - nx * w1 / 2, p.y - ny * w1 / 2);
  c.arc(p.x, p.y, w1 / 2, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
  c.closePath();
  c.fill();
}

/** Head placement in local coordinates (facing right) and pitch. */
function headPose(s, rig, z) {
  const S = Q.local(rig, rig.shoulder);
  // dip lowers the neck toward the ground to pick something up.
  return { x: S.x + 15 * z, y: S.y - 12 * z - rig.sit * 5 * z + s.dip * 20 * z, pitch: s.pitch };
}

/** Mouth position in world coordinates for the current head pose. */
function mouthWorld(s, rig, z) {
  const h = headPose(s, rig, z);
  const mx = 13 * z, my = 5 * z;
  const lx = h.x + Math.cos(h.pitch) * mx - Math.sin(h.pitch) * my;
  const ly = h.y + Math.sin(h.pitch) * mx + Math.cos(h.pitch) * my;
  return { x: rig.x + rig.dir * lx, y: ly };
}

window.PROP = {
  defaults: {
    size: 1,
    agility: 1,
    throwSpeed: 26,
    fur: '#d9822b',
    white: '#fff6ea',
    ball: '#d8f03a',
    collar: '#d63b3b',
    bubble: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const ground = y + GROUND * z;
    const rig = Q.create(SPEC, x - 44 * z, ground, 1, z);
    return {
      rig, ground, idle: 0, pitch: 0, dip: 0, wag: 0, tail: Array.from({ length: TAIL }, () => ({ a: -2.1, w: 0 })),
      prevSpeed: 0, prevVx: 0, blink: 0, nextBlink: k.time + k.rand(2, 5), tongue: 0,
      ball: { mode: 'held', x, y, vx: 0, vy: 0, spin: 0 },
    };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const rig = s.rig;
    const b = s.ball;
    const r = BALL_R * z;
    if (!k.dropping) s.ground = k.lerp(s.ground, m.y + GROUND * z, 0.06);
    const floor = s.ground - r;

    // Ball: held at the cursor, or flying / bouncing / rolling with friction,
    // bouncing off the sides of the screen.
    if (b.mode === 'held') {
      b.x = m.x;
      b.y = m.y;
      if (!k.dropping && m.speed > LOOK.throwSpeed && s.prevSpeed <= LOOK.throwSpeed) {
        b.mode = 'loose';
        b.vx = m.vx * 0.55;
        b.vy = m.vy * 0.55;
      }
    } else if (b.mode === 'loose') {
      b.vy += GRAVITY * z;
      b.x += b.vx;
      b.y += b.vy;
      if (b.y >= floor) {
        b.y = floor;
        b.vy = Math.abs(b.vy) < 1.2 * z ? 0 : -Math.abs(b.vy) * BOUNCE;
        b.vx *= ROLL;
      }
      if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x > k.W - r) { b.x = k.W - r; b.vx = -Math.abs(b.vx) * 0.6; }
      if (Math.abs(b.vx) < 0.05 * z && b.y >= floor) b.vx = 0;
      b.spin += b.vx / r;
    }
    s.prevSpeed = m.speed;

    // Where Biscuit goes: off-screen, to the ball, back to you, or beside you.
    // Fetching and delivering aim the mouth (not the body) at the spot.
    const mouthOffset = mouthWorld(s, rig, z).x - rig.x;
    let targetX, faceX;
    if (k.dropping) {
      targetX = rig.x < k.W / 2 ? -300 * z : k.W + 300 * z;
      faceX = targetX;
    } else if (b.mode === 'loose') {
      faceX = b.x;
      targetX = b.x - mouthOffset;                      // mouth over the ball
    } else if (b.mode === 'mouth') {
      faceX = m.x;
      targetX = m.x - mouthOffset;                      // mouth under your cursor
    } else {
      faceX = m.x;
      targetX = m.x - Math.sign(m.x - rig.x || 1) * 44 * z;
    }
    const settled = rig.speed < 0.1 * z && (targetX - rig.x) * rig.dir < 3 * z && b.mode === 'held' && !k.dropping;
    s.idle = settled ? s.idle + 1 : 0;
    rig.sit = k.clamp(rig.sit + (s.idle > SIT_AFTER ? 0.04 : -0.07), 0, 1);
    Q.update(rig, { targetX, maxSpeed: (k.dropping ? 1.4 : 1) * MAX_SPEED * z * (0.6 + 0.4 * LOOK.agility), ground: s.ground, faceX });

    // Head: dips toward a loose ball nearby, looks up at you otherwise.
    const h = headPose(s, rig, z);
    const look = b.mode === 'loose' ? { x: b.x, y: b.y } : { x: m.x, y: m.y };
    const lx = (look.x - rig.x) * rig.dir - h.x;
    const want = k.clamp(Math.atan2(look.y - h.y, Math.max(16 * z, Math.abs(lx))), -0.55, 0.8);
    s.pitch = k.lerp(s.pitch, want * (b.mode === 'loose' ? 1 : 0.6), 0.18);
    // Lower the neck to the ground when the ball is right in front of the mouth.
    const near = b.mode === 'loose' && b.y > floor - 12 * z && Math.abs(mouthWorld(s, rig, z).x - b.x) < 40 * z;
    s.dip = k.lerp(s.dip, near ? 1 : 0, 0.2);

    if (!k.dropping) {
      const mouth = mouthWorld(s, rig, z);
      if (b.mode === 'loose' && b.y > floor - 12 * z && Math.hypot(mouth.x - b.x, mouth.y - b.y) < 11 * z) b.mode = 'mouth';
      if (b.mode === 'mouth') {
        b.x = mouth.x;
        b.y = mouth.y;
        // Deliver at your cursor and bark; if the trigger is gated, hold on and retry.
        if (Math.abs(mouth.x - m.x) < 18 * z && k.fire(m.x, m.y)) b.mode = 'held';
      }
    }

    // Tail: a fluffy plume carried up over the back, wagging harder when the
    // ball is in play.
    const ax = (rig.vx - s.prevVx) * rig.dir;
    s.prevVx = rig.vx;
    const keen = b.mode === 'held' ? 1 : b.mode === 'mouth' ? 0.7 : 0.4;
    s.wag += 0.25 + 0.35 * keen;
    for (let i = 0; i < TAIL; i++) {
      const seg = s.tail[i];
      const t = i / TAIL;
      const target = k.lerp(-2.1, 2.6, rig.sit) + (0.16 - rig.sit * 0.3) * i + Math.sin(s.wag - i * 0.5) * 0.35 * keen * (0.3 + t);
      seg.w = (seg.w + k.wrapPi(target - seg.a) * 0.16 - ax * 0.02 * t) * 0.75;
      seg.a += seg.w;
    }
    s.tongue = k.lerp(s.tongue, rig.speed > 4 * z && b.mode !== 'mouth' ? 1 : 0, 0.1);
    if (k.time > s.nextBlink) {
      s.blink = 1;
      s.nextBlink = k.time + k.rand(2.5, 6);
    }
    s.blink = Math.max(0, s.blink - 0.12);
  },

  // Dropped: it runs off the nearest edge; capped at ~2.5 s so a drop never drags on.
  gone(s, k) {
    const x = s.rig.x;
    s.leaving = (s.leaving || 0) + 1;
    return s.leaving > DROP_FRAMES || x < -120 * k.LOOK.size || x > k.W + 120 * k.LOOK.size;
  },

  draw(ctx, s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const rig = s.rig;
    const b = s.ball;
    const fur = LOOK.fur;
    const white = LOOK.white;
    const farFur = k.shade(fur, -0.32);
    const farWhite = k.shade(white, -0.3);
    const L = p => Q.local(rig, p);

    const drawBall = (x, y) => {
      const r = BALL_R * z;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, k.shade(LOOK.ball, 0.4));
      g.addColorStop(1, k.shade(LOOK.ball, -0.25));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 0.9 * z;
      ctx.beginPath();
      ctx.arc(x - r * 0.9 * Math.cos(b.spin), y - r * 0.9 * Math.sin(b.spin), r * 0.75, b.spin - 0.9, b.spin + 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + r * 0.9 * Math.cos(b.spin), y + r * 0.9 * Math.sin(b.spin), r * 0.75, b.spin + Math.PI - 0.9, b.spin + Math.PI + 0.9);
      ctx.stroke();
    };

    if (b.mode !== 'held' && !k.dropping) {
      // Your cursor, while the ball is away.
      ctx.strokeStyle = 'rgba(20, 20, 24, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (b.mode === 'loose') {
      const lift = Math.max(0, s.ground - BALL_R * z - b.y);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * Math.max(0.25, 1 - lift / (80 * z))})`;
      ctx.beginPath();
      ctx.ellipse(b.x, s.ground + 1 * z, BALL_R * z * 1.1, BALL_R * z * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBall(b.x, b.y);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.beginPath();
    ctx.ellipse(rig.x, rig.ground + 1.5 * z, 40 * z * Q.turnScale(rig), 3.6 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    Q.frame(rig, ctx, () => {
      const H = L(rig.hip), S = L(rig.shoulder);
      const breathe = Math.sin(k.time * (rig.speed > 3 * z ? 6 : 2)) * 0.5 * z;

      // Short sturdy legs with white socks: fur above the knee/elbow, white below.
      const leg = (id, near) => {
        const j = rig.legs[id].joints;
        const r = L(j.root), mj = L(j.mid), a = L(j.ankle), t = L(j.toe);
        const hind = rig.legs[id].hind;
        const shift = near ? 0 : 2.5 * z;
        for (const p of [r, mj, a, t]) p.x += shift;
        ctx.fillStyle = near ? fur : farFur;
        limb(ctx, r, mj, (hind ? 10 : 8.5) * z, 6 * z);
        ctx.fillStyle = near ? white : farWhite;
        limb(ctx, mj, a, 5.6 * z, 4.6 * z);
        limb(ctx, a, t, 4.6 * z, 4.2 * z);
        ctx.beginPath();
        ctx.ellipse(t.x + 2.2 * z, t.y - 2.2 * z, 4.6 * z, 2.5 * z, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!near) return;
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.4)';
        ctx.lineWidth = 0.7 * z;
        for (const dx of [1.6, 3.8]) {
          ctx.beginPath();
          ctx.moveTo(t.x + dx * z, t.y - 0.4 * z);
          ctx.lineTo(t.x + dx * z, t.y - 2.3 * z);
          ctx.stroke();
        }
      };
      leg('RH', false);
      leg('RF', false);

      // Fluffy tail plume.
      const tb = { x: H.x - 9 * z, y: H.y - 6 * z };
      let px = tb.x, py = tb.y;
      const pts = [{ x: px, y: py }];
      for (const seg of s.tail) {
        px += Math.cos(seg.a) * 3.6 * z;
        py = Math.min(rig.ground - rig.air - 3 * z, py + Math.sin(seg.a) * 3.6 * z);
        pts.push({ x: px, y: py });
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const t = i / TAIL;
        ctx.fillStyle = t > 0.7 ? k.shade(fur, -0.15) : fur;
        limb(ctx, pts[i], pts[i + 1], (6 + 3 * Math.sin(Math.PI * t)) * z, (6 + 3 * Math.sin(Math.PI * (t + 1 / TAIL))) * z);
      }

      // Torso: long and low, deep chest, the famous fluffy rump; white underneath.
      const top = Math.min(H.y, S.y) - 9 * z - rig.flex * 3 * z;
      const R = { x: H.x - 10 * z, y: H.y - 6 * z };
      const W = { x: S.x + 1 * z, y: S.y - 9 * z };
      const chest = { x: S.x + 12 * z, y: S.y + 1 * z };
      const brisket = { x: S.x + 6 * z, y: S.y + 10 * z + breathe };
      const midX = (H.x + S.x) / 2;
      const bellyY = Math.max(H.y, S.y) + 8 * z + breathe;
      const groin = { x: H.x + 8 * z, y: H.y + 7 * z };
      const rumpBack = { x: H.x - 13 * z, y: H.y + 3 * z };
      const torso = () => {
        ctx.beginPath();
        ctx.moveTo(R.x, R.y);
        ctx.bezierCurveTo(R.x + 14 * z, top - 1.5 * z, W.x - 16 * z, top, W.x, W.y);
        ctx.quadraticCurveTo(S.x + 13 * z, S.y - 8 * z, chest.x, chest.y);
        ctx.quadraticCurveTo(S.x + 13 * z, S.y + 9 * z, brisket.x, brisket.y);
        ctx.quadraticCurveTo(midX, bellyY + 1.5 * z, groin.x, groin.y);
        ctx.quadraticCurveTo(H.x - 1 * z, H.y + 12 * z, rumpBack.x, rumpBack.y);
        ctx.quadraticCurveTo(H.x - 17 * z, H.y - 6 * z, R.x, R.y);
        ctx.closePath();
      };
      const shade = ctx.createLinearGradient(0, top, 0, bellyY);
      shade.addColorStop(0, k.shade(fur, -0.12));
      shade.addColorStop(0.5, fur);
      shade.addColorStop(1, k.shade(fur, 0.1));
      ctx.fillStyle = shade;
      torso();
      ctx.fill();
      ctx.save();
      torso();
      ctx.clip();
      // White chest bib and belly, with a soft edge.
      ctx.fillStyle = white;
      ctx.beginPath();
      ctx.ellipse(S.x + 8 * z, S.y + 5 * z, 9 * z, 10 * z, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(midX, bellyY + 2 * z, (S.x - H.x) * 0.42, 5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      // Fluffy pale "pants" at the back of the thighs.
      ctx.fillStyle = k.rgba(white, 0.9);
      ctx.beginPath();
      ctx.ellipse(H.x - 9 * z, H.y + 5 * z, 5.5 * z, 7 * z, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Sable saddle along the back.
      ctx.strokeStyle = k.rgba('#5a3210', 0.22);
      ctx.lineWidth = 5 * z;
      ctx.beginPath();
      ctx.moveTo(R.x + 4 * z, R.y + 1 * z);
      ctx.bezierCurveTo(R.x + 14 * z, top + 1.5 * z, W.x - 16 * z, top + 2.5 * z, W.x - 2 * z, W.y + 2 * z);
      ctx.stroke();
      ctx.restore();
      // Near legs over the body, haunch and shoulder first.
      const knee = L(rig.legs.LH.joints.mid), elbow = L(rig.legs.LF.joints.mid);
      ctx.fillStyle = fur;
      for (const [P, J, rx, ry] of [[H, knee, 10, 10.5], [S, elbow, 7, 8.5]]) {
        ctx.save();
        ctx.translate(P.x, P.y + 1.5 * z);
        ctx.rotate(Math.atan2(J.y - P.y, J.x - P.x) - Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 3 * z, rx * z, ry * z, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      leg('LH', true);
      leg('LF', true);

      // Neck with a collar and tag, then the head.
      const h = headPose(s, rig, z);
      const neckBase = { x: S.x + 6 * z, y: S.y - 4 * z };
      ctx.fillStyle = fur;
      limb(ctx, neckBase, { x: h.x - 2 * z, y: h.y + 2 * z }, 15 * z, 12 * z);
      const cx = k.lerp(neckBase.x, h.x, 0.55), cy = k.lerp(neckBase.y, h.y, 0.55) + 1 * z;
      ctx.strokeStyle = LOOK.collar;
      ctx.lineWidth = 3 * z;
      ctx.beginPath();
      ctx.moveTo(cx - 4 * z, cy - 6 * z);
      ctx.lineTo(cx + 3 * z, cy + 6 * z);
      ctx.stroke();
      ctx.fillStyle = '#e8c45a';
      ctx.beginPath();
      ctx.arc(cx + 3.8 * z, cy + 8.6 * z, 2 * z, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.pitch);
      ctx.scale(z, z);
      // Far ear, skull, muzzle, white blaze.
      ctx.fillStyle = farFur;
      ctx.beginPath();
      ctx.moveTo(-6.5, -5);
      ctx.lineTo(-5, -21);
      ctx.lineTo(1, -7);
      ctx.closePath();
      ctx.fill();
      const skull = ctx.createRadialGradient(-2, -4, 1, 0, 0, 11);
      skull.addColorStop(0, k.shade(fur, 0.16));
      skull.addColorStop(1, fur);
      ctx.fillStyle = skull;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, -4.5);
      ctx.quadraticCurveTo(12, -3.6, 16.5, -1.2);
      ctx.quadraticCurveTo(18, 2, 16, 4.4);
      ctx.quadraticCurveTo(10, 7, 4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = white;
      ctx.beginPath();
      ctx.moveTo(6, -3.2);
      ctx.quadraticCurveTo(12, -2.4, 16.2, -0.6);
      ctx.quadraticCurveTo(17.4, 2.2, 15.6, 4.4);
      ctx.quadraticCurveTo(10, 6.8, 5, 5.8);
      ctx.quadraticCurveTo(7.5, 1, 6, -3.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-1.5, 5.6, 6, 3.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Tongue while running and panting.
      if (s.tongue > 0.05) {
        ctx.fillStyle = '#ef7d92';
        ctx.beginPath();
        ctx.ellipse(12.5, 6.8 + s.tongue * 1.6, 2.6 * s.tongue + 0.4, 3.4 * s.tongue + 0.3, 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      // Nose and mouth.
      ctx.fillStyle = '#1a1310';
      ctx.beginPath();
      ctx.ellipse(16.6, 0.4, 2.2, 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(16.2, -0.4, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 24, 12, 0.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(16, 2.2);
      ctx.quadraticCurveTo(12, 5.4, 7, 4.6);
      ctx.stroke();
      // Big upright near ear with a pale inner ear.
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.moveTo(-6, -5.5);
      ctx.lineTo(-3, -23);
      ctx.lineTo(4, -7.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2c6ae';
      ctx.beginPath();
      ctx.moveTo(-3.6, -7.6);
      ctx.lineTo(-2.6, -19.5);
      ctx.lineTo(1.8, -8.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = k.rgba(white, 0.85);
      ctx.lineWidth = 0.5;
      for (const [x0, y0] of [[-2.4, -9.5], [-1.8, -12], [-1.4, -14.5]]) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 2, y0 - 1.2);
        ctx.stroke();
      }
      // Eye: dark brown almond, with a lid and catch-light.
      const open = Math.max(0.1, 1 - s.blink);
      ctx.fillStyle = '#2a1608';
      ctx.beginPath();
      ctx.ellipse(5, -2.2, 2.1, 1.9 * open, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      if (open > 0.4) {
        ctx.beginPath();
        ctx.arc(5.6, -2.9, 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = k.rgba('#5a3210', 0.8);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(2.8, -3.4);
      ctx.quadraticCurveTo(5, -4.8, 7.4, -3);
      ctx.stroke();
      ctx.restore();

    });

    // Balls are drawn in world space, after the dog (in the mouth or at your cursor).
    if (b.mode === 'mouth') drawBall(b.x, b.y);
    if (b.mode === 'held' && !k.dropping) drawBall(m.x, m.y);
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: '#ffffff', radius: 36 * z, life: 14, width: 2 });
    k.burst({ x, y, count: 10, colors: ['#ff6b8b', '#ffd166', '#ffffff'], speed: [1.5, 4], life: [16, 30],
      size: [1.2 * z, 2.4 * z], gravity: -0.04, drag: 0.94, shape: 'dot', blend: 'source-over' });
    if (!LOOK.bubble) return;
    // "WOOF!" speech bubble that pops up above the dog's head.
    let t = 0;
    const head = mouthWorld(s, s.rig, z);
    const bx = head.x, by = head.y - 40 * z;
    k.effect(c => {
      t += 1;
      if (t > 44) return false;
      const pop = t < 6 ? 0.6 + (t / 6) * 0.5 : t < 10 ? 1.1 - ((t - 6) / 4) * 0.1 : 1;
      c.globalAlpha = t < 30 ? 1 : 1 - (t - 30) / 14;
      c.translate(bx, by - t * 0.3);
      c.scale(pop * z, pop * z);
      c.fillStyle = '#ffffff';
      c.strokeStyle = 'rgba(30, 20, 12, 0.85)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.roundRect(-24, -11, 48, 22, 11);
      c.moveTo(-6, 10.5);
      c.lineTo(-10, 18);
      c.lineTo(1, 10.5);
      c.fill();
      c.stroke();
      c.fillStyle = '#2a1a10';
      c.font = '900 13px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('WOOF!', 0, 0.5);
      return true;
    }, 'source-over');
  },

  // Two barks: a resonant noise burst over a falling saw.
  sound(v) {
    for (const d of [0, 0.19]) {
      v.noise({ dur: 0.12, gain: 0.6, filter: 'bandpass', freq: 520, to: 300, q: 2, delay: d });
      v.tone({ type: 'sawtooth', freq: 270, to: 170, dur: 0.13, gain: 0.25, delay: d });
    }
  },
};
})();
