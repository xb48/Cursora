// electron-builder signing hook for command-line signers (SSL.com CodeSignTool,
// DigiCert KeyLocker smctl, Certum, AzureSignTool...). Used when CURSORA_SIGN_COMMAND
// is set: a JSON array of strings, the program first, with {file} standing for the
// file to sign, e.g. ["CodeSignTool.bat","sign","-input_file_path","{file}"].
//
// - Runs without a shell, so file names and arguments can't inject commands.
// - One file at a time: vendor tools often hold a single session or token.
// - Never prints the arguments (they may hold credentials), only the program name.
// - Fails unless the file really carries a signature afterwards: some tools exit 0
//   without signing.
'use strict';
const { execFile } = require('child_process');
const path = require('path');

const TIMEOUT_MS = 5 * 60 * 1000;

function parseCommand(raw) {
  let argv;
  try { argv = JSON.parse(raw || ''); } catch { argv = null; }
  if (!Array.isArray(argv) || !argv.length || !argv.every(a => typeof a === 'string' && a)) {
    throw new Error('CURSORA_SIGN_COMMAND must be a JSON array of strings, the program first.');
  }
  if (!argv.some(a => a.includes('{file}'))) throw new Error('CURSORA_SIGN_COMMAND must contain {file}.');
  return argv;
}

const run = (file, args, options) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); } else resolve(stdout);
  });
});

/** The Authenticode status of a file: "Valid", "NotSigned", "UnknownError" (untrusted root)... */
async function signatureStatus(file) {
  const script = "$ErrorActionPreference='Stop'; (Get-AuthenticodeSignature -LiteralPath $env:CURSORA_FILE).Status.ToString()";
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, CURSORA_FILE: file } });
  return out.trim();
}

/** Hides every argument of the command (they may be passwords or tokens) wherever a tool echoes them back. */
function redact(text, argv) {
  let out = text;
  for (const secret of argv.slice(1).filter(a => a.length >= 8 && !a.includes('{file}'))) out = out.split(secret).join('***');
  return out;
}

async function signOne(configuration) {
  const file = configuration.path;
  const argv = parseCommand(process.env.CURSORA_SIGN_COMMAND);
  const [program, ...args] = argv.map(a => a.split('{file}').join(file));
  const name = path.basename(program);
  try {
    await run(program, args, { shell: false });
  } catch (error) {
    const tail = redact(String(error.stderr || error.stdout || ''), argv).trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 300);
    const why = error.killed ? `timed out after ${TIMEOUT_MS / 1000}s` : `exit code ${error.code}`;
    throw new Error(`Signing ${path.basename(file)} with ${name} failed (${why})${tail ? `: ${tail}` : ''}`);
  }
  const status = await signatureStatus(file);
  if (status === 'NotSigned' || status === 'HashMismatch') {
    throw new Error(`${name} reported success but ${path.basename(file)} is ${status === 'NotSigned' ? 'not signed' : 'damaged (HashMismatch)'}.`);
  }
}

// Strictly one at a time, in order.
let queue = Promise.resolve();
module.exports = function sign(configuration) {
  const task = queue.then(() => signOne(configuration));
  queue = task.catch(() => {});
  return task;
};
module.exports.default = module.exports;
module.exports.parseCommand = parseCommand;
module.exports.redact = redact;
