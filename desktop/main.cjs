const { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_TITLE = "Ample Guitar Chord Progression Helper";

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");

  // Log to a file next to the EXE so users can send diagnostics when things
  // go wrong. We can't rely on stdout - the EXE runs without a console.
  const logPath = path.join(app.getPath("userData"), "app.log");
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(logPath, line); } catch { /* ignore */ }
    console.log(line.trim());
  };

  log(`Startup. __dirname=${__dirname}`);
  log(`Preload path: ${preloadPath} (exists=${fs.existsSync(preloadPath)})`);

  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 620,
    title: APP_TITLE,
    backgroundColor: "#acb0ac",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox:false is REQUIRED for ipcRenderer.sendSync / invoke to work
      // from a preload script in Electron 20+. Without this the preload runs
      // in a stripped-down v8 sandbox where 'electron' resolves but
      // ipcRenderer's sync/async transport is disabled - meaning Save and
      // D&D silently do nothing because window.desktopBridge exists but its
      // methods throw internally.
      sandbox: false,
      preload: preloadPath,
    },
  });

  // Surface anything the preload logs / errors, so we can see it in DevTools.
  win.webContents.on("preload-error", (_e, preload, err) => {
    log(`PRELOAD-ERROR ${preload}: ${err && err.stack ? err.stack : err}`);
  });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) log(`console(${level}) ${sourceId}:${line} ${message}`);
  });

  const indexPath = path.join(__dirname, "..", "dist", "index.html");

  // If the packaging skipped dist/, show a real error page instead of a
  // silent grey window so the user knows what's wrong.
  if (!fs.existsSync(indexPath)) {
    const missingMsg = `<!doctype html><meta charset="utf-8"><title>Missing build</title>
      <body style="font-family:system-ui;padding:2rem;background:#acb0ac;color:#111">
        <h1>Missing build output</h1>
        <p>Expected file was not found at:</p>
        <pre style="background:#fff;padding:1rem;border:1px solid #000">${indexPath}</pre>
        <p>Rebuild with: <code>.\\Build-Installer.ps1 -Mode Portable</code></p>
      </body>`;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(missingMsg));
  } else {
    win.loadFile(indexPath);
  }

  // If the renderer fails to load (e.g. broken asset paths), pop DevTools
  // and show the failing URL so users can report actionable info instead
  // of just "grey window".
  win.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error("[main] did-fail-load", { errorCode, errorDescription, validatedURL });
    const failMsg = `<!doctype html><meta charset="utf-8"><title>Load failed</title>
      <body style="font-family:system-ui;padding:2rem;background:#acb0ac;color:#111">
        <h1>Failed to load the app</h1>
        <p><b>Code:</b> ${errorCode}</p>
        <p><b>Description:</b> ${errorDescription}</p>
        <p><b>URL:</b> <code>${validatedURL}</code></p>
        <p>Usually this means asset paths in dist/index.html are absolute
        (starting with <code>/assets/...</code>) instead of relative
        (<code>./assets/...</code>). Rebuild with the current
        <code>Build-Installer.ps1</code>.</p>
      </body>`;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(failMsg));
  });

  // Keep navigation inside the app and open external URLs in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function writeMidiTemp(bytes, fileName) {
  const baseName = fileName || "ample-chord-progression.mid";
  const safeName = `${Date.now()}-${baseName}`;
  const outPath = path.join(app.getPath("temp"), safeName);
  fs.writeFileSync(outPath, Buffer.from(bytes));
  return outPath;
}

// Diagnostic round-trip so the UI can verify that IPC actually works.
ipcMain.on("desktop-bridge-ping", (event) => {
  event.returnValue = {
    ok: true,
    when: new Date().toISOString(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  };
});

ipcMain.on("save-midi-file", (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      event.returnValue = { ok: false, canceled: false, error: "empty" };
      return;
    }

    const suggestedName = payload?.fileName || "ample-chord-progression.mid";
    const parent = BrowserWindow.fromWebContents(event.sender);
    // Bring the parent window to the front so the modal Save dialog can't
    // open behind other windows.
    if (parent) {
      try {
        if (parent.isMinimized()) parent.restore();
        parent.focus();
      } catch { /* best effort */ }
    }
    const dialogOpts = {
      title: "Save MIDI File",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [
        { name: "MIDI files", extensions: ["mid"] },
        { name: "All files", extensions: ["*"] },
      ],
      properties: ["createDirectory", "showOverwriteConfirmation", "dontAddToRecent"],
    };
    const result = parent
      ? dialog.showSaveDialogSync(parent, dialogOpts)
      : dialog.showSaveDialogSync(dialogOpts);

    if (!result) {
      event.returnValue = { ok: false, canceled: true };
      return;
    }

    fs.writeFileSync(result, Buffer.from(bytes));
    event.returnValue = { ok: true, canceled: false, filePath: result };
  } catch (err) {
    event.returnValue = { ok: false, canceled: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle("save-midi-file-async", async (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      return { ok: false, canceled: false, error: "empty" };
    }

    const suggestedName = payload?.fileName || "ample-chord-progression.mid";
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (parent) {
      try {
        if (parent.isMinimized()) parent.restore();
        parent.focus();
      } catch { /* best effort */ }
    }
    const dialogOpts = {
      title: "Save MIDI File",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [
        { name: "MIDI files", extensions: ["mid"] },
        { name: "All files", extensions: ["*"] },
      ],
      properties: ["createDirectory", "showOverwriteConfirmation", "dontAddToRecent"],
    };
    const result = parent
      ? await dialog.showSaveDialog(parent, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, Buffer.from(bytes));
    return { ok: true, canceled: false, filePath: result.filePath };
  } catch (err) {
    return { ok: false, canceled: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.on("render-midi-temp", (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      event.returnValue = "";
      return;
    }
    const outPath = writeMidiTemp(bytes, payload?.fileName);
    event.returnValue = outPath;
  } catch {
    event.returnValue = "";
  }
});

ipcMain.on("start-midi-drag", (event, payload) => {
  try {
    const dragPath = payload?.tempPath;
    if (!dragPath || !fs.existsSync(dragPath)) {
      event.returnValue = false;
      return;
    }

    // Use a tiny transparent icon so the OS drag cursor does not show the app icon ghost.
    const icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XgnsAAAAASUVORK5CYII="
    );

    event.sender.startDrag({
      file: dragPath,
      icon,
    });
    event.returnValue = true;
  } catch {
    // Silent fail: browser fallback remains available in renderer.
    event.returnValue = false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});