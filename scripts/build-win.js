// Builds the native Windows app into dist/:
//   Cursora-Setup-<version>.exe     installer (Start menu + desktop shortcuts, uninstaller)
//   Cursora-Portable-<version>.exe  single-file app, no install needed
//   win-unpacked/Cursora.exe        the unpacked app folder
//   latest.yml                      update metadata (version, file, SHA-512)
//
// Publishing a release: create a GitHub release tagged v<version> on xb48/Cursora
// and attach Cursora-Setup-<version>.exe, its .blockmap and latest.yml. Installed
// copies find it, download it in the background and install it on restart.
//
// The app is staged into out/app with only what it needs at runtime: no Electron
// package, no dev tooling, and koffi trimmed to its Windows x64 binary (it ships
// binaries for 19 platforms). electron-builder then packages that folder.
// Run: npm run dist
const fs = require('fs');
const path = require('path');
const { build, Platform, Arch } = require('electron-builder');

const ROOT = path.resolve(__dirname, '..');
const STAGE = path.join(ROOT, 'out', 'app');
const pkg = require(path.join(ROOT, 'package.json'));
const KOFFI = 'node_modules/koffi';

const copy = rel => fs.cpSync(path.join(ROOT, rel), path.join(STAGE, rel), { recursive: true });

/** A package and its production dependencies, resolved exactly as Node resolves them (dirs relative to ROOT). */
function dependencyDirs(name) {
  const dirs = new Set();
  const resolve = (fromDir, dep) => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      if (path.basename(dir) === 'node_modules') continue;
      const cand = path.join(dir, 'node_modules', dep);
      if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
      if (path.resolve(dir) === ROOT) throw new Error(`cannot resolve ${dep} from ${fromDir}`);
    }
  };
  const walk = dir => {
    if (dirs.has(dir)) return;
    dirs.add(dir);
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pj.dependencies || {})) walk(resolve(dir, dep));
  };
  walk(path.join(ROOT, 'node_modules', name));
  // Nested node_modules come along with their parent package.
  return [...dirs].map(d => path.relative(ROOT, d)).filter((d, _i, all) => !all.some(p => p !== d && d.startsWith(p + path.sep)));
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const rel of ['main.js', 'preload.js', 'app', 'animations', 'icon']) copy(rel);
for (const rel of ['package.json', 'index.js', 'indirect.js', 'lib', 'LICENSE.txt']) copy(`${KOFFI}/${rel}`);
copy(`${KOFFI}/build/koffi/win32_x64/koffi.node`);
for (const rel of dependencyDirs('electron-updater')) copy(rel);

fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: pkg.name,
  productName: pkg.productName,
  version: pkg.version,
  description: pkg.description,
  author: 'Cursora',
  license: pkg.license,
  main: 'main.js',
  dependencies: {
    koffi: require(path.join(ROOT, KOFFI, 'package.json')).version,
    'electron-updater': require(path.join(ROOT, 'node_modules', 'electron-updater', 'package.json')).version,
  },
}, null, 2));

const icon = path.join(ROOT, 'icon', 'app.ico');

build({
  projectDir: ROOT,
  publish: 'never',                        // releases are uploaded by hand (see the top of this file)
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64),
  config: {
    appId: 'com.cursora.app',             // matches APP_ID in main.js
    productName: 'Cursora',
    copyright: `Copyright © ${new Date().getFullYear()} Cursora`,
    electronVersion: require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version,
    directories: { app: STAGE, output: path.join(ROOT, 'dist'), buildResources: path.join(ROOT, 'icon') },
    npmRebuild: false,                     // koffi ships a prebuilt N-API binary
    asar: true,
    asarUnpack: ['node_modules/koffi/**'], // native .node files can't load from inside the asar
    win: { icon },
    nsis: {
      oneClick: false,
      perMachine: false,                   // installs for the current user, no admin prompt
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: 'Cursora',
      runAfterFinish: true,
      installerIcon: icon,
      uninstallerIcon: icon,
      artifactName: 'Cursora-Setup-${version}.${ext}',
    },
    portable: { artifactName: 'Cursora-Portable-${version}.${ext}' },
    // Where installed copies look for updates (written into the app as app-update.yml).
    publish: [{ provider: 'github', owner: 'xb48', repo: 'Cursora', releaseType: 'release' }],
  },
}).then(files => {
  console.log('\nBuilt:');
  for (const f of files) console.log('  ' + path.relative(ROOT, f));
}).catch(err => {
  console.error(err);
  process.exit(1);
});
