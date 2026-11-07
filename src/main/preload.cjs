// Safe bridge between the windows and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('coko', {
  bootstrap: () => ipcRenderer.invoke('coko:bootstrap'),
  summary: (date) => ipcRenderer.invoke('coko:summary', date),
  week: () => ipcRenderer.invoke('coko:week'),
  saveSettings: (patch) => ipcRenderer.invoke('coko:settings', patch),
  journal: {
    list: (date) => ipcRenderer.invoke('coko:journal:list', date),
    add: (entry) => ipcRenderer.invoke('coko:journal:add', entry),
    toggle: (id) => ipcRenderer.invoke('coko:journal:toggle', id),
    remove: (id) => ipcRenderer.invoke('coko:journal:delete', id),
  },
  toggleDashboard: () => ipcRenderer.send('coko:dashboard:toggle'),
  hideDashboard: () => ipcRenderer.send('coko:dashboard:hide'),
  testNotification: () => ipcRenderer.send('coko:test-notification'),
  dragStart: (offsetX, offsetY) => ipcRenderer.send('coko:drag:start', { offsetX, offsetY }),
  dragEnd: () => ipcRenderer.send('coko:drag:end'),
  onStatus: on('coko:status'),
  onEvent: on('coko:event'),
  onSettings: on('coko:settings'),
  onDashboardShown: on('coko:dashboard-shown'),
});
