import Link from 'next/link';
import { APP } from '../../lib/site';
import { CAPABILITIES, TOOLS } from '../../lib/content';
import PageHeader from '../../components/PageHeader';
import Reveal from '../../components/Reveal';
import Shot from '../../components/Shot';
import Icon from '../../components/Icon';

export const metadata = {
  title: 'Features',
  description: 'Animations, a live Studio, custom Windows cursors, a crosshair overlay and a full crosshair editor: everything Cursora does.',
};

const HOTKEYS = [
  { keys: ['Ctrl', 'Alt', 'W'], what: 'Summon or dismiss the active animation' },
  { keys: ['Ctrl', 'Alt', 'X'], what: 'Show or hide the crosshair' },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHeader kicker="Features" title="Everything Cursora does">
        Five tools in one lightweight tray app, designed to look great, feel instant and stay out of your way.
      </PageHeader>

      <nav className="jump container" aria-label="On this page">
        {TOOLS.map(t => <a key={t.id} href={`#${t.id}`}><Icon name={t.icon} size={16} />{t.label}</a>)}
      </nav>

      <section className="section tight">
        <div className="container">
          {TOOLS.map((t, i) => (
            <article key={t.id} id={t.id} className={`feature ${i % 2 ? 'flip' : ''}`}>
              <Reveal className="feature-copy">
                <span className="kicker">{t.label}</span>
                <h2>{t.title}</h2>
                <p>{t.text}</p>
                <ul className="ticks">{t.points.map(p => <li key={p}><Icon name="check" size={18} />{p}</li>)}</ul>
              </Reveal>
              <Reveal className="feature-shot" delay={120}><Shot name={t.shot} alt={t.alt} /></Reveal>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container two-col">
          <Reveal>
            <span className="kicker">Hotkeys</span>
            <h2 className="h2">Work from anywhere</h2>
            <p className="muted">Global shortcuts work even while another app or a game has focus. Change them in the app.</p>
            <div className="hotkeys">
              {HOTKEYS.map(h => (
                <div key={h.what} className="hotkey">
                  <span className="keys">{h.keys.map((k, i) => <span key={k}>{i > 0 && <i>+</i>}<kbd>{k}</kbd></span>)}</span>
                  <span>{h.what}</span>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={100}>
            <span className="kicker">By the numbers</span>
            <h2 className="h2">Plenty to explore</h2>
            <dl className="spec">
              <div><dt>Animations</dt><dd>{APP.animations.length}, each with its own trigger and sound</dd></div>
              <div><dt>Cursor packs</dt><dd>11, plus 24 presets and a full designer</dd></div>
              <div><dt>Crosshair presets</dt><dd>{APP.presetCount}, in 12 categories</dd></div>
              <div><dt>Saved crosshairs</dt><dd>Up to 100, shareable as codes</dd></div>
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="kicker">And more</span>
            <h2>Built to feel at home on Windows</h2>
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

      <section className="cta">
        <div className="container">
          <Reveal className="cta-inner">
            <h2>See it on your own desktop</h2>
            <p>Free for Windows 10 and 11.</p>
            <div className="hero-cta"><Link className="btn btn-primary btn-lg" href="/download/"><Icon name="download" />Download Cursora</Link></div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
