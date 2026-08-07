const electron = require('electron');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
} = electron;

if (!app) {
  console.error(
    'AgriTrades must be started with the Electron runtime (npm run electron:dev).\n' +
      'If ELECTRON_RUN_AS_NODE is set in your environment, unset it and retry.'
  );
  process.exit(1);
}

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { buildAppMenu } = require('./menu.cjs');
const { createMongoManager } = require('./mongoManager.cjs');

const isPackaged = app.isPackaged;
const isDev = !isPackaged && process.env.NODE_ENV !== 'production';
const SERVER_PORT = process.env.PORT || 5050;
const CLIENT_DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3000';
const APP_PROD_URL = `http://127.0.0.1:${SERVER_PORT}`;

let mainWindow = null;
let serverProcess = null;
let mongoManager = null;
let isQuitting = false;
let allowClose = false;
let confirmOpen = false;

function resourcesRoot() {
  if (isPackaged) return process.resourcesPath;
  return path.join(__dirname, '..', 'resources');
}

function projectRoot() {
  return path.join(__dirname, '..');
}

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 11 } : undefined,
    title: 'AgriTrades',
    backgroundColor: '#F8F9F4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(buildAppMenu({
    getMainWindow,
    requestQuit: () => confirmAndQuit(),
    isDev,
  }));

  const startUrl = isDev ? CLIENT_DEV_URL : APP_PROD_URL;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 5000);

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[electron] Failed to load ${url}: ${desc} (${code})`);
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });

  mainWindow.on('close', (event) => {
    if (allowClose || isQuitting) return;
    event.preventDefault();
    confirmAndQuit();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith('about:blank') || url.startsWith('data:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }
    // Stay offline-friendly: do not open external browser for unknown links
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopAllServices() {
  stopEmbeddedServer();
  if (mongoManager) {
    mongoManager.stop();
    mongoManager = null;
  }
}

async function confirmAndQuit() {
  if (isQuitting || allowClose || confirmOpen) return;
  confirmOpen = true;

  try {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: ['Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Quit AgriTrades',
      message: 'Close AgriTrades?',
      detail: 'The application will quit. Your data stays saved on this PC.',
      noLink: true,
    });

    if (response !== 0) return;

    allowClose = true;
    isQuitting = true;
    stopAllServices();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners('close');
      mainWindow.close();
    }
    app.quit();
  } finally {
    confirmOpen = false;
  }
}

function waitForUrl(url, { timeoutMs = 120000, intervalMs = 400 } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

function resolveServerPaths() {
  if (isPackaged) {
    return {
      serverDir: path.join(process.resourcesPath, 'server'),
      entry: path.join(process.resourcesPath, 'server', 'index.js'),
      clientDist: path.join(process.resourcesPath, 'client', 'dist'),
    };
  }
  return {
    serverDir: path.join(projectRoot(), 'server'),
    entry: path.join(projectRoot(), 'server', 'index.js'),
    clientDist: path.join(projectRoot(), 'client', 'dist'),
  };
}

function startEmbeddedServer(mongoUri) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const { serverDir, entry, clientDist } = resolveServerPaths();
    if (!fs.existsSync(entry)) {
      done(new Error(`Server entry not found: ${entry}`));
      return;
    }

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    serverProcess = spawn(process.execPath, [entry], {
      cwd: serverDir,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(SERVER_PORT),
        ELECTRON_RUN: '1',
        NODE_ENV: 'production',
        MONGODB_URI: mongoUri,
        CLIENT_DIST: clientDist,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@agritrades.com',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
        JWT_SECRET: process.env.JWT_SECRET || 'agri_trades_desktop_secret',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    serverProcess.stdout.on('data', (buf) => {
      process.stdout.write(`[server] ${buf.toString()}`);
    });
    serverProcess.stderr.on('data', (buf) => {
      process.stderr.write(`[server] ${buf.toString()}`);
    });
    serverProcess.on('error', (err) => done(err));
    serverProcess.on('exit', (code) => {
      if (!isQuitting && !settled) {
        done(new Error(`API server exited early (code ${code})`));
      }
      serverProcess = null;
    });

    waitForUrl(`http://127.0.0.1:${SERVER_PORT}/api/health`)
      .then(() => done())
      .catch((err) => done(err));
  });
}

function stopEmbeddedServer() {
  if (!serverProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t'], { windowsHide: true });
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  serverProcess = null;
}

function registerIpc() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('app:getInfo', () => ({
    platform: process.platform,
    isDev,
    isPackaged,
    version: app.getVersion(),
  }));

  ipcMain.handle('app:reload', () => {
    mainWindow?.webContents.reload();
  });

  ipcMain.handle('app:toggleDevTools', () => {
    mainWindow?.webContents.toggleDevTools();
  });

  ipcMain.handle('app:toggleFullscreen', () => {
    if (!mainWindow) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });
}

async function startProductionStack() {
  let mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agriTrades';

  const resources = isPackaged
    ? process.resourcesPath
    : path.join(projectRoot(), 'resources');

  mongoManager = createMongoManager({
    resourcesRoot: resources,
    userDataPath: app.getPath('userData'),
    log: console,
  });

  const { resolveMongodPath } = require('./mongoManager.cjs');
  if (resolveMongodPath(resources) || isPackaged) {
    const mongo = await mongoManager.start();
    mongoUri = mongo.uri;
  } else {
    console.log('[mongo] No bundled MongoDB — using system MongoDB / MONGODB_URI');
    mongoManager = null;
  }

  await startEmbeddedServer(mongoUri);
}

app.whenReady().then(async () => {
  registerIpc();

  try {
    if (isDev) {
      await waitForUrl(`http://127.0.0.1:${SERVER_PORT}/api/health`);
      await waitForUrl(CLIENT_DEV_URL);
    } else {
      await startProductionStack();
    }
  } catch (err) {
    dialog.showErrorBox(
      'AgriTrades failed to start',
      `${err.message}\n\n${
        isDev
          ? `Make sure the API (:${SERVER_PORT}) and Vite (:3000) are running.`
          : 'Try reinstalling the app. Your data folder was not deleted.'
      }`
    );
    allowClose = true;
    isQuitting = true;
    stopAllServices();
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', (event) => {
  if (allowClose || isQuitting) {
    stopAllServices();
    return;
  }
  event.preventDefault();
  confirmAndQuit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!isQuitting) return;
    stopAllServices();
    app.quit();
  }
});

app.on('will-quit', () => {
  stopAllServices();
});
