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
    // Preferred: one round-trip that both writes the temp .mid and starts
    // the OS drag session in the same handler. Returns { ok, tempPath } or
    // { ok:false, error }. Using this avoids the timing window where the
    // renderer's dragstart event has ended before startDrag is invoked.
    midiDrag: (bytes, fileName) => {
      return ipcRenderer.sendSync("midi-drag", { bytes, fileName });
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
    // Resize the app window to a preset size. Renderer calls this from
    // the size dropdown (Scroll On History header).
    resizeWindow: (width, height) => {
      return ipcRenderer.sendSync("resize-window", { width, height });
    },
    // Guitar samples (sampler engine): listare recursiva a folderului
    // "guitar samples" + citirea octetilor unui fisier audio (pentru
    // decodeAudioData in renderer).
    listGuitarSamples: () => {
      return ipcRenderer.invoke("list-guitar-samples");
    },
    readGuitarSample: (relPath) => {
      return ipcRenderer.invoke("read-guitar-sample", { relPath });
    },
  });

  // Also log to the renderer console so it shows up in DevTools.
  console.log("[preload] desktopBridge exposed OK");
} catch (err) {
  // If contextBridge fails (e.g. wrong Electron version, sandbox blocking),
  // at least surface the error in the console.
  console.error("[preload] failed to expose desktopBridge:", err);
}
