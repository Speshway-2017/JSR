const { Menu, shell, app, dialog } = require('electron');

/**
 * Builds the application menu with window and quit commands.
 */
function buildAppMenu({ getMainWindow, requestQuit, isDev }) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            {
              label: 'Quit AgriTrades',
              accelerator: 'CmdOrCtrl+Q',
              click: () => requestQuit(),
            },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => getMainWindow()?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: isMac ? 'Close Window' : 'Quit',
          accelerator: isMac ? 'CmdOrCtrl+W' : 'Alt+F4',
          click: () => (isMac ? getMainWindow()?.close() : requestQuit()),
        },
        ...(!isMac
          ? []
          : [{
              label: 'Quit AgriTrades',
              accelerator: 'CmdOrCtrl+Q',
              click: () => requestQuit(),
            }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => getMainWindow()?.webContents.reload(),
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => getMainWindow()?.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            const win = getMainWindow();
            if (win) win.setFullScreen(!win.isFullScreen());
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => getMainWindow()?.webContents.toggleDevTools(),
          visible: isDev,
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: () => getMainWindow()?.minimize(),
        },
        {
          label: 'Maximize',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            const win = getMainWindow();
            if (!win) return;
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
          },
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => getMainWindow()?.close(),
        },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
            ]
          : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AgriTrades',
          click: () => {
            dialog.showMessageBox(getMainWindow(), {
              type: 'info',
              title: 'About AgriTrades',
              message: 'AgriTrades',
              detail: `Version ${app.getVersion()}\nDesktop app for vendor loads, sales, and settlements.`,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu };
