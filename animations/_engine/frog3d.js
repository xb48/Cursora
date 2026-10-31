// ══════════════════════════════════════════════════════════════════════════════
//  Frog3D: a realistic frog seen from above, shaded to read as a 3D object.
//  Shared by the "Frog" animation and the Meadow Frog cursor pack.
//
//    const model = Frog3D.create(seed, species);   // fixed skin pattern
//    Frog3D.draw(ctx, model, pose);                 // one frame
//
//  pose: x, y (ground position), rot (radians; 0 = facing up), scale,
//        z (height 0..1+, airborne), ext (hind legs 0 folded .. 1 stretched),
//        fore (front legs -1 tucked .. 0 resting .. 1 reaching), crouch 0..1,
//        breath -1..1, blink 0..1, wave 0..1 (right hand lifted),
//        tongue: { len, angle } (local, 0 = straight ahead), shadow (bool).
//  Local units: the body is ~34 long; 1 unit = 1 px at scale 1.
// ══════════════════════════════════════════════════════════════════════════════
(() => {
const SPECIES = {
  leopard: { name: 'Leopard frog', base: '#7fa34a', light: '#c9de8f', dark: '#33491b', spot: '#38461c', halo: 'rgba(222, 232, 170, 0.55)', fold: '#d8e6a0', leg: '#76993f', band: '#3a4a1e', web: 'rgba(70, 95, 40, 0.55)', iris: ['#f0cf6a', '#a4782a'] },
  bullfrog: { name: 'Bullfrog', base: '#6d7838', light: '#b0bb6c', dark: '#30361a', spot: '#454a22', halo: null, fold: '#9aa45c', leg: '#68723a', band: '#3f4420', web: 'rgba(60, 70, 35, 0.55)', iris: ['#e8b85a', '#7d5520'] },
  tree: { name: 'Tree frog', base: '#56b843', light: '#a9ec7f', dark: '#256d22', spot: null, halo: null, fold: '#f3f8e6', leg: '#4fae3e', band: null, web: 'rgba(40, 110, 40, 0.45)', iris: ['#f06a3c', '#9e2a12'] },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Body outline (facing -y), with flank breathing. */
function bodyPath(p, breath) {
  const f = 1 + 0.035 * breath;
  p.moveTo(0, -17);
  p.bezierCurveTo(5, -17, 9, -13.2, 10.4 * f, -7);
  p.bezierCurveTo(12 * f, -1.8, 12.4 * f, 6, 10.4 * f, 11);
  p.bezierCurveTo(8.4 * f, 15.4, 3.6, 16.6, 0, 16.6);
  p.bezierCurveTo(-3.6, 16.6, -8.4 * f, 15.4, -10.4 * f, 11);
  p.bezierCurveTo(-12.4 * f, 6, -12 * f, -1.8, -10.4 * f, -7);
  p.bezierCurveTo(-9, -13.2, -5, -17, 0, -17);
  p.closePath();
}

function create(seed = 1, species = 'leopard') {
  const r = rng(seed);
  const sp = SPECIES[species] || SPECIES.leopard;
  const probe = new Path2D(); bodyPath(probe, 0);
  const test = document.createElement('canvas').getContext('2d');
  const inside = (x, y) => test.isPointInPath(probe, x, y);
  const spots = [];
  if (sp.spot) {
    for (let i = 0; i < 60 && spots.length < 11; i++) {
      const x = (r() - 0.5) * 18, y = -6 + r() * 20;
      if (!inside(x, y) || Math.abs(x) < 1.5) continue;
      spots.push({ x, y, rx: 1.4 + r() * 1.6, ry: 1 + r() * 1.2, rot: r() * Math.PI });
    }
  }
  const grains = Array.from({ length: 140 }, () => ({ x: (r() - 0.5) * 24, y: -17 + r() * 34, r: 0.18 + r() * 0.32, light: r() > 0.5 }))
    .filter(g => inside(g.x, g.y));
  return { sp, spots, grains, seed };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

/** A limb segment drawn as a shaded, round-capped tube. */
function tube(ctx, a, b, w, sp, banded) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = sp.dark; ctx.lineWidth = w + 1.1;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  const g = ctx.createLinearGradient(a[0], a[1] - w, a[0] + w * 0.4, a[1] + w);
  g.addColorStop(0, sp.light); g.addColorStop(0.45, sp.leg); g.addColorStop(1, sp.dark);
  ctx.strokeStyle = g; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  if (banded && sp.band) {
    // Crossbands, like a leopard frog's legs.
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.strokeStyle = sp.band; ctx.lineWidth = Math.max(0.6, w * 0.22); ctx.globalAlpha = 0.7;
    for (const t of [0.3, 0.62]) {
      const cx = a[0] + dx * t, cy = a[1] + dy * t;
      ctx.beginPath(); ctx.moveTo(cx - nx * w * 0.42, cy - ny * w * 0.42); ctx.lineTo(cx + nx * w * 0.42, cy + ny * w * 0.42); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Wet highlight along the top of the limb.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = w * 0.28;
  ctx.beginPath(); ctx.moveTo(a[0] - 0.3, a[1] - w * 0.2); ctx.lineTo(b[0] - 0.3, b[1] - w * 0.2); ctx.stroke();
}

const at = (p, ang, len) => [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
const deg = d => d * Math.PI / 180;

/** Webbed foot / hand: toes fanned from `base` around `dir`. */
function foot(ctx, base, dir, toes, spread, len, sp, webbed) {
  const tips = toes.map((k, i) => {
    const a = dir + (i / (toes.length - 1) - 0.5) * spread;
    return at(base, a, len * k);
  });
  if (webbed) {
    ctx.fillStyle = sp.web;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]);
    tips.forEach(t => ctx.lineTo(t[0], t[1]));
    ctx.closePath(); ctx.fill();
  }
  for (const t of tips) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = sp.dark; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
    ctx.strokeStyle = sp.leg; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
    ctx.fillStyle = sp.light;
    ctx.beginPath(); ctx.arc(t[0], t[1], 0.75, 0, Math.PI * 2); ctx.fill();
  }
}

/** One hind leg (side = 1 right, -1 left). ext 0 = folded beside the body, 1 = stretched back. */
function hindLeg(ctx, side, ext, crouch, sp) {
  const e = smooth(Math.max(0, Math.min(1, ext)));
  const hip = [8.4 * side, 9];
  // Angles for the right leg; the left one is mirrored.
  const thighA = lerp(deg(-28 - crouch * 8), deg(98), e), shinA = lerp(deg(122), deg(94), e), footA = lerp(deg(-62), deg(92), e);
  const m = a => (side > 0 ? a : Math.PI - a);
  const knee = at(hip, m(thighA), lerp(10.5, 11.5, e));
  const ankle = at(knee, m(shinA), lerp(10, 11, e));
  const heel = at(ankle, m(footA), 5.5);
  tube(ctx, hip, knee, 6.2, sp, true);
  tube(ctx, knee, ankle, 4.4, sp, true);
  tube(ctx, ankle, heel, 2.8, sp, false);
  foot(ctx, heel, m(footA), [0.62, 0.8, 1, 0.88, 0.66], deg(70 - e * 25), 6.2, sp, true);
}

/** One front leg. fore -1 tucked back, 0 resting, 1 reaching forward; lift raises it toward the viewer. */
function frontLeg(ctx, side, fore, lift, sp) {
  const sh = [7 * side, -3];
  const f = Math.max(-1, Math.min(1.3, fore));
  const upperA = f >= 0 ? lerp(deg(-58), deg(-84), f) : lerp(deg(-58), deg(52), -f);
  const lowerA = f >= 0 ? lerp(deg(-104), deg(-96), f) : lerp(deg(-104), deg(96), -f);
  const m = a => (side > 0 ? a : Math.PI - a);
  const k = 1 + lift * 0.35;               // closer to the camera when raised
  const elbow = at(sh, m(upperA - lift * 0.6), 5.4 * k);
  const wrist = at(elbow, m(lowerA - lift * 0.9), 5 * k);
  tube(ctx, sh, elbow, 3.6 * k, sp, false);
  tube(ctx, elbow, wrist, 2.7 * k, sp, false);
  foot(ctx, wrist, m(lowerA - lift * 0.9), [0.7, 1, 0.92, 0.6], deg(95), 3.4 * k, sp, false);
}

function draw(ctx, model, pose) {
  const sp = model.sp;
  const z = Math.max(0, pose.z || 0);
  const s = (pose.scale || 1) * (1 + z * 0.32);
  const crouch = pose.crouch || 0;
  const breath = pose.breath || 0;

  // Contact shadow: separates and softens as the frog leaves the ground.
  if (pose.shadow !== false) {
    ctx.save();
    ctx.translate(pose.x + z * 9 * s, pose.y + z * 13 * s);
    ctx.rotate(pose.rot || 0);
    const blur = (2.5 + z * 6) * s;
    ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.38 / (1 + z * 1.4)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(0, 3 * s, 15 * s, 19 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot || 0);
  ctx.scale(s * (1 + crouch * 0.05), s * (1 - crouch * 0.07));

  // Tongue (under the head).
  if (pose.tongue && pose.tongue.len > 0) {
    const a = -Math.PI / 2 + (pose.tongue.angle || 0), L = pose.tongue.len / s;
    const tip = [Math.cos(a) * (17 + L), Math.sin(a) * (17 + L)];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a8344d'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = '#ec7d95'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    const tg = ctx.createRadialGradient(tip[0] - 0.6, tip[1] - 0.6, 0, tip[0], tip[1], 2.4);
    tg.addColorStop(0, '#ffb6c4'); tg.addColorStop(1, '#c4405c');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tip[0], tip[1], 2.3, 0, Math.PI * 2); ctx.fill();
  }

  hindLeg(ctx, 1, pose.ext || 0, crouch, sp);
  hindLeg(ctx, -1, pose.ext || 0, crouch, sp);
  frontLeg(ctx, 1, pose.fore || 0, pose.wave || 0, sp);
  frontLeg(ctx, -1, pose.fore || 0, 0, sp);

  // Body: lit from the upper left, darker at the rim, with a wet sheen.
  const body = new Path2D(); bodyPath(body, breath);
  ctx.strokeStyle = sp.dark; ctx.lineWidth = 1.2; ctx.stroke(body);
  const g = ctx.createRadialGradient(-4, -6, 1, -1, 0, 21);
  g.addColorStop(0, sp.light); g.addColorStop(0.45, sp.base); g.addColorStop(1, sp.dark);
  ctx.fillStyle = g; ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  for (const p of model.spots) {
    if (sp.halo) { ctx.fillStyle = sp.halo; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx + 0.7, p.ry + 0.7, p.rot, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = sp.spot; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, p.rot, 0, Math.PI * 2); ctx.fill();
  }
  for (const q of model.grains) {
    ctx.fillStyle = q.light ? 'rgba(255, 255, 230, 0.16)' : 'rgba(20, 30, 10, 0.16)';
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
  }
  // Dorsolateral folds: raised ridges down each side of the back.
  for (const side of [-1, 1]) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20, 30, 10, 0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(5.4 * side + 0.4 * side, -7.4); ctx.quadraticCurveTo(7.6 * side + 0.4 * side, 2, 6.2 * side + 0.4 * side, 12.6); ctx.stroke();
    ctx.strokeStyle = sp.fold; ctx.globalAlpha = 0.75; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(5.4 * side, -7.6); ctx.quadraticCurveTo(7.6 * side, 2, 6.2 * side, 12.4); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Volume: shade the far rim, then a soft specular sheen on the back.
  ctx.strokeStyle = 'rgba(10, 20, 5, 0.32)'; ctx.lineWidth = 4; ctx.stroke(body);
  const sh = ctx.createRadialGradient(-4.2, -7.5, 0, -4.2, -7.5, 8);
  sh.addColorStop(0, 'rgba(255, 255, 255, 0.42)'); sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sh; ctx.fillRect(-14, -18, 28, 36);
  ctx.restore();

  // Tympanum (ear drum) behind each eye, and nostrils on the snout.
  for (const side of [-1, 1]) {
    ctx.fillStyle = 'rgba(80, 60, 25, 0.55)';
    ctx.beginPath(); ctx.arc(8.4 * side, -4.4, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 220, 0.35)'; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.arc(8.4 * side, -4.4, 1.9, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.fillStyle = 'rgba(20, 25, 10, 0.75)';
    ctx.beginPath(); ctx.ellipse(1.4 * side, -15.2, 0.45, 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Eyes: domes that bulge out of the head, gold irises, slit pupils, reflections.
  const blink = Math.max(0, Math.min(1, pose.blink || 0));
  for (const side of [-1, 1]) {
    const ex = 7 * side, ey = -9.4;
    const dome = ctx.createRadialGradient(ex - 1.2, ey - 1.4, 0.5, ex, ey, 4.3);
    dome.addColorStop(0, sp.light); dome.addColorStop(0.6, sp.base); dome.addColorStop(1, sp.dark);
    ctx.fillStyle = dome; ctx.beginPath(); ctx.arc(ex, ey, 4.1, 0, Math.PI * 2); ctx.fill();
    const iris = ctx.createRadialGradient(ex - 0.8, ey - 0.8, 0.2, ex, ey, 3);
    iris.addColorStop(0, sp.iris[0]); iris.addColorStop(1, sp.iris[1]);
    ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(ex, ey, 2.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0c08'; ctx.beginPath(); ctx.ellipse(ex, ey, 0.85, 2.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.beginPath(); ctx.ellipse(ex - 1.1, ey - 1.2, 0.75, 0.5, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.beginPath(); ctx.arc(ex + 1, ey + 1.2, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sp.dark; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.stroke();
    if (blink > 0) {
      // Eyelid closing over the eye.
      ctx.save(); ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = dome; ctx.fillRect(ex - 3.4, ey - 3.4, 6.8, 6.8 * blink);
      ctx.restore();
    }
  }
  ctx.restore();
}

window.Frog3D = { SPECIES, create, draw };
})();
