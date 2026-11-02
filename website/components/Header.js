'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LINKS, NAV, asset } from '../lib/site';
import Icon from './Icon';

export default function Header() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  const active = href => pathname === href || pathname === href.replace(/\/$/, '');

  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="container nav-inner">
        <Link className="brand" href="/" aria-label="Cursora home">
          <img src={asset('generated/logo.svg')} alt="" width="32" height="32" />
          <span>Curs<b>ora</b></span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV.map(n => <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''} aria-current={active(n.href) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="nav-cta">
          <a className="icon-link" href={LINKS.github} aria-label="Cursora on GitHub"><Icon name="github" /></a>
          <a className="icon-link" href={LINKS.discord} aria-label="Cursora on Discord"><Icon name="discord" /></a>
          <Link className="btn btn-primary btn-sm nav-download" href="/download/"><Icon name="download" size={16} />Download</Link>
          <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(o => !o)}>
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        <nav aria-label="Mobile">
          {NAV.map(n => <Link key={n.href} href={n.href} className={active(n.href) ? 'active' : ''}>{n.label}<Icon name="chevron-right" size={18} /></Link>)}
          <div className="mobile-links">
            <a href={LINKS.github}><Icon name="github" />GitHub</a>
            <a href={LINKS.discord}><Icon name="discord" />Discord</a>
          </div>
        </nav>
      </div>
    </header>
  );
}
