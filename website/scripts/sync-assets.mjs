// Copies what the site shows from the app itself, so the page never drifts from
// the real product: screenshots, logos, animation thumbnails, the crosshair
// engine and the current version. Output: public/generated/ and lib/generated.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(SITE, '..');
const OUT = path.join(SITE, 'public', 'generated');

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true });
  fs.copyFileSync(path.join(APP, from), path.join(OUT, to));
};

fs.rmSync(OUT, { recursive: true, force: true });

for (const f of fs.readdirSync(path.join(APP, 'assets', 'screenshots'))) copy(`assets/screenshots/${f}`, `screenshots/${f}`);
copy('icon/logo.svg', 'logo.svg');
copy('assets/brand/cursora-mark-512.png', 'logo-512.png');
copy('assets/brand/cursora-mark-180.png', 'apple-touch-icon.png');
copy('assets/brand/social-preview.png', 'social-preview.png');
copy('app/crosshairs.js', 'kit/crosshairs.js');

const animations = [];
for (const dir of fs.readdirSync(path.join(APP, 'animations')).sort()) {
  const manifest = path.join(APP, 'animations', dir, 'manifest.json');
  if (!fs.existsSync(manifest)) continue;
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (!m.thumbnail || !fs.existsSync(path.join(APP, 'animations', dir, m.thumbnail))) continue;
  const file = `animations/${m.id}${path.extname(m.thumbnail)}`;
  copy(`animations/${dir}/${m.thumbnail}`, file);
  animations.push({ id: m.id, name: m.name || m.id, category: m.category || 'Other', thumb: file });
}

const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
const crosshairKit = fs.readFileSync(path.join(APP, 'app', 'crosshairs.js'), 'utf8');
const presetCount = (crosshairKit.match(/^\s*P\('/gm) || []).length;
// The app's own icon set (app/icons.js assigns window.ICONS).
const iconScope = {};
new Function('window', fs.readFileSync(path.join(APP, 'app', 'icons.js'), 'utf8'))(iconScope);
const icons = iconScope.ICONS;
if (!icons || !icons.download || !icons.discord) throw new Error('could not read app/icons.js');
const info = { version: pkg.version, animations, presetCount, icons };
fs.writeFileSync(path.join(SITE, 'lib', 'generated.json'), JSON.stringify(info, null, 2));
console.log(`synced: v${info.version}, ${animations.length} animations, ${presetCount} crosshair presets`);
