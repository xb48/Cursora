import Link from 'next/link';
import { LINKS } from '../../lib/site';
import { FAQ } from '../../lib/content';
import PageHeader from '../../components/PageHeader';
import Reveal from '../../components/Reveal';
import Icon from '../../components/Icon';

export const metadata = {
  title: 'Support',
  description: 'Get help with Cursora: troubleshooting, answers to common questions, and where to reach the community.',
};

const CHANNELS = [
  { icon: 'discord', title: 'Discord server', text: 'Open a support ticket and get help from the team and the community.', href: LINKS.discord, cta: 'Join the Discord' },
  { icon: 'github', title: 'Report an issue', text: 'Found a bug? Report it on GitHub with the steps to reproduce it.', href: LINKS.issues, cta: 'Open GitHub Issues' },
];

const TROUBLESHOOTING = [
  { q: "The crosshair doesn't show in my game", a: 'Switch the game to borderless or windowed mode. Games in exclusive fullscreen cover every other window, including overlays.' },
  { q: "A hotkey doesn't work", a: "Another app is probably using the same shortcut, and Cursora shows a warning when it can't register one. Open the Hotkeys page and pick a different combination." },
  { q: 'Windows SmartScreen blocks the installer', a: "Cursora isn't code-signed yet. Choose More info, then Run anyway. To be sure the file is genuine, compare its SHA-256 with the one on the download page." },
  { q: "I'm not getting updates", a: "Updates come to the installed app, not the portable one. Check Settings → Updates: “Update automatically” must be on, or press Check for updates." },
  { q: 'My cursors went back to normal after quitting', a: 'That is by design: your Cursora cursors apply while the app runs, and Windows gets its own cursors back when you quit. Leave Cursora in the tray to keep them.' },
  { q: "Linking Discord doesn't finish", a: 'Finish signing in on the Discord page that opens in your browser, then return to Cursora. If it times out, press Link Discord again. If Cursora says a port is in use, close the app using it and try again.' },
  { q: 'How do I uninstall Cursora?', a: 'Open Windows Settings → Apps, find Cursora and choose Uninstall. Your settings stay in %APPDATA%\\Cursora; delete that folder to remove them too.' },
];

export default function SupportPage() {
  return (
    <>
      <PageHeader kicker="Support" title="How can we help?">
        Answers to common questions, troubleshooting tips and where to reach us.
      </PageHeader>

      <section className="section tight">
        <div className="container">
          <div className="channels">
            {CHANNELS.map((c, i) => (
              <Reveal key={c.title} className="card channel" delay={i * 80}>
                <span className="card-icon"><Icon name={c.icon} /></span>
                <h2>{c.title}</h2>
                <p>{c.text}</p>
                <a className="btn btn-ghost btn-sm" href={c.href}>{c.cta}<Icon name="external" size={15} /></a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container narrow">
          <Reveal className="section-head left">
            <span className="kicker">Troubleshooting</span>
            <h2>Common fixes</h2>
          </Reveal>
          <div className="faq">
            {TROUBLESHOOTING.map(f => (
              <details key={f.q}><summary>{f.q}<Icon name="chevron-down" size={18} /></summary><p>{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container narrow">
          <Reveal className="section-head left">
            <span className="kicker">FAQ</span>
            <h2>Frequently asked questions</h2>
          </Reveal>
          <div className="faq">
            {FAQ.map(f => (
              <details key={f.q}><summary>{f.q}<Icon name="chevron-down" size={18} /></summary><p>{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container narrow">
          <Reveal className="callout">
            <Icon name="folder" />
            <div>
              <h3>Where Cursora keeps your data</h3>
              <p>Settings, history, saved crosshairs and your cursor design live in <code>%APPDATA%\Cursora</code> on your PC. Settings → Data → App data opens the folder. Read the <Link href="/privacy/">privacy notice</Link> for the details.</p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
