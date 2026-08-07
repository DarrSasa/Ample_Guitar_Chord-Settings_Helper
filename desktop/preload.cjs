const { contextBridge, ipcRenderer } = require("electron");

// Handshake marker: if preload loaded successfully, this will be visible
// in DevTools as window.__desktopBridgeLoaded === true. If it's undefined
// or missing, the preload didn't run - likely a path or sandbox issue.
try {
  contextBridge.exposeInMainWorld("__desktopBridgeLoaded", true);

  contextBridge.exposeInMainWorld("desktopBridge", {
    renderMidiTemp: (bytes, fileName) => {
      return ipcRenderer.sendSync("render-midi-temp", { bytes, fileName });
    },
    startMidiDrag: (tempPath) => {
      return ipcRenderer.sendSync("start-midi-drag", { tempPath });
    },
    saveMidiFile: (bytes, fileName) => {
      // Returns { ok, canceled, error } (object) instead of raw boolean so the
      // renderer can distinguish "user cancelled" from "handler failed".
      return ipcRenderer.sendSync("save-midi-file", { bytes, fileName });
    },
    saveMidiFileAsync: (bytes, fileName) => {
      return ipcRenderer.invoke("save-midi-file-async", { bytes, fileName });
    },
    // Diagnostic ping - renderer can call this to verify IPC round-trip.
    ping: () => ipcRenderer.sendSync("desktop-bridge-ping"),
  });

  // Also log to the renderer console so it shows up in DevTools.
  console.log("[preload] desktopBridge exposed OK");
} catch (err) {
  // If contextBridge fails (e.g. wrong Electron version, sandbox blocking),
  // at least surface the error in the console.
  console.error("[preload] failed to expose desktopBridge:", err);
}
