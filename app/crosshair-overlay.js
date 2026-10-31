// Draws the crosshair in the overlay window, in physical pixels so 1 px lines stay 1 px.
// Animated designs redraw every frame; still ones only when something changes.
'use strict';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let design = CrosshairKit.normalize(null);
let frame = 0;

function draw(t = 0) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // The centre pixel's top-left corner, on whole device pixels.
  CrosshairKit.render(ctx, design, Math.floor(w / 2), Math.floor(h / 2), 1, t);
}

function tick(now) {
  frame = 0;
  draw(now);
  if (CrosshairKit.isAnimated(design)) frame = requestAnimationFrame(tick);
}

/** Redraws now and keeps animating while the design needs it. */
function refresh() {
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  if (CrosshairKit.isAnimated(design)) frame = requestAnimationFrame(tick);
  else draw();
}

window.crossBridge.onDesign(d => { design = CrosshairKit.normalize(d); refresh(); });
window.addEventListener('resize', refresh);
// Display scaling can change while the window stays the same size in DIPs.
matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener('change', refresh);
refresh();
