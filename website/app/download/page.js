import Link from 'next/link';
import { LATEST } from '../../lib/site';
import { REQUIREMENTS } from '../../lib/content';
import PageHeader from '../../components/PageHeader';
import DownloadPanel from '../../components/DownloadPanel';
import Reveal from '../../components/Reveal';
import Icon from '../../components/Icon';

export const metadata = {
  title: 'Download',
  description: `Download Cursora ${LATEST.version} for Windows 10 and 11: the installer, which updates itself, or the portable app.`,
};

const INSTALL = [
  { title: 'Run the installer', text: 'Open Cursora-Setup. It installs for your account, so Windows won\'t ask for admin rights.' },
  { title: 'If SmartScreen appears', text: 'Cursora isn\'t code-signed yet, so Windows may warn about a new app. Choose More info, then Run anyway.' },
  { title: 'Find it in the tray', text: 'Cursora opens its window and adds an icon to the tray. Press Ctrl+Alt+W to summon an animation.' },
];

export default function DownloadPage() {
  return (
    <>
      <PageHeader kicker="Download" title="Get Cursora for Windows">
        Free, lightweight and ready in seconds. Pick the installer to get updates automatically.
      </PageHeader>
      <section className="section tight">
        <div className="container">
          <Reveal><DownloadPanel initial={LATEST} /></Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container two-col">
          <Reveal>
            <span className="kicker">Install</span>
            <h2 className="h2">Three steps, about a minute</h2>
            <ol className="install-steps">
              {INSTALL.map((s, i) => (
                <li key={s.title}><span className="step-n sm">{i + 1}</span><div><h3>{s.title}</h3><p>{s.text}</p></div></li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={100}>
            <span className="kicker">Requirements</span>
            <h2 className="h2">System requirements</h2>
            <dl className="spec">
              {REQUIREMENTS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            <div className="callout">
              <Icon name="refresh" />
              <div>
                <h3>Staying up to date</h3>
                <p>The installed app checks for new versions, downloads them in the background and installs them when Cursora restarts. You can turn this off in Settings → Updates.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container narrow center">
          <Reveal>
            <h2 className="h2">Need a hand?</h2>
            <p className="muted">Installation tips, troubleshooting and help from the community.</p>
            <div className="hero-cta">
              <Link className="btn btn-ghost btn-lg" href="/support/">Visit Support<Icon name="chevron-right" size={18} /></Link>
              <Link className="btn btn-ghost btn-lg" href="/changelog/">Read the changelog</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
