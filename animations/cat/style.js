// Whiskers: an orange tabby, drawn side-on with a real legged gait. It follows
// your cursor, which it sees as a laser dot: walking, trotting or galloping on
// planted feet, sitting when you rest. Wiggle the dot and it crouches and
// stalks (pupils widen, tail lashes, hips shimmy), then leaps and swats,
// leaving claw marks.
(() => {
const Q = window.OpenWhipQuadruped;
const SPEC = {
  body: 52, hipHeight: 34, shoulderHeight: 31, sitHipHeight: 9, sitShoulderHeight: 35, sitSpine: 0.62,
  hind: { upper: 17, lower: 18, foot: 12, angle: 1.12, swingAngle: 0.55, rest: 3, sitRest: 13 },
  fore: { upper: 16, lower: 17, foot: 6, angle: 1.45, swingAngle: 2.6, rest: -2 },
  gaits: {                                                      // offsets: LH, LF, RH, RF
    walk: { offsets: [0, 0.25, 0.5, 0.75], duty: 0.62, stride: 22, strideK: 3 },     // lateral-sequence walk
    trot: { offsets: [0, 0.5, 0.5, 0], duty: 0.5, stride: 26, strideK: 3.5 },        // diagonal pairs
    gallop: { offsets: [0, 0.55, 0.1, 0.65], duty: 0.34, stride: 34, strideK: 4 },   // rotary gallop
  },
  gaitSpeeds: [2.4, 5.6], lift: 6, accel: 0.06, brake: 0.12, turnSlack: 24, minPeriod: 9,
  turnDelay: 6, turnCooldown: 20,
};
const GROUND = 52;       // ground line below the dot, px at size 1
const FOLLOW = 58;       // the cat stays this far behind the dot
const MAX_SPEED = 8;
const DECAY = 0.97;      // excitement cools off when the dot calms down
const STILL_FRAMES = 12; // pause after which the dot's last direction is forgotten
const LEAP = 22;         // frames in the air
const TAIL = 12;         // tail segments
const SIT_AFTER = 160;   // idle frames before it sits down
const PRIMED_FRAMES = 60; // how long a primed pounce waits for the cat to be ready
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

/** Tapered claw slash from (ax, ay) to (bx, by), filled. */
function slash(c, ax, ay, bx, by, w) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / len * w, ny = (bx - ax) / len * w;
  c.beginPath();
  c.moveTo(ax, ay);
  c.quadraticCurveTo(mx + nx, my + ny, bx, by);
  c.quadraticCurveTo(mx - nx, my - ny, ax, ay);
  c.closePath();
}

window.PROP = {
  defaults: {
    size: 1,
    playful: 1,
    fur: '#e8954d',
    stripes: '#a85a22',
    eyes: '#a8d672',
    laser: true,
  },

  spawn(x, y, k) {
    const z = k.LOOK.size;
    const ground = y + GROUND * z;
    const rig = Q.create(SPEC, x - FOLLOW * z, ground, 1, z);
    const tail = Array.from({ length: TAIL }, (_, i) => ({ a: -2.35 + 0.07 * i, w: 0 }));
    return { rig, ground, excite: 0, primed: 0, heading: null, still: 0, idle: 0, leap: null, tail, prevVx: 0,
      blink: 0, nextBlink: k.time + k.rand(2, 5), lookY: 0 };
  },

  update(s, k) {
    const { LOOK, mouse: m } = k;
    const z = LOOK.size;
    const rig = s.rig;

    // Excitement: how sharply the dot changes direction, weighted by its speed.
    // The last direction is remembered through brief pauses, because a real
    // jiggle stops for an instant at every reversal.
    if (!k.dropping) {
      if (m.speed > 3) {
        const a = Math.atan2(m.vy, m.vx);
        if (s.heading !== null) s.excite += Math.abs(k.wrapPi(a - s.heading)) * Math.min(m.speed, 40) * 0.0024 * LOOK.playful;
        s.heading = a;
        s.still = 0;
      } else if (++s.still > STILL_FRAMES) {
        s.heading = null;
      }
    }
    s.excite = Math.min(1.2, s.excite * DECAY);
    const e = Math.min(1, s.excite);

    if (k.time > s.nextBlink) {
      s.blink = 1;
      s.nextBlink = k.time + k.rand(2.5, 6);
    }
    s.blink = Math.max(0, s.blink - 0.12);

    if (s.leap) {
      // Ballistic leap: forelegs reach for the dot, hind legs push out behind.
      const L = s.leap;
      L.t = Math.min(1, L.t + 1 / LEAP);
      rig.x = k.lerp(L.x0, L.x1, L.t);
      rig.air = Math.sin(Math.PI * L.t) * L.h;
      rig.crouch = k.lerp(rig.crouch, 0, 0.3);
      const d = rig.dir;
      const reachK = L.t < 0.75 ? 1 : 1 - (L.t - 0.75) / 0.25;    // tuck in for landing
      for (const id of Q.LEGS) {
        const leg = rig.legs[id];
        const root = leg.hind ? rig.hip : rig.shoulder;
        const far = id[0] === 'R' ? 2 * z : 0;
        const ox = leg.hind ? -d * (6 + 16 * reachK) * z : d * (4 + 14 * reachK) * z;
        const oy = (leg.hind ? 24 : 22) * z - (leg.hind ? 6 : 8) * reachK * z;
        leg.x = root.x + ox + d * far;
        leg.y = Math.min(rig.ground, root.y + oy);
      }
      Q.update(rig, { targetX: rig.x, maxSpeed: 0, ground: s.ground, faceX: rig.x + rig.dir, canMove: false });
      if (L.t >= 1) {
        s.leap = null;
        Q.land(rig);
      }
    } else {
      let targetX, faceX;
      if (k.dropping) {
        // Trot off the nearest side of the screen.
        targetX = rig.x < k.W / 2 ? -300 * z : k.W + 300 * z;
        faceX = targetX;
      } else {
        s.ground = k.lerp(s.ground, m.y + GROUND * z, 0.06);
        faceX = m.x;
        targetX = m.x - Math.sign(m.x - rig.x || 1) * FOLLOW * z;
      }
      rig.crouch = k.lerp(rig.crouch, k.dropping ? 0 : Math.min(1, e * 1.2), 0.1);
      rig.wiggle = e > 0.6 ? Math.sin(k.time * 24) * 1.4 * z * (e - 0.6) / 0.4 : 0;
      // Sit after resting a while; stand up first when it needs to move.
      // Settled = stopped with nothing ahead to walk to (it may have overshot a little).
      const settled = rig.speed < 0.1 * z && (targetX - rig.x) * rig.dir < 3 * z && e < 0.2 && !k.dropping;
      s.idle = settled ? s.idle + 1 : 0;
      rig.sit = k.clamp(rig.sit + (s.idle > SIT_AFTER ? 0.035 : -0.06), 0, 1);
      Q.update(rig, { targetX, maxSpeed: (k.dropping ? 1.5 : 1) * MAX_SPEED * z * (1 - 0.65 * rig.crouch), ground: s.ground, faceX,
        turnDelay: Math.round(6 + 18 * rig.crouch) });

      // Peak excitement primes a pounce that waits (up to ~1 s) for the cat to
      // finish turning, instead of being lost while it turns to face the dot.
      if (s.excite >= 1) s.primed = PRIMED_FRAMES;
      else if (s.primed > 0) s.primed -= 1;
      if (!k.dropping && s.primed > 0 && !rig.turning && k.fire(m.x, m.y)) {
        s.primed = 0;
        s.excite = 0;
        rig.sit = 0;
        // Leap forward only: land just short of the dot so the paws strike it.
        const x1 = rig.x + rig.dir * Math.max(0, (m.x - rig.x) * rig.dir - 14 * z);
        s.leap = { t: 0, x0: rig.x, x1, h: (24 + Math.abs(x1 - rig.x) * 0.15) * z };
        Q.takeOff(rig);
      }
    }

    // Tail: a chain of angular springs. Held up in a question mark when calm,
    // low and lashing when stalking, wrapped along the floor when sitting.
    const ax = (rig.vx - s.prevVx) * rig.dir;
    s.prevVx = rig.vx;
    const sit = rig.sit;
    const base = k.lerp(k.lerp(-2.35, -2.95, rig.crouch), 2.75, sit);
    const curl = k.lerp(k.lerp(0.075, 0.02, rig.crouch), -0.17, sit);
    const lash = (0.12 + 0.5 * e) * (1 - sit);
    for (let i = 0; i < TAIL; i++) {
      const seg = s.tail[i];
      const t = i / TAIL;
      const target = base + curl * i + Math.sin(k.time * (2.2 + 7 * e) - i * 0.45) * lash * t;
      seg.w = (seg.w + k.wrapPi(target - seg.a) * 0.12 - ax * 0.02 * t) * 0.78;
      seg.a += seg.w;
    }
    s.lookY = k.lerp(s.lookY, m.y, 0.2);
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
    const e = Math.min(1, s.excite);
    const fur = LOOK.fur;
    const farFur = k.shade(fur, -0.3);
    const cream = '#fbefdc';
    const L = p => Q.local(rig, p);

    if (LOOK.laser && !k.dropping) {
      const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 10);
      glow.addColorStop(0, 'rgba(255, 50, 50, 0.6)');
      glow.addColorStop(1, 'rgba(255, 50, 50, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft contact shadow, shrinking while airborne.
    const shadowK = 1 - Math.min(1, rig.air / (40 * z)) * 0.6;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.24 * shadowK})`;
    ctx.beginPath();
    ctx.ellipse(rig.x, rig.ground + 1.5 * z, 40 * z * shadowK * Q.turnScale(rig), 4 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    Q.frame(rig, ctx, () => {
      const H = L(rig.hip), S = L(rig.shoulder);
      const breathe = Math.sin(k.time * 1.7) * 0.5 * z;

      const leg = (id, color, near) => {
        const j = rig.legs[id].joints;
        const r = L(j.root), mj = L(j.mid), a = L(j.ankle), t = L(j.toe);
        const hind = rig.legs[id].hind;
        const shift = near ? 0 : 2.5 * z;            // far legs sit slightly forward
        for (const p of [r, mj, a, t]) p.x += shift;
        ctx.fillStyle = color;
        if (hind) {
          limb(ctx, r, mj, 11 * z, 6.5 * z);
          limb(ctx, mj, a, 5.6 * z, 3.9 * z);
          limb(ctx, a, t, 3.9 * z, 3.4 * z);
        } else {
          limb(ctx, r, mj, 9 * z, 6 * z);
          limb(ctx, mj, a, 5.6 * z, 4.3 * z);
          limb(ctx, a, t, 4.4 * z, 3.9 * z);
        }
        // Paw resting on its pads.
        ctx.beginPath();
        ctx.ellipse(t.x + 2 * z, t.y - 2.1 * z, 4.6 * z, 2.4 * z, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!near) return;
        // Tabby bands on the lower leg, and toe creases.
        ctx.strokeStyle = k.rgba(LOOK.stripes, 0.7);
        ctx.lineWidth = 1.6 * z;
        const lower = [mj, a];
        for (const f of [0.3, 0.62]) {
          const px = lower[0].x + (lower[1].x - lower[0].x) * f, py = lower[0].y + (lower[1].y - lower[0].y) * f;
          const dx = lower[1].x - lower[0].x, dy = lower[1].y - lower[0].y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len * 2.6 * z, ny = dx / len * 2.6 * z;
          ctx.beginPath();
          ctx.moveTo(px + nx, py + ny);
          ctx.lineTo(px - nx, py - ny);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(70, 34, 12, 0.45)';
        ctx.lineWidth = 0.7 * z;
        for (const dx of [1.5, 3.6]) {
          ctx.beginPath();
          ctx.moveTo(t.x + dx * z, t.y - 0.4 * z);
          ctx.lineTo(t.x + dx * z, t.y - 2.2 * z);
          ctx.stroke();
        }
      };

      // Far legs first, in shadow.
      leg('RH', farFur, false);
      leg('RF', farFur, false);

      // Tail from the base of the spine.
      const tb = { x: H.x - 10 * z, y: H.y - 3 * z };
      let px = tb.x, py = tb.y;
      const tailPts = [{ x: px, y: py }];
      for (const seg of s.tail) {
        px += Math.cos(seg.a) * 4.4 * z;
        py = Math.min(rig.ground - rig.air - 2 * z, py + Math.sin(seg.a) * 4.4 * z);
        tailPts.push({ x: px, y: py });
      }
      ctx.fillStyle = fur;
      for (let i = 0; i < tailPts.length - 1; i++) {
        const w = k.lerp(6.4, 4.2, i / TAIL) * z;
        limb(ctx, tailPts[i], tailPts[i + 1], w, w * 0.94);
      }
      ctx.fillStyle = LOOK.stripes;
      for (let i = 2; i < tailPts.length - 1; i += 2) {
        const p = tailPts[i], q = tailPts[i + 1];
        limb(ctx, p, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, k.lerp(6.4, 4.2, i / TAIL) * z, k.lerp(6.4, 4.2, i / TAIL) * z);
      }
      const tip = tailPts[tailPts.length - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();

      // Torso: back line, chest, belly, haunch. Breathes a little.
      const arch = rig.flex * 4 * z + rig.crouch * 1.5 * z;
      const top = Math.min(H.y, S.y) - 8.5 * z - arch;
      const R = { x: H.x - 9 * z, y: H.y - 6 * z };
      const W = { x: S.x + 1 * z, y: S.y - 8.5 * z };
      const chest = { x: S.x + 11 * z, y: S.y + 3 * z };
      const brisket = { x: S.x + 5 * z, y: S.y + 10.5 * z + breathe };
      const midX = (H.x + S.x) / 2;
      const bellyY = Math.max(H.y, S.y) + (9 - rig.crouch * 2) * z + breathe;
      const groin = { x: H.x + 7 * z, y: H.y + 8 * z };
      const rumpBack = { x: H.x - 12 * z, y: H.y + 2 * z };
      const torso = () => {
        ctx.beginPath();
        ctx.moveTo(R.x, R.y);
        ctx.bezierCurveTo(R.x + 12 * z, top - 1 * z, W.x - 14 * z, top + 1 * z, W.x, W.y);
        ctx.quadraticCurveTo(S.x + 12 * z, S.y - 6 * z, chest.x, chest.y);
        ctx.quadraticCurveTo(S.x + 12 * z, S.y + 9 * z, brisket.x, brisket.y);
        ctx.quadraticCurveTo(midX, bellyY + 2 * z, groin.x, groin.y);
        ctx.quadraticCurveTo(H.x - 2 * z, H.y + 13 * z, rumpBack.x, rumpBack.y);
        ctx.quadraticCurveTo(H.x - 15 * z, H.y - 4 * z, R.x, R.y);
        ctx.closePath();
      };
      const shade = ctx.createLinearGradient(0, top - 2 * z, 0, bellyY + 2 * z);
      shade.addColorStop(0, k.shade(fur, -0.12));
      shade.addColorStop(0.55, fur);
      shade.addColorStop(1, cream);
      ctx.fillStyle = shade;
      torso();
      ctx.fill();
      ctx.save();
      torso();
      ctx.clip();
      // Dorsal stripe and side stripes, thinning toward the belly.
      ctx.strokeStyle = k.rgba(LOOK.stripes, 0.55);
      ctx.lineWidth = 3.4 * z;
      ctx.beginPath();
      ctx.moveTo(R.x + 2 * z, R.y + 1 * z);
      ctx.bezierCurveTo(R.x + 12 * z, top + 1 * z, W.x - 14 * z, top + 3 * z, W.x, W.y + 1.5 * z);
      ctx.stroke();
      ctx.strokeStyle = k.rgba(LOOK.stripes, 0.75);
      for (let i = 0; i < 7; i++) {
        const f = (i + 0.5) / 7;
        const x = k.lerp(H.x - 4 * z, S.x - 4 * z, f);
        const y = k.lerp(H.y, S.y, f) - 9 * z;
        ctx.lineWidth = (3.2 - Math.abs(f - 0.5) * 2) * z;
        ctx.beginPath();
        ctx.moveTo(x, y - 2 * z);
        ctx.quadraticCurveTo(x - 3 * z, y + 6 * z, x + 1 * z, y + 13 * z);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 236, 210, 0.22)';
      ctx.lineWidth = 1.4 * z;
      ctx.beginPath();
      ctx.moveTo(R.x + 4 * z, R.y - 1 * z);
      ctx.bezierCurveTo(R.x + 12 * z, top - 0.2 * z, W.x - 14 * z, top + 1.6 * z, W.x - 2 * z, W.y - 0.5 * z);
      ctx.stroke();

      // Near legs over the body: haunch and shoulder muscles first.
      const lh = rig.legs.LH.joints, lf = rig.legs.LF.joints;
      const knee = L(lh.mid), elbow = L(lf.mid);
      ctx.fillStyle = fur;
      ctx.save();
      ctx.translate(H.x, H.y + 2 * z);
      ctx.rotate(Math.atan2(knee.y - H.y, knee.x - H.x) - Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 4 * z, 10 * z, 12.5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      leg('LH', fur, true);
      ctx.save();
      ctx.translate(S.x, S.y + 2 * z);
      ctx.rotate(Math.atan2(elbow.y - S.y, elbow.x - S.x) - Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 3 * z, 7 * z, 10 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      leg('LF', fur, true);

      // Neck and head, looking at the dot.
      const sitLift = rig.sit * 7 * z;
      const neckBase = { x: S.x + 5 * z, y: S.y - 5 * z };
      const head = { x: S.x + 17 * z, y: S.y - 14 * z + rig.crouch * 7 * z - sitLift };
      ctx.fillStyle = fur;
      limb(ctx, neckBase, head, 14 * z, 11 * z);
      const lookX = (m.x - rig.x) * rig.dir - head.x;
      const pitch = k.clamp(Math.atan2(s.lookY - head.y, Math.max(20 * z, Math.abs(lookX))), -0.45, 0.4) * 0.7;
      const open = Math.max(0.08, 1 - s.blink);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(pitch);
      ctx.scale(z, z);
      // Far ear.
      ctx.fillStyle = farFur;
      ctx.beginPath();
      ctx.moveTo(-7, -5);
      ctx.lineTo(-4.5, -16.5);
      ctx.lineTo(0.5, -7.5);
      ctx.closePath();
      ctx.fill();
      // Skull, cheek ruff, muzzle, chin.
      const skull = ctx.createRadialGradient(-2, -5, 1, 0, 0, 12);
      skull.addColorStop(0, k.shade(fur, 0.18));
      skull.addColorStop(1, fur);
      ctx.fillStyle = skull;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10.5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = k.shade(fur, 0.08);
      ctx.beginPath();
      ctx.ellipse(-3.5, 3.5, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = k.shade(fur, 0.25);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        const a = 2.2 + i * 0.28;
        ctx.beginPath();
        ctx.moveTo(-3.5 + Math.cos(a) * 6.5, 3.5 + Math.sin(a) * 5);
        ctx.lineTo(-3.5 + Math.cos(a) * 9, 3.5 + Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.fillStyle = cream;
      ctx.beginPath();
      ctx.ellipse(7.5, 3.2, 5.5, 4.2, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6.4, 6.4, 3.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nose and mouth.
      ctx.fillStyle = '#c66b70';
      ctx.beginPath();
      ctx.moveTo(11.2, 0);
      ctx.quadraticCurveTo(13.4, -0.2, 13.2, 1.6);
      ctx.quadraticCurveTo(12.4, 2.6, 11.2, 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70, 34, 12, 0.7)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(12.4, 2.4);
      ctx.lineTo(12.2, 3.8);
      ctx.quadraticCurveTo(10.6, 5.2, 8.4, 4.6);
      ctx.stroke();
      // Near ear with pink inner ear and tufts.
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.moveTo(-5.5, -6);
      ctx.lineTo(-2, -19.5);
      ctx.lineTo(4, -8.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2a3b2';
      ctx.beginPath();
      ctx.moveTo(-3.6, -7.6);
      ctx.lineTo(-1.8, -16.5);
      ctx.lineTo(2, -8.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 246, 232, 0.8)';
      ctx.lineWidth = 0.5;
      for (const [x0, y0] of [[-2.4, -9], [-1.6, -11], [-1, -13]]) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 1.8, y0 - 1.6);
        ctx.stroke();
      }
      // Forehead stripes and the dark "mascara" line from the eye.
      ctx.strokeStyle = k.rgba(LOOK.stripes, 0.85);
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(2 - i * 2.2, -8.4 + i * 0.2);
        ctx.quadraticCurveTo(-1 - i * 2.2, -6, -3 - i * 2, -3.6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(1.4, -1);
      ctx.quadraticCurveTo(-2, 0.4, -5, 0);
      ctx.stroke();
      // Eye: almond, slit pupil that widens with excitement, glints.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(1.2, -1.8);
      ctx.quadraticCurveTo(4.6, -1.8 - 2.6 * open, 7.8, -1.6);
      ctx.quadraticCurveTo(4.6, -1.8 + 2.2 * open, 1.2, -1.8);
      ctx.closePath();
      const iris = ctx.createRadialGradient(4.6, -1.8, 0.3, 4.6, -1.8, 3.6);
      iris.addColorStop(0, k.shade(LOOK.eyes, 0.4));
      iris.addColorStop(1, LOOK.eyes);
      ctx.fillStyle = iris;
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#100c08';
      ctx.beginPath();
      ctx.ellipse(5 + 0.6 * Math.sign(lookX), -1.8, k.lerp(0.7, 2.6, e), 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(6.2, -2.8, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(40, 20, 6, 0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(1, -1.8);
      ctx.quadraticCurveTo(4.6, -1.8 - 2.6 * open, 8, -1.5);
      ctx.stroke();
      // Whiskers, plus two brow whiskers.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(9.4, 2.6 + i * 0.7);
        ctx.quadraticCurveTo(15, 1 + i * 1.6, 22, -1 + i * 2.6);
        ctx.stroke();
      }
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(4.6 + i, -5.4);
        ctx.quadraticCurveTo(7 + i, -9, 10 + i * 1.5, -11);
        ctx.stroke();
      }
      ctx.restore();
    });
  },

  onFire(s, x, y, k) {
    const { LOOK } = k;
    const z = LOOK.size;
    k.ring({ x, y, color: '#ffffff', radius: 40 * z, life: 14, width: 2 });
    k.burst({ x, y, count: 14, colors: [LOOK.fur, LOOK.stripes, '#fbefdc'], speed: [1, 4], life: [20, 36],
      size: [1.2 * z, 2.6 * z], gravity: 0.08, drag: 0.94, shape: 'dot', blend: 'source-over' });
    // Three claw marks raked diagonally across the dot: drawn in fast, then fade.
    let t = 0;
    const dir = -0.75;
    const ux = Math.cos(dir), uy = Math.sin(dir);
    const len = 48 * z;
    k.effect(c => {
      t += 1;
      if (t > 46) return false;
      const grow = Math.min(1, t / 5);
      c.globalAlpha = t < 30 ? 1 : 1 - (t - 30) / 16;
      for (const o of [-1, 0, 1]) {
        const ox = -uy * o * 9 * z, oy = ux * o * 9 * z;
        const ax = x + ox - ux * len / 2, ay = y + oy - uy * len / 2;
        slash(c, ax, ay, ax + ux * len * grow, ay + uy * len * grow, 3.2 * z * grow);
        c.fillStyle = '#fbfbfb';
        c.fill();
        c.strokeStyle = 'rgba(40, 24, 12, 0.6)';
        c.lineWidth = 1.2;
        c.stroke();
      }
      return true;
    }, 'source-over');
  },

  // Meow (rise then fall), then the whoosh of the swat.
  sound(v) {
    v.tone({ type: 'triangle', freq: 480, to: 820, dur: 0.18, gain: 0.4 });
    v.tone({ type: 'triangle', freq: 820, to: 420, dur: 0.32, gain: 0.4, delay: 0.16 });
    v.tone({ type: 'sine', freq: 960, to: 1640, dur: 0.18, gain: 0.1 });
    v.noise({ dur: 0.16, gain: 0.35, filter: 'bandpass', freq: 1200, to: 3800, q: 1.1, delay: 0.42 });
  },
};
})();
