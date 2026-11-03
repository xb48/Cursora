// Run with: npm run test:signing
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveSigning, configuredModes } = require('./signing-config');
const { parseCommand, redact } = require('./sign-command');

const AZURE = {
  CURSORA_AZURE_ENDPOINT: 'https://eus.codesigning.azure.net/',
  CURSORA_AZURE_ACCOUNT: 'cursora-signing',
  CURSORA_AZURE_PROFILE: 'cursora-public',
  AZURE_TENANT_ID: 'tenant', AZURE_CLIENT_ID: 'client', AZURE_CLIENT_SECRET: 'sekret-azure-value',
  CURSORA_PUBLISHER_NAME: 'Jane Doe',
};

test('no method configured: unsigned, with a notice', () => {
  const r = resolveSigning({});
  assert.equal(r.mode, 'none');
  assert.equal(r.signed, false);
  assert.deepEqual(r.problems, []);
  assert.match(r.notes.join(' '), /UNSIGNED/);
  assert.deepEqual(r.win, {});
});

test('signing required but nothing configured: refused', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
    const r = resolveSigning({ CURSORA_REQUIRE_SIGNING: v });
    assert.equal(r.problems.length, 1, v);
    assert.match(r.problems[0], /required/);
  }
  assert.deepEqual(resolveSigning({ CURSORA_REQUIRE_SIGNING: 'false' }).problems, []);
  assert.deepEqual(resolveSigning({ CURSORA_REQUIRE_SIGNING: '' }).problems, []);
});

test('azure: complete configuration', () => {
  const r = resolveSigning(AZURE);
  assert.deepEqual(r.problems, []);
  assert.equal(r.mode, 'azure');
  assert.equal(r.signed, true);
  assert.deepEqual(r.win.azureSignOptions, {
    endpoint: 'https://eus.codesigning.azure.net/',
    codeSigningAccountName: 'cursora-signing',
    certificateProfileName: 'cursora-public',
    FileDigest: 'SHA256',
    TimestampRfc3161: 'http://timestamp.acs.microsoft.com',
    TimestampDigest: 'SHA256',
  });
  assert.deepEqual(r.win.publisherName, ['Jane Doe']);
  assert.equal(r.win.signtoolOptions, undefined, 'azure must not be combined with signtoolOptions');
  assert.deepEqual(r.win.signExts, ['.node']);
});

test('azure: every missing setting is reported', () => {
  const r = resolveSigning({ CURSORA_AZURE_ENDPOINT: 'https://x.codesigning.azure.net' });
  const text = r.problems.join('\n');
  for (const name of ['CURSORA_AZURE_ACCOUNT', 'CURSORA_AZURE_PROFILE', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'CURSORA_PUBLISHER_NAME']) assert.match(text, new RegExp(name), name);
  assert.equal(r.signed, false);
});

test('azure: the endpoint must be https; a certificate can replace the secret', () => {
  assert.match(resolveSigning({ ...AZURE, CURSORA_AZURE_ENDPOINT: 'http://eus.codesigning.azure.net' }).problems.join(), /https/);
  assert.match(resolveSigning({ ...AZURE, CURSORA_AZURE_ENDPOINT: 'not a url' }).problems.join(), /https/);
  const { AZURE_CLIENT_SECRET, ...noSecret } = AZURE;
  assert.match(resolveSigning(noSecret).problems.join(), /AZURE_CLIENT_SECRET/);
  assert.deepEqual(resolveSigning({ ...noSecret, AZURE_CLIENT_CERTIFICATE_PATH: 'c:/x.pem' }).problems, []);
});

test('pfx: CSC_LINK selects it; signs with sha256 and a timestamp', () => {
  const r = resolveSigning({ CSC_LINK: 'c:/cert.pfx', CSC_KEY_PASSWORD: 'pw-value' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.mode, 'pfx');
  assert.deepEqual(r.win.signtoolOptions.signingHashAlgorithms, ['sha256']);
  assert.equal(r.win.signtoolOptions.rfc3161TimeStampServer, 'http://timestamp.digicert.com');
  assert.equal(r.win.signtoolOptions.publisherName, undefined, 'derived from the certificate when not set');
  assert.equal(resolveSigning({ WIN_CSC_LINK: 'c:/cert.pfx' }).mode, 'pfx');
  assert.match(resolveSigning({ CSC_LINK: 'c:/cert.pfx' }).notes.join(), /CSC_KEY_PASSWORD/);
});

test('pfx: an explicit publisher name list is passed through', () => {
  const r = resolveSigning({ CSC_LINK: 'x', CSC_KEY_PASSWORD: 'p', CURSORA_PUBLISHER_NAME: ' Old Name | New Name ' });
  assert.deepEqual(r.win.signtoolOptions.publisherName, ['Old Name', 'New Name']);
  assert.deepEqual(r.publisherNames, ['Old Name', 'New Name']);
});

test('store: thumbprint is normalised and validated', () => {
  const sha = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01'.replace(/:/g, '');
  const ok = resolveSigning({ CURSORA_SIGN_SHA1: sha.replace(/(..)/g, '$1 ').trim() });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.mode, 'store');
  assert.equal(ok.win.signtoolOptions.certificateSha1, sha);
  assert.match(resolveSigning({ CURSORA_SIGN_SHA1: 'abc123' }).problems.join(), /40-character/);
  const bySubject = resolveSigning({ CURSORA_SIGN_SUBJECT: 'Jane Doe' });
  assert.equal(bySubject.win.signtoolOptions.certificateSubjectName, 'Jane Doe');
  assert.equal(resolveSigning({ CURSORA_SIGN_MODE: 'store' }).problems.length, 1);
});

