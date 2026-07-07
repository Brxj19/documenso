#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const args = new Set(process.argv.slice(2));
const force = args.has('--force');

const outputDir = path.resolve(cwd, '.local/reusable-signing-tool/certs');
const keyPath = path.join(outputDir, 'dev-signing-private.key');
const certificatePath = path.join(outputDir, 'dev-signing-certificate.crt');
const p12Path = path.join(outputDir, 'dev-signing-certificate.p12');

const passphrase = process.env.DOCUMENSO_DEV_SIGNING_PASSPHRASE ?? '';
const subject = process.env.DOCUMENSO_DEV_SIGNING_SUBJECT ?? '/CN=reusable-signing-tool-dev/O=Local Development/C=US';
const daysRaw = process.env.DOCUMENSO_DEV_SIGNING_DAYS ?? '365';
const days = Number.parseInt(daysRaw, 10);

if (!Number.isInteger(days) || days <= 0) {
  console.error(`DOCUMENSO_DEV_SIGNING_DAYS must be a positive integer, received "${daysRaw}".`);
  process.exit(1);
}

const outputPaths = [keyPath, certificatePath, p12Path];
const existingPaths = outputPaths.filter((filePath) => fs.existsSync(filePath));

if (existingPaths.length > 0 && !force) {
  console.error('Development certificate material already exists.');
  console.error('Re-run with --force to replace it:');
  existingPaths.forEach((filePath) => {
    console.error(`- ${path.relative(cwd, filePath) || filePath}`);
  });
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

try {
  fs.chmodSync(outputDir, 0o700);
} catch {
  // Best effort only. Some filesystems may not support POSIX modes.
}

for (const filePath of outputPaths) {
  if (force && fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }
}

const runOpenSsl = (openSslArgs, options = {}) => {
  const result = spawnSync('openssl', openSslArgs, {
    stdio: options.stdio ?? 'inherit',
    encoding: 'utf8',
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error('OpenSSL was not found on PATH.');
    } else {
      console.error(result.error.message);
    }

    process.exit(1);
  }

  if (result.status !== 0 && options.allowFailure !== true) {
    process.exit(result.status ?? 1);
  }

  return result;
};

let tempDirectory = null;
let passphraseFilePath = null;

if (passphrase.length > 0) {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'documenso-dev-cert-'));
  passphraseFilePath = path.join(tempDirectory, 'passphrase.txt');
  fs.writeFileSync(passphraseFilePath, passphrase, { mode: 0o600 });
}

runOpenSsl(['genrsa', '-out', keyPath, '2048']);
runOpenSsl(['req', '-new', '-x509', '-key', keyPath, '-out', certificatePath, '-days', String(days), '-subj', subject]);
const pkcs12Args = [
  'pkcs12',
  '-export',
  '-out',
  p12Path,
  '-inkey',
  keyPath,
  '-in',
  certificatePath,
  '-passout',
  passphraseFilePath ? `file:${passphraseFilePath}` : 'pass:',
];

const pkcs12WithLegacy = runOpenSsl([...pkcs12Args.slice(0, 8), '-legacy', ...pkcs12Args.slice(8)], {
  allowFailure: true,
  stdio: 'pipe',
});

if (pkcs12WithLegacy.status === 0) {
  if (pkcs12WithLegacy.stdout) {
    process.stdout.write(pkcs12WithLegacy.stdout);
  }

  if (pkcs12WithLegacy.stderr) {
    process.stderr.write(pkcs12WithLegacy.stderr);
  }
} else {
  const combinedOutput = `${pkcs12WithLegacy.stdout ?? ''}${pkcs12WithLegacy.stderr ?? ''}`;

  if (combinedOutput.includes("unknown option '-legacy'")) {
    runOpenSsl(pkcs12Args);
  } else {
    if (pkcs12WithLegacy.stdout) {
      process.stdout.write(pkcs12WithLegacy.stdout);
    }

    if (pkcs12WithLegacy.stderr) {
      process.stderr.write(pkcs12WithLegacy.stderr);
    }

    process.exit(pkcs12WithLegacy.status ?? 1);
  }
}

for (const filePath of outputPaths) {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort only. Some filesystems may not support POSIX modes.
  }
}

if (tempDirectory) {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log('Created development-only signing certificate material.');
console.log(`P12 path: ${p12Path}`);
console.log('Add the following values to your local .env file:');
console.log(`NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH="${p12Path}"`);

if (passphrase.length > 0) {
  console.log('NEXT_PRIVATE_SIGNING_PASSPHRASE="<use the same value as DOCUMENSO_DEV_SIGNING_PASSPHRASE>"');
} else {
  console.log('NEXT_PRIVATE_SIGNING_PASSPHRASE=""');
}
