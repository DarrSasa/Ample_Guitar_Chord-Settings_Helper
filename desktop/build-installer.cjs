// Backwards-compatible Node entry point for the Windows installer build.
// The primary UX is now Build-Installer.ps1 / Build-Installer.cmd, but some
// docs and old scripts still call this file directly, so it needs to keep
// working and produce the same NSIS installer.
//
// Fixes vs. the previous version:
//   - No MSI fallback (the "2.7z produced no files" error came from the MSI
//     target's post-install extractor; NSIS is enough and is what all major
//     Electron apps ship with).
//   - Purges corrupt cached downloads before each attempt.
//   - Retries the NSIS build up to 3 times to survive flaky networks.
//   - Writes package.json without BOM (electron-builder chokes on BOM).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const appName = "Ample Guitar Chord Progression Helper";
const packagerAppName = "Ample Guitar Chord Progression App";
const stageAppDir = path.join(rootDir, ".desktop-build", "app");
const installerProjectDir = path.join(rootDir, ".desktop-build", "installer-project");
const portableOutDir = path.join(rootDir, appName);
const installerOutDir = path.join(rootDir, "installer-out");
const defaultIcon = path.join(rootDir, "public", "grafics", "app.ico");

function resolveElectronVersion() {
  const rootPkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(rootPkgPath)) return "30.5.1";
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const raw =
    (rootPkg.devDependencies && rootPkg.devDependencies.electron) ||
    (rootPkg.dependencies && rootPkg.dependencies.electron) ||
    "30.5.1";
  return String(raw).replace(/^[^\d]*/, "");
}

function logStep(text) {
  console.log(`\n==> ${text}`);
}

function run(cmd, args, extraEnv) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function runNodeScript(scriptPath, scriptArgs, extraEnv) {
  if (!fs.existsSync(scriptPath)) throw new Error(`Missing script: ${scriptPath}`);
  run(process.execPath, [scriptPath, ...scriptArgs], extraEnv);
}

function runNpmInstall() {
  if (process.platform === "win32") {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm install --no-audit --no-fund"], {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });
    if (r.status !== 0) throw new Error("Command failed: npm install");
    return;
  }
  run("npm", ["install", "--no-audit", "--no-fund"]);
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function resetDir(p) { fs.rmSync(p, { recursive: true, force: true }); fs.mkdirSync(p, { recursive: true }); }

function writeJsonNoBom(filePath, obj) {
  // Explicit UTF-8 without BOM. Node's default fs.writeFileSync with 'utf8'
  // is already BOM-less, but be explicit to survive any accidental piping.
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), { encoding: "utf8" });
}

function parseIconArg() {
  const iconFlag = process.argv.find((a) => a.startsWith("--icon="));
  if (iconFlag) return iconFlag.replace("--icon=", "").replace(/^"|"$/g, "");
  if (fs.existsSync(defaultIcon)) return defaultIcon;
  return "";
}

function buildInstallerConfig(iconPath) {
  const electronVersion = resolveElectronVersion();
  const win = {
    target: [{ target: "nsis", arch: ["x64"] }],
  };
  if (iconPath) win.icon = iconPath;

  return {
    name: "ample-guitar-chord-progression-helper-installer",
    version: "1.0.0",
    description: "Windows installer for Ample Guitar Chord Progression Helper",
    author: "Ample Guitar Chord Progression Helper",
    build: {
      appId: "ro.ample.helper",
      productName: appName,
      directories: { output: installerOutDir },
      win,
      electronVersion,
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: appName,
        runAfterFinish: false,
      },
      artifactName: "AmpleInstaller.exe",
    },
  };
}

function purgeElectronBuilderCache() {
  // Delete zero-byte files and known-bad tool caches so a retry re-downloads
  // clean binaries — this is what fixes "2.7z produced no files".
  const roots = [];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    roots.push(path.join(process.env.LOCALAPPDATA, "electron-builder", "Cache"));
  }
  roots.push(path.join(os.homedir(), ".cache", "electron-builder"));

  for (const cacheRoot of roots) {
    if (!fs.existsSync(cacheRoot)) continue;
    console.log(`Cleaning electron-builder cache: ${cacheRoot}`);
    let entries = [];
    try { entries = fs.readdirSync(cacheRoot, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(cacheRoot, entry.name);
      try {
        if (entry.isDirectory() && /^(nsis|winCodeSign|appimage)/i.test(entry.name)) {
          fs.rmSync(full, { recursive: true, force: true });
        } else if (entry.isFile() && fs.statSync(full).size === 0) {
          fs.rmSync(full, { force: true });
        }
      } catch { /* best effort */ }
    }
  }
}

