// Crosshair overlay: the only thing the page needs is the current design.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crossBridge', {
  onDesign: fn => ipcRenderer.on('crosshair:design', (_e, design) => fn(design)),
});
