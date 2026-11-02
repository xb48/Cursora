import Link from 'next/link';
import { APP, LATEST, asset, assetOf, formatBytes } from '../lib/site';
import { CAPABILITIES, FAQ, TOOLS } from '../lib/content';
import Icon from '../components/Icon';
import Shot from '../components/Shot';
import Reveal from '../components/Reveal';
import Showcase from '../components/Showcase';
import CrosshairPlayground from '../components/CrosshairPlayground';

const STATS = [
  { value: String(APP.animations.length), label: 'animations' },
  { value: '11', label: 'cursor packs' },
  { value: String(APP.presetCount), label: 'crosshair presets' },
  { value: '14', label: 'Windows cursors restyled' },
];

const STEPS = [
  { icon: 'download', title: 'Download', text: 'Get the installer. It installs for your account in seconds, with no admin prompt.' },
  { icon: 'sparkles', title: 'Make it yours', text: 'Pick an animation, a cursor pack and a crosshair, or design your own.' },
  { icon: 'zap', title: 'Use it anywhere', text: 'Press a hotkey or click the tray icon. Cursora works over every app and game.' },
];

export default function Home() {
  const installer = assetOf(LATEST, 'installer');
  const thumbs = APP.animations;
  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="container hero-inner">
          <Link className="pill" href="/changelog/">
            <span className="pill-tag">v{LATEST.version}</span>
            See what&apos;s new
            <Icon name="chevron-right" size={14} />
          </Link>
          <h1>Your cursor,<br /><span className="grad">reimagined.</span></h1>
          <p className="lead">Animations that follow your pointer, custom Windows cursors and pixel-perfect crosshairs, in one lightweight tray app.</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href="/download/"><Icon name="download" />Download for Windows</Link>
            <Link className="btn btn-ghost btn-lg" href="/features/">Explore features<Icon name="chevron-right" size={18} /></Link>
          </div>
          <p className="fine">Free · Windows 10 &amp; 11{installer ? ` · ${formatBytes(installer.size)}` : ''} · Updates itself</p>
          <div className="hero-shot">
            <Shot name="animations" alt="Cursora's Animations page with the Inferno whip in the live preview" />
          </div>
        </div>
      </section>

      <section className="stats" aria-label="Cursora in numbers">
        <div className="container stats-grid">
          {STATS.map((s, i) => (
            <Reveal key={s.label} className="stat" delay={i * 70}><b>{s.value}</b><span>{s.label}</span></Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="kicker">One app, five tools</span>
            <h2>Everything your pointer was missing</h2>
            <p>Each tool is designed to look great, feel instant and stay out of your way.</p>
          </Reveal>
          <Reveal><Showcase items={TOOLS} /></Reveal>
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
          <Reveal className="section-head">
            <span className="kicker">Live demo</span>
            <h2>{APP.presetCount} crosshairs. Try them right here.</h2>
            <p>This preview runs Cursora&apos;s real crosshair engine. Copy any design&apos;s code and import it straight into the app.</p>
          </Reveal>
          <Reveal><CrosshairPlayground /></Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="kicker">Built for Windows</span>
            <h2>Polished down to the details</h2>
          </Reveal>
          <div className="bento">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} className="card" delay={(i % 3) * 80}>
                <span className="card-icon"><Icon name={c.icon} /></span>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="kicker">Get started</span>
            <h2>Up and running in a minute</h2>
          </Reveal>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} className="step" delay={i * 90}>
                <span className="step-n">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container narrow">
          <Reveal className="section-head">
            <span className="kicker">FAQ</span>
            <h2>Questions, answered</h2>
          </Reveal>
          <div className="faq">
            {FAQ.slice(0, 4).map(f => (
              <details key={f.q}><summary>{f.q}<Icon name="chevron-down" size={18} /></summary><p>{f.a}</p></details>
            ))}
          </div>
          <p className="more-link"><Link href="/support/">More answers in Support<Icon name="chevron-right" size={16} /></Link></p>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <Reveal className="cta-inner">
            <img src={asset('generated/logo.svg')} alt="" width="88" height="88" />
            <h2>Ready to reimagine your cursor?</h2>
            <p>Free for Windows 10 and 11. Installs in seconds and keeps itself up to date.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href="/download/"><Icon name="download" />Download Cursora {LATEST.version}</Link>
              <Link className="btn btn-ghost btn-lg" href="/support/">Get support</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
