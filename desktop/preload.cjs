const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  renderMidiTemp: (bytes, fileName) => {
    return ipcRenderer.sendSync("render-midi-temp", { bytes, fileName });
  },
  startMidiDrag: (tempPath) => {
    return ipcRenderer.sendSync("start-midi-drag", { tempPath });
  },
  saveMidiFile: (bytes, fileName) => {
    return ipcRenderer.sendSync("save-midi-file", { bytes, fileName });
  },
  saveMidiFileAsync: (bytes, fileName) => {
    return ipcRenderer.invoke("save-midi-file-async", { bytes, fileName });
  },
});