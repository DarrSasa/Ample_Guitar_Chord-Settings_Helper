General MIDI guitar soundfont packs (MusyngKite, ~50 MB total).

These files are NOT checked into git - they are downloaded on demand by
Download-Soundfonts.ps1 (which Build-Installer.ps1 runs automatically
before the first build).

Manual download:

  .\Download-Soundfonts.ps1         # skip files already downloaded
  .\Download-Soundfonts.ps1 -Force  # re-download everything

Or double-click Download-Soundfonts.cmd from Windows Explorer.

Expected files after a successful download:

  acoustic_guitar_nylon-mp3.js
  acoustic_guitar_steel-mp3.js
  electric_guitar_jazz-mp3.js
  electric_guitar_clean-mp3.js
  electric_guitar_muted-mp3.js
  overdriven_guitar-mp3.js
  distortion_guitar-mp3.js

The downloader tries eight CDN mirrors in sequence so that a blocked
host does not stop the whole batch. Each mirror has a 30-second
timeout. Mirror order (in Download-Soundfonts.ps1):

  1. https://gleitz.github.io/midi-js-soundfonts/MusyngKite/
  2. https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/MusyngKite/
  3. https://fastly.jsdelivr.net/gh/gleitz/midi-js-soundfonts@master/MusyngKite/
  4. https://cdn.statically.io/gh/gleitz/midi-js-soundfonts/master/MusyngKite/
  5. https://raw.githack.com/gleitz/midi-js-soundfonts/master/MusyngKite/
  6. https://rawcdn.githack.com/gleitz/midi-js-soundfonts/master/MusyngKite/
  7. https://mirror.ghproxy.com/https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/master/MusyngKite/
  8. https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/master/MusyngKite/

At runtime, if a soundfont file is missing here, the app first tries
the online MusyngKite CDN, then falls back to a plain oscillator so
the app is never silent.

Source (Creative Commons BY-SA 3.0):
  https://gleitz.github.io/midi-js-soundfonts/
  https://github.com/gleitz/midi-js-soundfonts
