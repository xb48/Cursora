// Builds the website logo PNGs in assets/brand/ from icon/logo.svg:
//   cursora-logo-on-dark-<h>.png   mark + "Cursora" wordmark, for dark backgrounds
//   cursora-logo-on-light-<h>.png  the same, for light backgrounds
//   cursora-mark-<n>.png           the mark alone (favicons, avatars, app tiles)
// Every PNG is drawn straight from the vector at its final pixel size, on a
// transparent background. Run with Electron: npm run logo
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'brand');
const LOCKUP_HEIGHTS = [64, 128, 256, 512];
const MARK_SIZES = [16, 32, 48, 180, 192, 512, 1024];
// The app's title-bar typeface (Segoe UI Variable), loaded from its file so a
// missing font fails loudly instead of silently falling back.
const FONT_FILE = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'SegUIVar.ttf');
const THEMES = {
  'on-dark': { text: '#ffffff', accent: '#89cff0' },
  'on-light': { text: '#141016', accent: '#3a9fd6' },
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    if (!fs.existsSync(FONT_FILE)) throw new Error(`font not found: ${FONT_FILE}`);
    const svg = fs.readFileSync(path.join(ROOT, 'icon', 'logo.svg'), 'utf8');
    if (!/^\s*<svg[\s>]/.test(svg)) throw new Error('icon/logo.svg is not an SVG document');
    await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8">');
    const fontB64 = fs.readFileSync(FONT_FILE).toString('base64');
    const result = await win.webContents.executeJavaScript(`(async () => { try {
      const bytes = Uint8Array.from(atob(${JSON.stringify(fontB64)}), ch => ch.charCodeAt(0));
      const font = new FontFace('CursoraBrand', bytes.buffer, { weight: '100 900' });
      await font.load();
      document.fonts.add(font);
      const mark = new Image();
      mark.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
      await mark.decode();
      const png = c => c.toDataURL('image/png').split(',')[1];
      const out = {};

      for (const size of ${JSON.stringify(MARK_SIZES)}) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mark, 0, 0, size, size);
        out['cursora-mark-' + size + '.png'] = png(c);
      }

      // Lockup proportions, as fractions of the mark height H.
      const TEXT = 0.56, GAP = 0.24, PAD = 0.04, TRACK = -0.01;
      for (const [theme, col] of Object.entries(${JSON.stringify(THEMES)})) {
        for (const H of ${JSON.stringify(LOCKUP_HEIGHTS)}) {
          const fontCss = '600 ' + (H * TEXT) + 'px CursoraBrand';
          if (!document.fonts.check(fontCss)) throw new Error('brand font not usable at ' + fontCss);
          const m = document.createElement('canvas').getContext('2d');
          m.font = fontCss;
          m.letterSpacing = (H * TEXT * TRACK) + 'px';
          const head = m.measureText('Curs'), all = m.measureText('Cursora');
          const x = H * (1 + GAP);
          const w = Math.ceil(x + all.actualBoundingBoxRight + H * PAD);
          const c = document.createElement('canvas');
          c.width = w; c.height = H;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(mark, 0, 0, H, H);
          ctx.font = fontCss;
          ctx.letterSpacing = m.letterSpacing;
          // Center the ink (cap height to baseline) on the mark.
          const base = H / 2 + (all.actualBoundingBoxAscent - all.actualBoundingBoxDescent) / 2;
          ctx.fillStyle = col.text;
          ctx.fillText('Curs', x, base);
          ctx.fillStyle = col.accent;
          ctx.fillText('ora', x + head.width, base);
          out['cursora-logo-' + theme + '-' + H + '.png'] = png(c);
        }
      }
      return { out };
    } catch (e) { return { error: String(e && e.stack || e) }; } })()`);
    if (result.error) throw new Error(result.error);
    const files = result.out;
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, b64] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
    console.log(`${Object.keys(files).length} PNGs written to assets/brand/`);
    app.exit(0);
  } catch (e) {
    console.error('make-web-logo failed:', e.stack || e);
    app.exit(1);
  }
});
