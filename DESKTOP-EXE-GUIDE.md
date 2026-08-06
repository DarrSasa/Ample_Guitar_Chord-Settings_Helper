# Ample Guitar Chord Progression Helper - Desktop EXE

This project can be packaged as a Windows desktop app that starts by double-clicking the `.exe` file.

## Folder name

The build output folder is configured as:

- `Ample Guitar Chord Progression Helper`

## Build steps (Windows)

1. Extract ZIP.
2. Open the project folder.
3. Double-click `Build-EXE.bat`.
4. Optionally enter your `.ico` path when prompted.
5. Wait until build completes.

Alternative (no prompt):

1. Put your icon here: `public/grafics/app.ico`
2. Double-click `Build-EXE-Quick.bat`

PowerShell method (most stable):

1. Right-click `Build-EXE.ps1` and choose **Run with PowerShell**
2. From PowerShell opened in project folder:
`.\Build-EXE.ps1`
3. With custom icon path:
`.\Build-EXE.ps1 -IconPath "C:\Path\to\app.ico"`

Direct CMD method (no questions asked):

1. Place icon at `public/grafics/app.ico` (optional)
2. Double-click `Build-EXE-Direct.cmd`

Installer method (.exe setup wizard):

1. Double-click `Build-Installer.cmd`
2. Or from PowerShell:
`.\Build-Installer.ps1`
3. Optional custom icon:
`.\Build-Installer.ps1 -IconPath "C:\Path\to\app.ico"`

Installer output folder:

- `installer-out`

After completion, open:

- `Ample Guitar Chord Progression Helper/Ample Guitar Chord Progression Helper.exe`

Double-click that `.exe` to start the app.

## .ico requirements

Recommended for best compatibility:

- Format: `.ico`
- Include multiple sizes inside one `.ico`: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256
- Color depth: 32-bit RGBA

Minimum practical size:

- 256x256 included in the icon set

## Notes

- Clicking a folder never starts the app. You must double-click the `.exe`.
- If no icon is provided, Electron uses the default app icon.