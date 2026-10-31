// Cursor designer: every Windows cursor role drawn in one consistent style.
// A design = shape (the main pointer's silhouette) + finish (how it is painted)
// + fill (a colour, a pattern or a flag) + size + shadow. Glyphs are drawn on a
// 32-unit grid and scaled, so every size is rendered from vectors.
(() => {
const GRID = 32;

// ── Seeded randomness (patterns must look identical every time) ─────────────
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── Drawing helpers (any CanvasRenderingContext2D or Path2D) ─────────────────
/** Polygon with rounded corners (radius r, clamped to half of each edge). */
function roundPoly(ctx, pts, r) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = [p1[0] + (p0[0] - p1[0]) * rr / d1, p1[1] + (p0[1] - p1[1]) * rr / d1];
    const b = [p1[0] + (p2[0] - p1[0]) * rr / d2, p1[1] + (p2[1] - p1[1]) * rr / d2];
    if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  ctx.closePath();
}
const poly = (ctx, pts) => { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
const rect = (ctx, x, y, w, h, r = 0) => (r ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h));
const circle = (ctx, x, y, r, ccw = false) => { ctx.moveTo(x + (ccw ? -r : r), y); ctx.arc(x, y, r, ccw ? Math.PI : 0, ccw ? -Math.PI : Math.PI * 2, ccw); };
/** Teardrop: a circle (c, r) drawn to a point at `tip`. */
function teardrop(ctx, tip, c, r) {
  const d = Math.hypot(c[0] - tip[0], c[1] - tip[1]);
  const base = Math.atan2(c[1] - tip[1], c[0] - tip[0]);
  const off = Math.acos(r / d);
  ctx.moveTo(tip[0], tip[1]);
  ctx.arc(c[0], c[1], r, base + Math.PI - off, base + Math.PI + off, true);
  ctx.closePath();
}
/** Star polygon points (n points, outer R, inner r, first point at angle rot). */
const starPts = (cx, cy, R, r, n = 5, rot = -Math.PI / 2) =>
  Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i * Math.PI) / n; const k = i % 2 ? r : R; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; });
/** Maps points drawn pointing "up" (tip at 0,0, body along +y) onto the 45° pointer diagonal. */
const diag = (pts, k = 1, tip = [3, 3]) => pts.map(([x, y]) => [tip[0] + (x + y) * 0.7071 * k, tip[1] + (y - x) * 0.7071 * k]);
const rotateAbout = (pts, deg) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [16 + (x - 16) * c - (y - 16) * s, 16 + (x - 16) * s + (y - 16) * c]);
};
const scaleAbout = (pts, k, cx = 16, cy = 16) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

// ── Fills: colours, patterns and flags ──────────────────────────────────────
// A colour is one hex value or a list of gradient stops.
const COLORS = [
  { id: 'snow', name: 'Snow', value: '#ffffff' },
  { id: 'graphite', name: 'Graphite', value: '#1b1d24' },
  { id: 'ember', name: 'Ember', value: '#ff7a1a' },
  { id: 'cyan', name: 'Cyan', value: '#22d3ee' },
  { id: 'violet', name: 'Violet', value: '#8b5cf6' },
  { id: 'lime', name: 'Lime', value: '#a3e635' },
  { id: 'rose', name: 'Rose', value: '#fb7185' },
  { id: 'gold', name: 'Gold', value: ['#fde68a', '#f59e0b'] },
  { id: 'ocean', name: 'Ocean', value: ['#38bdf8', '#6366f1'] },
  { id: 'sunset', name: 'Sunset', value: ['#fb923c', '#ec4899'] },
  { id: 'aurora', name: 'Aurora', value: ['#34d399', '#22d3ee', '#a78bfa'] },
  { id: 'frost', name: 'Frost', value: ['#f0f9ff', '#94a3b8'] },
];

