'use client';

// A live crosshair playground running Cursora's real crosshair engine
// (app/crosshairs.js, copied by the sync script) on a game-like scene.
import { useEffect, useMemo, useRef, useState } from 'react';
import { asset } from '../lib/site';
import Icon from './Icon';

const SHOWCASE = ['vortex', 'compassrose', 'synthwave', 'bracketlock', 'aurora', 'squad', 'gem', 'heartbeat', 'hexring', 'shuriken', 'disco', 'classic'];

let kitPromise = null;
function loadKit() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.CrosshairKit) return Promise.resolve(window.CrosshairKit);
  kitPromise = kitPromise || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = asset('generated/kit/crosshairs.js');
    s.async = true;
    s.onload = () => (window.CrosshairKit ? resolve(window.CrosshairKit) : reject(new Error('crosshair engine missing')));
    s.onerror = () => reject(new Error('crosshair engine failed to load'));
    document.head.appendChild(s);
  });
  return kitPromise;
}

/** The scene behind the crosshair: dusk sky, a skyline and hazy ground. */
function drawScene(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d1b2e'); sky.addColorStop(0.5, '#2a4766'); sky.addColorStop(0.66, '#c9a77e'); sky.addColorStop(0.67, '#3a3f45'); sky.addColorStop(1, '#14171c');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.72, h * 0.62, 0, w * 0.72, h * 0.62, w * 0.35);
  sun.addColorStop(0, 'rgba(255, 220, 170, 0.5)'); sun.addColorStop(1, 'rgba(255, 220, 170, 0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const skyline = (seed, base, minH, maxH, color) => {
    let s = seed;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    g.fillStyle = color;
    for (let x = -20; x < w + 20;) {
      const bw = (40 + rnd() * 90) * (w / 900), bh = (minH + rnd() * (maxH - minH)) * (h / 420);
      g.fillRect(x, base - bh, bw - 4, bh);
      x += bw;
    }
  };
  skyline(3, h * 0.67, 70, 200, 'rgba(40, 58, 80, 0.85)');
  skyline(11, h * 0.67, 30, 120, 'rgba(22, 30, 42, 0.95)');
  g.fillStyle = 'rgba(255, 210, 140, 0.25)';
  for (let i = 0; i < 30; i++) g.fillRect(((i * 173 + 60) % w), h * (0.52 + (i % 5) * 0.025), 4 * (w / 900), 6 * (h / 420));
}

export default function CrosshairPlayground() {
  const canvasRef = useRef(null);
  const [kit, setKit] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tag, setTag] = useState('All');
  const [current, setCurrent] = useState(SHOWCASE[0]);
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadKit().then(setKit, () => setFailed(true)); }, []);

  const presets = kit ? kit.PRESETS : [];
  const tags = useMemo(() => ['All', ...new Set(presets.map(p => p.tags))], [presets]);
  const shown = tag === 'All' ? presets : presets.filter(p => p.tags === tag);
  const preset = presets.find(p => p.id === current) || presets[0];

  // Cycle through a showcase until the visitor picks one.
  useEffect(() => {
    if (!kit || touched) return undefined;
    const t = setInterval(() => setCurrent(c => SHOWCASE[(SHOWCASE.indexOf(c) + 1) % SHOWCASE.length]), 1600);
    return () => clearInterval(t);
  }, [kit, touched]);

  // Draw (and keep animating animated designs).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!kit || !preset || !canvas) return undefined;
    let frame = 0;
    const draw = now => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      drawScene(g, w, h);
      // A whole-pixel zoom keeps every line crisp, as in the app's editor.
      const zoom = Math.max(1, Math.min(Math.round(3 * dpr), Math.floor((h * 0.42) / (kit.extent(preset.design) + 2))));
      kit.render(g, preset.design, Math.floor(w / 2), Math.floor(h / 2), zoom, now);
      if (kit.isAnimated(preset.design)) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); };
  }, [kit, preset]);

  const pick = id => { setTouched(true); setCurrent(id); setCopied(false); };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(kit.encode(preset.design));
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch { setCopied(false); }
  };

  return (
    <div className="playground">
      <div className="pg-stage">
        <canvas ref={canvasRef} aria-label={preset ? `${preset.name} crosshair preview` : 'Crosshair preview'} role="img" />
        {preset && (
          <div className="pg-caption">
            <span className="pg-dot" />
            <b>{preset.name}</b>
            <span>{preset.tags}{kit && kit.isAnimated(preset.design) && preset.tags !== 'Animated' ? ' · animated' : ''}</span>
          </div>
        )}
        {!kit && <div className="pg-loading">{failed ? 'The preview could not load.' : 'Loading the crosshair engine…'}</div>}
      </div>
      <div className="pg-panel">
        <div className="pg-tabs" role="tablist" aria-label="Crosshair categories">
          {tags.map(t => (
            <button key={t} role="tab" aria-selected={tag === t} className={tag === t ? 'on' : ''} onClick={() => { setTag(t); setTouched(true); }}>{t}</button>
          ))}
        </div>
        <div className="pg-list">
          {shown.map(p => (
            <button key={p.id} className={p.id === (preset && preset.id) ? 'on' : ''} onClick={() => pick(p.id)}>{p.name}</button>
          ))}
        </div>
        <div className="pg-actions">
          <button className="btn btn-ghost btn-sm" onClick={copyCode} disabled={!kit}>
            <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy share code'}
          </button>
          <p>{copied ? 'Paste it in Cursora → Crosshairs → Import.' : 'Every preset here is the real one from the app.'}</p>
        </div>
      </div>
    </div>
  );
}
