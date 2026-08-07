These WAV files are NO LONGER USED by the app.

Since the "soundfont-player + MusyngKite" refactor, the app plays every
guitar preset (Acoustic Nylon, Acoustic Steel, Electric Jazz, Electric
Clean, Electric Muted, Overdriven, Distortion) through the standard
General MIDI multi-sample packs fetched from:

  https://gleitz.github.io/midi-js-soundfonts/MusyngKite/

That gives real per-note samples instead of the previous single-WAV
pitch-shifted output, which sounded off away from C5.

You can safely delete this folder if you don't want it in your build.
Kept in the repo only for legacy reference.
