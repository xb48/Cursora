// Crosshair designer: one model, drawn pixel-exact by the gallery, the editor
// and the on-screen overlay alike (main.js loads it too, to size the overlay).
//
// Geometry is in screen pixels around a centre pixel that spans [0, 1) on both
// axes, so odd thicknesses are perfectly symmetric and nothing is blurred.
// render() scales by an integer zoom for previews, and takes a time (ms) for
// animated designs.
(() => {
const DEFAULT = {
  color: '#00ff88', color2: '#ffffff', colorMode: 'solid', opacity: 1, rotation: 0, scale: 1, tstyle: false,
  anim: { type: 'none', speed: 5 },
  outline: { on: true, thickness: 1, color: '#000000', opacity: 0.85 },
  glow: { on: false, strength: 6, custom: false, color: '#ffffff' },
  shadow: { on: false, x: 1, y: 1, blur: 0, opacity: 0.6, color: '#000000' },
  dot: { on: false, size: 2, shape: 'square', opacity: 1 },
  inner: { on: true, length: 6, thickness: 2, gap: 3, opacity: 1, arms: 'four', cap: 'square' },
  outer: { on: false, length: 4, thickness: 2, gap: 14, opacity: 0.6, arms: 'four', cap: 'square' },
  circle: { on: false, radius: 12, thickness: 1, style: 'solid', opacity: 1, segments: 0 },
  chevron: { on: false, size: 6, thickness: 2, gap: 6, opacity: 1, style: 'line', place: 'below', count: 1 },
};
// Allowed ranges; every number is clamped (and rounded unless it is a fraction).
const RANGES = {
  opacity: [0.05, 1], rotation: [0, 359], scale: [1, 4],
  'anim.speed': [1, 10],
  'outline.thickness': [1, 4], 'outline.opacity': [0, 1],
  'glow.strength': [1, 20],
  'shadow.x': [-8, 8], 'shadow.y': [-8, 8], 'shadow.blur': [0, 10], 'shadow.opacity': [0.05, 1],
  'dot.size': [1, 12], 'dot.opacity': [0.05, 1],
  'inner.length': [0, 40], 'inner.thickness': [1, 10], 'inner.gap': [0, 40], 'inner.opacity': [0.05, 1],
  'outer.length': [0, 40], 'outer.thickness': [1, 10], 'outer.gap': [0, 60], 'outer.opacity': [0.05, 1],
  'circle.radius': [2, 60], 'circle.thickness': [1, 6], 'circle.opacity': [0.05, 1], 'circle.segments': [0, 48],
  'chevron.size': [2, 30], 'chevron.thickness': [1, 8], 'chevron.gap': [0, 40], 'chevron.opacity': [0.05, 1], 'chevron.count': [1, 3],
};
const FLOATS = new Set(['opacity', 'outline.opacity', 'shadow.opacity', 'dot.opacity', 'inner.opacity', 'outer.opacity', 'circle.opacity', 'chevron.opacity']);
const DOT_SHAPES = ['square', 'round', 'diamond', 'ring', 'triangle', 'cross'];
const CIRCLE_STYLES = ['solid', 'dashed', 'dots', 'brackets', 'square', 'diamond', 'triangle', 'hexagon', 'double'];
const ARMS = ['four', 'h', 'v', 'three', 'six', 'eight'];
const CAPS = ['square', 'round', 'taper'];
const ENUMS = {
  colorMode: ['solid', 'twotone', 'gradient', 'spectrum'],
  'anim.type': ['none', 'pulse', 'breathe', 'spin', 'rainbow'],
  'dot.shape': DOT_SHAPES,
  'inner.arms': ARMS, 'outer.arms': ARMS,
  'inner.cap': CAPS, 'outer.cap': CAPS,
  'circle.style': CIRCLE_STYLES,
  'chevron.style': ['line', 'filled'],
  'chevron.place': ['below', 'above', 'both', 'four'],
};
// Arm directions in degrees, screen coordinates (0 = right, 90 = down).
const ARM_ANGLES = {
  four: [0, 180, 90, 270], h: [0, 180], v: [90, 270], three: [270, 30, 150],
  six: [0, 60, 120, 180, 240, 300], eight: [0, 45, 90, 135, 180, 225, 270, 315],
};
const HEX = /^#[0-9a-f]{6}$/i;

/** A complete, valid design from any input (unknown keys dropped, values clamped). */
function normalize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const fix = (key, v, def) => {
    if (typeof def === 'boolean') return v === undefined ? def : !!v;
    if (ENUMS[key]) return ENUMS[key].includes(v) ? v : def;
    if (typeof def === 'string') return HEX.test(v || '') ? v.toLowerCase() : def;
    const [lo, hi] = RANGES[key];
    let n = Number(v);
    if (v === null || v === '' || !Number.isFinite(n)) n = def;
    n = Math.min(hi, Math.max(lo, n));
    return FLOATS.has(key) ? Math.round(n * 100) / 100 : Math.round(n);
  };
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT)) {
    if (def && typeof def === 'object') {
      const p = src[k] && typeof src[k] === 'object' ? src[k] : {};
      out[k] = {};
      for (const [kk, dd] of Object.entries(def)) out[k][kk] = fix(`${k}.${kk}`, p[kk], dd);
    } else out[k] = fix(k, src[k], def);
  }
  return out;
}

const isAnimated = input => normalize(input).anim.type !== 'none';

