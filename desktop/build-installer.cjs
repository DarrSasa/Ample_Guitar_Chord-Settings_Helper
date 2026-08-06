const fs = require("fs");
const path = require("path");
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
  if (!fs.existsSync(rootPkgPath)) {
    return "30.5.1";
  }

  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const rawVersion =
    (rootPkg.devDependencies && rootPkg.devDependencies.electron) ||
    (rootPkg.dependencies && rootPkg.dependencies.electron) ||
    "30.5.1";

  return String(rawVersion).replace(/^[^\d]*/, "");
}

function logStep(text) {
  console.log(`\n==> ${text}`);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function runNodeScript(scriptPath, scriptArgs) {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Missing script: ${scriptPath}`);
  }
  run(process.execPath, [scriptPath, ...scriptArgs]);
}

function runNpmInstall() {
  if (process.platform === "win32") {
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm install"], {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error("Command failed: npm install");
    }
    return;
  }

  run("npm", ["install"]);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseIconArg() {
  const iconFlag = process.argv.find((arg) => arg.startsWith("--icon="));
  if (iconFlag) {
    return iconFlag.replace("--icon=", "").replace(/^"|"$/g, "");
  }
  if (fs.existsSync(defaultIcon)) {
    return defaultIcon;
  }
  return "";
}

function buildInstallerConfig(iconPath) {
  const electronVersion = resolveElectronVersion();

  const config = {
    name: "ample-guitar-chord-progression-helper-installer",
    version: "1.0.0",
    description: "Windows installer for Ample Guitar Chord Progression Helper",
    author: "Ample Guitar Chord Progression Helper",
    build: {
      appId: "ro.ample.helper",
      productName: appName,
      directories: {
        output: installerOutDir,
      },
      win: {
        target: [
          {
            target: "nsis",
            arch: ["x64"],
          },
        ],
      },
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

  if (iconPath) {
    config.build.win.icon = iconPath;
  }

  return config;
}

function main() {
  process.chdir(rootDir);
  console.log("===============================================");
  console.log(" Ample Guitar Chord Progression Helper");
  console.log(" Installer EXE Builder (NSIS)");
  console.log("===============================================");

  const iconPath = parseIconArg();
  if (iconPath) {
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Icon file not found: ${iconPath}`);
    }
    if (path.extname(iconPath).toLowerCase() !== ".ico") {
      throw new Error("Icon must be .ico");
    }
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

  logStep("Building React app");
  runNodeScript(path.join(rootDir, "node_modules", "vite", "bin", "vite.js"), ["build"]);

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

  const stagePkg = {
    name: "ample-guitar-chord-progression-helper",
    version: "1.0.0",
    main: "desktop/main.cjs",
    author: "Ample Guitar Chord Progression Helper",
    devDependencies: {
      electron: "30.5.1",
    },
  };
  fs.writeFileSync(path.join(stageAppDir, "package.json"), JSON.stringify(stagePkg, null, 2));

  logStep("Packing app");
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
  if (iconPath) {
    packArgs.push(`--icon=${iconPath}`);
  }
  runNodeScript(path.join(rootDir, "node_modules", "@electron", "packager", "bin", "electron-packager.js"), packArgs);

  const packagedAppDir = path.join(portableOutDir, `${packagerAppName}-win32-x64`);
  if (!fs.existsSync(packagedAppDir)) {
    throw new Error(`Packaged app missing: ${packagedAppDir}`);
  }

  logStep("Preparing NSIS installer config");
  resetDir(installerProjectDir);
  const installerPkg = buildInstallerConfig(iconPath);
  fs.writeFileSync(path.join(installerProjectDir, "package.json"), JSON.stringify(installerPkg, null, 2));

  logStep("Building installer (.exe NSIS, fallback .msi)");
  const builderCli = path.join(rootDir, "node_modules", "electron-builder", "out", "cli", "cli.js");
  let installerBuilt = false;

  try {
    runNodeScript(builderCli, [
      "--projectDir",
      installerProjectDir,
      "--prepackaged",
      packagedAppDir,
      "--win",
      "nsis",
      "--x64",
    ]);
    installerBuilt = true;
  } catch (error) {
    console.warn("NSIS build failed, trying MSI fallback...", error.message);
  }

  if (!installerBuilt) {
    runNodeScript(builderCli, [
      "--projectDir",
      installerProjectDir,
      "--prepackaged",
      packagedAppDir,
      "--win",
      "msi",
      "--x64",
    ]);
    installerBuilt = true;
  }

  console.log("\nDone.");
  console.log(`Portable app folder: ${portableOutDir}`);
  console.log(`Installer folder: ${installerOutDir}`);
}

try {
  main();
} catch (error) {
  console.error("\nERROR:", error.message);
  process.exit(1);
}