Put your guitar WAV samples in this folder.

Required sample names:
- Acoustic Guitar_C5.wav
- Nylon Guitar_C5.wav
- Steel Guitar_C5.wav
- Jazz Guitar_C5.wav
- Muted Guitar_C5.wav

Recommended:
- Mono or stereo WAV, 44.1kHz or 48kHz, 16-bit or 24-bit.
- Keep transient clean and short (single pluck/chord-friendly sample).
- If possible, include a WAV smpl chunk with MIDI unity note.

Root note rules used by sampler:
1) smpl chunk root note (if present)
2) suffix parser from file name (example: _C5)
3) fallback root = C5 (MIDI 72)

The sampler pitch-shifts from this root to target notes.