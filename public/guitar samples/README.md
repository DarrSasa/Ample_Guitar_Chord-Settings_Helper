# Guitar Samples (librarii multi-sample pentru sampler)

Acest folder este locul unde stau **librariile de chitara** folosite de
noua optiune de sampler (pe langa optiunea SoundFont existenta, care ramane).

## Ce pui aici

Librarii de chitara multi-sample, in unul dintre formatele:

- **`.exs`** (EXS24 / Logic) — preferat, parsabil direct (XML + WAV-uri).
- **`.gig`** (GigaStudio) — se converteste o singura data in WAV-uri + JSON.
- Pe viitor: `.sfz`, `.dspreset` (Decent Sampler), etc.

Fiecare librarie intr-un subfolder propriu (ex. `Realsamples-Electric-Guitar-Vol2/`).
In interior, structura tipica Realsamples:

```
Realsamples-Electric-Guitar-Vol2/
  ├── 0 - E2/          (folder per nota)
  │     ├── 1_E2.wav   (32 velocity layers pe aceeasi nota)
  │     ├── 2_E2.wav
  │     └── ...
  ├── 1 - F2/
  └── ...
```

## Reguli de gestiune

- **Adaugare librarie** = copiezi folderul ei aici. Motorul sampler o
  descopera automat (scaneaza recursiv).
- **Stergere librarie** = stergi folderul ei. Nu trebuie modificat cod.
- Fiecare librarie poate avea un descriptor **`library.json`** (optional) cu
  suprascrieri: prefix vendor, nume afisat, fade-out, hint de loop. Vezi
  `docs/sampler/DESCRIPTOR-FORMAT.md`. Daca lipseste, totul se deduce din
  numele folderelor/fisierelor.
- Prefixul vendorului (ex. `RS - Electric Guitar Vol.2`) se ia din
  `library.json` sau, implicit, din partea dinainte de " - " din numele
  folderului.
- Verificare rapida fara build: `node --experimental-strip-types scripts/list-libraries.mjs`

## Structura asteptata de sampler

```
<Librarie>/
  ├── Single Notes/            (optional, dar recomandat)
  │     ├── 0 - E2/            (N = index -> MIDI 40 + N)
  │     │     ├── 1_E2.wav     (prefix numeric = velocity layer 1..32)
  │     │     └── ...
  │     └── 1 - F2/ ...
  ├── Chords/                  (optional)
  │     └── A Major/ 1_AC.wav ... (velocity layer 1..8)
  └── library.json             (optional)

## Atentie la dimensiune

Librariile sunt mari (sute de MB pana la cativa GB). Ele **NU se comiteaza in
git**. Le tii local in acest folder (la build ajung automat in `dist/`) si
le poti tine ca backup pe Mega/Drive. Daca ai nevoie de distribuire, folosim
un script de descarcare dedicat (ca la soundfonts).

## Localizare in EXE-ul portabil / instalat

La build, continutul acestui folder ajunge in:

```
...portable-out\Ample Guitar Chord Progression Helper-win32-x64\resources\app\dist\guitar samples
```

In programul instalat, in folderul de instalare, sub `resources\app\dist\guitar samples`.
