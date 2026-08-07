/** @type {Window & { electronAPI?: import('./electron').ElectronAPI }} */
export {};

/**
 * @typedef {object} ElectronAPI
 * @property {true} isElectron
 * @property {() => Promise<void>} minimize
 * @property {() => Promise<boolean>} maximize
 * @property {() => Promise<void>} close
 * @property {() => Promise<boolean>} isMaximized
 * @property {(cb: (maximized: boolean) => void) => (() => void)} onMaximizedChange
 * @property {() => Promise<{ platform: string, isDev: boolean, version: string }>} getInfo
 * @property {() => Promise<void>} reload
 * @property {() => Promise<void>} toggleDevTools
 * @property {() => Promise<boolean>} toggleFullscreen
 */
