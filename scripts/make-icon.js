// Builds every icon file from the vector artwork in icon/:
//   logo.svg     -> app.ico (16–256 px), icon.ico (tray, 16–48 px), AppIcon.icns (16–1024 px)
//   template.svg -> Template.png (512 px macOS menu-bar template)
// Each size is rendered straight from the vector, not scaled down from a bitmap.
// Run with Electron (it rasterizes the SVG in Chromium): npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, '..', 'icon');
const APP_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const TRAY_SIZES = [16, 20, 24, 32, 40, 48];
// .icns PNG slots: type -> pixel size.
const ICNS = [['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic08', 256], ['ic13', 256], ['ic09', 512], ['ic14', 512], ['ic10', 1024]];

/** Rasterizes an SVG at the given square sizes; returns {size: {png, bgra}}. */
async function rasterize(win, svgFile, sizes) {
  const svg = fs.readFileSync(svgFile, 'utf8');
  if (!/^\s*<svg[\s>]/.test(svg)) throw new Error(`${svgFile} is not an SVG document`);
  const out = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    await img.decode();
    const result = {};
    for (const size of ${JSON.stringify(sizes)}) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      const rgba = ctx.getImageData(0, 0, size, size).data;
      let bin = '';
      for (let i = 0; i < rgba.length; i++) bin += String.fromCharCode(rgba[i]);
      result[size] = { png: c.toDataURL('image/png').split(',')[1], rgba: btoa(bin) };
    }
    return result;
  })()`);
  const images = {};
  for (const size of sizes) {
    const rgba = Buffer.from(out[size].rgba, 'base64');
    if (rgba.length !== size * size * 4) throw new Error(`${svgFile}: bad raster at ${size} px`);
    // Canvas pixel data is straight (unpremultiplied) RGBA; icons store BGRA.
    const bgra = Buffer.alloc(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
      bgra[i] = rgba[i + 2]; bgra[i + 1] = rgba[i + 1]; bgra[i + 2] = rgba[i]; bgra[i + 3] = rgba[i + 3];
    }
    images[size] = { png: Buffer.from(out[size].png, 'base64'), bgra };
  }
  return images;
}

/**
 * Classic 32-bit DIB icon image (BITMAPINFOHEADER + bottom-up BGRA rows + an
 * empty AND mask). Every Windows API reads this; PNG is only safe at 256 px.
 */
function dibEntry(bgra, size) {
  const rowBytes = size * 4;
  const maskRow = Math.ceil(size / 32) * 4;
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(size, 4);
  head.writeInt32LE(size * 2, 8);   // XOR + AND mask height
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  head.writeUInt32LE(0, 16);        // BI_RGB
  head.writeUInt32LE(rowBytes * size + maskRow * size, 20);
  const pixels = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    bgra.copy(pixels, (size - 1 - y) * rowBytes, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([head, pixels, Buffer.alloc(maskRow * size)]);
}

/** ICO container: DIB entries below 256 px, a PNG entry at 256 px. */
function writeIco(file, images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...images.map(p => p.data)]));
}

/** ICNS container of PNG entries. */
function writeIcns(file, entries) {
  const chunks = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  fs.writeFileSync(file, Buffer.concat([head, ...chunks]));
}

const ico = (images, sizes) => sizes.map(size => ({
  size,
  data: size >= 256 ? images[size].png : dibEntry(images[size].bgra, size),
}));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8">');
    const all = [...new Set([...APP_SIZES, ...TRAY_SIZES, ...ICNS.map(e => e[1])])];
    const logo = await rasterize(win, path.join(ICON_DIR, 'logo.svg'), all);
    writeIco(path.join(ICON_DIR, 'app.ico'), ico(logo, APP_SIZES));
    writeIco(path.join(ICON_DIR, 'icon.ico'), ico(logo, TRAY_SIZES));
    writeIcns(path.join(ICON_DIR, 'AppIcon.icns'), ICNS.map(([type, size]) => [type, logo[size].png]));
    const template = await rasterize(win, path.join(ICON_DIR, 'template.svg'), [512]);
    fs.writeFileSync(path.join(ICON_DIR, 'Template.png'), template[512].png);
    console.log(`icon/app.ico (${APP_SIZES.join(', ')} px), icon/icon.ico (${TRAY_SIZES.join(', ')} px), ` +
      `icon/AppIcon.icns (${[...new Set(ICNS.map(e => e[1]))].join(', ')} px), icon/Template.png (512 px) written`);
    app.exit(0);
  } catch (e) {
    console.error('make-icon failed:', e.stack || e);
    app.exit(1);
  }
});
