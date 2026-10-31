// Interface sounds: a soft tick on hover, a muted tap on click, and a short
// two-note chime when an option is chosen (rising for on, falling for off).
// Everything is synthesized with Web Audio, so there are no files to load.
(() => {
const MASTER = 0.9;           // overall level; the voices below are already quiet
const HOVER_GAP_MS = 45;      // at most one hover tick per this interval

/**
 * Schedules one sound on `ctx` into `dest` at time `t`.
 * Kept separate from the live context so it can be rendered offline for tests.
 */
function voice(ctx, dest, kind, t) {
  const tone = (type, f0, f1, start, dur, peak) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t + start);
    o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
    g.gain.setValueAtTime(0, t + start);
    g.gain.linearRampToValueAtTime(peak, t + start + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
    o.connect(g).connect(dest);
    o.start(t + start);
    o.stop(t + start + dur + 0.02);
  };
  const tick = (freq, start, dur, peak) => {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Fixed-seed noise, so the transient sounds identical every time.
    let seed = 0x2545f491;
    for (let i = 0; i < len; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 4294967296 * 2 - 1) * (1 - i / len) ** 3;
    }
    const src = ctx.createBufferSource();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = buf;
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    g.gain.value = peak;
    src.connect(bp).connect(g).connect(dest);
    src.start(t + start);
  };

  switch (kind) {
    case 'hover':
      tone('sine', 1760, 1560, 0, 0.035, 0.035);
      break;
    case 'click':
      tone('sine', 560, 380, 0, 0.06, 0.11);
      tick(3200, 0, 0.012, 0.05);
      break;
    case 'on':
      tone('sine', 740, 740, 0, 0.07, 0.06);
      tone('sine', 1109, 1109, 0.05, 0.09, 0.06);
      break;
    case 'off':
      tone('sine', 1109, 1109, 0, 0.07, 0.05);
      tone('sine', 740, 740, 0.05, 0.09, 0.05);
      break;
    default:
      throw new Error(`unknown interface sound: ${kind}`);
  }
}

let ctx = null;
let out = null;
let enabled = true;
let lastHover = 0;

function output() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // A gentle limiter keeps quick bursts (fast clicking) from stacking up.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    out = ctx.createGain();
    out.gain.value = MASTER;
    out.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return out;
}

function play(kind) {
  if (!enabled) return;
  try {
    const dest = output();
    if (dest) voice(ctx, dest, kind, ctx.currentTime + 0.005);
  } catch (e) {
    console.warn('cursora: interface sound failed:', e && e.message);
  }
}

window.UISound = {
  voice,
  setEnabled(on) { enabled = !!on; },
  get enabled() { return enabled; },
  hover() {
    const now = performance.now();
    if (now - lastHover < HOVER_GAP_MS) return;
    lastHover = now;
    play('hover');
  },
  click: () => play('click'),
  choose: (on = true) => play(on ? 'on' : 'off'),
};
})();
