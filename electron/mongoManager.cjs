const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

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

function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
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

/**
 * Starts bundled mongod. Data is stored under userData/mongo-data (persists across launches).
 */
function createMongoManager({ resourcesRoot, userDataPath, log = console }) {
  let processRef = null;
  let startedByUs = false;

  const dataDir = path.join(userDataPath, 'mongo-data');
  const logPath = path.join(userDataPath, 'mongod.log');

  async function start() {
    fs.mkdirSync(dataDir, { recursive: true });

    const mongod = resolveMongodPath(resourcesRoot);
    if (!mongod) {
      throw new Error(
        'Bundled MongoDB was not found in the app package.\n' +
          'Rebuild with: npm run dist:win (or dist:mac)'
      );
    }

    // If something is already listening (rare), reuse it
    const alreadyUp = await new Promise((resolve) => {
      const socket = net.connect({ port: MONGO_PORT, host: '127.0.0.1' }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
    if (alreadyUp) {
      log.log(`[mongo] Reusing existing MongoDB on port ${MONGO_PORT}`);
      return { uri: `mongodb://127.0.0.1:${MONGO_PORT}/agriTrades`, port: MONGO_PORT };
    }

    const args = [
      '--dbpath', dataDir,
      '--port', String(MONGO_PORT),
      '--bind_ip', '127.0.0.1',
      '--logpath', logPath,
      '--logappend',
    ];

    // WiredTiger quiet defaults; no auth for single-user local desktop
    processRef = spawn(mongod, args, {
      cwd: path.dirname(mongod),
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    startedByUs = true;

    processRef.stderr.on('data', (buf) => {
      log.error(`[mongod] ${buf.toString().trim()}`);
    });

    processRef.on('exit', (code, signal) => {
      if (startedByUs) {
        log.error(`[mongod] exited code=${code} signal=${signal}`);
      }
      processRef = null;
    });

    await waitForPort(MONGO_PORT);
    log.log(`[mongo] Embedded MongoDB ready on 127.0.0.1:${MONGO_PORT}`);
    return { uri: `mongodb://127.0.0.1:${MONGO_PORT}/agriTrades`, port: MONGO_PORT };
  }

  function stop() {
    if (!processRef || !startedByUs) return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(processRef.pid), '/f', '/t'], { windowsHide: true });
      } else {
        processRef.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
    processRef = null;
    startedByUs = false;
  }

  return { start, stop, port: MONGO_PORT };
}

module.exports = {
  createMongoManager,
  resolveMongodPath,
  MONGO_PORT,
};
