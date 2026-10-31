// Puente seguro entre la ventana y el proceso principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  cargar: () => ipcRenderer.invoke('cargar'),
  buscar: id => ipcRenderer.invoke('buscar', id),
  actualizar: id => ipcRenderer.invoke('actualizar', id),
  jugar: id => ipcRenderer.invoke('jugar', id),
  abrirWeb: url => ipcRenderer.invoke('abrirWeb', url),
  onProgreso: cb => ipcRenderer.on('progreso', (_e, d) => cb(d)),
});
