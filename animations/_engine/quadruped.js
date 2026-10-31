// ══════════════════════════════════════════════════════════════════════════════
//  Cursora quadruped rig: side-view legged locomotion for animal props.
//
//  - Feet in stance are pinned in world space while the body moves over them
//    (no foot sliding); swinging feet arc to a predicted foothold.
//  - Gaits: four-beat walk, diagonal trot, and gallop with spine flex, chosen
//    by speed with hysteresis. Stride length and cadence both scale with speed.
//  - Legs are hip→knee→hock→toe (hind) and shoulder→elbow→wrist→toe (fore):
//    a two-bone IK solve plus a foot segment, so every bone keeps its length.
//    Hind knees bend forward and hocks back; fore elbows bend back.
//
//  update() computes the full pose (rig.legs[id].joints) so it can be tested
//  without drawing. Drawing is done by each animal in "local" coordinates
//  (facing right) via rig.local() inside rig.frame().
// ══════════════════════════════════════════════════════════════════════════════
(() => {
const TAU = Math.PI * 2;
const LEGS = ['LH', 'LF', 'RH', 'RF'];             // L = near side, R = far side
const HIND = { LH: true, RH: true, LF: false, RF: false };
const NEAR = { LH: true, LF: true, RH: false, RF: false };
const GAIT_ORDER = ['walk', 'trot', 'gallop'];
const HYSTERESIS = 0.35;                            // px/frame around gait thresholds
const TURN_FRAMES = 12;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/**
 * Two-bone IK from root (ax, ay) toward end (bx, by). `bend` = +1 puts the
 * middle joint on the side the animal faces (when dir = +1). Returns the
 * joint, the end actually reached, and whether the end was within reach.
 */
function solve2(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy) || 1e-6;
  const max = l1 + l2 - 1e-4;
  const min = Math.abs(l1 - l2) + 1e-4;
  const dc = clamp(d, min, max);
  const cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
  const ang = Math.atan2(dy, dx) - bend * Math.acos(cosA);
  return {
    jx: ax + Math.cos(ang) * l1,
    jy: ay + Math.sin(ang) * l1,
    ex: ax + (dx / d) * dc,
    ey: ay + (dy / d) * dc,
    reach: d <= max + 1e-3,
  };
}

/** Shoulder height in spec units: front legs straighten and the chest rises when sitting. */
function shoulderH(rig) {
  const s = rig.spec;
  return lerp(s.shoulderHeight * (1 - 0.2 * rig.crouch), s.sitShoulderHeight, smooth(rig.sit));
}

/** Horizontal reach of a leg from its rest foothold, from its geometry. */
function legReach(rootH, ankleH, l1, l2) {
  const v = rootH - ankleH;
  // Conservative: leaves room for body bob, spine extension and crouching.
  return 0.72 * Math.sqrt(Math.max(0, (l1 + l2) * (l1 + l2) - v * v));
}

function create(spec, x, ground, dir, z) {
  const rig = {
    spec, z, x, ground, dir, vx: 0, speed: 0, phase: 0, gait: 'walk', bob: 0, flex: 0,
    sit: 0, crouch: 0, wiggle: 0, airborne: false, air: 0, turnT: 0, turning: false, flipped: false, frame: 0,
    behind: 0, lastTurn: -999,
    legs: {}, hip: null, shoulder: null,
  };
  rig.reach = {
    hind: legReach(spec.hipHeight, spec.hind.foot * Math.sin(spec.hind.angle), spec.hind.upper, spec.hind.lower),
    fore: legReach(spec.shoulderHeight, spec.fore.foot * Math.sin(spec.fore.angle), spec.fore.upper, spec.fore.lower),
  };
  for (const id of LEGS) {
    rig.legs[id] = { id, hind: HIND[id], near: NEAR[id], planted: true, x: x + restX(rig, id), y: ground,
      sx: 0, sy: 0, t: 0, dur: 1, landed: -99, swingK: 0, joints: null };
  }
  pose(rig);
  return rig;
}

/** World x offset of a leg's rest foothold from the body center. */
function restX(rig, id) {
  const s = rig.spec;
  const half = s.body / 2;
  const sitK = smooth(rig.sit);
  // Hind footholds are measured from the hip, which moves back when sitting.
  const off = HIND[id] ? hipBack(rig) + lerp(s.hind.rest, s.hind.sitRest, sitK) : half + s.fore.rest;
  return off * rig.z * rig.dir;
}

/**
 * Hip x relative to the body center, in spec units (negative = behind).
 * Standing, the spine is level; sitting, the front stays put while the spine
 * shortens and tilts up as the hips drop back onto the haunches.
 */
function hipBack(rig) {
  const s = rig.spec;
  const sitK = smooth(rig.sit);
  const len = s.body * (1 + 0.05 * rig.flex) * lerp(1, s.sitSpine, sitK);
  const hipH = lerp(s.hipHeight * (1 - 0.3 * rig.crouch), s.sitHipHeight, sitK);
  const dy = shoulderH(rig) - hipH;
  const across = Math.sqrt(Math.max(len * len - dy * dy, (len * 0.3) * (len * 0.3)));
  return s.body / 2 * (1 + 0.05 * rig.flex) - across;
}

function gaitFor(rig, speed) {
  const [t1, t2] = rig.spec.gaitSpeeds.map(v => v * rig.z);
  const i = GAIT_ORDER.indexOf(rig.gait);
  if (i === 0 && speed > t1 + HYSTERESIS) return 'trot';
  if (i === 1 && speed > t2 + HYSTERESIS) return 'gallop';
  if (i === 1 && speed < t1 - HYSTERESIS) return 'walk';
  if (i === 2 && speed < t2 - HYSTERESIS) return 'trot';
  return rig.gait;
}

/**
 * Lift a foot. 'phase' swings follow the gait clock exactly (so the gait's
 * footfall pattern holds at any speed); 'timed' swings (forced or settling
 * steps) run on their own frame budget.
 */
function lift(rig, leg, mode, frames) {
  leg.planted = false;
  leg.sx = leg.x;
  leg.sy = leg.y;
  // Lift-off counts from the start of this frame, so the paw also travels with
  // the body movement this frame has already made.
  leg.bx = rig.x - rig.vx;
  leg.gy = rig.ground; // ground height at lift-off
  leg.t = 0;
  leg.mode = mode;
  leg.rate = 1 / Math.max(4, frames || 10);
}

/**
 * One frame of locomotion.
 * ctl: { targetX, maxSpeed, ground, faceX (where to look/face), canMove }
 */
function update(rig, ctl) {
  const s = rig.spec;
  const z = rig.z;
  rig.frame += 1;
  rig.ground = ctl.ground;

  // Turn around (squash through edge-on) only once the target has stayed
  // well behind for a moment, and not again right after a turn: a darting
  // target is followed with the eyes and head before the whole body commits.
  const behind = (ctl.faceX - rig.x) * rig.dir < -s.turnSlack * z;
  rig.behind = behind ? rig.behind + 1 : 0;
  const delay = ctl.turnDelay === undefined ? s.turnDelay : ctl.turnDelay;
  if (!rig.turning && !rig.airborne && rig.behind >= delay && rig.frame - rig.lastTurn > s.turnCooldown && rig.sit < 0.05) {
    rig.turning = true;
    rig.turnT = 0;
    rig.lastTurn = rig.frame;
  }
  if (rig.turning) {
    rig.vx *= 0.8;
    rig.turnT += 1 / TURN_FRAMES;
    if (rig.turnT >= 0.5 && !rig.flipped) {
      rig.dir = -rig.dir;
      rig.flipped = true;
      for (const id of LEGS) {      // mirrored stance: re-plant under the body
        const leg = rig.legs[id];
        leg.planted = true;
        leg.x = rig.x + restX(rig, id);
        leg.y = rig.ground;
        leg.landed = rig.frame;
      }
    }
    if (rig.turnT >= 1) {
      rig.turning = false;
      rig.flipped = false;
      rig.turnT = 0;
    }
  }

  if (!rig.airborne) {
    // Arrive at the target, only ever walking forward.
    let want = 0;
    if (!rig.turning && ctl.canMove !== false && rig.sit < 0.3) {
      const ahead = (ctl.targetX - rig.x) * rig.dir;
      if (ahead > 1.5 * z) want = rig.dir * Math.min(ctl.maxSpeed, ahead * 0.07);
    }
    rig.vx = lerp(rig.vx, want, Math.abs(want) > Math.abs(rig.vx) ? s.accel : s.brake);
    if (Math.abs(rig.vx) < 0.02 * z) rig.vx = 0;
    rig.x += rig.vx;
  }
  rig.speed = Math.abs(rig.vx);
  const nextGait = gaitFor(rig, rig.speed);
  const changed = nextGait !== rig.gait;
  rig.gait = nextGait;
  const gait = s.gaits[rig.gait];
  const moving = rig.speed > 0.2 * z && !rig.airborne;

  // Cadence: stride length grows with speed; period = stride / speed. A planted
  // foot travels duty × stride under the body, half of it on each side of its
  // rest foothold, so stride is capped at what the legs can reach in stance.
  const maxStride = (1.7 * Math.min(rig.reach.hind, rig.reach.fore) * z) / gait.duty;
  const stride = Math.min(maxStride, (gait.stride + gait.strideK * rig.speed / z) * z);
  const period = moving ? clamp(stride / rig.speed, s.minPeriod, 90) : 90;
  if (moving) rig.phase = (rig.phase + 1 / period) % 1;

  if (!rig.airborne) {
    const swinging = LEGS.filter(id => !rig.legs[id].planted).length;
    const swingFrames = (1 - gait.duty) * period;
    LEGS.forEach((id, i) => {
      const leg = rig.legs[id];
      const rest = rig.x + restX(rig, id);
      const reach = (leg.hind ? rig.reach.hind : rig.reach.fore) * z;
      const local = (rig.phase + gait.offsets[i]) % 1;
      const inWindow = local >= gait.duty;
      if (!inWindow) leg.skip = false;
      if (leg.planted) {
        leg.y = rig.ground;
        const off = leg.x - rest;
        const due = moving && inWindow && !leg.skip && rig.frame - leg.landed > 2;
        // Too far from its rest foothold (now or after next frame's body move),
        // or the leg actually ran out of reach last frame: step now.
        const over = Math.abs(off) > reach || Math.abs(off - rig.vx) > reach || (leg.joints && !leg.joints.reach);
        const settle = !moving && Math.abs(off) > 2.5 * z && swinging === 0 && rig.frame - leg.landed > 6;
        if (due) lift(rig, leg, 'phase');
        else if (over) lift(rig, leg, 'timed', Math.min(14, swingFrames));
        else if (settle) lift(rig, leg, 'timed', 10);
      }
      // A foot lifted this frame starts its swing this frame too, so it never
      // lags a frame behind a body that has already moved on.
      if (!leg.planted) {
        // A gait change or a stop re-times phase swings so feet never snap.
        if (leg.mode === 'phase' && (changed || !moving)) {
          leg.mode = 'timed';
          leg.rate = (1 - leg.t) / Math.max(4, moving ? (1 - leg.t) * swingFrames : 8);
        }
        if (leg.mode === 'phase') {
          // Follow the gait clock; land when this foot's swing window closes.
          leg.t = inWindow ? Math.max(leg.t, Math.min(1, (local - gait.duty) / (1 - gait.duty))) : 1;
        } else {
          leg.t = Math.min(1, leg.t + leg.rate);
        }
        // Foothold predicted from the current velocity: ahead of the rest
        // position by half a stance, so the foot passes under the hip mid-stance.
        // Clamped to what the leg can reach.
        const remaining = leg.mode === 'phase' ? (1 - leg.t) * swingFrames : (1 - leg.t) / leg.rate;
        const stanceFrames = gait.duty * period;
        const target = rest + clamp(rig.vx * (remaining + stanceFrames / 2), -reach * 0.95, reach * 0.95);
        const e = smooth(leg.t);
        const liftH = s.lift * z * (moving ? clamp(0.55 + rig.speed / (4 * z), 0.55, 1.25) : 0.45);
        // The paw is carried along with the body from lift-off and blends into
        // the foothold, so a fast body never leaves a swinging foot behind.
        leg.x = lerp(leg.sx + (rig.x - leg.bx), target, e);
        // Height is relative to the current ground, which follows the cursor.
        leg.y = rig.ground + (leg.sy - leg.gy) * (1 - e) - liftH * Math.sin(Math.PI * leg.t);
        leg.swingK = Math.sin(Math.PI * leg.t);
        if (leg.t >= 1) {
          leg.planted = true;
          leg.x = target;
          leg.y = rig.ground;
          leg.landed = rig.frame;
          leg.swingK = 0;
          leg.skip = inWindow;   // a step that lands inside its window waits for the next cycle
        }
      }
    });
  }
  pose(rig);
}

/** Put the rig in the air (feet free); the animal poses leg.x/leg.y itself. */
function takeOff(rig) {
  rig.airborne = true;
  for (const id of LEGS) rig.legs[id].planted = false;
}

/** Land: all feet planted under the body. */
function land(rig) {
  rig.airborne = false;
  rig.air = 0;
  for (const id of LEGS) {
    const leg = rig.legs[id];
    leg.planted = true;
    leg.x = rig.x + restX(rig, id);
    leg.y = rig.ground;
    leg.landed = rig.frame;
    leg.swingK = 0;
  }
}

/** Solve every joint for the current body and foot positions. */
function pose(rig) {
  const s = rig.spec;
  const z = rig.z;
  const d = rig.dir;
  const sitK = smooth(rig.sit);
  const moveK = clamp(rig.speed / (3 * z), 0, 1);
  const g = rig.gait;
  // Vertical bob: twice per stride when walking/trotting, a big rock in gallop.
  const beat = g === 'gallop' ? Math.sin(rig.phase * TAU) : Math.cos(rig.phase * TAU * 2);
  rig.bob = (g === 'gallop' ? 2.1 : g === 'trot' ? 1.4 : 0.9) * z * moveK * beat;
  rig.flex = g === 'gallop' ? moveK * Math.sin(rig.phase * TAU) : 0;
  const crouch = rig.crouch;
  const hipH = lerp(s.hipHeight * (1 - 0.3 * crouch), s.sitHipHeight, sitK) * z;
  const shH = shoulderH(rig) * z;
  const half = (s.body / 2) * (1 + 0.05 * rig.flex) * z;
  const base = rig.ground - rig.air;
  const wig = rig.wiggle;
  rig.hip = { x: rig.x + d * hipBack(rig) * z, y: base - hipH + rig.bob * (g === 'gallop' ? -1 : 1) + wig };
  rig.shoulder = { x: rig.x + d * half, y: base - shH + rig.bob * 0.6 };

  for (const id of LEGS) {
    const leg = rig.legs[id];
    const L = leg.hind ? s.hind : s.fore;
    const root = leg.hind ? rig.hip : rig.shoulder;
    const foot = L.foot * z;
    let a;
    if (leg.hind) {
      // Metatarsal: steep in stance, trailing in swing, flat on the ground when sitting.
      a = lerp(L.angle, L.swingAngle, leg.swingK);
      a = lerp(a, 0.1, sitK);
    } else {
      // Metacarpal: near vertical in stance; the paw flicks back in swing.
      a = lerp(L.angle, L.swingAngle, leg.swingK);
    }
    const ax = leg.x - d * Math.cos(a) * foot;
    const ay = leg.y - Math.sin(a) * foot;
    const ik = solve2(root.x, root.y, ax, ay, L.upper * z, L.lower * z, leg.hind ? d : -d);
    // If the ankle was out of reach, keep the foot attached to the reached
    // ankle, pivoting the paw so it never dips below the ground.
    let tx = leg.x, ty = leg.y;
    if (!ik.reach) {
      const floor = rig.ground - rig.air;
      const down = clamp((floor - ik.ey) / foot, -1, 1);
      const pa = Math.min(a, Math.asin(down));
      tx = ik.ex + d * Math.cos(pa) * foot;
      ty = ik.ey + Math.sin(pa) * foot;
    }
    leg.joints = {
      root: { x: root.x, y: root.y },
      mid: { x: ik.jx, y: ik.jy },
      ankle: { x: ik.ex, y: ik.ey },
      toe: { x: tx, y: ty },
      reach: ik.reach,
    };
  }
}

/** World point → local (facing right, origin at the body center x). */
function local(rig, p) {
  return { x: (p.x - rig.x) * rig.dir, y: p.y };
}

/** Squash factor through a turn (1 → 0 → 1). */
function turnScale(rig) {
  return rig.turning ? Math.max(0.06, Math.abs(Math.cos(Math.PI * rig.turnT))) : 1;
}

/** Run draw(ctx) in local coordinates: x mirrored by facing, squashed while turning. */
function frame(rig, ctx, draw) {
  ctx.save();
  ctx.translate(rig.x, 0);
  ctx.scale(rig.dir * turnScale(rig), 1);
  draw();
  ctx.restore();
}

window.OpenWhipQuadruped = { LEGS, create, update, takeOff, land, local, frame, turnScale, solve2 };
})();
