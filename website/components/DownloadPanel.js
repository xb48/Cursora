'use client';

// The download choices. It starts from the release known at build time and
// quietly checks GitHub for a newer one, so the static page never goes stale.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LINKS, assetOf, formatBytes, formatDate } from '../lib/site';
import CopyButton from './CopyButton';
import Icon from './Icon';

const kindOf = name => (/^Cursora-Setup-[\d.]+\.exe$/.test(name) ? 'installer' : /^Cursora-Portable-[\d.]+\.exe$/.test(name) ? 'portable' : null);

function detectPlatform() {
  const uad = navigator.userAgentData;
  const p = ((uad && uad.platform) || navigator.platform || '').toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(ua)) return 'mobile';
  if (p.includes('win') || ua.includes('windows')) return 'windows';
  if (p.includes('mac') || ua.includes('mac os')) return 'macOS';
  if (p.includes('linux') || ua.includes('linux')) return 'Linux';
  return 'unknown';
}

const OPTIONS = [
  {
    kind: 'installer', title: 'Installer', badge: 'Recommended', icon: 'download',
    points: ['Start menu and desktop shortcuts', 'Updates itself automatically', 'No admin prompt: installs for your account'],
  },
  {
    kind: 'portable', title: 'Portable', badge: null, icon: 'box',
    points: ['A single file, nothing to install', 'Run it from anywhere, even a USB drive', "Doesn't update itself: download new versions here"],
  },
];

export default function DownloadPanel({ initial }) {
  const [release, setRelease] = useState(initial);
  const [platform, setPlatform] = useState(null);

  useEffect(() => { setPlatform(detectPlatform()); }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('https://api.github.com/repos/xb48/Cursora/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(r => {
        if (!r || r.draft || r.prerelease || r.tag_name === initial.tag) return;
        setRelease({
          tag: r.tag_name, version: r.tag_name.replace(/^v/, ''), name: r.name, date: r.published_at, url: r.html_url,
          assets: r.assets.filter(a => kindOf(a.name)).map(a => ({ kind: kindOf(a.name), name: a.name, size: a.size, sha256: (a.digest || '').replace(/^sha256:/, '') || null, url: a.browser_download_url })),
        });
      })
      .catch(() => { /* offline or rate-limited: the build-time release stays */ });
    return () => ctrl.abort();
  }, [initial.tag]);

  const notWindows = platform && platform !== 'windows' && platform !== 'unknown';

  return (
    <div className="download">
      <div className="download-meta">
        <span className="status-dot" />
        <span>Version <b>{release.version}</b></span>
        {release.date && <span>Released {formatDate(release.date)}</span>}
        <span>Windows 10 &amp; 11 · 64-bit</span>
        <Link href="/changelog/">What&apos;s new<Icon name="chevron-right" size={14} /></Link>
      </div>

      {notWindows && (
        <div className="notice" role="note">
          <Icon name="info" size={18} />
          <span>{platform === 'mobile' ? "You're on a phone or tablet." : `You're on ${platform}.`} Cursora is a Windows app: download it on a Windows 10 or 11 PC.</span>
        </div>
      )}

      <div className="download-grid">
        {OPTIONS.map(o => {
          const a = assetOf(release, o.kind);
          const verify = a ? `Get-FileHash .\\${a.name} -Algorithm SHA256` : '';
          return (
            <article key={o.kind} className={`dl-card ${o.badge ? 'featured' : ''}`}>
              <div className="dl-head">
                <span className="card-icon"><Icon name={o.icon} /></span>
                <div><h2>{o.title}</h2>{a && <p className="dl-file">{a.name} · {formatBytes(a.size)}</p>}</div>
                {o.badge && <span className="badge">{o.badge}</span>}
              </div>
              <ul className="ticks">{o.points.map(p => <li key={p}><Icon name="check" size={17} />{p}</li>)}</ul>
              {a
                ? <a className={`btn ${o.badge ? 'btn-primary' : 'btn-ghost'} btn-lg btn-block`} href={a.url}><Icon name="download" />Download {o.title.toLowerCase()}</a>
                : <a className="btn btn-ghost btn-lg btn-block" href={LINKS.latestRelease}><Icon name="external" />Get it from GitHub Releases</a>}
              {a && a.sha256 && (
                <details className="verify">
                  <summary><Icon name="info" size={15} />Verify the download (SHA-256)</summary>
                  <div className="hash"><code>{a.sha256}</code><CopyButton text={a.sha256} /></div>
                  <p>In PowerShell, in the folder you saved it to:</p>
                  <div className="hash"><code>{verify}</code><CopyButton text={verify} /></div>
                  <p>The hash it prints should match the one above.</p>
                </details>
              )}
            </article>
          );
        })}
      </div>
      <p className="download-alt">Every file comes straight from <a href={release.url || LINKS.releases}>Cursora&apos;s GitHub Releases</a>, built and published automatically from the public source code.</p>
    </div>
  );
}
