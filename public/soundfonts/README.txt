General MIDI guitar soundfont packs (MusyngKite, ~50 MB total).

These files are NOT checked into git - they are downloaded on demand by
Download-Soundfonts.ps1 (which Build-Installer.ps1 runs automatically
before the first build).

Manual download:

  .\Download-Soundfonts.ps1         # skip files already downloaded
  .\Download-Soundfonts.ps1 -Force  # re-download everything

Expected files after a successful download:

  acoustic_guitar_nylon-mp3.js
  acoustic_guitar_steel-mp3.js
  electric_guitar_jazz-mp3.js
  electric_guitar_clean-mp3.js
  electric_guitar_muted-mp3.js
  overdriven_guitar-mp3.js
  distortion_guitar-mp3.js

At runtime the app looks here first, then falls back to the online CDN
at https://gleitz.github.io/midi-js-soundfonts/MusyngKite/ if a file is
missing, then to a plain oscillator if there's no internet at all.

Source (Creative Commons BY-SA 3.0):
  https://gleitz.github.io/midi-js-soundfonts/
  https://github.com/gleitz/midi-js-soundfonts
