import info from '../lib/generated.json';
import { LINKS, asset } from '../lib/site';
import Icon from '../components/Icon';
import CrosshairPlayground from '../components/CrosshairPlayground';

const STATS = [
  { value: String(info.animations.length), label: 'animations' },
  { value: '11', label: 'cursor packs' },
  { value: String(info.presetCount), label: 'crosshair presets' },
  { value: '14', label: 'Windows cursors restyled' },
];

const FEATURES = [
  {
    id: 'animations', kicker: 'Animations', title: 'Bring your desktop to life',
    text: 'Whips, props and companions that follow your pointer and react when you flick it. Each one has its own trigger, sound and effect.',
    points: ['Six whips, from The Whip to Inferno', 'Props like Singularity, Tesseract and Stormcloud', 'Companions, including a realistic 3D frog'],
    shot: 'animations', alt: 'The Animations page with the Inferno whip in the live preview',
  },
  {
    id: 'studio', kicker: 'Studio', title: 'Tune every detail',
    text: 'A live playground for every animation. Change the physics, look and sound, and try it before taking it to your desktop.',
    points: ['Physics, look and sound settings', 'Live preview that follows your mouse', 'Restore defaults any time'],
    shot: 'studio', alt: 'The Studio playground with the Neon Lash whip',
  },
  {
    id: 'cursors', kicker: 'Cursors', title: 'Restyle your Windows pointer',
    text: 'Change all 14 Windows cursors at once with a themed pack, a designer preset or a design of your own.',
    points: ['11 themed packs, some animated', '12 shapes, 6 finishes, any colour, patterns and 38 flags', 'Windows gets its own cursors back when you quit'],
    shot: 'cursors', alt: 'The Cursors page with themed cursor packs',
  },
  {
    id: 'crosshair-editor', kicker: 'Crosshair Editor', title: 'Build the crosshair you want',
    text: 'Start from scratch or from any preset, then share it with a single code.',
    points: ['Solid, two-tone, gradient and spectrum colours', 'Pulse, breathe, spin and rainbow animations', 'Outlines, glow, drop shadows, chevrons and more'],
    shot: 'editor', alt: 'The Crosshair Editor building a two-tone crosshair',
  },
];

const MORE = [
  { icon: 'mouse', title: 'Click-through overlays', text: 'Animations and crosshairs never get in the way. Clicks go straight to your apps and games.' },
  { icon: 'keyboard', title: 'Global hotkeys', text: 'Ctrl+Alt+W summons the animation and Ctrl+Alt+X toggles the crosshair, from anywhere.' },
  { icon: 'refresh', title: 'Automatic updates', text: 'New versions download in the background and install when Cursora restarts.' },
  { icon: 'moon', title: 'Dark and light themes', text: 'A modern interface that follows your Windows theme.' },
  { icon: 'tray', title: 'Lives in the tray', text: 'Lightweight, starts with Windows if you want, and stays out of your way.' },
  { icon: 'discord', title: 'Discord account link', text: 'Optionally show your Discord profile in Settings. You sign in on Discord itself.' },
];

const STEPS = [
  { title: 'Download', text: 'Get the installer from GitHub Releases. It installs for your account, with no admin prompt.' },
  { title: 'Pick your style', text: 'Choose an animation, a cursor pack and a crosshair, or design your own.' },
  { title: 'Use it anywhere', text: 'Press a hotkey or click the tray icon. Cursora works over any app.' },
];

const FAQ = [
  { q: 'Is Cursora free?', a: 'Yes. Cursora is free to download and use, and its source code is on GitHub.' },
  { q: 'Which versions of Windows does it support?', a: 'Windows 10 and Windows 11.' },
  { q: 'Will the crosshair show in my games?', a: 'It shows over windowed and borderless-fullscreen games. Games in exclusive fullscreen cover every other window, so switch them to borderless.' },
  { q: 'Why does Windows show a SmartScreen warning?', a: 'Cursora is new and not yet code-signed, so Windows may warn on the first install. Choose More info, then Run anyway.' },
  { q: 'Does it change my cursors permanently?', a: 'No. Your Cursora cursors apply while the app runs, and Windows gets its own cursors back when you quit.' },
  { q: 'How do updates work?', a: 'The installed app checks for new versions, downloads them in the background and installs them when it restarts. The portable version does not update itself.' },
];

