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

// Session-local counter for the temp MIDI file name. Starts at 1 on every
// EXE launch and increments each save, so the user sees clean, human names
// like "1-ample-chord-progression.mid", "2-ample-chord-progression.mid",
// instead of the previous "1786101786487-..." Date.now() prefix. We keep
// a prefix (never bare name) so a second save doesn't overwrite the temp
// file the OS is still using for an active drag session.
let midiTempCounter = 0;

function writeMidiTemp(bytes, fileName) {
  const baseName = fileName || "ample-chord-progression.mid";
  midiTempCounter += 1;
  const safeName = `${midiTempCounter}-${baseName}`;
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

// Builds the platform-appropriate Save-dialog options. Only include the
// dialog `properties` that Electron actually supports on the current OS -
// passing 'createDirectory' or 'showOverwriteConfirmation' on Windows makes
// some Electron 30.x builds return instantly without showing the dialog at
// all (the user sees Save "do nothing"). See:
// https://www.electronjs.org/docs/latest/api/dialog#dialogshowsavedialogsyncwindow-options
function buildSaveDialogOpts(suggestedName) {
  const properties = [];
  if (process.platform === "win32") {
    properties.push("showHiddenFiles", "dontAddToRecent");
  } else if (process.platform === "darwin") {
    properties.push("showHiddenFiles", "createDirectory", "treatPackageAsDirectory");
  } else {
    properties.push("showOverwriteConfirmation");
  }
  return {
    title: "Save MIDI File",
    defaultPath: path.join(app.getPath("documents"), suggestedName),
    filters: [
      { name: "MIDI files", extensions: ["mid"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties,
  };
}

// Bring the parent window to the foreground so a modal dialog can't open
// behind it. Uses moveTop/show as a fallback because focus() alone is
// sometimes ignored on Windows when another app owns focus.
function bringWindowToFront(win) {
  if (!win) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.moveTop();
    win.focus();
  } catch { /* best effort */ }
}

ipcMain.on("save-midi-file", (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      event.returnValue = { ok: false, canceled: false, error: "empty" };
      return;
    }

    const suggestedName = payload?.fileName || "ample-chord-progression.mid";
    const parent = BrowserWindow.fromWebContents(event.sender);
    bringWindowToFront(parent);
    const dialogOpts = buildSaveDialogOpts(suggestedName);

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
    bringWindowToFront(parent);
    const dialogOpts = buildSaveDialogOpts(suggestedName);

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
      event.returnValue = { ok: false, error: `Missing file: ${dragPath}` };
      return;
    }

    // Electron's startDrag requires a real (non-empty, sensible-size) icon.
    // A 1x1 PNG is silently rejected on some Electron 30.x builds, which
    // makes the whole drag start fail. Build a proper 32x32 PNG in memory
    // so this is bulletproof across Electron versions.
    const icon = buildDragIcon();

    event.sender.startDrag({
      file: dragPath,
      icon,
    });
    event.returnValue = { ok: true };
  } catch (err) {
    event.returnValue = { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// Combined 1-round-trip drag: write the MIDI bytes to a temp file AND kick
// off startDrag inside the same IPC handler. This guarantees startDrag runs
// while the renderer is still inside its dragstart event window (which is
// what makes the OS actually accept the drag) - two separate sendSync calls
// sometimes lose that window and the drag silently no-ops.
ipcMain.on("midi-drag", (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      event.returnValue = { ok: false, error: "empty" };
      return;
    }
    const tempPath = writeMidiTemp(bytes, payload?.fileName);
    if (!fs.existsSync(tempPath)) {
      event.returnValue = { ok: false, error: `Failed to write temp file at ${tempPath}` };
      return;
    }
    const icon = buildDragIcon();
    event.sender.startDrag({ file: tempPath, icon });
    event.returnValue = { ok: true, tempPath };
  } catch (err) {
    event.returnValue = { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// A 32x32 opaque orange (#ff8827) PNG - big enough for Electron's
// startDrag to accept as a valid drag image on every platform. Kept as a
// base64 literal so we don't depend on any external icon files existing.
// Programmatically generated so it is guaranteed to decode as a real PNG.
function buildDragIcon() {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKUlEQVR42u3NQQkAAAgE" +
    "sGtjVVtrCh/CYP9luk5FIBAIBAKBQCAQfAkWT2+4Wx4SUP4AAAAASUVORK5CYII=";
  return nativeImage.createFromBuffer(Buffer.from(b64, "base64"));
}

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