// ── Colour helpers ──────────────────────────────────────────────────────────
const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function hueOf(hex) {
  const [r, g, b] = rgbOf(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (!c) return 0;
  const h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return (h * 60 + 360) % 360;
}
/** The colour with its hue turned by deg (lightness and saturation kept). */
function shiftHue(hex, deg) {
  const [r, g, b] = rgbOf(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
  if (!c) return hex; // greys have no hue
  const h = ((hueOf(hex) + deg) % 360 + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r1, g1, b1].map(v => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('');
}

// ── Animation ───────────────────────────────────────────────────────────────
const BREATHE = 3; // px the gaps open by at the widest point of a breath
/** The design at time t (ms), plus the extra rotation and opacity it carries. */
function animate(d, t) {
  const fx = { rot: 0, alpha: 1 };
  const type = d.anim.type;
  if (type === 'none' || !t) return { d, fx };
  const sec = t / 1000, sp = d.anim.speed;
  const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * sp * 0.2 * sec); // 0 → 1 → 0, 1–2 times a second
  const a = JSON.parse(JSON.stringify(d));
  if (type === 'pulse') fx.alpha = 1 - 0.65 * wave;
  else if (type === 'breathe') {
    const k = Math.round(BREATHE * wave);
    a.inner.gap += k; a.outer.gap += k; a.circle.radius += k; a.chevron.gap += k;
  } else if (type === 'spin') fx.rot = (sec * sp * 36) % 360;
  else if (type === 'rainbow') {
    const deg = (sec * sp * 36) % 360;
    a.color = shiftHue(a.color, deg); a.color2 = shiftHue(a.color2, deg);
    if (a.glow.custom) a.glow.color = shiftHue(a.glow.color, deg);
  }
  return { d: a, fx };
}

// ── Geometry ────────────────────────────────────────────────────────────────
const half = t => Math.floor((t - 1) / 2);
const POLY = { triangle: [3, -Math.PI / 2], diamond: [4, -Math.PI / 2], hexagon: [6, 0] };
// Spacing between stacked chevrons: line ones by their thickness, filled ones by their size.
const chevronStep = c => (c.style === 'filled' ? Math.ceil(c.size * 0.6) + 2 : c.thickness + 2);

/**
 * Furthest point from the centre the shapes reach, in design pixels, with
 * every shape widened by g (its outline): miter corners and tapered tips included.
 */
function reach(d, g = 0) {
  let r = 1.5;
  if (d.dot.on) {
    const z = d.dot.size, s = d.dot.shape;
    const dr = s === 'square' || s === 'cross' ? (z / 2 + 1 + g) * Math.SQRT2
      : s === 'diamond' ? z / 2 + 0.5 + g * Math.SQRT2
        : s === 'triangle' ? z / 2 + 0.5 + g * 2
          : z / 2 + 0.5 + g;
    r = Math.max(r, dr + 1);
  }
  for (const p of [d.inner, d.outer]) {
    if (!p.on || p.length <= 0) continue;
    const tip = p.cap === 'taper' ? g * 3 : g; // a widened taper tip moves out by up to 3g
    r = Math.max(r, Math.hypot(p.gap + p.length + 1 + tip, p.thickness / 2 + 1 + g));
  }
  if (d.circle.on) {
    const { radius, thickness: t, style } = d.circle;
    const path = radius + t / 2, hw = t / 2 + g; // traced radius and half the stroke
    let cr;
    if (POLY[style]) cr = (path + hw) / Math.cos(Math.PI / POLY[style][0]); // vertices + miter
    else if (style === 'square') cr = (path + hw) * Math.SQRT2;
    else if (style === 'double') cr = path + t + Math.max(2, t) + hw;
    else cr = path + hw;
    r = Math.max(r, cr + 1);
  }
  if (d.chevron.on) {
    const c = d.chevron;
    const top = 1 + c.gap + c.thickness / 2 + (c.count - 1) * chevronStep(c);
    // Square caps (line) or the outline's miter corners (filled) push past the end points.
    const out = c.style === 'filled' ? g * 2.7 : (c.thickness / 2 + g) * Math.SQRT2;
    r = Math.max(r, Math.hypot(top + c.size + out, c.size + out) + 1);
  }
  return r;
}

/** Furthest device pixel from the centre the design reaches at zoom 1 (sizes the overlay). */
function extent(input) {
  const d = normalize(input);
  // Breathing opens every gap by up to BREATHE px; measure the design fully open.
  const open = JSON.parse(JSON.stringify(d));
  if (d.anim.type === 'breathe') { open.inner.gap += BREATHE; open.outer.gap += BREATHE; open.circle.radius += BREATHE; open.chevron.gap += BREATHE; }
  const r = reach(open, d.outline.on ? d.outline.thickness : 0);
  let fxr = d.glow.on ? d.glow.strength * 1.5 : 0;
  if (d.shadow.on) fxr = Math.max(fxr, Math.hypot(d.shadow.x, d.shadow.y) + d.shadow.blur * 2);
  return Math.ceil((r + fxr) * d.scale + 2);
}

/** Every shape of a design, around the centre pixel. tone 'a' = main colour, 'b' = second. */
function shapesOf(d) {
  const shapes = [];
  const arms = (p, tone) => {
    const { length: L, thickness: t, gap: g, opacity: a, cap } = p;
    if (L <= 0) return;
    const o = -half(t);
    for (const ang of ARM_ANGLES[p.arms]) {
      if (ang === 270 && d.tstyle) continue;
      const base = { kind: 'arm', cap, a, tone };
      if (ang === 0) shapes.push({ ...base, x: 1 + g, y: o, w: L, h: t, dir: 'r' });
      else if (ang === 180) shapes.push({ ...base, x: -g - L, y: o, w: L, h: t, dir: 'l' });
      else if (ang === 90) shapes.push({ ...base, x: o, y: 1 + g, w: t, h: L, dir: 'd' });
      else if (ang === 270) shapes.push({ ...base, x: o, y: -g - L, w: t, h: L, dir: 'u' });
      else shapes.push({ ...base, x: 1 + g, y: 0.5 - t / 2, w: L, h: t, dir: 'r', rot: (ang * Math.PI) / 180 });
    }
  };
  if (d.inner.on) arms(d.inner, 'a');
  if (d.outer.on) arms(d.outer, 'b');
  if (d.circle.on) shapes.push({ kind: 'circle', r: d.circle.radius, t: d.circle.thickness, style: d.circle.style, seg: d.circle.segments, a: d.circle.opacity, tone: 'b' });
  if (d.chevron.on) shapes.push({ kind: 'chevron', ...d.chevron, t: d.chevron.thickness, g: d.chevron.gap, a: d.chevron.opacity, tone: 'b' });
  if (d.dot.on) shapes.push({ kind: 'dot', shape: d.dot.shape, size: d.dot.size, a: d.dot.opacity, tone: 'a' });
  return shapes;
}

// Path builders. `grow` widens a shape by that many pixels (its outline).
function traceArm(ctx, sh, g) {
  if (sh.rot) { ctx.save(); ctx.translate(0.5, 0.5); ctx.rotate(sh.rot); ctx.translate(-0.5, -0.5); }
  const { x, y, w, h } = sh;
  if (sh.cap === 'round') ctx.roundRect(x - g, y - g, w + g * 2, h + g * 2, Math.min(w, h) / 2 + g);
  else if (sh.cap === 'taper') {
    const along = sh.dir === 'r' || sh.dir === 'l' ? w : h, across = sh.dir === 'r' || sh.dir === 'l' ? h : w;
    // A tip widened by g moves out by g / sin(half-angle); kept to 3g on needle-thin tips.
    const m = g ? Math.min(g * 3, g / Math.sin(Math.atan2(across / 2, along))) : 0;
    if (sh.dir === 'r') { ctx.moveTo(x - g, y - g); ctx.lineTo(x + w + m, y + h / 2); ctx.lineTo(x - g, y + h + g); }
    else if (sh.dir === 'l') { ctx.moveTo(x + w + g, y - g); ctx.lineTo(x - m, y + h / 2); ctx.lineTo(x + w + g, y + h + g); }
    else if (sh.dir === 'd') { ctx.moveTo(x - g, y - g); ctx.lineTo(x + w / 2, y + h + m); ctx.lineTo(x + w + g, y - g); }
    else { ctx.moveTo(x - g, y + h + g); ctx.lineTo(x + w / 2, y - m); ctx.lineTo(x + w + g, y + h + g); }
    ctx.closePath();
  } else ctx.rect(x - g, y - g, w + g * 2, h + g * 2);
  if (sh.rot) ctx.restore();
}
function traceDot(ctx, sh, g) {
  const z = sh.size;
  if (sh.shape === 'square') ctx.rect(-half(z) - g, -half(z) - g, z + g * 2, z + g * 2);
  else if (sh.shape === 'round') ctx.arc(0.5, 0.5, z / 2 + g, 0, Math.PI * 2);
  else if (sh.shape === 'diamond') {
    const r = z / 2 + 0.5 + g * Math.SQRT2;
    ctx.moveTo(0.5, 0.5 - r); ctx.lineTo(0.5 + r, 0.5); ctx.lineTo(0.5, 0.5 + r); ctx.lineTo(0.5 - r, 0.5); ctx.closePath();
  } else if (sh.shape === 'triangle') {
    // Equilateral, pointing up; widening the edges by g moves each corner out by 2g.
    const R = z / 2 + 0.5 + g * 2;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      ctx[i ? 'lineTo' : 'moveTo'](0.5 + Math.cos(a) * R, 0.5 + Math.sin(a) * R);
    }
    ctx.closePath();
  } else if (sh.shape === 'cross') {
    const b = Math.max(1, Math.round(z / 3));
    ctx.rect(-half(z) - g, -half(b) - g, z + g * 2, b + g * 2);
    ctx.rect(-half(b) - g, -half(z) - g, b + g * 2, z + g * 2);
  } else { // ring
    const b = Math.max(1, Math.round(z / 4));
    ctx.arc(0.5, 0.5, z / 2 + 0.5 + g, 0, Math.PI * 2);
    const inner = z / 2 + 0.5 - b - g;
    if (inner > 0) { ctx.moveTo(0.5 + inner, 0.5); ctx.arc(0.5, 0.5, inner, 0, Math.PI * 2, true); }
  }
}
/** Chevron corner points (apex in the middle), one triple per chevron. */
function chevronPoints(sh) {
  const rots = { below: [0], above: [Math.PI], both: [0, Math.PI], four: [0, Math.PI / 2, Math.PI, Math.PI * 1.5] }[sh.place];
  const out = [];
  for (const rot of rots) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const turn = (x, y) => [0.5 + (x - 0.5) * c - (y - 0.5) * s, 0.5 + (x - 0.5) * s + (y - 0.5) * c];
    for (let i = 0; i < sh.count; i++) {
      const top = 1 + sh.g + sh.t / 2 + i * chevronStep(sh);
      out.push([turn(0.5 - sh.size, top + sh.size), turn(0.5, top), turn(0.5 + sh.size, top + sh.size)]);
    }
  }
  return out;
}
function traceStroke(ctx, sh) {
  if (sh.kind === 'chevron') {
    for (const [p0, p1, p2] of chevronPoints(sh)) {
      ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2);
      if (sh.style === 'filled') ctx.closePath();
    }
    return;
  }
  const r = sh.r + sh.t / 2;
  const style = sh.style;
  if (style === 'square') ctx.rect(0.5 - r, 0.5 - r, r * 2, r * 2);
  else if (POLY[style]) {
    const [n, a0] = POLY[style];
    const R = r / Math.cos(Math.PI / n); // edges stay `radius` away from the centre
    for (let i = 0; i < n; i++) { const a = a0 + (i * 2 * Math.PI) / n; ctx[i ? 'lineTo' : 'moveTo'](0.5 + Math.cos(a) * R, 0.5 + Math.sin(a) * R); }
    ctx.closePath();
  } else if (style === 'brackets') {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.moveTo(0.5 + Math.cos(a - 0.42) * r, 0.5 + Math.sin(a - 0.42) * r); ctx.arc(0.5, 0.5, r, a - 0.42, a + 0.42); }
  } else if (style === 'dashed') {
    const n = sh.seg || Math.max(8, Math.round(r * 0.9));
    for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI / n) * 1.1; ctx.moveTo(0.5 + Math.cos(a0) * r, 0.5 + Math.sin(a0) * r); ctx.arc(0.5, 0.5, r, a0, a1); }
  } else if (style === 'dots') {
    const n = sh.seg || Math.max(6, Math.round(r * 0.6));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2, x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r;
      ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + Math.PI / 2) * 0.01, y + Math.sin(a + Math.PI / 2) * 0.01);
    }
  } else if (style === 'double') {
    ctx.moveTo(0.5 + r, 0.5); ctx.arc(0.5, 0.5, r, 0, Math.PI * 2);
    const r2 = r + sh.t + Math.max(2, sh.t);
    ctx.moveTo(0.5 + r2, 0.5); ctx.arc(0.5, 0.5, r2, 0, Math.PI * 2);
  } else ctx.arc(0.5, 0.5, r, 0, Math.PI * 2);
}
const isStroke = sh => sh.kind === 'circle' || sh.kind === 'chevron';

