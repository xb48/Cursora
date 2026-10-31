const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['state', 'stats', 'overlay:state', 'window:maximized', 'update', 'discord'];

contextBridge.exposeInMainWorld('openwhip', {
  getState: () => ipcRenderer.invoke('app:state'),
  activate: (id) => ipcRenderer.invoke('anim:activate', id),
  summon: (id) => ipcRenderer.invoke('anim:summon', id),
  updateSettings: (id, patch) => ipcRenderer.invoke('anim:settings', id, patch),
  resetSettings: (id) => ipcRenderer.invoke('anim:reset', id),
  toggleFavorite: (id) => ipcRenderer.invoke('anim:favorite', id),
  setCursor: (payload) => ipcRenderer.invoke('cursor:set', payload),
  setCrosshair: (patch) => ipcRenderer.invoke('crosshair:set', patch),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  readText: () => ipcRenderer.invoke('clipboard:read'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  suspendHotkey: (suspended) => ipcRenderer.invoke('hotkey:suspend', suspended),
  clearHistory: () => ipcRenderer.invoke('stats:clear'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  dismissWhatsNew: () => ipcRenderer.invoke('update:seen'),
  linkDiscord: () => ipcRenderer.invoke('discord:link'),
  cancelDiscord: () => ipcRenderer.invoke('discord:cancel'),
  refreshDiscord: () => ipcRenderer.invoke('discord:refresh'),
  unlinkDiscord: () => ipcRenderer.invoke('discord:unlink'),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  openExternal: (url) => ipcRenderer.send('shell:open', url),
  on: (channel, fn) => {
    if (!EVENTS.includes(channel)) return () => {};
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
