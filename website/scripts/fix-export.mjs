// Post-build fix for the static export (Next.js 16.4): page data for nested routes
// is written as out/<route>/__next.<route>/__PAGE__.txt, but the browser prefetches
// it as out/<route>/__next.<route>.__PAGE__.txt (the flat name the root page uses).
// Without the flat copy those prefetches 404 and navigation falls back to full
// page loads. Each nested file is copied to its flat name; the originals stay.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
if (!fs.existsSync(OUT)) throw new Error('out/ not found: run next build first');

let copied = 0;
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('__next.')) {
      for (const f of fs.readdirSync(full, { withFileTypes: true })) {
        if (!f.isFile()) continue;
        const flat = path.join(dir, `${entry.name}.${f.name}`);
        if (!fs.existsSync(flat)) { fs.copyFileSync(path.join(full, f.name), flat); copied++; }
      }
    } else if (entry.name !== '_next' && entry.name !== 'generated') walk(full);
  }
};
walk(OUT);
console.log(`export fix: ${copied} page data file(s) given their flat names`);
