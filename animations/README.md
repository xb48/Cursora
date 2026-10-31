# Cursora animations (maintainers only)

Users can't add, import or remove animations. The app only loads the folders
in this directory, which ship with Cursora. To add a whip, add a folder here
and release a new version.

```
animations/
  _engine/            shared engines (no manifest, so not listed)
    whip-engine.js    rope physics, crack detection, sound, effects, style kit
    prop-engine.js    input, trigger gating, synth sound, effects for props
    quadruped.js      side-view legged locomotion rig (cat, dog)
    sounds/           crack sounds A–E.mp3
  whip/ neon/ aurora/ volt/ inferno/ heritage/          whips (rope engine)
  gavel/ overdrive/ sentinel/ liquid/ afterburner/      props (prop engine)
  singularity/ tesseract/ koi/ stormcloud/ deadline/ sumi/
  prism/ gyroscope/ paperplane/
  cat/ shark/ dog/ octopus/ bees/ jellyfish/ frog/      animals (prop engine)
    frog3d.js (in _engine) is the realistic frog renderer, shared with the
    Meadow Frog cursor pack in app/cursors.js
    manifest.json     metadata + Studio settings
    overlay.html      boilerplate: loads style.js, then ../_engine/whip-engine.js
    style.js          the whip's look and crack effects
    thumbnail.svg     card art (16:10)
```

## Adding a whip

1. Copy an existing whip folder and give it a new `id` (letters, digits, `-`, `_`).
2. Edit `style.js` (see below) and `thumbnail.svg`.
3. List every setting in `manifest.json`. Each setting `key` must be a physics
   number from `BASE_DEFAULTS` in `whip-engine.js` or a key in your style's
   `look` object, with a matching type. Other keys are ignored.
4. Run the app and try the whip in the Studio playground.

## style.js

```js
window.WHIP_STYLE = {
  physics: { segments: 30, lineWidthHandle: 6 }, // overrides BASE_DEFAULTS
  look: { colorA: '#00e5ff', glow: 0.8, particles: true }, // non-physics settings
  sounds: ['A.mp3', 'C.mp3'],   // optional, from _engine/sounds
  pitch: [1.1, 1.25],           // optional random playback-rate range
  draw(ctx, whip, kit) {},      // optional; without it the classic whip is drawn
  tick(whip, kit, tipSpeed) {}, // optional, once per physics frame
  onCrack(tip, kit) {},         // optional, on every crack
};
```

`whip` is the array of rope points (`x`, `y`, previous `px`, `py`), from the
handle to the tip. `ctx` is already saved, with round caps and joins. The kit
provides:

| kit member | purpose |
| --- | --- |
| `P`, `LOOK`, `time`, `W`, `H` | live physics values, look values, seconds, canvas size |
| `path(ctx, pts, from?, to?)` | starts a smooth path through the points |
| `links(ctx, pts, (i, t) => …)` | strokes each link; set width/color in the callback |
| `width(i, pts)` | tapered width of link `i`, including the thicker handle |
| `mix(hexStops, t, alpha?)` | color along gradient stops |
| `grip(ctx, pts, { body, accent, cap })` | draws a handle with bands and a pommel |
| `burst({...})`, `ring({...})`, `effect(fn)` | sparks/dots, shockwave rings, custom per-frame effects |
| `lerp`, `clamp`, `rand`, `pick`, `bezier` | helpers |

A `look.particles: false` setting turns off `burst`, `ring` and `effect`.

Keep helpers inside an IIFE (see `volt/style.js`). Top-level names share one
scope with the engine, and a duplicate `let`/`const` is a SyntaxError. Never
declare `bridge` either: the overlay window exposes `window.bridge` as a
locked global.

## Props (non-rope animations)

Every non-whip animation (The Gavel through Sumi) runs on
`_engine/prop-engine.js`. Their `overlay.html` loads that engine instead of the
whip engine, and their `style.js` defines `window.PROP`:

```js
(() => {                                  // keep helpers private (see above)
window.PROP = {
  defaults: { size: 1, threshold: 30, accent: '#ff7a1a' }, // every setting key
  spawn(x, y, kit) { return { x, y }; },  // your state object
  update(state, kit) {                    // one frame; kit.mouse = {x, y, vx, vy, speed}
    if (/* your trigger */ false) kit.fire(state.x, state.y);
  },
  draw(ctx, state, kit) {},
  gone(state, kit) {},                    // optional: true once a dropped prop is off-screen
  onFire(state, x, y, kit) {},            // optional: effects (kit.burst / ring / effect)
  sound(kit) {},                          // optional: kit.sound.tone({...}) / kit.sound.noise({...})
};
})();
```

`kit.fire()` applies the cooldown and the post-spawn grace period, plays the
sound and records the trigger in History. It returns `false` when gated. While
`kit.dropping` is true, animate the prop falling off-screen. `volume` and
`particles` always exist in `kit.LOOK`.

Add `"hints": ["Move to …", "… to fire", "Click to drop"]` to the manifest for
the Studio playground. The first word of each hint is shown bold.

When you set a drop shadow, reset `shadowColor` *and* `shadowOffsetX/Y`
afterwards. A later glow that only changes `shadowColor` otherwise inherits
the offset and renders an offset copy.

## Host bridge

The engine talks to the app through `window.bridge`:
`onSpawn`, `onDrop`, `onSettings`, `trigger()`, `hide()`.

Inside the Studio playground the page runs in an iframe with `?preview`, and
the engine uses `postMessage` instead. A style never calls the bridge itself.

## Legged animals (quadruped rig)

`cat` and `dog` load `_engine/quadruped.js` before their `style.js`. Create a
rig with `OpenWhipQuadruped.create(SPEC, x, ground, dir, size)` and call
`update(rig, { targetX, faceX, maxSpeed, ground })` once per frame. The rig
handles:

- planted feet that never slide, with arcs to predicted footholds
- walk / trot / gallop by speed, with stride and cadence scaling together
- two-bone IK legs (hind knee forward, fore elbow back)
- sitting, crouching, deliberate turning and leaps (`takeOff` / `land`)

Draw inside `OpenWhipQuadruped.frame(rig, ctx, fn)` using
`OpenWhipQuadruped.local(rig, point)`, so the animal faces right and turns
automatically. Every leg must be able to reach its stance foothold; the rig
derives reach from the `SPEC` geometry.

## Trigger design rules

- Gentle movement (about 4 px/frame) must never fire.
- A threshold trigger needs re-arming (hysteresis, or a rising edge on a value
  that falls back between gestures). If `kit.fire()` returns `false` (cooldown
  or spawn grace), stay armed. Otherwise a value that never drops below the
  threshold locks the trigger out. See `tesseract/style.js`.
- `kit.shade()` returns an `rgb()` string; pass only hex colors to
  `kit.rgba()` and `kit.mix()`.
