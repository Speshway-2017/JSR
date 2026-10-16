process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const electron = require('electron');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  shell,
  clipboard,
  nativeImage,
} = electron;

if (!app) {
  console.error(
    'JSR must be started with the Electron runtime (npm run electron:dev).\n' +
      'If ELECTRON_RUN_AS_NODE is set in your environment, unset it and retry.'
  );
  process.exit(1);
}

if (app) {
  app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill');
  app.commandLine.appendSwitch('log-level', '3');
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.jsr.app');
}

const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const { buildAppMenu } = require('./menu.cjs');
const { createMongoManager } = require('./mongoManager.cjs');

const isPackaged = app.isPackaged;
const isDev = !isPackaged && process.env.NODE_ENV !== 'production';
const SERVER_PORT = process.env.PORT || 5050;
const CLIENT_DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3000';
const APP_PROD_URL = `http://127.0.0.1:${SERVER_PORT}`;
const STARTUP_TOKEN = crypto.randomBytes(16).toString('hex');

let mainWindow = null;
let serverProcess = null;
let mongoManager = null;
let isQuitting = false;
let allowClose = false;
let confirmOpen = false;

// Only one desktop instance — avoids zombie API on :5050 with a dead MongoDB
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function killPortListeners(port) {
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
          console.log(`[electron] Cleared leftover PID ${pid} on port ${port}`);
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
      } catch {
        // ignore
      }
    }
  } catch {
    // empty
  }
}

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
    title: 'JSR',
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
    // Open external URLs (WhatsApp Web, WhatsApp app, Email, etc.) in system default browser / app
    if (
      url.startsWith('http:') ||
      url.startsWith('https:') ||
      url.startsWith('mailto:') ||
      url.startsWith('whatsapp:') ||
      url.startsWith('tel:')
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
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
      title: 'Quit JSR',
      message: 'Close JSR?',
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

function waitForUrl(url, { timeoutMs = 120000, intervalMs = 400, expectToken } = {}) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 500) {
            retry();
            return;
          }
          if (expectToken) {
            try {
              const json = JSON.parse(body);
              if (json.token !== expectToken || json.db !== 'connected') {
                retry();
                return;
              }
            } catch {
              retry();
              return;
            }
          }
          resolve();
        });
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

    // Avoid talking to a zombie API from a previous crashed session
    killPortListeners(SERVER_PORT);

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
        JSR_STARTUP_TOKEN: STARTUP_TOKEN,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@jsr.com',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
        SALES_EMAIL: process.env.SALES_EMAIL || 'sales@jsr.com',
        SALES_PASSWORD: process.env.SALES_PASSWORD || 'sales123',
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

    waitForUrl(`http://127.0.0.1:${SERVER_PORT}/api/health`, {
      expectToken: STARTUP_TOKEN,
    })
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

  ipcMain.handle('app:openExternal', async (_event, url) => {
    if (url && typeof url === 'string') {
      try {
        await shell.openExternal(url);
        return true;
      } catch (err) {
        console.error('[electron] openExternal failed:', err);
        return false;
      }
    }
    return false;
  });

  ipcMain.handle('app:systemShare', async (_event, { title, text, fileBase64, fileName }) => {
    try {
      if (fileBase64) {
        const tempDir = app.getPath('temp');
        const safeName = (fileName || 'JSR_Report.pdf').replace(/[/\\?%*:|"<>]/g, '_');
        const filePath = path.join(tempDir, safeName);
        fs.writeFileSync(filePath, Buffer.from(fileBase64, 'base64'));
        
        // Show file in folder so user can use Windows context menu "Send to" / share, or open
        shell.showItemInFolder(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[electron] systemShare failed:', err);
      return false;
    }
  });

  ipcMain.handle('clipboard:writeImage', async (_event, imageBase64) => {
    try {
      if (imageBase64) {
        const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
        const img = nativeImage.createFromDataURL(dataUrl);
        clipboard.writeImage(img);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[electron] clipboard:writeImage error:', err);
      return false;
    }
  });

  ipcMain.handle('app:nativeShareDialog', async (_event, data = {}) => {
    const {
      recipientPhone = '',
      recipientName = 'Customer',
      recipientEmail = '',
      text = '',
      fileBase64 = '',
      imageBase64 = '',
      fileName = 'JSR_Report.pdf',
    } = data;

    // Auto-copy bill image to system clipboard if available
    if (imageBase64) {
      try {
        const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
        const img = nativeImage.createFromDataURL(dataUrl);
        clipboard.writeImage(img);
      } catch (err) {
        console.warn('[electron] Failed to auto-copy image to clipboard:', err);
      }
    }

    // Auto-save PDF to Desktop/JSR_Bills folder and temp folder so it's ready on disk
    let savedPdfPath = '';
    if (fileBase64) {
      try {
        const safeName = (fileName || 'JSR_Report.pdf').replace(/[/\\?%*:|"<>]/g, '_');
        const desktopBillsDir = path.join(app.getPath('desktop'), 'JSR_Bills');
        if (!fs.existsSync(desktopBillsDir)) {
          fs.mkdirSync(desktopBillsDir, { recursive: true });
        }
        savedPdfPath = path.join(desktopBillsDir, safeName);
        fs.writeFileSync(savedPdfPath, Buffer.from(fileBase64, 'base64'));
      } catch (err) {
        console.warn('[electron] Failed to save Desktop PDF, falling back to temp:', err);
        try {
          const tempDir = app.getPath('temp');
          const safeName = (fileName || 'JSR_Report.pdf').replace(/[/\\?%*:|"<>]/g, '_');
          savedPdfPath = path.join(tempDir, safeName);
          fs.writeFileSync(savedPdfPath, Buffer.from(fileBase64, 'base64'));
        } catch (e) {
          console.warn('[electron] Failed to save temp PDF:', e);
        }
      }
    }

    // Clean phone number (e.g. 918074407095)
    let cleanDigits = String(recipientPhone || '').replace(/\D/g, '');
    if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;
    const displayPhone = cleanDigits ? (cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits) : '';

    const buttons = [
      'WhatsApp Desktop',
      'Microsoft Teams',
      'Telegram Desktop',
      'Mail / Outlook',
      'WhatsApp Web',
      'Save PDF',
      'Cancel',
    ];

    const { response } = await dialog.showMessageBox(mainWindow || null, {
      type: 'question',
      buttons,
      defaultId: 0,
      cancelId: 6,
      title: 'Share Statement',
      message: `Share statement for ${recipientName}?`,
      detail: `Recipient: ${recipientName}${displayPhone ? ` (${displayPhone})` : ''}\n\n• Bill image copied to clipboard (Press Ctrl+V in WhatsApp to attach visual bill)\n• Choose which desktop application you want to share with:`,
      noLink: true,
    });

    try {
      // 0: WhatsApp Desktop
      if (response === 0) {
        const waUrl = cleanDigits
          ? `whatsapp://send?phone=${cleanDigits}&text=${encodeURIComponent(text)}`
          : `whatsapp://send?text=${encodeURIComponent(text)}`;
        try {
          await shell.openExternal(waUrl);
        } catch {
          const fallbackUrl = cleanDigits
            ? `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(text)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
          await shell.openExternal(fallbackUrl);
        }
        return { success: true, app: 'whatsapp_desktop', imageCopied: !!imageBase64, pdfPath: savedPdfPath };
      }

      // 1: Microsoft Teams
      if (response === 1) {
        const teamsUrl = `https://teams.microsoft.com/share?msgText=${encodeURIComponent(text)}`;
        await shell.openExternal(teamsUrl);
        return { success: true, app: 'teams', imageCopied: !!imageBase64, pdfPath: savedPdfPath };
      }

      // 2: Telegram Desktop
      if (response === 2) {
        try {
          await shell.openExternal(`tg://msg_url?text=${encodeURIComponent(text)}`);
        } catch {
          await shell.openExternal(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`);
        }
        return { success: true, app: 'telegram', imageCopied: !!imageBase64, pdfPath: savedPdfPath };
      }

      // 3: Mail / Outlook
      if (response === 3) {
        const subject = encodeURIComponent(`Statement / Bill - JSR Agri Trades (${recipientName})`);
        const body = encodeURIComponent(text);
        const mailUrl = recipientEmail ? `mailto:${recipientEmail}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
        await shell.openExternal(mailUrl);
        return { success: true, app: 'mail', pdfPath: savedPdfPath };
      }

      // 4: WhatsApp Web
      if (response === 4) {
        const webUrl = cleanDigits
          ? `https://web.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(text)}`
          : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        await shell.openExternal(webUrl);
        return { success: true, app: 'whatsapp_web', imageCopied: !!imageBase64, pdfPath: savedPdfPath };
      }

      // 5: Save PDF / Show in folder
      if (response === 5) {
        if (savedPdfPath) {
          shell.showItemInFolder(savedPdfPath);
          return { success: true, app: 'save_pdf', path: savedPdfPath };
        }
      }

      return { success: false, cancelled: true };
    } catch (err) {
      console.error('[electron] nativeShareDialog error:', err);
      return { success: false, error: err.message };
    }
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
      'JSR failed to start',
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