// Art fills draw into the glyph's bounding box b = [x0, y0, x1, y1] (grid units),
// already clipped to the glyph. `palette` serves line glyphs and glows.
const W = b => b[2] - b[0], H = b => b[3] - b[1];
const hBands = (ctx, b, colors, weights = colors.map(() => 1)) => {
  const total = weights.reduce((a, v) => a + v, 0);
  let y = b[1];
  colors.forEach((c, i) => { const h = H(b) * weights[i] / total; ctx.fillStyle = c; ctx.fillRect(b[0], y, W(b), h + 0.05); y += h; });
};
const vBands = (ctx, b, colors, weights = colors.map(() => 1)) => {
  const total = weights.reduce((a, v) => a + v, 0);
  let x = b[0];
  colors.forEach((c, i) => { const w = W(b) * weights[i] / total; ctx.fillStyle = c; ctx.fillRect(x, b[1], w + 0.05, H(b)); x += w; });
};
const fillPoly = (ctx, color, pts) => { ctx.fillStyle = color; ctx.beginPath(); poly(ctx, pts); ctx.fill(); };
const fillCircle = (ctx, color, x, y, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
/** Crescent: the outer disc minus an offset inner disc, in `color`. */
function crescent(ctx, color, cx, cy, R, ix, iy, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.arc(ix, iy, r, 0, Math.PI * 2, true);
  ctx.fillStyle = color; ctx.fill('evenodd');
  ctx.restore();
}
/** Nordic cross: field, then the cross at fractions of the length / height. */
function nordic(ctx, b, field, crosses, hx, vy) {
  ctx.fillStyle = field; ctx.fillRect(b[0], b[1], W(b), H(b));
  for (const [color, wx, wy] of crosses) {
    ctx.fillStyle = color;
    ctx.fillRect(b[0] + W(b) * (hx - wx / 2), b[1], W(b) * wx, H(b));
    ctx.fillRect(b[0], b[1] + H(b) * (vy - wy / 2), W(b), H(b) * wy);
  }
}
/** Serrated hoist (Bahrain, Qatar): white band with `n` triangles into the field. */
function serrated(ctx, b, field, n, base, tip) {
  ctx.fillStyle = field; ctx.fillRect(b[0], b[1], W(b), H(b));
  const pts = [[b[0], b[1]], [b[0] + W(b) * base, b[1]]];
  for (let i = 0; i < n; i++) {
    pts.push([b[0] + W(b) * tip, b[1] + H(b) * (i + 0.5) / n]);
    pts.push([b[0] + W(b) * base, b[1] + H(b) * (i + 1) / n]);
  }
  pts.push([b[0], b[3]]);
  fillPoly(ctx, '#ffffff', pts);
}

const PATTERNS = [
  { id: 'carbon', name: 'Carbon', palette: ['#3a3d45', '#16171b'], dark: true, draw(ctx, b) {
    ctx.fillStyle = '#15161a'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const s = 1.6;
    for (let y = Math.floor(b[1] / s) * s; y < b[3]; y += s) for (let x = Math.floor(b[0] / s) * s; x < b[2]; x += s) {
      const even = (Math.round(x / s) + Math.round(y / s)) % 2 === 0;
      const g = even ? ctx.createLinearGradient(x, y, x + s, y) : ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, '#2c2e35'); g.addColorStop(0.5, '#464a54'); g.addColorStop(1, '#1b1c21');
      ctx.fillStyle = g; ctx.fillRect(x + 0.08, y + 0.08, s - 0.16, s - 0.16);
    }
  } },
  { id: 'marble', name: 'Marble', palette: ['#f4f1ec', '#b9b2a8'], draw(ctx, b) {
    const g = ctx.createLinearGradient(b[0], b[1], b[2], b[3]); g.addColorStop(0, '#fbfaf7'); g.addColorStop(1, '#e7e2da');
    ctx.fillStyle = g; ctx.fillRect(b[0], b[1], W(b), H(b));
    const r = rng(7); ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(120, 112, 100, ${0.25 + r() * 0.35})`; ctx.lineWidth = 0.25 + r() * 0.6;
      ctx.beginPath();
      const y = b[1] + r() * H(b);
      ctx.moveTo(b[0] - 1, y);
      ctx.bezierCurveTo(b[0] + W(b) * 0.3, y + (r() - 0.5) * 12, b[0] + W(b) * 0.7, y + (r() - 0.5) * 12, b[2] + 1, y + (r() - 0.5) * 10);
      ctx.stroke();
    }
  } },
  { id: 'holo', name: 'Holographic', palette: ['#ff9ad5', '#8fd3ff', '#9dffcf'], draw(ctx, b) {
    const g = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
    ['#ff9ad5', '#c39bff', '#8fd3ff', '#9dffcf', '#fff59d', '#ffb4a2'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(b[0], b[1], W(b), H(b));
    ctx.globalAlpha = 0.5;
    for (let i = -3; i < 8; i++) {
      const x = b[0] + i * 5;
      const s = ctx.createLinearGradient(x, b[1], x + 4, b[1] + 4);
      s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.9)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = s;
      ctx.beginPath(); poly(ctx, [[x, b[1]], [x + 2.2, b[1]], [x + 2.2 + H(b), b[3]], [x + H(b), b[3]]]); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } },
  { id: 'galaxy', name: 'Galaxy', palette: ['#7c3aed', '#22d3ee'], dark: true, draw(ctx, b) {
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, R = Math.max(W(b), H(b));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, '#2b1259'); g.addColorStop(1, '#07031a');
    ctx.fillStyle = g; ctx.fillRect(b[0], b[1], W(b), H(b));
    for (const [fx, fy, c, k] of [[0.3, 0.35, 'rgba(236, 72, 153, 0.55)', 0.5], [0.7, 0.65, 'rgba(34, 211, 238, 0.45)', 0.55]]) {
      const x = b[0] + W(b) * fx, y = b[1] + H(b) * fy, n = ctx.createRadialGradient(x, y, 0, x, y, R * k);
      n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = n; ctx.fillRect(b[0], b[1], W(b), H(b));
    }
    const r = rng(42);
    for (let i = 0; i < 40; i++) fillCircle(ctx, `rgba(255,255,255,${0.5 + r() * 0.5})`, b[0] + r() * W(b), b[1] + r() * H(b), 0.12 + r() * 0.32);
  } },
  { id: 'camo', name: 'Camouflage', palette: ['#5b6b3a', '#3b4426'], dark: true, draw(ctx, b) {
    ctx.fillStyle = '#6b7a45'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const r = rng(11);
    for (const c of ['#8f9658', '#3e4a27', '#2b2e1e', '#a1925f']) {
      ctx.fillStyle = c;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.ellipse(b[0] + r() * W(b), b[1] + r() * H(b), 1.5 + r() * 3.5, 1 + r() * 2.2, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } },
  { id: 'checker', name: 'Racing check', palette: ['#ffffff', '#111111'], draw(ctx, b) {
    const s = 2.6;
    for (let y = b[1]; y < b[3]; y += s) for (let x = b[0]; x < b[2]; x += s) {
      ctx.fillStyle = (Math.round((x - b[0]) / s) + Math.round((y - b[1]) / s)) % 2 ? '#111111' : '#ffffff';
      ctx.fillRect(x, y, s + 0.04, s + 0.04);
    }
  } },
  { id: 'candy', name: 'Candy stripe', palette: ['#e23c4c', '#ffffff'], draw(ctx, b) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(b[0], b[1], W(b), H(b));
    ctx.fillStyle = '#e23c4c';
    for (let x = b[0] - H(b); x < b[2]; x += 5) { ctx.beginPath(); poly(ctx, [[x, b[3]], [x + 2.5, b[3]], [x + 2.5 + H(b), b[1]], [x + H(b), b[1]]]); ctx.fill(); }
  } },
  { id: 'spectrum', name: 'Spectrum', palette: ['#ff3b5c', '#ffe14d', '#30b8ff'], draw(ctx, b) {
    hBands(ctx, b, ['#ff3b5c', '#ff9f1c', '#ffe14d', '#3ddc84', '#30b8ff', '#8a5cff']);
  } },
  { id: 'lava', name: 'Lava', palette: ['#ff5a1f', '#ffb347'], dark: true, draw(ctx, b) {
    ctx.fillStyle = '#1c0703'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const x = b[0] + r() * W(b), y = b[1] + r() * H(b), R = 2 + r() * 4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, '#ffe08a'); g.addColorStop(0.35, '#ff7a1a'); g.addColorStop(1, 'rgba(160, 20, 0, 0)');
      ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    }
  } },
];

// National flags, drawn from their official layouts (proportions are stretched
// to each glyph; discs, stars and crescents keep their shape).
const FLAGS = [
  // Arab world
  { id: 'ps', name: 'Palestine', palette: ['#009736', '#ee2a35'], draw(ctx, b) {
    hBands(ctx, b, ['#000000', '#ffffff', '#009736']);
    fillPoly(ctx, '#ee2a35', [[b[0], b[1]], [b[0] + W(b) / 3, b[1] + H(b) / 2], [b[0], b[3]]]);
  } },
  { id: 'ae', name: 'United Arab Emirates', palette: ['#00843d', '#c8102e'], draw(ctx, b) {
    hBands(ctx, b, ['#00843d', '#ffffff', '#000000']);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(b[0], b[1], W(b) / 4, H(b));
  } },
  { id: 'kw', name: 'Kuwait', palette: ['#007a3d', '#ce1126'], draw(ctx, b) {
    hBands(ctx, b, ['#007a3d', '#ffffff', '#ce1126']);
    fillPoly(ctx, '#000000', [[b[0], b[1]], [b[0] + W(b) / 4, b[1] + H(b) / 3], [b[0] + W(b) / 4, b[1] + H(b) * 2 / 3], [b[0], b[3]]]);
  } },
  { id: 'sd', name: 'Sudan', palette: ['#d21034', '#007229'], draw(ctx, b) {
    hBands(ctx, b, ['#d21034', '#ffffff', '#000000']);
    fillPoly(ctx, '#007229', [[b[0], b[1]], [b[0] + W(b) / 3, b[1] + H(b) / 2], [b[0], b[3]]]);
  } },
  { id: 'ye', name: 'Yemen', palette: ['#ce1126', '#000000'], draw(ctx, b) { hBands(ctx, b, ['#ce1126', '#ffffff', '#000000']); } },
  { id: 'dz', name: 'Algeria', palette: ['#006233', '#d21034'], draw(ctx, b) {
    vBands(ctx, b, ['#006233', '#ffffff']);
    const h = H(b), cx = b[0] + W(b) / 2, cy = b[1] + h / 2;
    crescent(ctx, '#d21034', cx, cy, h * 0.25, cx + h * 0.0625, cy, h * 0.2);
    fillPoly(ctx, '#d21034', starPts(cx + h * 0.06, cy, h * 0.125, h * 0.05, 5, -Math.PI / 2 - 0.3));
  } },
  { id: 'tn', name: 'Tunisia', palette: ['#e70013', '#ffffff'], draw(ctx, b) {
    ctx.fillStyle = '#e70013'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const h = H(b), cx = b[0] + W(b) / 2, cy = b[1] + h / 2;
    fillCircle(ctx, '#ffffff', cx, cy, h * 0.25);
    crescent(ctx, '#e70013', cx, cy, h * 0.1875, cx + h * 0.05, cy, h * 0.15);
    fillPoly(ctx, '#e70013', starPts(cx + h * 0.04, cy, h * 0.1, h * 0.04, 5, -Math.PI / 2 - 0.3));
  } },
  { id: 'ma', name: 'Morocco', palette: ['#c1272d', '#006233'], draw(ctx, b) {
    ctx.fillStyle = '#c1272d'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const h = H(b), cx = b[0] + W(b) / 2, cy = b[1] + h / 2, R = h * 0.33;
    const p = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
    ctx.strokeStyle = '#006233'; ctx.lineWidth = h * 0.05; ctx.lineJoin = 'miter';
    ctx.beginPath(); [0, 2, 4, 1, 3].forEach((k, i) => (i ? ctx.lineTo(...p[k]) : ctx.moveTo(...p[k]))); ctx.closePath(); ctx.stroke();
  } },
  { id: 'ly', name: 'Libya', palette: ['#e70013', '#239e46'], draw(ctx, b) {
    hBands(ctx, b, ['#e70013', '#000000', '#239e46'], [1, 2, 1]);
    const h = H(b), cx = b[0] + W(b) / 2, cy = b[1] + h / 2;
    crescent(ctx, '#ffffff', cx - h * 0.02, cy, h * 0.15, cx + h * 0.02, cy, h * 0.12);
    fillPoly(ctx, '#ffffff', starPts(cx + h * 0.08, cy, h * 0.07, h * 0.028, 5, -Math.PI / 2 - 0.3));
  } },
  { id: 'bh', name: 'Bahrain', palette: ['#ce1126', '#ffffff'], draw(ctx, b) { serrated(ctx, b, '#ce1126', 5, 0.25, 0.37); } },
  { id: 'qa', name: 'Qatar', palette: ['#8a1538', '#ffffff'], draw(ctx, b) { serrated(ctx, b, '#8a1538', 9, 0.3, 0.42); } },
  { id: 'mr', name: 'Mauritania', palette: ['#00a95c', '#ffd700'], draw(ctx, b) {
    hBands(ctx, b, ['#d01c1f', '#00a95c', '#d01c1f'], [1, 3, 1]);
    const h = H(b), cx = b[0] + W(b) / 2, cy = b[1] + h * 0.52;
    crescent(ctx, '#ffd700', cx, cy, h * 0.22, cx, cy - h * 0.08, h * 0.2);
    fillPoly(ctx, '#ffd700', starPts(cx, cy - h * 0.16, h * 0.08, h * 0.032));
  } },
  { id: 'so', name: 'Somalia', palette: ['#4189dd', '#ffffff'], draw(ctx, b) {
    ctx.fillStyle = '#4189dd'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const h = H(b);
    fillPoly(ctx, '#ffffff', starPts(b[0] + W(b) / 2, b[1] + h / 2, h * 0.3, h * 0.12));
  } },
  { id: 'dj', name: 'Djibouti', palette: ['#6ab2e7', '#12ad2b'], draw(ctx, b) {
    hBands(ctx, b, ['#6ab2e7', '#12ad2b']);
    fillPoly(ctx, '#ffffff', [[b[0], b[1]], [b[0] + W(b) * 0.43, b[1] + H(b) / 2], [b[0], b[3]]]);
    fillPoly(ctx, '#d7141a', starPts(b[0] + W(b) * 0.15, b[1] + H(b) / 2, H(b) * 0.1, H(b) * 0.04));
  } },
  // Rest of the world
  { id: 'us', name: 'United States', palette: ['#b22234', '#3c3b6e'], draw(ctx, b) {
    hBands(ctx, b, Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234')));
    const cw = W(b) * 0.4, ch = H(b) * 7 / 13;
    ctx.fillStyle = '#3c3b6e'; ctx.fillRect(b[0], b[1], cw, ch);
    const r = Math.min(cw / 12, ch / 10) * 0.55;
    for (let row = 0; row < 9; row++) {
      const n = row % 2 ? 5 : 6;
      for (let i = 0; i < n; i++) {
        const x = b[0] + cw * ((row % 2 ? 2 : 1) + i * 2) / 12, y = b[1] + ch * (row + 1) / 10;
        fillPoly(ctx, '#ffffff', starPts(x, y, r, r * 0.4));
      }
    }
  } },
  { id: 'gb', name: 'United Kingdom', palette: ['#012169', '#c8102e'], draw(ctx, b) {
    ctx.fillStyle = '#012169'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const t = H(b) / 30;
    ctx.lineCap = 'butt';
    const saltire = (color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[2], b[3]); ctx.moveTo(b[2], b[1]); ctx.lineTo(b[0], b[3]); ctx.stroke();
    };
    saltire('#ffffff', t * 6);
    // Counterchanged red saltire: each arm sits on the clockwise side of its diagonal.
    ctx.save();
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    for (const [qx, qy] of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) {
      ctx.save();
      ctx.beginPath(); poly(ctx, [[cx, cy], [qx, cy], [qx, qy], [cx, qy]]); ctx.clip();
      const dx = qx - cx, dy = qy - cy, len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len, off = t * 1;
      const side = (qx < cx) === (qy < cy) ? 1 : -1;
      ctx.strokeStyle = '#c8102e'; ctx.lineWidth = t * 2;
      ctx.beginPath();
      ctx.moveTo(cx + nx * off * side, cy + ny * off * side); ctx.lineTo(qx + nx * off * side, qy + ny * off * side);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - t * 5, b[1], t * 10, H(b)); ctx.fillRect(b[0], cy - t * 5, W(b), t * 10);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(cx - t * 3, b[1], t * 6, H(b)); ctx.fillRect(b[0], cy - t * 3, W(b), t * 6);
  } },
  { id: 'fr', name: 'France', palette: ['#0055a4', '#ef4135'], draw(ctx, b) { vBands(ctx, b, ['#0055a4', '#ffffff', '#ef4135']); } },
  { id: 'de', name: 'Germany', palette: ['#000000', '#dd0000', '#ffce00'], draw(ctx, b) { hBands(ctx, b, ['#000000', '#dd0000', '#ffce00']); } },
  { id: 'it', name: 'Italy', palette: ['#009246', '#ce2b37'], draw(ctx, b) { vBands(ctx, b, ['#009246', '#ffffff', '#ce2b37']); } },
  { id: 'jp', name: 'Japan', palette: ['#ffffff', '#bc002d'], draw(ctx, b) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(b[0], b[1], W(b), H(b));
    fillCircle(ctx, '#bc002d', (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(W(b), H(b)) * 0.3);
  } },
  { id: 'ua', name: 'Ukraine', palette: ['#0057b7', '#ffd700'], draw(ctx, b) { hBands(ctx, b, ['#0057b7', '#ffd700']); } },
  { id: 'se', name: 'Sweden', palette: ['#006aa7', '#fecc00'], draw(ctx, b) { nordic(ctx, b, '#006aa7', [['#fecc00', 2 / 16, 2 / 10]], 6 / 16, 0.5); } },
  { id: 'no', name: 'Norway', palette: ['#ba0c2f', '#00205b'], draw(ctx, b) { nordic(ctx, b, '#ba0c2f', [['#ffffff', 4 / 22, 4 / 16], ['#00205b', 2 / 22, 2 / 16]], 8 / 22, 0.5); } },
  { id: 'dk', name: 'Denmark', palette: ['#c8102e', '#ffffff'], draw(ctx, b) { nordic(ctx, b, '#c8102e', [['#ffffff', 4 / 37, 4 / 28]], 14 / 37, 0.5); } },
  { id: 'fi', name: 'Finland', palette: ['#ffffff', '#002f6c'], draw(ctx, b) { nordic(ctx, b, '#ffffff', [['#002f6c', 3 / 18, 3 / 11]], 6.5 / 18, 0.5); } },
  { id: 'ch', name: 'Switzerland', palette: ['#da291c', '#ffffff'], draw(ctx, b) {
    ctx.fillStyle = '#da291c'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const s = Math.min(W(b), H(b)), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - s * 3 / 32, cy - s * 10 / 32, s * 6 / 32, s * 20 / 32);
    ctx.fillRect(cx - s * 10 / 32, cy - s * 3 / 32, s * 20 / 32, s * 6 / 32);
  } },
  { id: 'gr', name: 'Greece', palette: ['#0d5eaf', '#ffffff'], draw(ctx, b) {
    hBands(ctx, b, Array.from({ length: 9 }, (_, i) => (i % 2 ? '#ffffff' : '#0d5eaf')));
    const ch = H(b) * 5 / 9;
    ctx.fillStyle = '#0d5eaf'; ctx.fillRect(b[0], b[1], ch, ch);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b[0] + ch * 2 / 5, b[1], ch / 5, ch); ctx.fillRect(b[0], b[1] + ch * 2 / 5, ch, ch / 5);
  } },
  { id: 'tr', name: 'Türkiye', palette: ['#e30a17', '#ffffff'], draw(ctx, b) {
    ctx.fillStyle = '#e30a17'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const h = H(b), cx = b[0] + Math.min(W(b) * 0.4, h * 0.5), cy = b[1] + h / 2;
    crescent(ctx, '#ffffff', cx, cy, h * 0.25, cx + h * 0.0625, cy, h * 0.2);
    fillPoly(ctx, '#ffffff', starPts(cx + h * 0.27, cy, h * 0.125, h * 0.05, 5, Math.PI));
  } },
  { id: 'in', name: 'India', palette: ['#ff9933', '#138808'], draw(ctx, b) {
    hBands(ctx, b, ['#ff9933', '#ffffff', '#138808']);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, r = Math.min(H(b) / 3 * 0.42, W(b) * 0.2);
    ctx.strokeStyle = '#000080'; ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.stroke();
    fillCircle(ctx, '#000080', cx, cy, r * 0.18);
  } },
  { id: 'cn', name: 'China', palette: ['#ee1c25', '#ffff00'], draw(ctx, b) {
    ctx.fillStyle = '#ee1c25'; ctx.fillRect(b[0], b[1], W(b), H(b));
    const u = Math.min(W(b) / 30, H(b) / 20);
    const at = (gx, gy) => [b[0] + gx * u, b[1] + gy * u];
    const [bx, by] = at(5, 5);
    fillPoly(ctx, '#ffff00', starPts(bx, by, 3 * u, 1.15 * u));
    for (const [gx, gy] of [[10, 2], [12, 4], [12, 7], [10, 9]]) {
      const [x, y] = at(gx, gy);
      fillPoly(ctx, '#ffff00', starPts(x, y, u, 0.38 * u, 5, Math.atan2(by - y, bx - x)));
    }
  } },
  { id: 'ie', name: 'Ireland', palette: ['#169b62', '#ff883e'], draw(ctx, b) { vBands(ctx, b, ['#169b62', '#ffffff', '#ff883e']); } },
  { id: 'nl', name: 'Netherlands', palette: ['#ae1c28', '#21468b'], draw(ctx, b) { hBands(ctx, b, ['#ae1c28', '#ffffff', '#21468b']); } },
  { id: 'pl', name: 'Poland', palette: ['#ffffff', '#dc143c'], draw(ctx, b) { hBands(ctx, b, ['#ffffff', '#dc143c']); } },
  { id: 'id', name: 'Indonesia', palette: ['#ff0000', '#ffffff'], draw(ctx, b) { hBands(ctx, b, ['#ff0000', '#ffffff']); } },
  { id: 'ng', name: 'Nigeria', palette: ['#008751', '#ffffff'], draw(ctx, b) { vBands(ctx, b, ['#008751', '#ffffff', '#008751']); } },
  { id: 'co', name: 'Colombia', palette: ['#fcd116', '#003893', '#ce1126'], draw(ctx, b) { hBands(ctx, b, ['#fcd116', '#003893', '#ce1126'], [2, 1, 1]); } },
  { id: 'bd', name: 'Bangladesh', palette: ['#006a4e', '#f42a41'], draw(ctx, b) {
    ctx.fillStyle = '#006a4e'; ctx.fillRect(b[0], b[1], W(b), H(b));
    fillCircle(ctx, '#f42a41', b[0] + W(b) * 0.45, b[1] + H(b) / 2, Math.min(W(b) * 0.2, H(b) * 0.33));
  } },
  { id: 'at', name: 'Austria', palette: ['#ed2939', '#ffffff'], draw(ctx, b) { hBands(ctx, b, ['#ed2939', '#ffffff', '#ed2939']); } },
];

/** Fill source for a colour id: 'ember', 'custom', 'p:<pattern>' or 'f:<flag>'. */
function fillOf(d) {
  if (d.color.startsWith('p:') || d.color.startsWith('f:')) {
    const art = (d.color[0] === 'p' ? PATTERNS : FLAGS).find(x => x.id === d.color.slice(2));
    return { stops: art.palette, art };
  }
  const v = d.color === 'custom' ? d.custom : COLORS.find(c => c.id === d.color).value;
  return { stops: Array.isArray(v) ? v : [v], art: null };
}
const stopsOf = d => fillOf(d).stops;

// ── Shapes, finishes, presets ───────────────────────────────────────────────
const SHAPES = [
  { id: 'classic', name: 'Classic' },
  { id: 'soft', name: 'Soft' },
  { id: 'dart', name: 'Dart' },
  { id: 'comet', name: 'Comet' },
  { id: 'dot', name: 'Dot' },
  { id: 'reticle', name: 'Reticle' },
  { id: 'pixel', name: 'Pixel' },
  { id: 'plane', name: 'Paper plane' },
  { id: 'bolt', name: 'Bolt' },
  { id: 'sword', name: 'Sword' },
  { id: 'nib', name: 'Pen nib' },
  { id: 'wand', name: 'Wand' },
];

const FINISHES = [
  { id: 'solid', name: 'Solid', note: 'Filled, with a crisp contrasting rim' },
  { id: 'bold', name: 'Bold', note: 'Thick outline around the fill' },
  { id: 'glass', name: 'Glass', note: 'Translucent with a glossy highlight' },
  { id: 'neon', name: 'Neon', note: 'Glowing outline, see-through centre' },
  { id: 'gloss', name: 'Gloss', note: 'Glossy glass with a bright top highlight' },
  { id: 'jelly', name: 'Jelly', note: 'Soft, translucent candy with a shine' },
];

const PRESETS = [
  { id: 'polar', name: 'Polar', design: { shape: 'classic', finish: 'solid', color: 'snow' } },
  { id: 'ember', name: 'Ember', design: { shape: 'soft', finish: 'solid', color: 'ember' } },
  { id: 'midnight', name: 'Midnight', design: { shape: 'soft', finish: 'solid', color: 'graphite' } },
  { id: 'pulse', name: 'Neon Pulse', design: { shape: 'dart', finish: 'neon', color: 'cyan' } },
  { id: 'glasswing', name: 'Glasswing', design: { shape: 'comet', finish: 'glass', color: 'ocean' } },
  { id: 'aurora', name: 'Aurora', design: { shape: 'soft', finish: 'glass', color: 'aurora' } },
  { id: 'goldleaf', name: 'Gold Leaf', design: { shape: 'classic', finish: 'bold', color: 'gold' } },
  { id: 'sniper', name: 'Sniper', design: { shape: 'reticle', finish: 'neon', color: 'lime' } },
  { id: 'candy', name: 'Candy', design: { shape: 'dot', finish: 'bold', color: 'rose' } },
  { id: 'retro', name: 'Retro', design: { shape: 'pixel', finish: 'solid', color: 'snow' } },
  { id: 'dusk', name: 'Dusk', design: { shape: 'dart', finish: 'glass', color: 'sunset' } },
  { id: 'haze', name: 'Violet Haze', design: { shape: 'comet', finish: 'neon', color: 'violet' } },
  { id: 'carbonblade', name: 'Carbon Blade', design: { shape: 'sword', finish: 'solid', color: 'p:carbon' } },
  { id: 'holowand', name: 'Holo Wand', design: { shape: 'wand', finish: 'glass', color: 'p:holo' } },
  { id: 'nebula', name: 'Nebula', design: { shape: 'comet', finish: 'solid', color: 'p:galaxy' } },
  { id: 'marblenib', name: 'Marble Nib', design: { shape: 'nib', finish: 'solid', color: 'p:marble' } },
  { id: 'chequered', name: 'Chequered', design: { shape: 'plane', finish: 'solid', color: 'p:checker' } },
  { id: 'thunder', name: 'Thunder', design: { shape: 'bolt', finish: 'neon', color: 'gold' } },
  { id: 'magma', name: 'Magma', design: { shape: 'bolt', finish: 'solid', color: 'p:lava' } },
  { id: 'candycane', name: 'Candy Cane', design: { shape: 'classic', finish: 'bold', color: 'p:candy' } },
  { id: 'fieldops', name: 'Field Ops', design: { shape: 'soft', finish: 'solid', color: 'p:camo' } },
  { id: 'palestine', name: 'Palestine', design: { shape: 'soft', finish: 'solid', color: 'f:ps' } },
  { id: 'hinomaru', name: 'Hinomaru', design: { shape: 'dot', finish: 'solid', color: 'f:jp' } },
  { id: 'starsstripes', name: 'Stars & Stripes', design: { shape: 'classic', finish: 'solid', color: 'f:us' } },
];

const DEFAULT_DESIGN = { shape: 'soft', finish: 'solid', color: 'ember', custom: '#ff7a1a', size: 36, shadow: true };
const SIZES = { min: 24, max: 72, step: 4 };

// Windows cursor roles, in the order Settings › Mouse pointers lists them.
const ROLES = [
  { id: 'normal', name: 'Normal select' },
  { id: 'help', name: 'Help select' },
  { id: 'appstarting', name: 'Working in background' },
  { id: 'wait', name: 'Busy' },
  { id: 'cross', name: 'Precision select' },
  { id: 'ibeam', name: 'Text select' },
  { id: 'no', name: 'Unavailable' },
  { id: 'sizens', name: 'Vertical resize' },
  { id: 'sizewe', name: 'Horizontal resize' },
  { id: 'sizenwse', name: 'Diagonal resize 1' },
  { id: 'sizenesw', name: 'Diagonal resize 2' },
  { id: 'sizeall', name: 'Move' },
  { id: 'up', name: 'Alternate select' },
  { id: 'hand', name: 'Link select' },
];

const validColor = id => COLORS.some(c => c.id === id) ||
  (typeof id === 'string' && ((id.startsWith('p:') && PATTERNS.some(p => p.id === id.slice(2))) || (id.startsWith('f:') && FLAGS.some(f => f.id === id.slice(2)))));

/** A design with every field valid (unknown or missing values fall back). */
function normalize(d = {}) {
  const pick = (list, v, def) => (list.some(x => x.id === v) ? v : def);
  const size = Math.round(Number(d.size));
  return {
    shape: pick(SHAPES, d.shape, DEFAULT_DESIGN.shape),
    finish: pick(FINISHES, d.finish, DEFAULT_DESIGN.finish),
    color: d.color === 'custom' || validColor(d.color) ? d.color : DEFAULT_DESIGN.color,
    custom: /^#[0-9a-f]{6}$/i.test(d.custom || '') ? d.custom.toLowerCase() : DEFAULT_DESIGN.custom,
    size: Number.isFinite(size) ? Math.min(SIZES.max, Math.max(SIZES.min, size)) : DEFAULT_DESIGN.size,
    shadow: d.shadow !== false,
    pack: PACKS.some(p => p.id === d.pack) ? d.pack : null,
  };
}

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** Relative luminance (sRGB), for choosing a contrasting rim. */
function luminance(hex) {
  const ch = rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const avgLum = stops => stops.reduce((s, h) => s + luminance(h), 0) / stops.length;
/** Lighter (amt > 0, toward white) or darker (amt < 0, toward black) hex colour. */
const shadeHex = (hex, amt) => '#' + rgb(hex).map(v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))
  .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

// ── Main pointer per shape ──────────────────────────────────────────────────
// path builds the silhouette (grid units); detail draws inner lines in `ink`.
const ARROW = [[3, 2.5], [3, 24.5], [8.6, 19.3], [12.2, 27.6], [15.9, 26], [12.4, 18], [19.6, 18]];
const SWORD = {
  blade: diag([[0, 0], [2.3, 4.2], [2.3, 19], [-2.3, 19], [-2.3, 4.2]], 1.05),
  guard: diag([[-6.2, 19], [6.2, 19], [6.2, 21.4], [-6.2, 21.4]], 1.05),
  grip: diag([[-1.4, 21.4], [1.4, 21.4], [1.4, 27], [-1.4, 27]], 1.05),
  pommel: diag([[0, 28.6]], 1.05)[0],
};
const NIB = {
  body: diag([[0, 0], [5.6, 9], [6.2, 17.5], [-6.2, 17.5], [-5.6, 9]], 1.1),
  collar: diag([[-6.8, 17.5], [6.8, 17.5], [6.8, 21], [-6.8, 21]], 1.1),
  slit: diag([[0, 1.5], [0, 10.5]], 1.1),
  hole: diag([[0, 11.6]], 1.1)[0],
};
const POINTERS = {
  classic: { hot: [3, 2.5], path: ctx => poly(ctx, ARROW) },
  soft: { hot: [3.4, 3], path: ctx => roundPoly(ctx, [[3.4, 3], [3.4, 23.2], [8.6, 18.8], [12, 26.2], [15.4, 24.7], [12.2, 17.6], [19, 17.4]], 1.6) },
  dart: { hot: [3, 3], path: ctx => roundPoly(ctx, [[3, 3], [25.5, 11.4], [15.2, 14.6], [11.6, 25.5]], 1.1) },
  comet: { hot: [3, 3], path: ctx => teardrop(ctx, [3, 3], [16.6, 16.6], 8.6) },
  dot: { hot: [16, 16], path: ctx => circle(ctx, 16, 16, 5.2), ring: 10 },
  reticle: { hot: [16, 16], stroke: 2.1, path: ctx => {
    circle(ctx, 16, 16, 9.5);
    for (const [x1, y1, x2, y2] of [[16, 2, 16, 9], [16, 23, 16, 30], [2, 16, 9, 16], [23, 16, 30, 16]]) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  }, dot: 1.6 },
  pixel: { hot: [3, 2], pixel: true },
  plane: { hot: [3, 3],
    path: ctx => roundPoly(ctx, [[3, 3], [28.5, 13], [17.2, 15.4], [15.6, 16.6], [13, 28.5]], 0.9),
    detail: (ctx, ink) => { ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4.6, 4.6); ctx.lineTo(16.4, 16); ctx.stroke(); } },
  bolt: { hot: [3, 3], path: ctx => roundPoly(ctx, [[3, 3], [17.5, 9.2], [13.6, 12.2], [24.6, 18.4], [20.2, 20.2], [29, 29], [14.4, 21.4], [18.2, 18.8], [7.4, 13.8], [11, 11.4]], 0.7) },
  sword: { hot: [3, 3],
    path: ctx => { poly(ctx, SWORD.blade); poly(ctx, SWORD.guard); poly(ctx, SWORD.grip); circle(ctx, SWORD.pommel[0], SWORD.pommel[1], 2.1); },
    detail: (ctx, ink) => {
      const [a, b] = diag([[0, 3.2], [0, 17.6]], 1.05);
      ctx.strokeStyle = ink; ctx.lineWidth = 0.55; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.globalAlpha = 1;
    } },
  nib: { hot: [3, 3],
    path: ctx => { poly(ctx, NIB.body); poly(ctx, NIB.collar); },
    detail: (ctx, ink) => {
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(NIB.slit[0][0], NIB.slit[0][1]); ctx.lineTo(NIB.slit[1][0], NIB.slit[1][1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(NIB.hole[0], NIB.hole[1], 1.05, 0, Math.PI * 2); ctx.fill();
    } },
  wand: { hot: [7, 7],
    path: ctx => {
      poly(ctx, starPts(7, 7, 5.6, 2.4, 5, -Math.PI / 2));
      poly(ctx, [[9.2, 10.4], [10.4, 9.2], [28.6, 27.4], [27.4, 28.6]]);
    } },
};

// Classic 8-bit arrow: X = rim, . = body.
const PIXEL_ART = [
  'X', 'XX', 'X.X', 'X..X', 'X...X', 'X....X', 'X.....X', 'X......X', 'X.......X', 'X........X',
  'X.....XXXXX', 'X..X..X', 'X.X X..X', 'XX  X..X', 'X    X..X', '     X..X', '      XX',
];

// ── Painting ────────────────────────────────────────────────────────────────
const boundsCache = new Map();
const probe = document.createElement('canvas').getContext('2d');
/** Bounding box (grid units) of a glyph, sampled once per glyph and cached. */
function boundsOf(build, key) {
  if (boundsCache.has(key)) return boundsCache.get(key);
  const p = new Path2D();
  build(p);
  let x0 = GRID, y0 = GRID, x1 = 0, y1 = 0;
  for (let y = 0; y <= GRID; y += 0.25) {
    for (let x = 0; x <= GRID; x += 0.25) {
      if (probe.isPointInPath(p, x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
  }
  const b = x1 > x0 && y1 > y0 ? [x0 - 0.3, y0 - 0.3, x1 + 0.3, y1 + 0.3] : [2, 2, 30, 30];
  boundsCache.set(key, b);
  return b;
}

/**
 * Paints one glyph in the design's finish and fill. `build` adds the glyph's
 * sub-paths to a path (grid units); `stroke` > 0 makes it a line glyph.
 */
function paint(ctx, d, build, { stroke = 0, detail = null } = {}) {
  const { stops, art } = fillOf(d);
  const dark = art ? !!art.dark : avgLum(stops) < 0.35;
  const shape = new Path2D();
  build(shape);
  const box = stroke ? [2, 2, 30, 30] : boundsOf(build, build.toString());
  const gradient = () => {
    if (stops.length === 1) return stops[0];
    const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    return g;
  };
  const shadowOn = () => {
    if (!d.shadow) return;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 1.6 * ctx.__scale;
    ctx.shadowOffsetX = 0.35 * ctx.__scale;
    ctx.shadowOffsetY = 0.9 * ctx.__scale;
  };
  const shadowOff = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };
  const draw = (style, width) => {
    if (stroke) { ctx.strokeStyle = style; ctx.lineWidth = stroke + width; ctx.stroke(shape); }
    else if (width) { ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke(shape); }
    else { ctx.fillStyle = style; ctx.fill(shape, 'nonzero'); }
  };
  /** The glyph's interior: the art clipped to the silhouette, or the colour. */
  const body = (alpha = 1) => {
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (art && !stroke) { ctx.clip(shape); art.draw(ctx, box); }
    else draw(gradient(), 0);
    ctx.restore();
  };
  const ink = dark ? 'rgba(255,255,255,0.75)' : 'rgba(16,17,20,0.7)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (d.finish === 'solid') {
    const rim = dark ? '#ffffff' : '#101114';
    shadowOn(); draw(rim, 2.4); shadowOff();
    if (!stroke) draw(rim, 2.4);
    body();
    if (detail) detail(ctx, ink);
  } else if (d.finish === 'bold') {
    // A thick rim around the fill; flat colours get a contrasting core instead.
    // Line glyphs get a thinner rim so they stay lines instead of turning into blobs.
    const rim = stroke ? 2.6 : 4.2;
    shadowOn(); draw(gradient(), rim); shadowOff();
    draw(gradient(), rim);
    if (art) {
      draw(dark ? '#ffffff' : '#101114', 1.4);
      body();
    } else {
      draw(avgLum(stops) > 0.75 ? '#1b1d24' : '#ffffff', 0);
    }
    if (detail) detail(ctx, art ? ink : avgLum(stops) > 0.75 ? 'rgba(255,255,255,0.8)' : 'rgba(16,17,20,0.6)');
  } else if (d.finish === 'glass') {
    shadowOn(); draw('rgba(10, 12, 18, 0.55)', 2.6); shadowOff();
    body(0.82);
    // Glossy sheen on the upper-left half, clipped to the glyph.
    ctx.save();
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke(shape); }
    else {
      ctx.clip(shape);
      const sheen = ctx.createLinearGradient(box[0], box[1], (box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
      sheen.addColorStop(0, 'rgba(255,255,255,0.75)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, GRID, GRID);
    }
    ctx.restore();
    // A bright rim on filled glyphs (a line glyph already got its sheen above).
    if (!stroke) draw('rgba(255, 255, 255, 0.9)', 1);
    if (detail) detail(ctx, 'rgba(255,255,255,0.7)');
  } else if (d.finish === 'gloss' || d.finish === 'jelly') {
    const base = stops[0], last = stops[stops.length - 1];
    const jelly = d.finish === 'jelly';
    const rim = shadeHex(jelly ? base : last, jelly ? -0.38 : -0.55);
    const w = box[2] - box[0], h = box[3] - box[1], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const tone = () => {
      if (jelly) {
        const g = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.2, 0, cx, cy, Math.max(w, h) * 0.75);
        g.addColorStop(0, shadeHex(base, 0.55)); g.addColorStop(0.45, base); g.addColorStop(1, shadeHex(last, -0.22));
        return g;
      }
      const g = ctx.createLinearGradient(0, box[1], 0, box[3]);
      g.addColorStop(0, shadeHex(base, 0.45)); g.addColorStop(0.5, base); g.addColorStop(1, shadeHex(last, -0.3));
      return g;
    };
    shadowOn(); draw(rim, stroke ? 1.6 : 2); shadowOff();
    if (!stroke) draw(rim, 2);
    ctx.save();
    if (jelly) ctx.globalAlpha *= 0.92;
    if (art && !stroke) { ctx.clip(shape); art.draw(ctx, box); } else draw(tone(), 0);
    ctx.restore();
    if (!stroke) {
      // Highlight, clipped to the glyph: a wide top gloss, or a jelly glint.
      ctx.save();
      ctx.clip(shape);
      if (jelly) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath(); ctx.ellipse(box[0] + w * 0.32, box[1] + h * 0.24, Math.max(0.8, w * 0.15), Math.max(0.5, h * 0.08), -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(box[0] + w * 0.52, box[1] + h * 0.16, Math.max(0.35, Math.min(w, h) * 0.04), 0, Math.PI * 2); ctx.fill();
      } else {
        const g = ctx.createLinearGradient(0, box[1], 0, cy);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.85)'); g.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cx, box[1] + h * 0.16, w * 0.72, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      draw('rgba(255, 255, 255, 0.5)', 0.6);
    } else {
      draw('rgba(255, 255, 255, 0.45)', -stroke + 0.5);
    }
    if (detail) detail(ctx, 'rgba(255,255,255,0.75)');
  } else {
    // Neon: dark halo for contrast on light backgrounds, then a glowing tube,
    // with the interior cleared so it reads as an outline. Line glyphs get a
    // slimmer halo and tube so they stay crisp.
    draw('rgba(8, 10, 16, 0.55)', stroke ? 2.8 : 4.2);
    ctx.save();
    ctx.shadowColor = stops[Math.floor(stops.length / 2)];
    ctx.shadowBlur = (stroke ? 1.4 : 2.2) * ctx.__scale;
    draw(gradient(), stroke ? 0.9 : 2.2);
    ctx.restore();
    if (!stroke) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.86;
      draw('#000', 0);
      ctx.restore();
      body(art ? 0.35 : 0.16);
    }
    draw('rgba(255, 255, 255, 0.85)', stroke ? -stroke + 0.7 : 0.6);
    if (detail) detail(ctx, stops[0]);
  }
}

/** The pixel-art pointer, crisp at any size (snapped to whole device pixels). */
function paintPixel(ctx, d, px) {
  const { stops, art } = fillOf(d);
  const dark = art ? !!art.dark : avgLum(stops) < 0.35;
  const rim = d.finish === 'neon' ? stops[stops.length - 1] : dark ? '#ffffff' : '#101114';
  const cell = px.size / 22;
  const ox = Math.round(3 * px.size / GRID), oy = Math.round(2 * px.size / GRID);
  const at = v => Math.round(v);
  const cells = ch => {
    const out = [];
    PIXEL_ART.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) out.push([at(ox + x * cell), at(oy + y * cell)]); }));
    return out;
  };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const size = Math.ceil(cell);
  // Cells are merged into one path per colour: separate translucent squares would
  // overlap by a pixel and show a grid.
  const union = (list, dx = 0, dy = 0) => { const p = new Path2D(); for (const [x, y] of list) p.rect(x + dx, y + dy, size, size); return p; };
  if (d.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill(union([...cells('X'), ...cells('.')], at(cell * 0.5), at(cell * 0.8)));
  }
  if (d.finish !== 'neon') {
    if (art) {
      // The body cells become a clip, and the art fills them.
      ctx.save();
      ctx.clip(union(cells('.')));
      ctx.scale(px.size / GRID, px.size / GRID);
      // The art spans the 11×17-cell sprite (one cell = 32/22 grid units).
      art.draw(ctx, [3, 2, 3 + 11 * GRID / 22, 2 + 17 * GRID / 22]);
      ctx.restore();
    } else {
      ctx.fillStyle = d.finish === 'glass' ? rgba(stops[0], 0.7) : stops[0];
      ctx.fill(union(cells('.')));
    }
  }
  ctx.fillStyle = rim;
  ctx.fill(union(cells('X')));
}

// ── Role glyphs ─────────────────────────────────────────────────────────────
const DOUBLE = [[2.5, 16], [9.5, 9], [9.5, 13.4], [22.5, 13.4], [22.5, 9], [29.5, 16], [22.5, 23], [22.5, 18.6], [9.5, 18.6], [9.5, 23]];

/** Draws the main pointer (shape-specific), scaled by k about the origin. */
function drawPointer(ctx, d, px, k = 1) {
  const P = POINTERS[d.shape];
  if (P.pixel) {
    if (k !== 1) {
      // Inside a composite glyph the pixel pointer is drawn smoothly instead.
      ctx.save(); ctx.scale(k, k);
      paint(ctx, d, c => poly(c, ARROW));
      ctx.restore();
      return;
    }
    paintPixel(ctx, d, px);
    return;
  }
  ctx.save();
  ctx.scale(k, k);
  if (P.stroke) {
    paint(ctx, d, P.path, { stroke: P.stroke });
    if (P.dot) paint(ctx, d, c => circle(c, 16, 16, 1.6));
  } else {
    paint(ctx, d, P.path, { detail: P.detail });
    if (P.ring) {
      ctx.globalAlpha = 0.7;
      paint(ctx, d, c => circle(c, 16, 16, 10), { stroke: 1.3 });
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** Small badge (spinner ring or "?") in the bottom-right, for composite roles. */
function badge(ctx, d, kind) {
  if (kind === 'spin') {
    paint(ctx, d, c => { circle(c, 24, 24, 5.6); circle(c, 24, 24, 3.2, true); });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(24, 24, 4.4, -Math.PI / 2, 0.2);
    ctx.stroke();
    ctx.restore();
  } else {
    // The "?" sits on a solid disc in the fill's main colour, for legibility.
    const { stops } = fillOf(d);
    const plain = { ...d, color: 'custom', custom: stops[0] };
    paint(ctx, plain, c => circle(c, 24, 23.5, 6.2));
    const lum = luminance(stops[0]);
    const ink = d.finish === 'neon' ? stops[0] : d.finish === 'bold' ? (lum > 0.75 ? '#ffffff' : '#1b1d24') : lum < 0.45 ? '#ffffff' : '#101114';
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '700 9px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 24, 24.2);
    ctx.restore();
  }
}

// Silhouettes of the single-shape roles (grid units), shared by the vector
// glyphs below and the pixel packs.
const ROLE_SHAPES = {
  cross: { stroke: 2, build: c => { for (const [x1, y1, x2, y2] of [[16, 3, 16, 11.5], [16, 20.5, 16, 29], [3, 16, 11.5, 16], [20.5, 16, 29, 16]]) { c.moveTo(x1, y1); c.lineTo(x2, y2); } }, dot: c => circle(c, 16, 16, 1.5) },
  ibeam: { build: c => { rect(c, 14.8, 5.5, 2.4, 21, 0.6); rect(c, 10.5, 3.5, 11, 2.6, 1.3); rect(c, 10.5, 25.9, 11, 2.6, 1.3); } },
  no: { build: c => { circle(c, 16, 16, 11); circle(c, 16, 16, 7.6, true); poly(c, rotateAbout([[5.5, 14.4], [26.5, 14.4], [26.5, 17.6], [5.5, 17.6]], 45)); } },
  sizewe: { build: c => roundPoly(c, DOUBLE, 0.6) },
  sizens: { build: c => roundPoly(c, rotateAbout(DOUBLE, 90), 0.6) },
  sizenwse: { build: c => roundPoly(c, rotateAbout(scaleAbout(DOUBLE, 0.92), 45), 0.6) },
  sizenesw: { build: c => roundPoly(c, rotateAbout(scaleAbout(DOUBLE, 0.92), -45), 0.6) },
  sizeall: { build: c => roundPoly(c, [[16, 2.5], [21.5, 8.5], [17.8, 8.5], [17.8, 14.2], [23.5, 14.2], [23.5, 10.5], [29.5, 16], [23.5, 21.5], [23.5, 17.8],
    [17.8, 17.8], [17.8, 23.5], [21.5, 23.5], [16, 29.5], [10.5, 23.5], [14.2, 23.5], [14.2, 17.8], [8.5, 17.8], [8.5, 21.5],
    [2.5, 16], [8.5, 10.5], [8.5, 14.2], [14.2, 14.2], [14.2, 8.5], [10.5, 8.5]], 0.5) },
  up: { build: c => roundPoly(c, [[16, 2.5], [25, 12.5], [19, 12.5], [19, 28.5], [13, 28.5], [13, 12.5], [7, 12.5]], 0.7) },
  hand: { build: c => {
    // Index finger up, three folded fingers, thumb resting on the side.
    rect(c, 10.6, 2.6, 4.4, 15, 2.2); rect(c, 14.6, 10.6, 4, 9, 2); rect(c, 18.2, 11.8, 4, 8.6, 2); rect(c, 21.8, 13.4, 3.8, 8, 1.9);
    roundPoly(c, [[6.2, 15.2], [11.4, 18.8], [11.4, 21]], 1.6); rect(c, 8.6, 15.6, 17, 13.4, 5.2);
  } },
};
const ROLE_HOT = { cross: [16, 16], ibeam: [16, 16], no: [16, 16], sizewe: [16, 16], sizens: [16, 16], sizenwse: [16, 16], sizenesw: [16, 16], sizeall: [16, 16], up: [16, 2.5], hand: [12.8, 2.6] };
const shapeGlyph = id => ({
  hot: () => ROLE_HOT[id],
  draw: (ctx, d) => {
    const r = ROLE_SHAPES[id];
    paint(ctx, d, r.build, { stroke: r.stroke || 0 });
    if (r.dot) paint(ctx, d, r.dot);
  },
});

const GLYPHS = {
  normal: { hot: d => POINTERS[d.shape].hot, draw: (ctx, d, px) => drawPointer(ctx, d, px) },
  help: { hot: d => POINTERS[d.shape].hot.map(v => v * 0.78), draw: (ctx, d, px) => { drawPointer(ctx, d, px, 0.78); badge(ctx, d, 'help'); } },
  appstarting: { hot: d => POINTERS[d.shape].hot.map(v => v * 0.78), draw: (ctx, d, px) => { drawPointer(ctx, d, px, 0.78); badge(ctx, d, 'spin'); } },
  wait: { hot: () => [16, 16], draw: (ctx, d) => {
    paint(ctx, d, c => { circle(c, 16, 16, 10.4); circle(c, 16, 16, 6.4, true); });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(16, 16, 8.4, -Math.PI / 2, Math.PI * 0.15);
    ctx.stroke();
    ctx.restore();
  } },
  ...Object.fromEntries(Object.keys(ROLE_SHAPES).map(id => [id, shapeGlyph(id)])),
};

// ── Packs ───────────────────────────────────────────────────────────────────
// Complete themed sets. Pixel packs are drawn on a 16-cell grid from sprites
// (fills only: the outline, highlight and shade are added automatically);
// their standard cursors are the vector silhouettes above, pixelated.
const PX = 16;
/** Sprite from rows of colour letters ('.' = empty); every row is padded to the widest. */
const sprite = (rows, colors) => {
  const w = Math.max(...rows.map(r => r.length));
  const cells = [];
  rows.forEach((r, y) => [...r.padEnd(w, '.')].forEach((ch, x) => { if (ch !== '.') cells.push([x, y, colors[ch]]); }));
  return { w, h: rows.length, cells };
};
// Compact arrow, so the mascot behind it stays visible.
const ARROW_SPRITE = rows => sprite([
  'w', 'ww', 'www', 'wwww', 'wwwww', 'wwwwww', 'www', 'w.ww', '...ww',
], rows);
const QUESTION = color => sprite(['.qqqq.', 'qq..qq', '....qq', '...qq.', '..qq..', '..qq..', '......', '..qq..', '..qq..'], { q: color });
const MASCOTS = {
  apple2: sprite([
    '......b.gg..', '.....b.gggg.', '..rrrrbrrr..', '.rrhhrrrrrr.', 'rrhhrrrrrrrd', 'rrhrrrrrrrrd',
    'rrrkrrrrkrrd', 'rrpkrrrrkprd', 'rrrrrkkrrrdd', '.rrrrrrrrdd.', '..rroooorr..', '...rr..rr...',
  ], { r: '#f0453b', h: '#ffb0a3', d: '#b3261d', o: '#f7a23a', k: '#2b1416', p: '#ff97a9', b: '#6b3d1f', g: '#5cc443' }),
  cherries: sprite([
    '.....g.ll...', '.....gllll..', '....g.g.....', '...g...g....', '..g.....g...',
    '.rrr...rrr..', 'rhrrr.rhrrr.', 'rkrkr.rkrkr.', 'rrrrd.rrrrd.', '.rrd...rrd..',
  ], { r: '#e3303f', h: '#ff9aa2', d: '#9e1b2a', k: '#2b1416', g: '#4f8a2c', l: '#6fcf4f' }),
  cherries2: sprite([
    '....g.ll....', '....gllll...', '....g.g.....', '...g...g....', '..g.....g...',
    '.rrr...rrr..', 'rhrrr.rhrrr.', 'rkrkr.rkrkr.', 'rrrrd.rrrrd.', '.rrd...rrd..',
  ], { r: '#e3303f', h: '#ff9aa2', d: '#9e1b2a', k: '#2b1416', g: '#4f8a2c', l: '#6fcf4f' }),
  berryblink: sprite([
    '...c.c.c...', '....ccc....', '..uuuuuuu..', '.uhhuuuuuu.', 'uhhuuuuuuuv', 'uhuuuuuuuuv',
    'uuukkuukkuv', 'uuuuuukuuvv', '.uuuuuuuvv.', '..uuuuuvv..', '....uuu....',
  ], { u: '#4f6bd8', h: '#9fb4ff', v: '#2f3f9e', c: '#3a3f6b', k: '#14162e' }),
  apple: sprite([
    '.....b.....', '....bgg....', '..rr.b.rr..', '.rrrrrrrrr.', 'rhhrrrrrrrr', 'rhrrrrrrrrd',
    'rrrkrrrkrrd', 'rprrrrrrrpd', '.rrrrkrrrd.', '..rrrrrrd..', '...rr.rr...',
  ], { r: '#f2423c', h: '#ff9a8f', d: '#b5261f', k: '#2b1416', p: '#ff8fa3', b: '#6b3d1f', g: '#5cc443' }),
  berry: sprite([
    '...c.c.c...', '....ccc....', '..uuuuuuu..', '.uhhuuuuuu.', 'uhhuuuuuuuv', 'uhuukuuukuv',
    'uuupuuuuupv', 'uuuuuukuuvv', '.uuuuuuuvv.', '..uuuuuvv..', '....uuu....',
  ], { u: '#4f6bd8', h: '#9fb4ff', v: '#2f3f9e', c: '#3a3f6b', k: '#14162e', p: '#ff9ab6' }),
  pumpkin: sprite([
    '.....g.....', '....gg.....', '..ooooooo..', '.ohooooooO.', 'ohhoooooooO', 'ohyyoooyyoO',
    'oooyoooyooO', 'ooooooooooO', 'ooyyyyyyyoO', '.oooyoyooO.', '..ooooooo..',
  ], { o: '#ff8a1f', h: '#ffc27a', O: '#c95a0b', y: '#ffe66b', g: '#4f8a2c' }),
  ghost: sprite([
    '...wwwww...', '..wwwwwww..', '.wwwwwwwww.', '.wkkwwwkkw.', '.wkkwwwkkw.', '.wwwwwwwww.',
    '.wwpwkwpww.', '.wwwwwwwww.', '.wwwwwwwww.', '.ww.www.ww.', '.w...w...w.',
  ], { w: '#f4f1ff', k: '#2a2140', p: '#ffb3c8' }),
  frog: sprite([
    '..ww....ww..', '.wwkw..wkww.', '.wwww..wwww.', 'gggggggggggg', 'ghgggggggggG',
    'gpggggggggpG', 'gggkkkkkkggG', '.ggggggggGG.', '..gg....gg..',
  ], { g: '#6fcf4f', h: '#b8f59a', G: '#3f8f2c', w: '#ffffff', k: '#1b2b14', p: '#ff9fb0' }),
  lotus: sprite([
    '.....p.....', '....pPp....', '..p.pPp.p..', '..ppPpPpp..', '...ppppp...', '.lllllllll.',
    'lllllllllll', 'llLlllllLll', '.lllllllll.',
  ], { p: '#ff9fc4', P: '#ffe1ee', l: '#5fb84a', L: '#3d8a2e' }),
  penguin: sprite([
    '...kkkkk...', '..kkkkkkk..', '.kkwwkwwkk.', '.kwkwwwkwk.', '.kwwwywwwk.', 'kkwwwwwwwkk',
    'kkwwwwwwwkk', 'kkwwwwwwwkk', '.kwwwwwwwk.', '..wwwwwww..', '..yy...yy..',
  ], { k: '#1d2433', w: '#ffffff', y: '#ffb020' }),
  fish: sprite([
    '....fff....', '..fffffff.F', '.fkfffffFFF', 'ffffffffFF.', '.fffffffFFF', '..fffffff.F', '....fff....',
  ], { f: '#4fb3ff', F: '#2b7fd1', k: '#10243a' }),
  heart: sprite([
    '.hhh...hhh.', 'hHHhh.hhhhh', 'hHhhhhhhhhd', 'hhhhhhhhhhd', 'hhhhhhhhhhd',
    '.hhhhhhhhd.', '..hhhhhhd..', '...hhhhd...', '....hhd....', '.....h.....',
  ], { h: '#ff5a8a', H: '#ffc2d6', d: '#d63a6a' }),
  heartface: sprite([
    '.hhh...hhh.', 'hHHhh.hhhhh', 'hHhhhhhhhhd', 'hhhkhhhkhhd', 'hhphhhhhphd',
    '.hhhhkhhhd.', '..hhhhhhd..', '...hhhhd...', '....hhd....', '.....h.....',
  ], { h: '#ff5a8a', H: '#ffc2d6', d: '#d63a6a', k: '#5a1a35', p: '#ffd1e3' }),
  hourglass: sprite([
    'kkkkkkkkk', '.kwwwwwk.', '..kwwwk..', '...ksk...', '....k....', '...ksk...', '..ksssk..', '.ksssssk.', 'kkkkkkkkk',
  ], { k: '#000000', w: '#ffffff', s: '#000000' }),
};

const maskCache = new Map();
/** Pixelates a role silhouette onto the 16-cell grid (a cell is 2 grid units). */
function pixelMask(id) {
  if (maskCache.has(id)) return maskCache.get(id);
  const r = ROLE_SHAPES[id];
  const p = new Path2D(); r.build(p);
  const dot = r.dot ? (() => { const q = new Path2D(); r.dot(q); return q; })() : null;
  probe.lineWidth = r.stroke || 1; probe.lineCap = 'round'; probe.lineJoin = 'round';
  const inside = (x, y) => (r.stroke ? probe.isPointInStroke(p, x, y) : probe.isPointInPath(p, x, y));
  const mask = new Set();
  for (let cy = 0; cy < PX; cy++) for (let cx = 0; cx < PX; cx++) {
    let n = 0, onDot = false;
    for (const [ox, oy] of [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5], [1.5, 1.5]]) {
      if (inside(cx * 2 + ox, cy * 2 + oy)) n++;
      // A centre dot is smaller than the 2-of-4 rule can see: any hit keeps it.
      if (dot && probe.isPointInPath(dot, cx * 2 + ox, cy * 2 + oy)) onDot = true;
    }
    if (n >= 2 || onDot) mask.add(cx + ',' + cy);
  }
  maskCache.set(id, mask);
  return mask;
}
/** A layer: filled cells (with colours) at an offset; outline cells are derived. */
const layerOf = (cells, ox = 0, oy = 0) => {
  const fill = new Map();
  for (const [x, y, c] of cells) { const X = x + ox, Y = y + oy; if (X >= 0 && Y >= 0 && X < PX && Y < PX) fill.set(X + ',' + Y, c); }
  return fill;
};
/** Glyph layer from a mask: highlight along the top edge, shade along the bottom. */
function glyphLayer(mask, g) {
  const fill = new Map();
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    fill.set(key, !mask.has(x + ',' + (y - 1)) ? g.hi : !mask.has(x + ',' + (y + 1)) ? g.shade : g.fill);
  }
  return fill;
}
function outlineOf(fill) {
  const out = new Set();
  for (const key of fill.keys()) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, k = X + ',' + Y;
      if (X >= 0 && Y >= 0 && X < PX && Y < PX && !fill.has(k)) out.add(k);
    }
  }
  return out;
}

/** Renders a pixel-pack role: layers are drawn bottom to top, each with its outline. */
function renderPixelRole(pack, role, size, shadow, t = 0) {
  const S = Math.max(32, Math.min(128, Math.round(size / PX) * PX));
  const cell = S / PX;
  const arrow = layerOf(ARROW_SPRITE({ w: pack.arrow }).cells, 1, 1);
  // Mascot for a role at frame t: the pack's animation, or its static default.
  const pick = def => { const a = pack.anim && pack.anim[role]; return a ? { dx: 0, dy: 0, ...a.mascot(t) } : { m: def, dx: 0, dy: 0 }; };
  const corner = sp => { const m = MASCOTS[sp.m]; return layerOf(m.cells, PX - m.w - 1 + sp.dx, PX - m.h - 1 + sp.dy); };
  const center = sp => { const m = MASCOTS[sp.m]; return layerOf(m.cells, Math.floor((PX - m.w) / 2) + sp.dx, Math.floor((PX - m.h) / 2) + sp.dy); };
  let layers, hot;
  if (role === 'normal') {
    layers = pack.full ? [glyphLayer(pixelMaskOf('arrow'), pack.glyph)] : [corner(pick(pack.mascots[0])), arrow];
    hot = pack.full ? [1.5, 1.25] : [1, 1];
  } else if (role === 'appstarting') { layers = [corner(pick(pack.mascots[1])), arrow]; hot = [1, 1]; }
  else if (role === 'help') { layers = [layerOf(QUESTION(pack.accent).cells, PX - 7, PX - 10), arrow]; hot = [1, 1]; }
  else if (role === 'wait') { layers = [center(pick(pack.mascots[1]))]; hot = [8, 8]; }
  else { layers = [glyphLayer(pixelMask(role), pack.glyph)]; hot = ROLE_HOT[role].map(v => v / 2); }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rectAt = (p, key, dx = 0, dy = 0) => { const [x, y] = key.split(',').map(Number); p.rect(x * cell + dx, y * cell + dy, cell, cell); };
  if (shadow) {
    const p = new Path2D(), d = Math.max(1, Math.round(cell * 0.5));
    for (const l of layers) { for (const k of l.keys()) rectAt(p, k, d, d); for (const k of outlineOf(l)) rectAt(p, k, d, d); }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fill(p);
  }
  for (const l of layers) {
    const o = new Path2D();
    for (const k of outlineOf(l)) rectAt(o, k);
    ctx.fillStyle = pack.outline; ctx.fill(o);
    const byColor = new Map();
    for (const [k, c] of l) { if (!byColor.has(c)) byColor.set(c, new Path2D()); rectAt(byColor.get(c), k); }
    for (const [c, p] of byColor) { ctx.fillStyle = c; ctx.fill(p); }
  }
  return { canvas, hx: Math.min(S - 1, Math.round(hot[0] * cell)), hy: Math.min(S - 1, Math.round(hot[1] * cell)) };
}
/** Pixel masks for silhouettes that are not roles (the full-size arrow of 1-Bit). */
function pixelMaskOf(id) {
  if (id !== 'arrow') return pixelMask(id);
  if (!ROLE_SHAPES.__arrow) ROLE_SHAPES.__arrow = { build: c => poly(c, ARROW) };
  return pixelMask('__arrow');
}

// Vector pack helpers.
const ringArc = (ctx, cx, cy, r, w, track, color) => {
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = track; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 0.5); ctx.stroke();
  ctx.restore();
};
const qBadge = (ctx, d, color) => {
  paint(ctx, { ...d, finish: 'solid', color: 'custom', custom: color }, c => circle(c, 24, 23.5, 6.2));
  ctx.save(); ctx.fillStyle = '#ffffff'; ctx.font = '700 9px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 24, 24.2); ctx.restore();
};
const blossom = (c, cx, cy, k) => {
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    c.moveTo(cx + Math.cos(a) * 5.4 * k + 4.4 * k * Math.cos(a), cy + Math.sin(a) * 5.4 * k + 4.4 * k * Math.sin(a));
    c.ellipse(cx + Math.cos(a) * 5.4 * k, cy + Math.sin(a) * 5.4 * k, 4.4 * k, 3.3 * k, a, 0, Math.PI * 2);
  }
  c.moveTo(cx + 3 * k, cy); c.arc(cx, cy, 3 * k, 0, Math.PI * 2);
};

const PACKS = [
  { id: 'orchard', name: 'Orchard', kind: 'pixel', outline: '#3b1d1d', arrow: '#ffd27a', accent: '#ffcf4a', mascots: ['apple2', 'cherries'],
    glyph: { fill: '#ff6b5e', hi: '#ffb1a8', shade: '#c43a3a' },
    anim: {
      // Apple bobs; cherries sway on their stem; the blueberry bounces and blinks.
      normal: { frames: 8, rate: 9, mascot: t => ({ m: 'apple2', dy: [0, 0, 0, -1, -1, -1, 0, 0][t] }) },
      appstarting: { frames: 4, rate: 14, mascot: t => ({ m: t % 2 ? 'cherries2' : 'cherries' }) },
      wait: { frames: 12, rate: 7, mascot: t => ({ m: t === 10 ? 'berryblink' : 'berry', dy: [0, -1, -1, 0, 0, -1, -1, 0, 0, 0, 0, 0][t] }) },
    } },
  { id: 'spooky', name: 'Spooky', kind: 'pixel', outline: '#1a1022', arrow: '#f4f1ff', accent: '#b388ff', mascots: ['pumpkin', 'ghost'],
    glyph: { fill: '#ff8c1a', hi: '#ffc078', shade: '#c45a00' } },
  { id: 'pond', name: 'Lily Pond', kind: 'pixel', outline: '#1f3317', arrow: '#ffffff', accent: '#ff8fb1', mascots: ['frog', 'lotus'],
    glyph: { fill: '#7bc950', hi: '#c5f29b', shade: '#4e8f2c' } },
  { id: 'iceberg', name: 'Iceberg', kind: 'pixel', outline: '#14202b', arrow: '#ffffff', accent: '#ffb020', mascots: ['penguin', 'fish'],
    glyph: { fill: '#8fd3ff', hi: '#e6f6ff', shade: '#4aa3d8' } },
  { id: 'sweetheart', name: 'Sweetheart', kind: 'pixel', outline: '#5a1a35', arrow: '#ffffff', accent: '#ff5a8a', mascots: ['heartface', 'heart'],
    glyph: { fill: '#ff8fb8', hi: '#ffd1e3', shade: '#e0517f' } },
  { id: 'onebit', name: '1-Bit', kind: 'pixel', full: true, outline: '#ffffff', arrow: '#000000', accent: '#000000', mascots: ['hourglass', 'hourglass'],
    glyph: { fill: '#000000', hi: '#000000', shade: '#000000' } },
  { id: 'lagoon', name: 'Lagoon', kind: 'vector', base: { shape: 'soft', finish: 'gloss', color: 'custom', custom: '#1fb6d6' },
    colors: { no: '#e53935' },
    roles: {
      wait: { hot: () => [16, 16], draw: (ctx, d) => {
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 4;
          ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * (i / 7);
          paint(ctx, d, c => circle(c, 16 + Math.cos(a) * 9.5, 16 + Math.sin(a) * 9.5, 2.6));
          ctx.restore();
        }
      } },
    } },
  { id: 'clarity', name: 'Clarity', kind: 'vector', base: { shape: 'classic', finish: 'solid', color: 'snow' },
    roles: {
      wait: { hot: () => [16, 16], draw: ctx => {
        ringArc(ctx, 16, 16, 9, 4.6, 'rgba(16,17,20,0.55)', '#ffffff');
        ringArc(ctx, 16, 16, 9, 2.8, 'rgba(255,255,255,0.35)', '#0a84ff');
      } },
      appstarting: { hot: d => POINTERS[d.shape].hot.map(v => v * 0.78), draw: (ctx, d, px) => {
        drawPointer(ctx, d, px, 0.78);
        ringArc(ctx, 24, 24, 4.4, 3.4, 'rgba(16,17,20,0.55)', '#ffffff');
        ringArc(ctx, 24, 24, 4.4, 2, 'rgba(255,255,255,0.4)', '#0a84ff');
      } },
      help: { hot: d => POINTERS[d.shape].hot.map(v => v * 0.78), draw: (ctx, d, px) => { drawPointer(ctx, d, px, 0.78); qBadge(ctx, d, '#0a84ff'); } },
    } },
  { id: 'gummy', name: 'Gummy', kind: 'vector', base: { shape: 'soft', finish: 'jelly', color: 'custom', custom: '#ff4d6d' },
    colors: { help: '#ffc93c', appstarting: '#4cc9f0', wait: '#ff70a6', cross: '#38c172', ibeam: '#9b5de5', no: '#ff4d4d',
      sizens: '#ff9f1c', sizewe: '#ff9f1c', sizenwse: '#ff9f1c', sizenesw: '#ff9f1c', sizeall: '#38c172', up: '#ffc93c', hand: '#ff70a6' } },
  { id: 'sakura', name: 'Sakura', kind: 'vector', base: { shape: 'soft', finish: 'bold', color: 'custom', custom: '#ff8fbf' },
    roles: {
      wait: { hot: () => [16, 16], draw: (ctx, d) => {
        paint(ctx, d, c => blossom(c, 16, 16, 1));
        paint(ctx, { ...d, finish: 'solid', custom: '#ffd36b' }, c => circle(c, 16, 16, 2.2));
      } },
      appstarting: { hot: d => POINTERS[d.shape].hot.map(v => v * 0.78), draw: (ctx, d, px) => {
        drawPointer(ctx, d, px, 0.78);
        paint(ctx, d, c => blossom(c, 24, 24, 0.55));
        paint(ctx, { ...d, finish: 'solid', custom: '#ffd36b' }, c => circle(c, 24, 24, 1.3));
      } },
    } },
];
// ── Meadow Frog ─────────────────────────────────────────────────────────────
const FROG = { outline: '#2d4419', top: '#a3d86c', bottom: '#6aa640', belly: '#f1e6a6', cheek: 'rgba(244, 150, 140, 0.85)', pupil: '#1f2a14',
  cream: '#f0e2b6', creamEdge: '#5a4524', leafTop: '#b2dc78', leafBottom: '#6fae3f', pad: '#4f9a3a', padLight: '#79c25c' };
const frogShadow = (ctx, on) => {
  if (on) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 1.4 * ctx.__scale; ctx.shadowOffsetY = 0.8 * ctx.__scale; }
  else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
};
/** Outline-then-fill for a set of parts, so overlapping parts read as one body. */
function inkParts(ctx, parts, outline, width, shadow) {
  const paths = parts.map(([build, fill]) => { const p = new Path2D(); build(p); return [p, fill]; });
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = outline; ctx.lineWidth = width;
  frogShadow(ctx, shadow);
  for (const [p] of paths) ctx.stroke(p);
  frogShadow(ctx, false);
  for (const [p, fill] of paths) { ctx.fillStyle = fill; ctx.fill(p); }
  ctx.restore();
}
const ell = (x, y, rx, ry, rot = 0) => c => { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };

// The realistic frog (animations/_engine/frog3d.js), shared with the Frog animation.
let frogModel = null;
const frog3d = () => {
  if (!window.Frog3D) throw new Error('Frog3D is not loaded (animations/_engine/frog3d.js)');
  return frogModel || (frogModel = window.Frog3D.create(17, 'leopard'));
};
/** The 3D frog at (x, y) in grid units, facing `rot` (0 = up), at cursor scale. */
const cursorFrog = (ctx, x, y, scale, pose, shadow) => window.Frog3D.draw(ctx, frog3d(), { x, y, scale, shadow, ...pose });
/** A lily pad seen from above: a notched disc with radiating veins. */
function lilyPad(ctx, cx, cy, r, notch, shadow) {
  ctx.save();
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 1.6 * ctx.__scale; ctx.shadowOffsetY = 0.8 * ctx.__scale; }
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#8fcf62'); g.addColorStop(0.6, '#4f9a3a'); g.addColorStop(1, '#2f6a24');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, notch + 0.22, notch - 0.22 + Math.PI * 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(30, 60, 20, 0.6)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, notch + 0.22, notch - 0.22 + Math.PI * 2); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 235, 150, 0.4)'; ctx.lineWidth = 0.35;
  for (let i = 1; i < 12; i++) {
    const ang = notch + 0.22 + (i / 12) * (Math.PI * 2 - 0.44);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r * 0.92, cy + Math.sin(ang) * r * 0.92); ctx.stroke();
  }
  ctx.restore();
}
/** A small open book seen from above, at (x, y) turned by rot. */
function openBook(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#7a4a22'; ctx.fillRect(-4.4, -2.9, 8.8, 5.8);
  ctx.fillStyle = '#f6eedb'; ctx.fillRect(-4, -2.5, 3.8, 5); ctx.fillRect(0.2, -2.5, 3.8, 5);
  ctx.strokeStyle = 'rgba(90, 70, 40, 0.55)'; ctx.lineWidth = 0.28;
  for (const yy of [-1.5, -0.5, 0.5, 1.5]) { ctx.beginPath(); ctx.moveTo(-3.5, yy); ctx.lineTo(-0.7, yy); ctx.moveTo(0.7, yy); ctx.lineTo(3.5, yy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(60, 40, 20, 0.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(0, -2.6); ctx.lineTo(0, 2.6); ctx.stroke();
  ctx.restore();
}
/** Leaf-shaped arrow with its tip at (3, 3). */
function drawLeafArrow(ctx, shadow) {
  const g = ctx.createLinearGradient(3, 3, 14, 14);
  g.addColorStop(0, FROG.leafTop); g.addColorStop(1, FROG.leafBottom);
  inkParts(ctx, [[c => { c.moveTo(3, 3); c.bezierCurveTo(10.5, 3.4, 15, 7.6, 13.4, 12.6); c.bezierCurveTo(8.6, 14.4, 3.4, 10.4, 3, 3); c.closePath(); }, g]], FROG.outline, 1.4, shadow);
  ctx.save(); ctx.strokeStyle = FROG.outline; ctx.lineCap = 'round';
  ctx.lineWidth = 0.55; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(12.2, 12.2); ctx.stroke();
  ctx.lineWidth = 0.35; ctx.globalAlpha = 0.45;
  for (const t of [0.3, 0.5, 0.7]) {
    const px = 4 + 8.2 * t, py = 4 + 8.2 * t;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 2.6, py - 1.2); ctx.moveTo(px, py); ctx.lineTo(px - 1.2, py + 2.6); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(12.8, 12.8); ctx.lineTo(15.2, 15.2); ctx.stroke();
  ctx.restore();
}
/** Thought bubble whose dots fill in one by one. */
function drawThought(ctx, n) {
  inkParts(ctx, [
    [ell(24.2, 7.6, 4.6, 3.4), '#ffffff'], [ell(21.2, 8.4, 2.6, 2.2), '#ffffff'], [ell(27.4, 8.6, 2.4, 2.1), '#ffffff'],
    [ell(19.4, 13, 1.05, 1.05), '#ffffff'], [ell(18, 15.4, 0.65, 0.65), '#ffffff'],
  ], FROG.outline, 1, false);
  ctx.fillStyle = FROG.outline;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(22.2 + i * 2, 8.1, 0.65, 0, Math.PI * 2); ctx.fill(); }
}
const creamGlyph = id => ({
  hot: () => ROLE_HOT[id],
  draw: (ctx, d) => {
    const r = ROLE_SHAPES[id];
    if (r.stroke) {
      const p = new Path2D(); r.build(p);
      ctx.save(); ctx.lineCap = 'round';
      frogShadow(ctx, d.shadow); ctx.strokeStyle = FROG.creamEdge; ctx.lineWidth = r.stroke + 1.8; ctx.stroke(p); frogShadow(ctx, false);
      ctx.strokeStyle = FROG.cream; ctx.lineWidth = r.stroke; ctx.stroke(p);
      ctx.restore();
      if (r.dot) inkParts(ctx, [[r.dot, FROG.cream]], FROG.creamEdge, 1.4, false);
    } else {
      inkParts(ctx, [[r.build, FROG.cream]], FROG.creamEdge, 1.8, d.shadow);
    }
  },
});

PACKS.push({ id: 'meadow', name: 'Meadow Frog', kind: 'vector', base: {},
  roles: {
    ...Object.fromEntries(Object.keys(ROLE_HOT).map(id => [id, creamGlyph(id)])),
    // The frog sits facing the arrow tip (up-left) and breathes.
    normal: { frames: 12, rate: 8, hot: () => [3, 3], draw: (ctx, d, px, t = 0) => {
      cursorFrog(ctx, 21.2, 21, 0.42, { rot: -Math.PI / 4, breath: Math.sin(t * Math.PI * 2), blink: t > 0.84 && t < 0.92 ? 1 : 0 }, d.shadow);
      drawLeafArrow(ctx, d.shadow);
    } },
    // Waves a front leg while the system works.
    appstarting: { frames: 8, rate: 7, hot: () => [3, 3], draw: (ctx, d, px, t = 0) => {
      cursorFrog(ctx, 21.2, 21, 0.42, { rot: -Math.PI / 4, wave: (1 - Math.cos(t * Math.PI * 2)) / 2 }, d.shadow);
      drawLeafArrow(ctx, d.shadow);
    } },
    // Reads a little book, pen tapping, while a thought bubble fills with dots.
    help: { frames: 16, rate: 7, hot: () => [3, 3], draw: (ctx, d, px, t = 0) => {
      drawThought(ctx, Math.floor(t * 4) % 4);
      openBook(ctx, 15.6, 20.2, -Math.PI / 4);
      cursorFrog(ctx, 21.4, 25.2, 0.38, { rot: -Math.PI / 4, fore: 0.6, blink: t > 0.45 && t < 0.52 ? 1 : 0 }, d.shadow);
      ctx.save(); ctx.translate(13.4 + Math.sin(t * Math.PI * 4) * 0.5, 23.4); ctx.rotate(-0.4 + Math.sin(t * Math.PI * 4) * 0.2);
      ctx.strokeStyle = '#1f2547'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -3.4); ctx.lineTo(0, 2.4); ctx.stroke();
      ctx.fillStyle = '#e8c270'; ctx.beginPath(); ctx.moveTo(-0.45, 2.3); ctx.lineTo(0.45, 2.3); ctx.lineTo(0, 3.5); ctx.closePath(); ctx.fill();
      ctx.restore();
      drawLeafArrow(ctx, d.shadow);
    } },
    // Turns all the way round on a lily pad.
    wait: { frames: 16, rate: 4, hot: () => [16, 16], draw: (ctx, d, px, t = 0) => {
      lilyPad(ctx, 16, 16.6, 13, 0.6, d.shadow);
      cursorFrog(ctx, 16, 16.6, 0.5, { rot: t * Math.PI * 2, breath: Math.sin(t * Math.PI * 4) * 0.5 }, true);
    } },
    ibeam: { hot: () => [16, 16], draw: (ctx, d) => {
      // A sprouting seedling: stem with leaves at the top and the bottom.
      const leaf = (x, y, rot) => ell(x, y, 3.3, 1.7, rot);
      inkParts(ctx, [
        [c => c.roundRect(15.1, 6, 1.8, 20, 0.9), FROG.leafBottom],
        [leaf(12.6, 5.6, 0.45), FROG.leafTop], [leaf(19.4, 5.6, -0.45), FROG.leafTop],
        [leaf(12.6, 26.4, -0.45), FROG.leafTop], [leaf(19.4, 26.4, 0.45), FROG.leafTop],
      ], FROG.outline, 1.2, d.shadow);
    } },
  } });

const PACK_MAP = Object.fromEntries(PACKS.map(p => [p.id, p]));

/**
 * Renders one role of a design onto a fresh canvas of `size`×`size` px.
 * Returns { canvas, hx, hy } with the hotspot in pixels.
 */
/** How many frames a role has in this design, and its delay per frame (1/60 s). */
function animOf(d, roleId) {
  const pack = d.pack ? PACK_MAP[d.pack] : null;
  if (!pack) return { frames: 1, rate: 0 };
  const a = pack.kind === 'pixel' ? pack.anim && pack.anim[roleId] : pack.roles && pack.roles[roleId];
  return a && a.frames > 1 ? { frames: a.frames, rate: a.rate } : { frames: 1, rate: 0 };
}

/** Every frame of a role: { frames: [canvas…], hx, hy, rate }. */
function renderRoleFrames(design, roleId, size) {
  const d = normalize(design);
  const { frames, rate } = animOf(d, roleId);
  const out = [];
  let hot = null;
  for (let t = 0; t < frames; t++) {
    const r = renderRole(d, roleId, size, t, frames);
    out.push(r.canvas);
    hot = hot || [r.hx, r.hy];
  }
  return { frames: out, hx: hot[0], hy: hot[1], rate };
}

function renderRole(design, roleId, size, frame = 0, frameCount = 1) {
  const d = normalize(design);
  const pack = d.pack ? PACK_MAP[d.pack] : null;
  if (pack && pack.kind === 'pixel') return renderPixelRole(pack, roleId, size || d.size, d.shadow, frame);
  const px = { size: size || d.size };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px.size;
  const ctx = canvas.getContext('2d');
  const s = px.size / GRID;
  ctx.__scale = s;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  // A vector pack restyles the design per role (base look, role colour, custom art).
  let dd = d, g = GLYPHS[roleId];
  if (pack) {
    const own = pack.colors && pack.colors[roleId];
    dd = { ...d, ...pack.base, ...(own ? { color: 'custom', custom: own } : {}) };
    if (pack.roles && pack.roles[roleId]) g = pack.roles[roleId];
  }
  g.draw(ctx, dd, px, frameCount > 1 ? frame / frameCount : 0);
  const [hx, hy] = g.hot(dd);
  return {
    canvas,
    hx: Math.min(px.size - 1, Math.max(0, Math.round(hx * s))),
    hy: Math.min(px.size - 1, Math.max(0, Math.round(hy * s))),
  };
}

/** A pattern or flag as a w×h swatch image (data URL), for pickers. */
function renderFill(colorId, w, h, scale = 2) {
  const { art } = fillOf({ color: colorId });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  art.draw(ctx, [0, 0, w, h]);
  return canvas.toDataURL('image/png');
}

/** CSS `cursor` value showing this role (for live previews inside the app). */
function cssCursor(design, roleId, fallback = 'auto') {
  const { canvas, hx, hy } = renderRole(design, roleId);
  return `url(${canvas.toDataURL('image/png')}) ${hx} ${hy}, ${fallback}`;
}

/** Every role as raw RGBA, ready to be written as Windows cursor files. */
function buildSet(design) {
  const d = normalize(design);
  const raw = c => new Uint8Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
  return ROLES.map(r => {
    const { frames, hx, hy, rate } = renderRoleFrames(d, r.id);
    const img = { role: r.id, w: frames[0].width, h: frames[0].height, hx, hy, rgba: raw(frames[0]) };
    if (frames.length > 1) { img.frames = frames.map(raw); img.rate = rate; }
    return img;
  });
}

window.CursorKit = {
  COLORS, PATTERNS, FLAGS, SHAPES, FINISHES, PRESETS, PACKS, ROLES, SIZES, DEFAULT_DESIGN,
  normalize, renderRole, renderRoleFrames, animOf, renderFill, cssCursor, buildSet, stopsOf,
};
})();
