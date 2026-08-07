#!/usr/bin/env node
/**
 * Downloads a portable MongoDB Community binary into resources/mongodb/<platform>
 * for bundling into the desktop installer (offline use — no system MongoDB required).
 *
 * Usage:
 *   node scripts/download-mongodb.cjs              # current platform
 *   node scripts/download-mongodb.cjs win32
 *   node scripts/download-mongodb.cjs darwin
 *   node scripts/download-mongodb.cjs linux
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

const VERSION = process.env.MONGODB_VERSION || '7.0.14';
const ROOT = path.join(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'resources', 'mongodb');

const PLATFORM = process.argv[2] || process.platform;

const ARCHIVES = {
  win32: {
    url: `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${VERSION}.zip`,
    kind: 'zip',
    binName: 'mongod.exe',
  },
  darwin: {
    url:
      process.arch === 'arm64'
        ? `https://fastdl.mongodb.org/osx/mongodb-macos-arm64-${VERSION}.tgz`
        : `https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-${VERSION}.tgz`,
    kind: 'tgz',
    binName: 'mongod',
  },
  linux: {
    url: `https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-${VERSION}.tgz`,
    kind: 'tgz',
    binName: 'mongod',
  },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;

    const request = (currentUrl) => {
      get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed ${res.statusCode} for ${currentUrl}`));
          return;
        }
        pipeline(res, file).then(resolve).catch(reject);
      }).on('error', reject);
    };

    request(url);
  });
}

function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  const spec = ARCHIVES[PLATFORM];
  if (!spec) {
    console.error(`Unsupported platform: ${PLATFORM}`);
    process.exit(1);
  }

  const destDir = path.join(OUT_ROOT, PLATFORM, 'bin');
  const destBin = path.join(destDir, spec.binName);
  if (fs.existsSync(destBin)) {
    console.log(`[mongodb] Already present: ${destBin}`);
    return;
  }

  fs.mkdirSync(path.join(OUT_ROOT, PLATFORM), { recursive: true });
  const tmpDir = path.join(OUT_ROOT, '_tmp', PLATFORM);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const archivePath = path.join(tmpDir, spec.kind === 'zip' ? 'mongo.zip' : 'mongo.tgz');
  console.log(`[mongodb] Downloading ${spec.url}`);
  console.log('[mongodb] This is large (~100–200MB) and only needed when building the installer…');
  await download(spec.url, archivePath);
  console.log('[mongodb] Extracting…');

  if (spec.kind === 'zip') {
    try {
      execFileSync('unzip', ['-q', archivePath, '-d', tmpDir], { stdio: 'inherit' });
    } catch {
      // Fallback: PowerShell on Windows builders
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Expand-Archive -Path "${archivePath}" -DestinationPath "${tmpDir}" -Force`],
        { stdio: 'inherit' }
      );
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', tmpDir], { stdio: 'inherit' });
  }

  const found = findFile(tmpDir, spec.binName);
  if (!found) {
    throw new Error(`Could not find ${spec.binName} in extracted archive`);
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(found, destBin);
  if (PLATFORM !== 'win32') {
    fs.chmodSync(destBin, 0o755);
  }

  fs.rmSync(path.join(OUT_ROOT, '_tmp'), { recursive: true, force: true });
  console.log(`[mongodb] Ready: ${destBin}`);
}

main().catch((err) => {
  console.error('[mongodb]', err.message);
  process.exit(1);
});
