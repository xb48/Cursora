const { contextBridge, ipcRenderer } = require('electron');

// Bridge for animation overlays. Every animation's overlay.html gets this API.
contextBridge.exposeInMainWorld('bridge', {
  trigger: () => ipcRenderer.send('overlay:trigger'),
  hide: () => ipcRenderer.send('overlay:hide'),
  onSpawn: (fn) => ipcRenderer.on('overlay:spawn', (_e, payload) => fn(payload)),
  onDrop: (fn) => ipcRenderer.on('overlay:drop', () => fn()),
  onSettings: (fn) => ipcRenderer.on('overlay:settings', (_e, settings) => fn(settings)),
  onCursor: (fn) => ipcRenderer.on('overlay:cursor', (_e, point) => fn(point)),
});
