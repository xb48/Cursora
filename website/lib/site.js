// Links and paths shared by the whole site.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** A file in public/, with the base path the site is served from. */
export const asset = p => `${BASE_PATH}/${p.replace(/^\//, '')}`;

export const SITE_URL = process.env.SITE_URL || 'https://xb48.github.io/Cursora';
export const LINKS = {
  download: 'https://github.com/xb48/Cursora/releases/latest',
  github: 'https://github.com/xb48/Cursora',
  releases: 'https://github.com/xb48/Cursora/releases',
  discord: 'https://discord.gg/qat8yUcYqh',
};
