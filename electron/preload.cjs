'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose only the three desktop operations this local renderer needs.
// Never pass IpcRendererEvent or raw ipcRenderer through the isolation boundary.
contextBridge.exposeInMainWorld('digitalWindow', Object.freeze({
  isDesktop: true,
  getWindowState: () => ipcRenderer.invoke('digital-window:get-state'),
  setFullscreen: (enabled) => ipcRenderer.invoke('digital-window:set-fullscreen', enabled),
  quit: () => ipcRenderer.invoke('digital-window:quit'),
  onWindowState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A state callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('digital-window:state', listener);
    return () => ipcRenderer.removeListener('digital-window:state', listener);
  },
}));
