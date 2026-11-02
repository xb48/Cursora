import Link from 'next/link';
import { LATEST, LINKS, asset } from '../lib/site';
import Icon from './Icon';

const COLUMNS = [
  { title: 'Product', links: [{ href: '/features/', label: 'Features' }, { href: '/download/', label: 'Download' }, { href: '/changelog/', label: 'Changelog' }] },
  { title: 'Resources', links: [{ href: '/support/', label: 'Support' }, { href: '/privacy/', label: 'Privacy' }, { href: LINKS.github, label: 'Source code', external: true }] },
  { title: 'Community', links: [{ href: LINKS.discord, label: 'Discord server', external: true }, { href: LINKS.releases, label: 'GitHub Releases', external: true }, { href: LINKS.issues, label: 'Report an issue', external: true }] },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" href="/"><img src={asset('generated/logo.svg')} alt="" width="30" height="30" /><span>Curs<b>ora</b></span></Link>
            <p>Your cursor, reimagined. Animations, custom cursors and crosshairs for Windows 10 and 11.</p>
            <div className="footer-social">
              <a className="icon-link" href={LINKS.github} aria-label="GitHub"><Icon name="github" /></a>
              <a className="icon-link" href={LINKS.discord} aria-label="Discord"><Icon name="discord" /></a>
            </div>
          </div>
          {COLUMNS.map(c => (
            <nav key={c.title} className="footer-col" aria-label={c.title}>
              <h2>{c.title}</h2>
              {c.links.map(l => (l.external
                ? <a key={l.label} href={l.href}>{l.label}</a>
                : <Link key={l.label} href={l.href}>{l.label}</Link>))}
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <p>Cursora by <a href={LINKS.author}>Xb48</a></p>
          <p className="footer-version"><span className="status-dot" />Latest version {LATEST.version}</p>
        </div>
      </div>
    </footer>
  );
}
