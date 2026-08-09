const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const MONGO_PORT = Number(process.env.EMBEDDED_MONGO_PORT || 27018);

function mongodBinaryName() {
  return process.platform === 'win32' ? 'mongod.exe' : 'mongod';
}

/**
 * Resolve bundled mongod path for packaged or local resources/.
 */
function resolveMongodPath(resourcesRoot) {
  const name = mongodBinaryName();
  const candidates = [
    path.join(resourcesRoot, 'mongodb', 'bin', name),
    path.join(resourcesRoot, 'mongodb', process.platform, 'bin', name),
    path.join(resourcesRoot, 'mongodb', name),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for MongoDB on ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 400);
      });
    };
    tryConnect();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readTail(filePath, maxBytes = 4000) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Copy mongod into userData so Windows Defender / Program Files locks are less likely.
 */
function ensureLocalMongod(bundledPath, userDataPath) {
  const destDir = path.join(userDataPath, 'mongodb-bin');
  const dest = path.join(destDir, mongodBinaryName());
  fs.mkdirSync(destDir, { recursive: true });

  try {
    const srcStat = fs.statSync(bundledPath);
    const needsCopy =
      !fs.existsSync(dest) || fs.statSync(dest).size !== srcStat.size;
    if (needsCopy) {
      fs.copyFileSync(bundledPath, dest);
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    }
    return dest;
  } catch (err) {
    // Fall back to bundled path if copy fails
    console.warn('[mongo] Could not copy mongod to userData:', err.message);
    return bundledPath;
  }
}

function clearStaleLock(dataDir, log) {
  const lockFile = path.join(dataDir, 'mongod.lock');
  if (!fs.existsSync(lockFile)) return;
  try {
    const contents = fs.readFileSync(lockFile, 'utf8').trim();
    // Empty or leftover lock after hard kill — safe to remove when port is free
    fs.unlinkSync(lockFile);
    log.log(`[mongo] Removed stale lock (${contents || 'empty'})`);
  } catch (err) {
    log.warn?.(`[mongo] Could not clear lock: ${err.message}`) ||
      log.log(`[mongo] Could not clear lock: ${err.message}`);
  }
}

function killProcessOnPort(port, log) {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'cmd.exe',
        ['/c', `netstat -ano | findstr :${port}`],
        { encoding: 'utf8', windowsHide: true }
      );
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execFileSync('taskkill', ['/pid', pid, '/f', '/t'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          log.log(`[mongo] Killed leftover PID ${pid} on port ${port}`);
        } catch {
          // ignore
        }
      }
    } catch {
      // nothing listening
    }
    return;
  }

  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    for (const pid of out.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        log.log(`[mongo] Sent SIGTERM to PID ${pid} on port ${port}`);
      } catch {
        // ignore
      }
    }
  } catch {
    // lsof empty / missing
  }
}

/**
 * Starts bundled mongod. Data is stored under userData/mongo-data (persists across launches).
 */
function createMongoManager({ resourcesRoot, userDataPath, log = console }) {
  let processRef = null;
  let startedByUs = false;
  let stopping = false;
  let restartTimer = null;
  let mongodPath = null;

  const dataDir = path.join(userDataPath, 'mongo-data');
  const logPath = path.join(userDataPath, 'mongod.log');

  function spawnMongod() {
    const args = [
      '--dbpath', dataDir,
      '--port', String(MONGO_PORT),
      '--bind_ip', '127.0.0.1',
      '--logpath', logPath,
      '--logappend',
    ];

    processRef = spawn(mongodPath, args, {
      cwd: path.dirname(mongodPath),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      // Keep mongod alive with the Electron parent (not detached)
    });
    startedByUs = true;

    processRef.stderr.on('data', (buf) => {
      log.error(`[mongod] ${buf.toString().trim()}`);
    });

    processRef.on('exit', (code, signal) => {
      const wasOurs = startedByUs;
      processRef = null;
      if (stopping || !wasOurs) return;
      log.error(`[mongod] exited unexpectedly code=${code} signal=${signal}`);
      // Auto-restart so login/save keep working if AV or crash killed mongod
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (stopping) return;
        log.log('[mongo] Restarting embedded MongoDB…');
        try {
          clearStaleLock(dataDir, log);
          spawnMongod();
        } catch (err) {
          log.error(`[mongo] Restart failed: ${err.message}`);
        }
      }, 1500);
    });
  }

  async function start() {
    stopping = false;
    fs.mkdirSync(dataDir, { recursive: true });

    const bundled = resolveMongodPath(resourcesRoot);
    if (!bundled) {
      throw new Error(
        'Bundled MongoDB was not found in the app package.\n' +
          'Rebuild with: npm run dist:win (or dist:mac)'
      );
    }
    mongodPath = ensureLocalMongod(bundled, userDataPath);

    // Free port / clear lock from a previous hard kill
    if (await portOpen(MONGO_PORT)) {
      log.log(`[mongo] Port ${MONGO_PORT} busy — clearing leftover process`);
      killProcessOnPort(MONGO_PORT, log);
      await sleep(800);
    }

    if (!(await portOpen(MONGO_PORT))) {
      clearStaleLock(dataDir, log);
    }

    if (await portOpen(MONGO_PORT)) {
      log.log(`[mongo] Reusing existing MongoDB on port ${MONGO_PORT}`);
      return { uri: `mongodb://127.0.0.1:${MONGO_PORT}/agriTrades`, port: MONGO_PORT };
    }

    spawnMongod();

    try {
      await waitForPort(MONGO_PORT);
      // Port open ≠ fully ready — give WiredTiger a moment after crash recovery
      await sleep(1200);
      if (!(await portOpen(MONGO_PORT))) {
        throw new Error('MongoDB opened then closed immediately');
      }
    } catch (err) {
      const tail = readTail(logPath);
      throw new Error(
        `${err.message}\n\n--- mongod.log (tail) ---\n${tail || '(empty)'}`
      );
    }

    log.log(`[mongo] Embedded MongoDB ready on 127.0.0.1:${MONGO_PORT}`);
    return { uri: `mongodb://127.0.0.1:${MONGO_PORT}/agriTrades`, port: MONGO_PORT };
  }

  function stop() {
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (!processRef || !startedByUs) {
      processRef = null;
      startedByUs = false;
      return;
    }

    const pid = processRef.pid;
    processRef = null;
    startedByUs = false;

    try {
      // Prefer clean shutdown so next launch does not need long recovery
      spawn(
        mongodPath,
        ['--dbpath', dataDir, '--shutdown'],
        { windowsHide: true, stdio: 'ignore' }
      );
    } catch {
      // ignore
    }

    setTimeout(() => {
      try {
        if (process.platform === 'win32' && pid) {
          spawn('taskkill', ['/pid', String(pid), '/f', '/t'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } else if (pid) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }, 2000);
  }

  return { start, stop, port: MONGO_PORT };
}

module.exports = {
  createMongoManager,
  resolveMongodPath,
  MONGO_PORT,
};
