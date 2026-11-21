const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabs', {
  select: (name) => ipcRenderer.invoke('tabs:select', name),
  reload: () => ipcRenderer.invoke('tabs:reload'),
  onActive: (handler) => ipcRenderer.on('tabs:active', (_event, name) => handler(name)),
});
