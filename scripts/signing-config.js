// Chooses how Cursora's Windows build is signed, from environment variables only,
// so no certificate, password or key ever lives in the repository. It is a pure
// function (env in, description out), which is what lets it be tested exhaustively.
//
// Methods (docs/code-signing.md explains each, with how to get a certificate):
//   azure    Azure Artifact Signing, a cloud service that signs in CI
//   pfx      a certificate file: CSC_LINK + CSC_KEY_PASSWORD (electron-builder's own variables)
//   store    a certificate in the Windows certificate store (hardware token, SimplySign...)
//   command  any vendor command-line signer (SSL.com, DigiCert KeyLocker, Certum...)
//   none     unsigned; refused when CURSORA_REQUIRE_SIGNING is on
'use strict';
const path = require('path');

const MODES = ['azure', 'pfx', 'store', 'command'];
const TIMESTAMP = { azure: 'http://timestamp.acs.microsoft.com', other: 'http://timestamp.digicert.com' };

const text = (env, key) => (typeof env[key] === 'string' ? env[key].trim() : '');
const truthy = value => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const isHttpUrl = value => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };

/** Which methods have their trigger variable set (more than one is ambiguous). */
function configuredModes(env) {
  const found = [];
  if (text(env, 'CURSORA_AZURE_ENDPOINT')) found.push('azure');
  if (text(env, 'CURSORA_SIGN_COMMAND')) found.push('command');
  if (text(env, 'CURSORA_SIGN_SHA1') || text(env, 'CURSORA_SIGN_SUBJECT')) found.push('store');
  if (text(env, 'CSC_LINK') || text(env, 'WIN_CSC_LINK')) found.push('pfx');
  return found;
}

/** Publisher names exactly as in the certificate: one, or several separated by "|". */
function publisherNames(env) {
  return text(env, 'CURSORA_PUBLISHER_NAME').split('|').map(s => s.trim()).filter(Boolean);
}

