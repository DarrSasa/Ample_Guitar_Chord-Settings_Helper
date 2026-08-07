const { app, BrowserWindow, shell, ipcMain, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_TITLE = "Ample Guitar Chord Progression Helper";

function createWindow() {
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
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexPath);

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

ipcMain.on("save-midi-file", (event, payload) => {
  try {
    const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];
    if (bytes.length === 0) {
      event.returnValue = { ok: false, canceled: false, error: "empty" };
      return;
    }

    const suggestedName = payload?.fileName || "ample-chord-progression.mid";
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      title: "Save MIDI File",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "MIDI", extensions: ["mid"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    };
    const result = win
      ? dialog.showSaveDialogSync(win, dialogOpts)
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
    const win = BrowserWindow.fromWebContents(event.sender);
    const dialogOpts = {
      title: "Save MIDI File",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "MIDI", extensions: ["mid"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    };
    const result = win
      ? await dialog.showSaveDialog(win, dialogOpts)
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