test('command: valid, and every way to get it wrong', () => {
  const cmd = JSON.stringify(['signer.exe', 'sign', '--in', '{file}']);
  const ok = resolveSigning({ CURSORA_SIGN_COMMAND: cmd, CURSORA_PUBLISHER_NAME: 'Jane Doe' });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.mode, 'command');
  assert.equal(ok.win.signtoolOptions.sign, path.join(__dirname, 'sign-command.js'));
  assert.match(resolveSigning({ CURSORA_SIGN_COMMAND: 'signer.exe sign {file}', CURSORA_PUBLISHER_NAME: 'x' }).problems.join(), /JSON array/);
  assert.match(resolveSigning({ CURSORA_SIGN_COMMAND: '["signer.exe","sign"]', CURSORA_PUBLISHER_NAME: 'x' }).problems.join(), /\{file\}/);
  assert.match(resolveSigning({ CURSORA_SIGN_COMMAND: '[]', CURSORA_PUBLISHER_NAME: 'x' }).problems.join(), /JSON array/);
  assert.match(resolveSigning({ CURSORA_SIGN_COMMAND: '["a",1]', CURSORA_PUBLISHER_NAME: 'x' }).problems.join(), /JSON array/);
  assert.match(resolveSigning({ CURSORA_SIGN_COMMAND: cmd }).problems.join(), /CURSORA_PUBLISHER_NAME/);
});

test('two methods configured is ambiguous unless CURSORA_SIGN_MODE decides', () => {
  const both = { ...AZURE, CSC_LINK: 'c:/c.pfx', CSC_KEY_PASSWORD: 'p' };
  assert.deepEqual(configuredModes(both).sort(), ['azure', 'pfx']);
  assert.match(resolveSigning(both).problems.join(), /More than one/);
  assert.equal(resolveSigning({ ...both, CURSORA_SIGN_MODE: 'pfx' }).mode, 'pfx');
  assert.equal(resolveSigning({ ...both, CURSORA_SIGN_MODE: 'azure' }).mode, 'azure');
});

test('CURSORA_SIGN_MODE: validated, case-insensitive, "none" turns signing off', () => {
  assert.match(resolveSigning({ CURSORA_SIGN_MODE: 'gpg' }).problems.join(), /not one of/);
  assert.equal(resolveSigning({ ...AZURE, CURSORA_SIGN_MODE: 'AZURE' }).mode, 'azure');
  const off = resolveSigning({ ...AZURE, CURSORA_SIGN_MODE: 'none' });
  assert.equal(off.mode, 'none');
  assert.deepEqual(off.problems, []);
  assert.match(resolveSigning({ ...AZURE, CURSORA_SIGN_MODE: 'none', CURSORA_REQUIRE_SIGNING: '1' }).problems.join(), /required/);
});

test('timestamp server: default per method, override validated', () => {
  assert.equal(resolveSigning({ CSC_LINK: 'x', CSC_KEY_PASSWORD: 'p', CURSORA_TIMESTAMP_URL: 'http://time.certum.pl' }).win.signtoolOptions.rfc3161TimeStampServer, 'http://time.certum.pl');
  assert.match(resolveSigning({ CSC_LINK: 'x', CSC_KEY_PASSWORD: 'p', CURSORA_TIMESTAMP_URL: 'ftp://nope' }).problems.join(), /http/);
  assert.equal(resolveSigning({ ...AZURE, CURSORA_TIMESTAMP_URL: 'http://timestamp.digicert.com' }).win.azureSignOptions.TimestampRfc3161, 'http://timestamp.digicert.com');
});

test('every signed build signs only sha256 and also the native module', () => {
  for (const env of [{ CSC_LINK: 'x', CSC_KEY_PASSWORD: 'p' }, { CURSORA_SIGN_SUBJECT: 's' }]) {
    const r = resolveSigning(env);
    assert.deepEqual(r.win.signtoolOptions.signingHashAlgorithms, ['sha256']);
    assert.deepEqual(r.win.signExts, ['.node']);
  }
});

test('secrets never appear in the summary, notes or problems', () => {
  const secrets = { CSC_LINK: 'https://secret.example/cert.pfx', CSC_KEY_PASSWORD: 'hunter2-password', AZURE_CLIENT_SECRET: 'sekret-azure-value' };
  for (const env of [{ ...secrets }, { ...AZURE, ...secrets, CURSORA_SIGN_MODE: 'azure' }, { ...secrets, CURSORA_SIGN_MODE: 'store' }]) {
    const r = resolveSigning(env);
    const shown = JSON.stringify([r.summary, r.notes, r.problems]);
    for (const value of Object.values(secrets)) assert.ok(!shown.includes(value), `leaked ${value}`);
  }
});

test('parseCommand (the signing hook) accepts exactly what the config accepts', () => {
  assert.deepEqual(parseCommand('["a","{file}"]'), ['a', '{file}']);
  assert.throws(() => parseCommand('["a"]'), /\{file\}/);
  assert.throws(() => parseCommand('nope'), /JSON array/);
  assert.throws(() => parseCommand(undefined), /JSON array/);
});

test('redact hides every long argument of the signing command, wherever a tool echoes it', () => {
  const argv = ['signer.exe', 'sign', '--password', 'hunter2-password', '--user', 'jane@example.com', '{file}'];
  const echoed = 'auth failed for jane@example.com using hunter2-password (retry hunter2-password)';
  assert.equal(redact(echoed, argv), 'auth failed for *** using *** (retry ***)');
  assert.equal(redact('no secrets here', argv), 'no secrets here');
  assert.equal(redact('the program signer.exe ran', argv), 'the program signer.exe ran', 'the program name stays visible');
});
