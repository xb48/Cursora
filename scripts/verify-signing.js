// Verifies a finished Windows build in dist/ before it is released:
//   node scripts/verify-signing.js [--require] [--allow-untrusted] [--dir dist]
//
// For a signed build it checks that every binary we ship (installer, portable app,
// app exe, elevate.exe, uninstaller, native .node modules) is signed with a valid,
// timestamped signature from ONE publisher; that this publisher matches the
// publisherName in app-update.yml, which is what installed apps check updates
// against (a mismatch would make every installed copy reject every update); and that
// latest.yml's SHA-512 and size match the signed installer (they would not if
// anything changed the file after it was hashed).
//
//   --require          fail if the build is unsigned (also CURSORA_REQUIRE_SIGNING=1)
//   --allow-untrusted  accept a signature whose root is not trusted, for self-signed
//                      test certificates; never use it for a release
// An unsigned build passes (with a loud notice) unless signing is required.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const yaml = require('js-yaml');
const { parseDn } = require('builder-util-runtime');
const { truthy } = require('./signing-config');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const dirArg = args.indexOf('--dir') >= 0 ? args[args.indexOf('--dir') + 1] : 'dist';
const DIST = path.resolve(ROOT, dirArg);
const requireSigned = flag('--require') || truthy(process.env.CURSORA_REQUIRE_SIGNING);
const allowUntrusted = flag('--allow-untrusted');

const failures = [];
let signedPublisher = null; // the one publisher that signed everything, once known
const fail = message => { failures.push(message); console.log(`FAIL  ${message}`); };
const pass = message => console.log(`ok    ${message}`);
const rel = file => path.relative(ROOT, file).split(path.sep).join('/');

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
  return out;
}

/**
 * Authenticode details of each file, from one PowerShell run. File names travel in the
 * environment, one per line (a file name can't contain a newline), never in the command.
 * (Not JSON: Windows PowerShell 5.1's ConvertFrom-Json returns an array as one nested object.)
 */
