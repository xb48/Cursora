// Links, navigation, release data and formatting shared by the whole site.
import info from './generated.json';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** A file in public/, with the base path the site is served from. */
export const asset = p => `${BASE_PATH}/${p.replace(/^\//, '')}`;

export const SITE_URL = process.env.SITE_URL || 'https://xb48.github.io/Cursora';
export const LINKS = {
  github: 'https://github.com/xb48/Cursora',
  releases: 'https://github.com/xb48/Cursora/releases',
  latestRelease: 'https://github.com/xb48/Cursora/releases/latest',
  issues: 'https://github.com/xb48/Cursora/issues',
  discord: 'https://discord.gg/qat8yUcYqh',
  author: 'https://github.com/xb48',
};

export const NAV = [
  { href: '/features/', label: 'Features' },
  { href: '/download/', label: 'Download' },
  { href: '/changelog/', label: 'Changelog' },
  { href: '/support/', label: 'Support' },
];

export const APP = info;
/** Published releases, newest first (empty if GitHub couldn't be reached at build time). */
export const RELEASES = info.releases || [];
/** The newest published release, or a stand-in pointing at the Releases page. */
export const LATEST = RELEASES[0] || { version: info.version, tag: `v${info.version}`, date: null, url: LINKS.latestRelease, notes: '', assets: [] };
export const assetOf = (release, kind) => (release.assets || []).find(a => a.kind === kind) || null;

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}
export function formatDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}
