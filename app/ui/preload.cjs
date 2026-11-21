const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dlp', {
  state: () => ipcRenderer.invoke('state'),
  setResponseColor: (color) => ipcRenderer.invoke('set-response-color', color),
  openTab: (name) => ipcRenderer.invoke('tabs:select', name),
  onActivity: (handler) => ipcRenderer.on('activity', (_event, entry) => handler(entry)),
});