function buildNsisWithRetry(builderCli, packagedAppDir, maxAttempts) {
  const env = {
    USE_HARD_LINKS: "false",
    ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: "true",
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logStep(`Building NSIS installer (attempt ${attempt}/${maxAttempts})`);
    try {
      runNodeScript(
        builderCli,
        [
          "--projectDir", installerProjectDir,
          "--prepackaged", packagedAppDir,
          "--win", "nsis",
          "--x64",
        ],
        env
      );
      return;
    } catch (err) {
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) {
        throw new Error(
          `NSIS installer build failed after ${maxAttempts} attempts. ` +
          `Check your internet connection and antivirus — electron-builder needs ` +
          `to download NSIS from github.com/electron-userland/electron-builder-binaries.`
        );
      }
      console.warn("Purging cache and retrying in 3 seconds...");
      purgeElectronBuilderCache();
      const wait = Date.now() + 3000;
      while (Date.now() < wait) { /* small pause without needing a timer lib */ }
    }
  }
}

function main() {
  process.chdir(rootDir);
  console.log("===============================================");
  console.log(" Ample Guitar Chord Progression Helper");
  console.log(" Installer EXE Builder (NSIS)");
  console.log("===============================================");

  const iconPath = parseIconArg();
  if (iconPath) {
    if (!fs.existsSync(iconPath)) throw new Error(`Icon file not found: ${iconPath}`);
    if (path.extname(iconPath).toLowerCase() !== ".ico") throw new Error("Icon must be .ico");
    console.log(`Icon: ${iconPath}`);
  } else {
    console.log("Icon: default Electron icon");
  }

  if (!fs.existsSync(path.join(rootDir, "package.json"))) {
    throw new Error("package.json not found. Run from project root.");
  }

  if (!fs.existsSync(path.join(rootDir, "node_modules", "vite"))) {
    logStep("Installing dependencies");
    runNpmInstall();
  }

  logStep("Building React app (single-file for Electron)");
  runNodeScript(
    path.join(rootDir, "node_modules", "vite", "bin", "vite.js"),
    ["build"],
    { BUILD_TARGET: "electron" }
  );

  logStep("Preparing staging app");
  resetDir(stageAppDir);
  ensureDir(path.join(stageAppDir, "desktop"));
  ensureDir(path.join(stageAppDir, "dist"));

  fs.copyFileSync(path.join(rootDir, "desktop", "main.cjs"), path.join(stageAppDir, "desktop", "main.cjs"));
  fs.copyFileSync(path.join(rootDir, "desktop", "preload.cjs"), path.join(stageAppDir, "desktop", "preload.cjs"));
  fs.cpSync(path.join(rootDir, "dist"), path.join(stageAppDir, "dist"), { recursive: true });
  const publicSamples = path.join(rootDir, "public", "guitar samples");
  if (fs.existsSync(publicSamples)) {
    fs.mkdirSync(path.join(stageAppDir, "dist", "guitar samples"), { recursive: true });
    fs.cpSync(publicSamples, path.join(stageAppDir, "dist", "guitar samples"), { recursive: true });
  }

  writeJsonNoBom(path.join(stageAppDir, "package.json"), {
    name: "ample-guitar-chord-progression-helper",
    version: "1.0.0",
    main: "desktop/main.cjs",
    author: "Ample Guitar Chord Progression Helper",
    devDependencies: { electron: "30.5.1" },
  });

  logStep("Packing app with @electron/packager");
  ensureDir(portableOutDir);
  const packArgs = [
    stageAppDir,
    packagerAppName,
    "--platform=win32",
    "--arch=x64",
    "--overwrite",
    "--prune=true",
    `--out=${portableOutDir}`,
    `--executable-name=${appName}`,
  ];
  if (iconPath) packArgs.push(`--icon=${iconPath}`);
  runNodeScript(
    path.join(rootDir, "node_modules", "@electron", "packager", "bin", "electron-packager.js"),
    packArgs
  );

  const packagedAppDir = path.join(portableOutDir, `${packagerAppName}-win32-x64`);
  if (!fs.existsSync(packagedAppDir)) {
    throw new Error(`Packaged app missing: ${packagedAppDir}`);
  }

  logStep("Preparing NSIS installer config");
  resetDir(installerProjectDir);
  writeJsonNoBom(path.join(installerProjectDir, "package.json"), buildInstallerConfig(iconPath));

  purgeElectronBuilderCache();

  const builderCli = path.join(rootDir, "node_modules", "electron-builder", "out", "cli", "cli.js");
  buildNsisWithRetry(builderCli, packagedAppDir, 3);

  console.log("\nDone.");
  console.log(`Portable app folder: ${portableOutDir}`);
  console.log(`Installer folder:    ${installerOutDir}`);
}

try {
  main();
} catch (err) {
  console.error("\nERROR:", err.message);
  process.exit(1);
}
