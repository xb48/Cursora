import { SITE_URL } from '../lib/site';

export const dynamic = 'force-static';

export default function sitemap() {
  return ['', 'features/', 'download/', 'changelog/', 'support/', 'privacy/'].map(p => ({
    url: `${SITE_URL}/${p}`,
    changeFrequency: p === 'changelog/' || p === 'download/' ? 'weekly' : 'monthly',
    priority: p === '' ? 1 : p === 'download/' ? 0.9 : 0.6,
  }));
}