/** Draws one shape widened by `grow` in `style` (outline/shadow passes use grow > 0). */
function paintShape(ctx, sh, grow, style) {
  ctx.beginPath();
  if (!isStroke(sh)) {
    ctx.fillStyle = style;
    if (sh.kind === 'arm') traceArm(ctx, sh, grow); else traceDot(ctx, sh, grow);
    ctx.fill('nonzero');
    return;
  }
  traceStroke(ctx, sh);
  const filled = sh.kind === 'chevron' && sh.style === 'filled';
  if (filled) { ctx.fillStyle = style; ctx.fill(); if (!grow) return; }
  ctx.strokeStyle = style;
  ctx.lineWidth = filled ? grow * 2 : sh.t + grow * 2;
  ctx.lineCap = sh.kind === 'circle' && sh.style === 'dots' ? 'round' : sh.kind === 'chevron' ? 'square' : 'butt';
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

let shadowLayer = null;
/**
 * Draws the design with its centre pixel's top-left corner at (cx, cy), at an
 * integer zoom s (1 = real size) and time t in ms (0 = the design at rest).
 * Use integer cx, cy for pixel-exact output.
 */
function render(ctx, input, cx, cy, s = 1, t = 0) {
  const { d, fx } = animate(normalize(input), t);
  const shapes = shapesOf(d);
  const ot = d.outline.on ? d.outline.thickness : 0;
  const rot = ((d.rotation + fx.rot) % 360) * Math.PI / 180;
  const alpha = d.opacity * fx.alpha;
  const place = c => {
    c.translate(cx, cy);
    c.scale(s * d.scale, s * d.scale);
    if (rot) { c.translate(0.5, 0.5); c.rotate(rot); c.translate(-0.5, -0.5); }
  };

  ctx.save();
  // Drop shadow: every shape's silhouette (outline included) on its own layer,
  // offset in screen space, then blended once so overlaps never double up.
  if (d.shadow.on) {
    const { width: W, height: H } = ctx.canvas;
    if (!shadowLayer || shadowLayer.width !== W || shadowLayer.height !== H) shadowLayer = new OffscreenCanvas(W, H);
    const lc = shadowLayer.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, W, H);
    lc.setTransform(ctx.getTransform());
    lc.translate(d.shadow.x * s * d.scale, d.shadow.y * s * d.scale);
    place(lc);
    for (const sh of shapes) paintShape(lc, sh, ot, d.shadow.color);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha * d.shadow.opacity;
    if (d.shadow.blur) ctx.filter = `blur(${d.shadow.blur * s * d.scale * 0.5}px)`;
    ctx.drawImage(shadowLayer, 0, 0);
    ctx.restore();
    ctx.save();
  }
  place(ctx);
  // Outlines first (all of them), so no outline ever cuts across a line.
  if (ot) {
    for (const sh of shapes) {
      ctx.globalAlpha = alpha * sh.a * d.outline.opacity;
      paintShape(ctx, sh, ot, d.outline.color);
    }
  }
  // Fill styles for the colour mode.
  let shared = null;
  if (d.colorMode === 'gradient') {
    shared = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, Math.max(4, reach(d)));
    shared.addColorStop(0, d.color); shared.addColorStop(1, d.color2);
  } else if (d.colorMode === 'spectrum') {
    shared = ctx.createConicGradient(-Math.PI / 2, 0.5, 0.5);
    for (let i = 0; i <= 6; i++) shared.addColorStop(i / 6, shiftHue(d.color, i * 60));
  }
  const fill = tone => shared || (d.colorMode === 'twotone' && tone === 'b' ? d.color2 : d.color);
  if (d.glow.on) { ctx.shadowColor = d.glow.custom ? d.glow.color : d.color; ctx.shadowBlur = d.glow.strength * s * d.scale; }
  for (const sh of shapes) {
    ctx.globalAlpha = alpha * sh.a;
    paintShape(ctx, sh, 0, fill(sh.tone));
  }
  ctx.restore();
}