function readSignatures(files) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$files = $env:CURSORA_FILES -split '\r?\n' | Where-Object { $_ }
$out = foreach ($f in $files) {
  $s = Get-AuthenticodeSignature -LiteralPath $f
  [pscustomobject]@{
    Path = $f
    Status = $s.Status.ToString()
    Message = $s.StatusMessage
    Subject = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { $null }
    NotAfter = if ($s.SignerCertificate) { $s.SignerCertificate.NotAfter.ToString('o') } else { $null }
    Timestamp = if ($s.TimeStamperCertificate) { $s.TimeStamperCertificate.Subject } else { $null }
  }
}
ConvertTo-Json -InputObject @($out) -Compress`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { env: { ...process.env, CURSORA_FILES: files.join('\n') }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => (error ? reject(new Error(`PowerShell failed: ${(stderr || error.message).trim()}`)) : resolve(JSON.parse(stdout))));
  });
}

/** The same publisher matching electron-updater applies: a full DN must match every key, a bare name must equal the CN. */
function publisherMatches(subject, names) {
  const have = parseDn(subject);
  return names.some(name => {
    const want = parseDn(name);
    return want.size ? [...want.keys()].every(k => want.get(k) === have.get(k)) : name === have.get('CN');
  });
}

async function main() {
  console.log(`Verifying ${rel(DIST)}/ ${requireSigned ? '(signing required)' : '(signing not required)'}${allowUntrusted ? ' [untrusted certificates allowed: TEST ONLY]' : ''}\n`);

  // What was built.
  const latestPath = path.join(DIST, 'latest.yml');
  if (!fs.existsSync(latestPath)) { fail(`${rel(latestPath)} is missing: run npm run dist first.`); return; }
  const latest = yaml.load(fs.readFileSync(latestPath, 'utf8'));
  const installer = path.join(DIST, latest.path);
  const unpacked = path.join(DIST, 'win-unpacked');
  const targets = [
    installer,
    path.join(DIST, `Cursora-Portable-${latest.version}.exe`),
    path.join(unpacked, 'Cursora.exe'),
    path.join(unpacked, 'resources', 'elevate.exe'),
    ...walk(DIST, f => /__uninstaller-nsis-.*\.exe$/.test(path.basename(f)) && path.dirname(f) === DIST),
    ...walk(path.join(unpacked, 'resources', 'app.asar.unpacked'), f => f.endsWith('.node')),
  ];
  for (const file of targets.filter(f => !fs.existsSync(f))) fail(`${rel(file)} is missing from the build.`);
  const present = targets.filter(f => fs.existsSync(f));

  // Signatures.
  const signatures = await readSignatures(present);
  const signed = signatures.filter(s => s.Status !== 'NotSigned');
  if (signed.length === 0) {
    if (requireSigned) fail(`The build is unsigned but signing is required: no file in ${rel(DIST)}/ carries a signature.`);
    else console.log('NOTICE  This build is UNSIGNED. Windows SmartScreen will warn people who install it. See docs/code-signing.md.\n');
  } else {
    for (const s of signatures) {
      const name = rel(s.Path);
      if (s.Status === 'NotSigned') { fail(`${name} is not signed (the build is only partly signed).`); continue; }
      const untrustedRoot = (s.Status === 'UnknownError' || s.Status === 'NotTrusted') && /not trusted|untrusted/i.test(s.Message || '');
      if (s.Status === 'Valid') pass(`${name} is signed and trusted`);
      else if (untrustedRoot && allowUntrusted) pass(`${name} is signed (root not trusted: allowed for testing)`);
      else { fail(`${name} has signature status ${s.Status}: ${s.Message}`); continue; }
      if (!s.Timestamp) fail(`${name} has no trusted timestamp, so its signature would stop being valid when the certificate expires.`);
    }
    const subjects = [...new Set(signed.map(s => s.Subject))];
    if (subjects.length === 1) { signedPublisher = subjects[0]; pass(`one publisher signed every file: ${subjects[0]}`); }
    else fail(`files are signed by different publishers: ${subjects.join(' || ')}`);

    // What installed apps will enforce on future updates.
    const updatePath = path.join(unpacked, 'resources', 'app-update.yml');
    const configured = fs.existsSync(updatePath) ? yaml.load(fs.readFileSync(updatePath, 'utf8')).publisherName : null;
    const names = [].concat(configured || []);
    if (!names.length) fail('app-update.yml has no publisherName, so installed apps would install updates WITHOUT checking who signed them.');
    else if (subjects.length === 1 && publisherMatches(subjects[0], names)) pass(`publisherName in app-update.yml matches the signer (${names.join(' | ')})`);
    else if (subjects.length === 1) fail(`publisherName in app-update.yml (${names.join(' | ')}) does not match the signer (${subjects[0]}): installed apps would REJECT every update from this build.`);
  }

  // The update metadata must describe the file as shipped.
  if (fs.existsSync(installer)) {
    const bytes = fs.readFileSync(installer);
    const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
    const entry = (latest.files || []).find(f => f.url === latest.path) || (latest.files || [])[0] || {};
    if (latest.sha512 === sha512 && entry.sha512 === sha512) pass('latest.yml SHA-512 matches the installer');
    else fail('latest.yml SHA-512 does not match the installer: it was changed after being hashed, so every update would be rejected.');
    if (entry.size === bytes.length) pass('latest.yml size matches the installer');
    else fail(`latest.yml size (${entry.size}) does not match the installer (${bytes.length}).`);
  }
  if (!fs.existsSync(`${installer}.blockmap`)) fail(`${rel(installer)}.blockmap is missing.`);
}

/** On GitHub Actions, shows the outcome on the run's summary page. */
function writeSummary(line) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Code signing\n\n${line}\n`); } catch { /* the summary is a courtesy */ }
}

main().then(() => {
  console.log(failures.length ? `\n${failures.length} problem(s). Do not release this build.` : '\nAll checks passed.');
  writeSummary(failures.length
    ? `**Not releasable:** ${failures.length} problem(s)\n\n${failures.map(f => `- ${f}`).join('\n')}`
    : signedPublisher ? `**Signed** by \`${signedPublisher}\`; all signatures, the publisher name and the update metadata check out.`
      : '**Unsigned build.** Windows SmartScreen will warn people who install it. See docs/code-signing.md.');
  process.exit(failures.length ? 1 : 0);
}, error => { console.error(`\nverify-signing could not run: ${error.message}`); process.exit(2); });
