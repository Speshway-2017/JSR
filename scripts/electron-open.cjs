#!/usr/bin/env node
/**
 * Open Electron against already-running API + Vite.
 * Fails fast with instructions if they are not up.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_PORT = process.env.PORT || 5050;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const HEALTH = `http://127.0.0.1:${SERVER_PORT}/api/health`;
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(!!(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const apiUp = await checkUrl(HEALTH);
  const clientUp = await checkUrl(CLIENT_URL);

  if (!apiUp || !clientUp) {
    console.error('[electron:open] Client/API are not running.');
    if (!apiUp) console.error(`  ✗ API   ${HEALTH}`);
    else console.error(`  ✓ API   ${HEALTH}`);
    if (!clientUp) console.error(`  ✗ Vite  ${CLIENT_URL}`);
    else console.error(`  ✓ Vite  ${CLIENT_URL}`);
    console.error('\nStart them first, or use one command:\n  npm run electron:dev\n');
    process.exit(1);
  }

  console.log(`[electron:open] Opening ${CLIENT_URL}`);
  const electronPath = require('electron');
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_START_URL: CLIENT_URL,
    PORT: String(SERVER_PORT),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, ['.'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => process.exit(code || 0));
})();
