#!/usr/bin/env node
/**
 * Smart Electron launcher for development.
 * Starts API + Vite if needed, then opens the desktop window.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_PORT = process.env.PORT || 5050;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const HEALTH = `http://127.0.0.1:${SERVER_PORT}/api/health`;
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[electron:dev] ${msg}`);
}

function checkUrl(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(!!(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function resolveClientUrl() {
  const candidates = [
    `http://127.0.0.1:${CLIENT_PORT}`,
    `http://localhost:${CLIENT_PORT}`,
    `http://[::1]:${CLIENT_PORT}`,
  ];
  for (const url of candidates) {
    if (await checkUrl(url)) return url;
  }
  return null;
}

function waitForUrl(url, label, { timeoutMs = 90000, intervalMs = 500 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await checkUrl(url)) {
        resolve();
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label} (${url})`));
        return;
      }
      if (elapsed > 0 && elapsed % 5000 < intervalMs) {
        log(`Still waiting for ${label}…`);
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function run(command, args, name, env = {}) {
  const mergedEnv = { ...process.env, ...env };
  // Electron must not run in Node mode or `app` is undefined
  delete mergedEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(command, args, {
    cwd: ROOT,
    env: mergedEnv,
    stdio: 'inherit',
    shell: false,
  });
  children.push({ child, name, owned: true });
  child.on('error', (err) => {
    console.error(`[electron:dev] Failed to start ${name}:`, err.message);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

(async () => {
  try {
    const apiUp = await checkUrl(HEALTH);
    let clientUrl = await resolveClientUrl();

    if (apiUp) {
      log(`API already running on :${SERVER_PORT}`);
    } else {
      log(`Starting API on :${SERVER_PORT}…`);
      run('npm', ['run', 'dev', '--prefix', 'server'], 'server');
      await waitForUrl(HEALTH, 'API');
      log('API ready');
    }

    if (clientUrl) {
      log(`Vite already running at ${clientUrl}`);
    } else {
      log(`Starting Vite on :${CLIENT_PORT}…`);
      run('npm', ['run', 'dev', '--prefix', 'client'], 'client');
      const started = Date.now();
      while (!(clientUrl = await resolveClientUrl())) {
        if (Date.now() - started > 90000) {
          throw new Error(`Timed out waiting for Vite on port ${CLIENT_PORT}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      log(`Vite ready at ${clientUrl}`);
    }

    const electronPath = require('electron');
    log(`Opening Electron → ${clientUrl}`);
    const electron = run(
      electronPath,
      ['.'],
      'electron',
      {
        NODE_ENV: 'development',
        ELECTRON_START_URL: clientUrl,
        PORT: String(SERVER_PORT),
      }
    );

    electron.on('exit', (code) => {
      log('Electron closed');
      shutdown(code || 0);
    });
  } catch (err) {
    console.error(`\n[electron:dev] ${err.message}`);
    console.error('Make sure MongoDB is running: mongodb://127.0.0.1:27017\n');
    shutdown(1);
  }
})();
