const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
  getInfo: () => ipcRenderer.invoke('app:getInfo'),
  reload: () => ipcRenderer.invoke('app:reload'),
  toggleDevTools: () => ipcRenderer.invoke('app:toggleDevTools'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggleFullscreen'),
});