function resolveSigning(env = process.env) {
  const required = truthy(env.CURSORA_REQUIRE_SIGNING);
  const problems = [];
  const notes = [];
  const names = publisherNames(env);
  const result = { mode: 'none', required, signed: false, publisherNames: names, problems, notes, win: {}, summary: 'unsigned' };

  // 1. Pick the method.
  const explicit = text(env, 'CURSORA_SIGN_MODE').toLowerCase();
  const found = configuredModes(env);
  let mode = 'none';
  if (explicit) {
    if (explicit !== 'none' && !MODES.includes(explicit)) {
      problems.push(`CURSORA_SIGN_MODE "${explicit}" is not one of: ${MODES.join(', ')}, none.`);
      return result;
    }
    mode = explicit;
  } else if (found.length > 1) {
    problems.push(`More than one signing method is configured (${found.join(', ')}). Set CURSORA_SIGN_MODE to the one to use, or remove the others.`);
    return result;
  } else if (found.length === 1) {
    mode = found[0];
  }
  if (mode === 'none') {
    if (required) problems.push('Signing is required (CURSORA_REQUIRE_SIGNING) but no signing method is configured.');
    else notes.push('No signing method is configured: this build will be UNSIGNED and Windows SmartScreen will warn people who install it.');
    return result;
  }

  // 2. Timestamp: signatures must outlive the certificate, which is always short-lived or expiring.
  const timestampUrl = text(env, 'CURSORA_TIMESTAMP_URL') || (mode === 'azure' ? TIMESTAMP.azure : TIMESTAMP.other);
  if (!isHttpUrl(timestampUrl)) problems.push(`CURSORA_TIMESTAMP_URL "${timestampUrl}" is not an http(s) URL.`);
  const needNames = what => { if (!names.length) problems.push(`CURSORA_PUBLISHER_NAME is required with ${what}: the name exactly as in the certificate, because it is what installed apps check updates against.`); };

  // 3. Method-specific settings.
  const win = { signExts: ['.node'] }; // also sign the native module (koffi.node) Cursora loads
  const signtool = { signingHashAlgorithms: ['sha256'], rfc3161TimeStampServer: timestampUrl };
  if (names.length) signtool.publisherName = names;

  if (mode === 'azure') {
    const endpoint = text(env, 'CURSORA_AZURE_ENDPOINT');
    const account = text(env, 'CURSORA_AZURE_ACCOUNT');
    const profile = text(env, 'CURSORA_AZURE_PROFILE');
    if (!endpoint) problems.push('CURSORA_AZURE_ENDPOINT is missing (for example https://eus.codesigning.azure.net/, the region of your account).');
    else if (!/^https:\/\//i.test(endpoint) || !isHttpUrl(endpoint)) problems.push(`CURSORA_AZURE_ENDPOINT "${endpoint}" must be an https URL.`);
    if (!account) problems.push('CURSORA_AZURE_ACCOUNT is missing (the Artifact Signing account name).');
    if (!profile) problems.push('CURSORA_AZURE_PROFILE is missing (the certificate profile name).');
    for (const key of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID']) if (!text(env, key)) problems.push(`${key} is missing (the service principal that signs).`);
    if (!text(env, 'AZURE_CLIENT_SECRET') && !text(env, 'AZURE_CLIENT_CERTIFICATE_PATH')) problems.push('AZURE_CLIENT_SECRET (or AZURE_CLIENT_CERTIFICATE_PATH) is missing.');
    needNames('Azure signing');
    Object.assign(win, {
      publisherName: names,
      azureSignOptions: {
        endpoint,
        codeSigningAccountName: account,
        certificateProfileName: profile,
        FileDigest: 'SHA256',
        // Azure certificates are short-lived: without a timestamp a signature stops being valid within days.
        TimestampRfc3161: timestampUrl,
        TimestampDigest: 'SHA256',
      },
    });
  } else if (mode === 'pfx') {
    if (!text(env, 'CSC_LINK') && !text(env, 'WIN_CSC_LINK')) problems.push('CSC_LINK is missing (the certificate file, an https URL to it, or the file as base64).');
    if (!text(env, 'CSC_KEY_PASSWORD') && !text(env, 'WIN_CSC_KEY_PASSWORD')) notes.push('CSC_KEY_PASSWORD is not set: assuming the certificate file has no password.');
    win.signtoolOptions = signtool;
  } else if (mode === 'store') {
    const sha1 = text(env, 'CURSORA_SIGN_SHA1').replace(/[\s:]/g, '');
    const subject = text(env, 'CURSORA_SIGN_SUBJECT');
    if (!sha1 && !subject) problems.push('CURSORA_SIGN_SHA1 (the certificate thumbprint) or CURSORA_SIGN_SUBJECT is missing.');
    if (sha1 && !/^[0-9a-f]{40}$/i.test(sha1)) problems.push('CURSORA_SIGN_SHA1 must be the 40-character SHA-1 thumbprint of the certificate.');
    win.signtoolOptions = { ...signtool, ...(sha1 ? { certificateSha1: sha1 } : { certificateSubjectName: subject }) };
  } else if (mode === 'command') {
    const raw = text(env, 'CURSORA_SIGN_COMMAND');
    let argv = null;
    try { argv = JSON.parse(raw); } catch { /* reported below */ }
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every(a => typeof a === 'string' && a !== '')) {
      problems.push('CURSORA_SIGN_COMMAND must be a JSON array of strings, the program first, for example ["signer.exe","sign","{file}"].');
    } else if (!argv.some(a => a.includes('{file}'))) {
      problems.push('CURSORA_SIGN_COMMAND must contain {file}, which is replaced by the path of each file to sign.');
    }
    needNames('a signing command');
    win.signtoolOptions = { ...signtool, sign: path.join(__dirname, 'sign-command.js') };
  }

  result.mode = mode;
  result.signed = problems.length === 0;
  result.win = win;
  result.summary = `signed with ${mode}${names.length ? ` as ${names.join(' | ')}` : ''}, timestamp ${timestampUrl}`;
  return result;
}

module.exports = { resolveSigning, configuredModes, MODES, truthy };