function Shot({ name, alt, priority = false }) {
  return (
    <figure className="window">
      <div className="window-bar" aria-hidden="true"><i /><i /><i /></div>
      <img src={asset(`generated/screenshots/${name}.png`)} alt={alt} width="1600" height="1000" loading={priority ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  );
}

export default function Home() {
  const thumbs = info.animations;
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top" aria-label="Cursora home">
            <img src={asset('generated/logo.svg')} alt="" width="32" height="32" />
            <span>Curs<b>ora</b></span>
          </a>
          <nav className="nav-links" aria-label="Main">
            <a href="#features">Features</a>
            <a href="#crosshairs">Crosshairs</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <a className="icon-link" href={LINKS.github} aria-label="Cursora on GitHub"><Icon name="github" /></a>
            <a className="icon-link" href={LINKS.discord} aria-label="Cursora on Discord"><Icon name="discord" /></a>
            <a className="btn btn-primary btn-sm" href={LINKS.download}><Icon name="download" size={16} />Download</a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="container hero-inner">
            <a className="pill" href={LINKS.releases}>
              <span className="pill-tag">v{info.version}</span>
              Now with automatic updates
              <Icon name="chevron-right" size={14} />
            </a>
            <h1>Your cursor,<br /><span className="grad">reimagined.</span></h1>
            <p className="lead">Animations that follow your pointer, custom Windows cursors and pixel-perfect crosshairs, in one lightweight tray app.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={LINKS.download}><Icon name="download" />Download for Windows</a>
              <a className="btn btn-ghost btn-lg" href={LINKS.github}><Icon name="github" />View on GitHub</a>
            </div>
            <p className="fine">Free · Windows 10 &amp; 11 · Installer or portable</p>
            <div className="hero-shot">
              <Shot name="animations" alt="Cursora's Animations page with the Inferno whip in the live preview" priority />
            </div>
          </div>
        </section>

        <section className="stats" aria-label="Cursora in numbers">
          <div className="container stats-grid">
            {STATS.map(s => (
              <div key={s.label} className="stat"><b>{s.value}</b><span>{s.label}</span></div>
            ))}
          </div>
        </section>

        <section id="features" className="section">
          <div className="container">
            <div className="section-head">
              <span className="kicker">Features</span>
              <h2>Everything your pointer was missing</h2>
              <p>Four tools in one tray app, each designed to look great and stay out of your way.</p>
            </div>
            {FEATURES.map((f, i) => (
              <article key={f.id} id={f.id} className={`feature ${i % 2 ? 'flip' : ''}`}>
                <div className="feature-copy">
                  <span className="kicker">{f.kicker}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <ul>
                    {f.points.map(p => <li key={p}><Icon name="check" size={18} />{p}</li>)}
                  </ul>
                </div>
                <div className="feature-shot"><Shot name={f.shot} alt={f.alt} /></div>
              </article>
            ))}
          </div>
        </section>

        <section className="marquee-section" aria-label="All animations">
          <div className="marquee">
            <div className="marquee-track">
              {[...thumbs, ...thumbs].map((a, i) => (
                <figure key={`${a.id}-${i}`} className="thumb" aria-hidden={i >= thumbs.length}>
                  <img src={asset(`generated/${a.thumb}`)} alt={i < thumbs.length ? a.name : ''} width="320" height="200" loading="lazy" decoding="async" />
                  <figcaption><b>{a.name}</b><span>{a.category}</span></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="crosshairs" className="section">
          <div className="container">
            <div className="section-head">
              <span className="kicker">Crosshairs</span>
              <h2>{info.presetCount} crosshairs. Try them right here.</h2>
              <p>A pixel-perfect overlay that stays on top of your games, with its own hotkey. This preview runs Cursora&apos;s real crosshair engine.</p>
            </div>
            <CrosshairPlayground />
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <span className="kicker">And more</span>
              <h2>Built to feel at home on Windows</h2>
            </div>
            <div className="cards">
              {MORE.map(m => (
                <div key={m.title} className="card">
                  <span className="card-icon"><Icon name={m.icon} /></span>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-head">
              <span className="kicker">Get started</span>
              <h2>Up and running in a minute</h2>
            </div>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="step"><span className="step-n">{i + 1}</span><h3>{s.title}</h3><p>{s.text}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section id="faq" className="section">
          <div className="container narrow">
            <div className="section-head">
              <span className="kicker">FAQ</span>
              <h2>Questions, answered</h2>
            </div>
            <div className="faq">
              {FAQ.map(f => (
                <details key={f.q}>
                  <summary>{f.q}<Icon name="chevron-down" size={18} /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="container cta-inner">
            <img src={asset('generated/logo.svg')} alt="" width="88" height="88" />
            <h2>Ready to reimagine your cursor?</h2>
            <p>Free for Windows 10 and 11. Installs in seconds and keeps itself up to date.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={LINKS.download}><Icon name="download" />Download Cursora {info.version}</a>
              <a className="btn btn-ghost btn-lg" href={LINKS.discord}><Icon name="discord" />Join the Discord</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <a className="brand" href="#top"><img src={asset('generated/logo.svg')} alt="" width="26" height="26" /><span>Curs<b>ora</b></span></a>
          <nav aria-label="Footer">
            <a href={LINKS.releases}>Releases</a>
            <a href={LINKS.github}>GitHub</a>
            <a href={LINKS.discord}>Discord</a>
          </nav>
          <p>Cursora by <a href="https://github.com/xb48">Xb48</a></p>
        </div>
      </footer>
    </>
  );
}
