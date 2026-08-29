# Plan de înregistrare a articulațiilor / FX în DirectWave (AGM și celelalte)

Scop: să ai, în program, o previzualizare fidelă a fiecărei articulații / FX
**înainte** de a trimite MIDI‑ul în plugin, fără foldere uriașe și fără să
înregistrezi notă cu notă. Cheia: folosești randarea **multi‑sample** a
DirectWave (key range + velocity layers) = **o singură trecere per articulație**,
iar pentru cele care nu sunt „note susținute” reduci straturile / intervalul /
lungimea ca să rămână folderele mici.

Fiecare articulație / FX primește **propriul folder**, numit ca în plugin
(ex. `Palm Mute/`, `Dead Note/`, `Pick Scrape/`), sub `AGM - 4.1.0 (Pick)/`.

## Trei preseturi de randare (copiază‑le în fereastra de rendering)

### P1 — SUSȚINUT (ca Sustain‑ul tău deja făcut)
Pentru: `Sustain`.
```
Key range E3(40)→C7(84) | Keys/zone 1 | Velocity 8 @16..120 | Stop on Max Length
Note length 6s | Release 6s | Loop OFF | 44.1k/32-bit float | Declick ON
Stereo OFF | Normalize OFF | Mixer FX OFF | monolithic OFF | Link vel→gain OFF
```
(Max velocity 120, NU 127 — la AGM 127 = Pop.)

### P2 — SCURT / PERCUTANT (note cu pitch, dar care mor repede)
Pentru: `Palm Mute`, `Staccato`, `Dead Note`, `Accent`, `Mute`, `Pop`, `Slap`,
`Tap`, `Natural Harmonic`, `Pinch Harmonic`, `Artificial Harmonic`.
```
Key range E3(40)→C6(72)        <- mai scurt, sus oricum nu se folosește
Keys/zone 1 | Velocity 4 @32,64,96,120   <- 4 straturi, nu 8
Stop on Max Length | Note length 1.5s | Release 0.5s
Loop OFF | 44.1k/24-bit | Declick ON | Stereo OFF | Normalize OFF | FX OFF
```
De ce mai mic: sunetele percutante decad în <1s, deci 1.5s + 4 velocity păstrează
caracterul dar taie ~4× din dimensiune față de P1.

### P3 — FX / ZGOMOT (fără pitch relevant pe tot griful)
Pentru: `Scratch`, `Slap (FX)`, `Muting`, `Strum Mute`, `Downstroke/Upstroke`,
`Hit Top/Rim`, `Pick Scrape`, `FX Slide …` etc.
```
Key range 1–3 taste doar (ex. C3–D3)   <- FX-urile nu se transposează cromatice
Keys/zone 3 | Velocity 2 @64,120 | Note length 2s | Loop OFF
44.1k/24-bit | Declick ON | Stereo OFF | Normalize OFF | FX OFF
```
De ce minuscul: un FX e practic un one‑shot; nu are sens să‑l duplici pe 44 taste.

## Cum lucrezi (etape, nu notă‑cu‑notă)

1. În plugin, activează articulația (keyswitch‑ul ei din `Articulations`).
2. În FL, *Create DirectWave instrument* → aplică presetul potrivit (P1/P2/P3).
3. Randează → salvează WAV‑urile într‑un folder nou numit ca articulația.
4. Repetă 1–3 pentru următoarea articulație. **O singură randare per articulație.**

Astfel, pentru AGM: ~1 folder P1 (Sustain) + ~11 foldere P2 + ~11 foldere P3,
fiecare mult mai mic decât un P1 complet.

## „To the right of the Articulations” (legato / bend)

`No Legato / Legato Slide / Legato HP / HO/PO / Slide Out / Bend…` sunt
**tranziții**, nu timbre independente. Nu le înregistra cromatice. Dacă vrei totuși
previzualizare, înregistrează doar câteva perechi des folosite (ex. sursă E3→
țintă F3, G3, A3) ca one‑shot‑uri într‑un folder `Legato Slide/` etc. (preset P3,
2–3 taste). Altfel, lasă‑le pe seama pluginului la rulare — programul oricum
trimite MIDI‑ul cu keyswitch‑ul de legato către Ample.

## Reguli de numire & dimensiune

- Folder per articulație / FX, numit **exact** ca în plugin (ca să pot mapa
  automat în `catalog_riffer.json`).
- Fișierele WAV numite după notă (`C3.wav`, `C#3.wav`…) ca DirectWave să mapeze
  root‑urile singur.
- Ține `Normalize OFF` și `Link velocity to gain OFF` peste tot — velocity trebuie
  să aleagă **layer‑ul**, nu volumul (altfel pierzi dinamica).
