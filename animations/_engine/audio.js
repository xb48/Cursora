// ══════════════════════════════════════════════════════════════════════════════
//  Cursora sound bank, shared by every animation engine.
//
//  Each sound, either a recorded sample or a synth recipe, is decoded or
//  rendered once into an AudioBuffer and loudness-matched, so every animation
//  plays at the same perceived level. Playback runs through one master
//  limiter, so stacked sounds never clip. Volume is applied at play time.
// ══════════════════════════════════════════════════════════════════════════════
(() => {
const RATE = 44100;
const TARGET_RMS = 0.2;      // loudness every sound is matched to
const PEAK_CEILING = 0.79;   // −2 dBFS per sound: single sounds never touch the limiter
const LIMIT_DB = -2;         // limiter threshold, at the ceiling: only overlaps are limited
const GATE = 0.02;           // ignore near-silence (tails) when measuring loudness
const MAX_VOICES = 8;

/** Gain that brings a buffer to the target loudness without crossing the ceiling. */
function matchGain(buffer) {
  let peak = 0, sum = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a > GATE) { sum += d[i] * d[i]; n++; }
    }
  }
  if (!peak) return 1;
  const rms = n ? Math.sqrt(sum / n) : peak;
  return Math.min(TARGET_RMS / rms, PEAK_CEILING / peak);
}

/** Transfer curve that is linear up to 0.9, then bends smoothly so output stays below 1. */
function softClipCurve() {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09));
  }
  return curve;
}

/** Synth voices for recipes: tone() and noise() render into `ctx`. */
function voice(ctx) {
  const envelope = (t0, dur, gain) => {
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    return amp;
  };
  return {
    /** Oscillator sweep from `freq` to `to` Hz with a fast attack and exponential decay. */
    tone({ type = 'sine', freq = 440, to = freq, dur = 0.2, gain = 0.3, delay = 0 }) {
      const t0 = delay;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      osc.connect(envelope(t0, dur, gain)).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    /** Filtered white-noise burst; the filter cutoff sweeps from `freq` to `to`. */
    noise({ dur = 0.2, gain = 0.3, filter = 'lowpass', freq = 1200, to = freq, q = 1, delay = 0 }) {
      const t0 = delay;
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(RATE * dur)), RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const biquad = ctx.createBiquadFilter();
      biquad.type = filter;
      biquad.Q.value = q;
      biquad.frequency.setValueAtTime(freq, t0);
      biquad.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      src.connect(biquad).connect(envelope(t0, dur, gain)).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },
  };
}

/** Length in seconds a recipe needs, found by running it against a probe voice. */
function recipeLength(recipe) {
  let end = 0;
  const probe = o => { end = Math.max(end, (o.delay || 0) + (o.dur ?? 0.2)); };
  recipe({ tone: probe, noise: probe });
  return end + 0.05;
}

window.OpenWhipAudio = {
  /** A sound bank whose playback level follows getVolume() (0–1). */
  create(getVolume) {
    let ctx = null;
    let limiter = null;
    const sounds = new Map();   // name -> { buffer, gain }
    const voices = [];

    function context() {
      if (!ctx) {
        try { ctx = new AudioContext({ latencyHint: 'interactive' }); } catch { return null; }
        // Master bus: limiter for overlapping sounds, then a soft clipper as
        // a hard guarantee (the compressor alone can overshoot on fast attacks).
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = LIMIT_DB;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;
        const clipper = ctx.createWaveShaper();
        clipper.curve = softClipCurve();
        limiter.connect(clipper).connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    const store = (name, buffer) => sounds.set(name, { buffer, gain: matchGain(buffer) });
    const fail = what => e => console.warn(`openwhip: sound ${what} failed to load:`, e && e.message);

    return {
      /** Decode a recorded sample from a URL. */
      sample(name, url) {
        return fetch(url)
          .then(r => r.arrayBuffer())
          .then(bytes => new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes))
          .then(buffer => store(name, buffer))
          .catch(fail(url));
      },

      /** Render a synth recipe, recipe(voice) calling voice.tone/noise, once. */
      synth(name, recipe) {
        try {
          const off = new OfflineAudioContext(1, Math.ceil(recipeLength(recipe) * RATE), RATE);
          recipe(voice(off));
          return off.startRendering().then(buffer => store(name, buffer)).catch(fail(name));
        } catch (e) {
          fail(name)(e);
          return Promise.resolve();
        }
      },

      /** Start the audio device early so the first trigger plays without delay. */
      warm() { context(); },

      has(name) { return sounds.has(name); },

      /** Play a loaded sound; `gain` is relative to its matched level. */
      play(name, { gain = 1, rate = 1 } = {}) {
        const s = sounds.get(name);
        const volume = getVolume();
        if (!s || !(volume > 0)) return false;
        const a = context();
        if (!a) return false;
        while (voices.length >= MAX_VOICES) {
          try { voices.shift().stop(); } catch { /* already stopped */ }
        }
        const src = a.createBufferSource();
        src.buffer = s.buffer;
        src.playbackRate.value = rate;
        const amp = a.createGain();
        amp.gain.value = s.gain * gain * volume;
        src.connect(amp).connect(limiter);
        src.onended = () => {
          const i = voices.indexOf(src);
          if (i >= 0) voices.splice(i, 1);
        };
        voices.push(src);
        src.start();
        return true;
      },
    };
  },
};
})();