// ── Presets (original designs) ──────────────────────────────────────────────
const off = { inner: { on: false }, outer: { on: false }, dot: { on: false }, circle: { on: false }, chevron: { on: false } };
const P = (id, name, tags, d) => ({ id, name, tags, design: normalize({ ...off, ...d, outline: { on: true, ...(d.outline || {}) } }) });
const PRESETS = [
  P('classic', 'Classic', 'Lines', { color: '#00ff88', inner: { on: true, length: 6, thickness: 2, gap: 3 } }),
  P('pinpoint', 'Pinpoint', 'Dot', { color: '#ffffff', dot: { on: true, size: 2 } }),
  P('microdot', 'Micro Dot', 'Dot', { color: '#ff3b5c', dot: { on: true, size: 1, shape: 'square' }, outline: { thickness: 1, opacity: 1 } }),
  P('round', 'Round Dot', 'Dot', { color: '#22d3ee', dot: { on: true, size: 5, shape: 'round' } }),
  P('tee', 'Tee', 'Lines', { color: '#ffe14d', tstyle: true, inner: { on: true, length: 7, thickness: 2, gap: 3 }, dot: { on: true, size: 2 } }),
  P('precision', 'Precision', 'Lines', { color: '#ffffff', inner: { on: true, length: 9, thickness: 1, gap: 4 }, dot: { on: true, size: 1 }, outline: { opacity: 0.7 } }),
  P('compact', 'Compact', 'Lines', { color: '#00ffff', inner: { on: true, length: 3, thickness: 2, gap: 2 } }),
  P('bold', 'Bold Plus', 'Lines', { color: '#00ff00', inner: { on: true, length: 8, thickness: 4, gap: 0 }, outline: { thickness: 1 } }),
  P('double', 'Double Line', 'Lines', { color: '#7cf7ff', inner: { on: true, length: 4, thickness: 2, gap: 3 }, outer: { on: true, length: 5, thickness: 2, gap: 12, opacity: 0.55 } }),
  P('xcross', 'X-Cross', 'Lines', { color: '#ff7a1a', rotation: 45, inner: { on: true, length: 6, thickness: 2, gap: 3 } }),
  P('diamond', 'Diamond', 'Dot', { color: '#c084fc', dot: { on: true, size: 6, shape: 'diamond' } }),
  P('circledot', 'Circle Dot', 'Circle', { color: '#ffffff', dot: { on: true, size: 2 }, circle: { on: true, radius: 10, thickness: 1 } }),
  P('ring', 'Ring', 'Circle', { color: '#00ff88', circle: { on: true, radius: 6, thickness: 2 } }),
  P('halo', 'Halo', 'Circle', { color: '#38bdf8', glow: { on: true, strength: 8 }, dot: { on: true, size: 3, shape: 'round' }, circle: { on: true, radius: 14, thickness: 2, opacity: 0.7 }, outline: { on: false } }),
  P('shotgun', 'Spread', 'Circle', { color: '#ffd166', dot: { on: true, size: 2 }, circle: { on: true, radius: 24, thickness: 2, style: 'dashed', opacity: 0.85 } }),
  P('brackets', 'Brackets', 'Circle', { color: '#a3e635', dot: { on: true, size: 2 }, circle: { on: true, radius: 14, thickness: 2, style: 'brackets' } }),
  P('box', 'Box', 'Circle', { color: '#ffffff', dot: { on: true, size: 2 }, circle: { on: true, radius: 9, thickness: 1, style: 'square' } }),
  P('chevron', 'Chevron', 'Chevron', { color: '#ff3b5c', chevron: { on: true, size: 6, thickness: 2, gap: 2 } }),
  P('arrowhead', 'Arrowhead', 'Chevron', { color: '#22d3ee', dot: { on: true, size: 2 }, chevron: { on: true, size: 5, thickness: 2, gap: 5 } }),
  P('tactical', 'Tactical', 'Chevron', { color: '#a3e635', tstyle: true, inner: { on: true, length: 8, thickness: 1, gap: 6 }, chevron: { on: true, size: 4, thickness: 1, gap: 2 }, dot: { on: true, size: 1 } }),
  P('sniper', 'Long Range', 'Scope', { color: '#000000', inner: { on: true, length: 40, thickness: 1, gap: 6 }, outer: { on: true, length: 20, thickness: 3, gap: 40, opacity: 1 }, circle: { on: true, radius: 3, thickness: 1 }, outline: { color: '#ffffff', opacity: 0.6 } }),
  P('target', 'Target', 'Scope', { color: '#ff3b5c', dot: { on: true, size: 3, shape: 'round' }, circle: { on: true, radius: 9, thickness: 1 }, outer: { on: true, length: 6, thickness: 1, gap: 14, opacity: 0.8 } }),
  P('neon', 'Neon', 'Glow', { color: '#ff2fd0', glow: { on: true, strength: 10 }, inner: { on: true, length: 7, thickness: 2, gap: 4 }, dot: { on: true, size: 2 }, outline: { on: false } }),
  P('ember', 'Ember', 'Glow', { color: '#ff7a1a', glow: { on: true, strength: 7 }, inner: { on: true, length: 5, thickness: 2, gap: 3 }, circle: { on: true, radius: 11, thickness: 1, style: 'brackets', opacity: 0.8 } }),
  P('ghost', 'Ghost', 'Minimal', { color: '#ffffff', opacity: 0.55, inner: { on: true, length: 5, thickness: 1, gap: 3 }, outline: { on: false } }),
  P('minimal', 'Minimal', 'Minimal', { color: '#e5e7eb', inner: { on: true, length: 2, thickness: 2, gap: 4 }, outline: { opacity: 0.6 } }),
  P('retro', 'Retro', 'Retro', { color: '#39ff14', inner: { on: true, length: 6, thickness: 3, gap: 2 }, dot: { on: true, size: 3 }, outline: { thickness: 2, opacity: 1 } }),
  P('cyber', 'Cyber', 'Glow', { color: '#00e5ff', glow: { on: true, strength: 6 }, rotation: 45, dot: { on: true, size: 4, shape: 'diamond' }, outer: { on: true, length: 4, thickness: 2, gap: 8, opacity: 0.9 }, outline: { on: false } }),

  // Lines
  P('needle', 'Needle', 'Lines', { color: '#ffffff', inner: { on: true, length: 10, thickness: 3, gap: 2, cap: 'taper' } }),
  P('capsule', 'Capsule', 'Lines', { color: '#7dd3fc', inner: { on: true, length: 7, thickness: 4, gap: 4, cap: 'round' } }),
  P('hairline', 'Hairline', 'Lines', { color: '#f8fafc', opacity: 0.9, inner: { on: true, length: 14, thickness: 1, gap: 6 }, outline: { on: false } }),
  P('wideopen', 'Wide Open', 'Lines', { color: '#facc15', inner: { on: true, length: 4, thickness: 2, gap: 10 } }),
  P('horizon', 'Horizon', 'Lines', { color: '#38bdf8', inner: { on: true, length: 12, thickness: 2, gap: 3, arms: 'h' }, dot: { on: true, size: 2 } }),
  P('pillar', 'Pillar', 'Lines', { color: '#f472b6', inner: { on: true, length: 10, thickness: 2, gap: 4, arms: 'v' }, dot: { on: true, size: 2 } }),
  P('tripod', 'Tripod', 'Lines', { color: '#a78bfa', inner: { on: true, length: 7, thickness: 2, gap: 3, arms: 'three' }, dot: { on: true, size: 3, shape: 'round' } }),
  P('hexstar', 'Hex Star', 'Lines', { color: '#34d399', inner: { on: true, length: 5, thickness: 2, gap: 4, arms: 'six' } }),
  P('compass', 'Compass', 'Lines', { color: '#e2e8f0', inner: { on: true, length: 4, thickness: 1, gap: 5, arms: 'eight' }, dot: { on: true, size: 2 } }),
  P('splittee', 'Split Tee', 'Lines', { color: '#fb923c', tstyle: true, inner: { on: true, length: 9, thickness: 3, gap: 3, cap: 'taper' } }),
  P('stacked', 'Stacked', 'Lines', { color: '#fde047', inner: { on: true, length: 3, thickness: 2, gap: 2 }, outer: { on: true, length: 3, thickness: 2, gap: 8, opacity: 1 } }),
  P('rails', 'Rails', 'Lines', { color: '#93c5fd', inner: { on: true, length: 5, thickness: 1, gap: 4, arms: 'h' }, outer: { on: true, length: 5, thickness: 1, gap: 12, opacity: 0.8, arms: 'h' } }),
  P('ladder', 'Ladder', 'Lines', { color: '#fca5a5', inner: { on: true, length: 4, thickness: 2, gap: 3, arms: 'v' }, outer: { on: true, length: 4, thickness: 2, gap: 11, opacity: 0.8, arms: 'v' }, dot: { on: true, size: 2 } }),
  P('heavyx', 'Heavy X', 'Lines', { color: '#ef4444', rotation: 45, inner: { on: true, length: 7, thickness: 4, gap: 3, cap: 'taper' } }),
  P('tilt', 'Tilt', 'Lines', { color: '#22d3ee', rotation: 30, inner: { on: true, length: 6, thickness: 2, gap: 3, cap: 'round' } }),
  P('trident', 'Trident', 'Lines', { color: '#60a5fa', rotation: 180, inner: { on: true, length: 8, thickness: 3, gap: 2, arms: 'three', cap: 'taper' } }),
  P('level', 'Level', 'Lines', { color: '#ffffff', inner: { on: true, length: 18, thickness: 2, gap: 0, arms: 'h' }, outer: { on: true, length: 4, thickness: 2, gap: 2, opacity: 1, arms: 'v' } }),
  P('twinbar', 'Twin Bar', 'Lines', { color: '#4ade80', inner: { on: true, length: 6, thickness: 6, gap: 4, cap: 'square' }, outline: { thickness: 1, opacity: 1 } }),
  P('pill', 'Pill', 'Lines', { color: '#fef08a', inner: { on: true, length: 3, thickness: 3, gap: 3, cap: 'round' }, dot: { on: true, size: 3, shape: 'round' } }),

  // Dots
  P('ringdot', 'Ring Dot', 'Dot', { color: '#22c55e', dot: { on: true, size: 8, shape: 'ring' } }),
  P('tridot', 'Delta Dot', 'Dot', { color: '#facc15', dot: { on: true, size: 7, shape: 'triangle' } }),
  P('plusdot', 'Plus Dot', 'Dot', { color: '#ff3b5c', dot: { on: true, size: 7, shape: 'cross' } }),
  P('pearl', 'Pearl', 'Dot', { color: '#e0f2fe', glow: { on: true, strength: 6 }, dot: { on: true, size: 8, shape: 'round' }, outline: { on: false } }),
  P('pixel', 'Pixel', 'Dot', { color: '#00ffff', dot: { on: true, size: 4, shape: 'square' }, outline: { thickness: 2, opacity: 1 } }),
  P('gem', 'Gem', 'Dot', { color: '#67e8f9', color2: '#a855f7', colorMode: 'gradient', dot: { on: true, size: 11, shape: 'diamond' } }),
  P('dotcross', 'Dot Cross', 'Dot', { color: '#f97316', dot: { on: true, size: 11, shape: 'cross' }, outline: { thickness: 1, opacity: 1 } }),

  // Circles
  P('triring', 'Tri Ring', 'Geometric', { color: '#fde047', circle: { on: true, radius: 8, thickness: 2, style: 'triangle' }, dot: { on: true, size: 2 } }),
  P('hexring', 'Hex Ring', 'Geometric', { color: '#2dd4bf', circle: { on: true, radius: 11, thickness: 2, style: 'hexagon' }, dot: { on: true, size: 2 } }),
  P('diamondframe', 'Diamond Frame', 'Geometric', { color: '#f472b6', circle: { on: true, radius: 10, thickness: 2, style: 'diamond' }, dot: { on: true, size: 2, shape: 'round' } }),
  P('doublering', 'Double Ring', 'Circle', { color: '#ffffff', circle: { on: true, radius: 7, thickness: 1, style: 'double' }, dot: { on: true, size: 1 } }),
  P('dottedring', 'Dotted Ring', 'Circle', { color: '#38bdf8', circle: { on: true, radius: 12, thickness: 3, style: 'dots', segments: 12 }, dot: { on: true, size: 2, shape: 'round' } }),
  P('radar', 'Radar', 'Circle', { color: '#4ade80', circle: { on: true, radius: 20, thickness: 1, style: 'dashed', segments: 24, opacity: 0.8 }, inner: { on: true, length: 4, thickness: 1, gap: 3 }, dot: { on: true, size: 1 } }),
  P('lens', 'Lens', 'Scope', { color: '#ffffff', opacity: 0.9, circle: { on: true, radius: 16, thickness: 1 }, outer: { on: true, length: 8, thickness: 1, gap: 12, opacity: 1 } }),
  P('reticle', 'Reticle', 'Scope', { color: '#ef4444', circle: { on: true, radius: 22, thickness: 1 }, inner: { on: true, length: 16, thickness: 1, gap: 6 }, outline: { opacity: 0.5 } }),
  P('sixdots', 'Six Dots', 'Circle', { color: '#f9a8d4', circle: { on: true, radius: 6, thickness: 3, style: 'dots', segments: 6 }, dot: { on: true, size: 2, shape: 'round' } }),
  P('bullseye', 'Bullseye', 'Circle', { color: '#ef4444', circle: { on: true, radius: 5, thickness: 1, style: 'double' }, dot: { on: true, size: 3, shape: 'round' } }),
  P('crown', 'Crown', 'Circle', { color: '#facc15', circle: { on: true, radius: 14, thickness: 2, style: 'dashed', segments: 6 }, dot: { on: true, size: 3, shape: 'diamond' } }),
  P('ringlines', 'Ring Lines', 'Circle', { color: '#a5f3fc', circle: { on: true, radius: 8, thickness: 1 }, outer: { on: true, length: 6, thickness: 2, gap: 10, opacity: 1 } }),

  // Chevrons
  P('caret', 'Caret', 'Chevron', { color: '#ffffff', chevron: { on: true, size: 5, thickness: 2, gap: 2, place: 'above' } }),
  P('delta', 'Delta', 'Chevron', { color: '#ef4444', chevron: { on: true, size: 6, gap: 1, style: 'filled' } }),
  P('squad', 'Squad', 'Chevron', { color: '#22d3ee', chevron: { on: true, size: 4, thickness: 2, gap: 4, place: 'four' } }),
  P('rankstack', 'Rank Stack', 'Chevron', { color: '#facc15', chevron: { on: true, size: 4, thickness: 2, gap: 2, count: 3 } }),
  P('pincer', 'Pincer', 'Chevron', { color: '#a3e635', chevron: { on: true, size: 5, thickness: 2, gap: 3, place: 'both' }, dot: { on: true, size: 2 } }),
  P('arrowstorm', 'Arrow Storm', 'Chevron', { color: '#f472b6', chevron: { on: true, size: 4, gap: 6, style: 'filled', place: 'four' }, dot: { on: true, size: 2 } }),
  P('rank', 'Rank', 'Chevron', { color: '#60a5fa', chevron: { on: true, size: 5, thickness: 2, gap: 3, place: 'above', count: 2 }, dot: { on: true, size: 2 } }),
  P('post', 'Post', 'Scope', { color: '#f97316', tstyle: true, inner: { on: true, length: 12, thickness: 2, gap: 9, arms: 'v' }, chevron: { on: true, size: 5, gap: 0, style: 'filled' } }),
  P('vanguard', 'Vanguard', 'Chevron', { color: '#e5e7eb', chevron: { on: true, size: 7, thickness: 1, gap: 4, count: 2 }, inner: { on: true, length: 5, thickness: 1, gap: 3, arms: 'h' } }),

  // Scope / tactical
  P('duplex', 'Duplex', 'Scope', { color: '#0f172a', inner: { on: true, length: 24, thickness: 1, gap: 0 }, outer: { on: true, length: 20, thickness: 3, gap: 24, opacity: 1 }, outline: { color: '#e2e8f0', opacity: 0.7 } }),
  P('holo', 'Holo', 'Scope', { color: '#ff3355', glow: { on: true, strength: 5 }, circle: { on: true, radius: 18, thickness: 2 }, dot: { on: true, size: 2, shape: 'round' }, outline: { on: false } }),
  P('rangefinder', 'Rangefinder', 'Scope', { color: '#fef3c7', inner: { on: true, length: 6, thickness: 1, gap: 3 }, outer: { on: true, length: 4, thickness: 1, gap: 20, opacity: 1 }, circle: { on: true, radius: 30, thickness: 1, style: 'dashed', opacity: 0.5 } }),
  P('bracketlock', 'Bracket Lock', 'Tactical', { color: '#34d399', circle: { on: true, radius: 18, thickness: 2, style: 'brackets' }, inner: { on: true, length: 4, thickness: 2, gap: 6 } }),
  P('boxlock', 'Box Lock', 'Tactical', { color: '#ffffff', circle: { on: true, radius: 14, thickness: 1, style: 'square' }, dot: { on: true, size: 3, shape: 'round' }, outer: { on: true, length: 4, thickness: 1, gap: 18, opacity: 1 } }),
  P('marker', 'Marker', 'Tactical', { color: '#fb7185', rotation: 45, inner: { on: true, length: 5, thickness: 2, gap: 7 }, circle: { on: true, radius: 5, thickness: 1, style: 'diamond' } }),
  P('overwatch', 'Overwatch', 'Tactical', { color: '#cbd5e1', tstyle: true, inner: { on: true, length: 10, thickness: 1, gap: 4 }, circle: { on: true, radius: 12, thickness: 1, style: 'brackets' }, dot: { on: true, size: 1 } }),
  P('breach', 'Breach', 'Tactical', { color: '#facc15', inner: { on: true, length: 6, thickness: 3, gap: 6, cap: 'taper' }, circle: { on: true, radius: 3, thickness: 1, style: 'square' } }),
  P('milspec', 'Mil-Spec', 'Tactical', { color: '#86efac', inner: { on: true, length: 10, thickness: 1, gap: 2 }, outer: { on: true, length: 2, thickness: 3, gap: 14, opacity: 1 }, dot: { on: true, size: 1 } }),
  P('flank', 'Flank', 'Tactical', { color: '#93c5fd', inner: { on: true, length: 8, thickness: 2, gap: 5, arms: 'h', cap: 'taper' }, chevron: { on: true, size: 4, thickness: 2, gap: 3 } }),

  // Glow / neon
  P('laser', 'Laser', 'Glow', { color: '#00ffea', glow: { on: true, strength: 12 }, inner: { on: true, length: 10, thickness: 1, gap: 4 }, outline: { on: false } }),
  P('plasma', 'Plasma', 'Glow', { color: '#a855f7', glow: { on: true, strength: 10 }, dot: { on: true, size: 4, shape: 'round' }, circle: { on: true, radius: 9, thickness: 1 }, outline: { on: false } }),
  P('ion', 'Ion', 'Glow', { color: '#38bdf8', glow: { on: true, strength: 8 }, inner: { on: true, length: 5, thickness: 2, gap: 4, arms: 'six', cap: 'taper' }, outline: { on: false } }),
  P('nova', 'Nova', 'Glow', { color: '#fef08a', glow: { on: true, strength: 14, custom: true, color: '#f97316' }, dot: { on: true, size: 5, shape: 'round' }, inner: { on: true, length: 3, thickness: 1, gap: 6, arms: 'eight' }, outline: { on: false } }),

  // Gradient / spectrum / two-tone
  P('synthwave', 'Synthwave', 'Colour', { color: '#ff2fd0', color2: '#00e5ff', colorMode: 'gradient', inner: { on: true, length: 8, thickness: 2, gap: 4 }, circle: { on: true, radius: 14, thickness: 1 } }),
  P('aurora', 'Aurora', 'Colour', { color: '#22d3ee', colorMode: 'spectrum', circle: { on: true, radius: 12, thickness: 3 }, dot: { on: true, size: 2 } }),
  P('prismstar', 'Prism Star', 'Colour', { color: '#ff3b5c', colorMode: 'spectrum', inner: { on: true, length: 6, thickness: 2, gap: 4, arms: 'eight' } }),
  P('sunset', 'Sunset', 'Colour', { color: '#fde047', color2: '#f43f5e', colorMode: 'gradient', inner: { on: true, length: 10, thickness: 3, gap: 3, cap: 'taper' } }),
  P('glacier', 'Glacier', 'Colour', { color: '#ffffff', color2: '#89cff0', colorMode: 'gradient', circle: { on: true, radius: 12, thickness: 2, style: 'hexagon' }, inner: { on: true, length: 4, thickness: 1, gap: 2 } }),
  P('duo', 'Duo', 'Colour', { color: '#ffffff', color2: '#ef4444', colorMode: 'twotone', inner: { on: true, length: 5, thickness: 2, gap: 3 }, outer: { on: true, length: 4, thickness: 2, gap: 12, opacity: 1 } }),
  P('splitring', 'Split Ring', 'Colour', { color: '#00ff88', color2: '#ffffff', colorMode: 'twotone', inner: { on: true, length: 5, thickness: 1, gap: 3 }, circle: { on: true, radius: 12, thickness: 1, style: 'dashed' } }),
  P('embercore', 'Ember Core', 'Colour', { color: '#fde047', color2: '#f97316', colorMode: 'twotone', dot: { on: true, size: 3, shape: 'round' }, circle: { on: true, radius: 10, thickness: 2, style: 'brackets' } }),
  P('royal', 'Royal', 'Colour', { color: '#facc15', color2: '#8b5cf6', colorMode: 'twotone', chevron: { on: true, size: 4, thickness: 2, gap: 5, place: 'four' }, dot: { on: true, size: 5, shape: 'diamond' } }),
  P('frost', 'Frost', 'Colour', { color: '#e0f2fe', color2: '#38bdf8', colorMode: 'twotone', inner: { on: true, length: 3, thickness: 1, gap: 2, arms: 'eight' }, circle: { on: true, radius: 10, thickness: 1, style: 'double' } }),
  P('signal', 'Signal', 'Colour', { color: '#ffffff', color2: '#22c55e', colorMode: 'twotone', tstyle: true, inner: { on: true, length: 7, thickness: 2, gap: 3 }, chevron: { on: true, size: 5, thickness: 2, gap: 12 } }),
  P('oceanic', 'Oceanic', 'Colour', { color: '#2dd4bf', color2: '#1d4ed8', colorMode: 'gradient', dot: { on: true, size: 4, shape: 'round' }, circle: { on: true, radius: 8, thickness: 3, style: 'dots', segments: 8 } }),
  P('hologram', 'Hologram', 'Colour', { color: '#a78bfa', colorMode: 'spectrum', opacity: 0.85, circle: { on: true, radius: 16, thickness: 2, style: 'triangle' }, outline: { on: false }, glow: { on: true, strength: 4 } }),

  // Animated
  P('heartbeat', 'Heartbeat', 'Animated', { color: '#f43f5e', anim: { type: 'pulse', speed: 6 }, dot: { on: true, size: 4, shape: 'round' }, circle: { on: true, radius: 8, thickness: 2 } }),
  P('spinner', 'Spinner', 'Animated', { color: '#22d3ee', anim: { type: 'spin', speed: 3 }, circle: { on: true, radius: 10, thickness: 2, style: 'dashed', segments: 8 }, dot: { on: true, size: 2 } }),
  P('rainbow', 'Rainbow', 'Animated', { color: '#ff0040', anim: { type: 'rainbow', speed: 4 }, inner: { on: true, length: 6, thickness: 2, gap: 3 }, dot: { on: true, size: 2 } }),
  P('sweep', 'Sweep', 'Animated', { color: '#4ade80', anim: { type: 'spin', speed: 2 }, circle: { on: true, radius: 16, thickness: 1, style: 'brackets' }, inner: { on: true, length: 3, thickness: 1, gap: 2 } }),
  P('gyro', 'Gyro', 'Animated', { color: '#fbbf24', anim: { type: 'spin', speed: 5 }, inner: { on: true, length: 8, thickness: 2, gap: 4, arms: 'three', cap: 'taper' } }),
  P('lungs', 'Lungs', 'Animated', { color: '#c084fc', anim: { type: 'breathe', speed: 2 }, circle: { on: true, radius: 8, thickness: 2 }, dot: { on: true, size: 2, shape: 'round' } }),
  P('disco', 'Disco', 'Animated', { color: '#ff0080', anim: { type: 'rainbow', speed: 7 }, inner: { on: true, length: 4, thickness: 2, gap: 5, arms: 'eight' }, dot: { on: true, size: 3, shape: 'diamond' }, glow: { on: true, strength: 5 } }),
  P('vortex', 'Vortex', 'Animated', { color: '#7c3aed', color2: '#22d3ee', colorMode: 'gradient', anim: { type: 'spin', speed: 4 }, inner: { on: true, length: 8, thickness: 3, gap: 2, arms: 'six', cap: 'taper' } }),

  // Minimal
  P('shadowdot', 'Shadow Dot', 'Minimal', { color: '#ffffff', dot: { on: true, size: 4, shape: 'round' }, outline: { on: false }, shadow: { on: true, x: 1, y: 2, blur: 2, opacity: 0.8 } }),
  P('floating', 'Floating', 'Minimal', { color: '#f1f5f9', inner: { on: true, length: 5, thickness: 2, gap: 4, cap: 'round' }, outline: { on: false }, shadow: { on: true, x: 2, y: 2, blur: 3, opacity: 0.7 } }),

  // Retro / arcade
  P('chunky', 'Chunky', 'Retro', { color: '#ff6ad5', circle: { on: true, radius: 6, thickness: 3, style: 'square' }, dot: { on: true, size: 5, shape: 'cross' }, outline: { thickness: 2, opacity: 1 } }),
  P('arcade', 'Arcade', 'Retro', { color: '#00ff00', chevron: { on: true, size: 3, gap: 7, style: 'filled', place: 'four' }, circle: { on: true, radius: 4, thickness: 1, style: 'square' } }),
  P('invader', 'Invader', 'Retro', { color: '#7cfc00', dot: { on: true, size: 9, shape: 'cross' }, chevron: { on: true, size: 4, thickness: 2, gap: 6, place: 'above' }, outline: { thickness: 2, opacity: 1 } }),
  P('vector', 'Vector', 'Retro', { color: '#00ffff', glow: { on: true, strength: 3 }, circle: { on: true, radius: 8, thickness: 1, style: 'diamond' }, inner: { on: true, length: 3, thickness: 1, gap: 2 }, outline: { on: false } }),
  P('crt', 'CRT', 'Retro', { color: '#ffb000', glow: { on: true, strength: 4 }, inner: { on: true, length: 5, thickness: 2, gap: 3 }, outer: { on: true, length: 2, thickness: 2, gap: 11, opacity: 0.6 }, outline: { on: false }, scale: 2 }),

  // Geometric
  P('triad', 'Triad', 'Geometric', { color: '#fef9c3', circle: { on: true, radius: 6, thickness: 1, style: 'triangle' }, inner: { on: true, length: 3, thickness: 1, gap: 14, arms: 'three' } }),
  P('hexa', 'Hexa', 'Geometric', { color: '#5eead4', circle: { on: true, radius: 9, thickness: 1, style: 'hexagon' }, inner: { on: true, length: 3, thickness: 1, gap: 12, arms: 'six' } }),
  P('octo', 'Octo', 'Geometric', { color: '#fca5a5', inner: { on: true, length: 2, thickness: 2, gap: 8, arms: 'eight' }, dot: { on: true, size: 2 } }),
  P('stargate', 'Star Gate', 'Geometric', { color: '#93c5fd', circle: { on: true, radius: 12, thickness: 1, style: 'double' }, chevron: { on: true, size: 3, thickness: 1, gap: 3, place: 'four' } }),
  P('compassrose', 'Compass Rose', 'Geometric', { color: '#fde68a', inner: { on: true, length: 10, thickness: 3, gap: 0, arms: 'eight', cap: 'taper' } }),
  P('shuriken', 'Shuriken', 'Geometric', { color: '#e5e7eb', rotation: 20, inner: { on: true, length: 8, thickness: 4, gap: 0, cap: 'taper' } }),
  P('lattice', 'Lattice', 'Geometric', { color: '#cbd5e1', inner: { on: true, length: 4, thickness: 1, gap: 2 }, outer: { on: true, length: 4, thickness: 1, gap: 9, opacity: 1, arms: 'eight' } }),
  P('snowflake', 'Snowflake', 'Geometric', { color: '#e0f2fe', inner: { on: true, length: 6, thickness: 1, gap: 1, arms: 'six' }, outer: { on: true, length: 3, thickness: 1, gap: 9, opacity: 1, arms: 'six' }, dot: { on: true, size: 1 } }),
  P('pyramid', 'Pyramid', 'Geometric', { color: '#f59e0b', circle: { on: true, radius: 5, thickness: 2, style: 'triangle' }, dot: { on: true, size: 3, shape: 'triangle' } }),
  P('hive', 'Hive', 'Geometric', { color: '#facc15', circle: { on: true, radius: 5, thickness: 1, style: 'hexagon' }, outer: { on: true, length: 3, thickness: 2, gap: 9, opacity: 1, arms: 'six' } }),
  P('kite', 'Kite', 'Geometric', { color: '#a78bfa', circle: { on: true, radius: 7, thickness: 1, style: 'diamond' }, inner: { on: true, length: 6, thickness: 1, gap: 12, cap: 'taper' } }),
];

// ── Share codes ─────────────────────────────────────────────────────────────
const PREFIX = 'CRX1-';
const toB64 = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = s => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
/** A short text code for a design (copy, paste, share). */
const encode = d => PREFIX + toB64(JSON.stringify(normalize(d)));
/** The design in a code, or null if it is not a valid code. */
function decode(code) {
  const c = String(code || '').trim();
  if (!c.startsWith(PREFIX) || c.length > 4000) return null;
  try { return normalize(JSON.parse(fromB64(c.slice(PREFIX.length)))); } catch { return null; }
}

const kit = { DEFAULT, RANGES, ENUMS, DOT_SHAPES, CIRCLE_STYLES, PRESETS, normalize, extent, isAnimated, render, encode, decode, shiftHue };
if (typeof module === 'object' && module.exports) module.exports = kit;
else window.CrosshairKit = kit;
})();
