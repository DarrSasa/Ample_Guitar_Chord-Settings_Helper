# Inventar librarii guitar samples (Etapa 1)

Sursa: raport generat cu `scripts/inspect-guitar-library.mjs` pe libraria
**"RS - Acoustic Guitar 1"** (Realsamples), 17.08.2026.

## Concluzia principala (importanta)

Libraria se poate parsa **in intregime din numele folderelor si al fisierelor**.
NU este nevoie sa citim `.exs`/`.gig`:

- fisierele `.exs` din aceasta librarie sunt de fapt **binare GigaStudio**
  (nu XML text);
- mapping-ul nota/velocity reiese clar din structura de foldere + prefixul
  numeric al fisierului;
- WAV-urile NU au chunk `smpl` (nota NU e in metadate) -> nota se ia din
  numele folderului.

## Structura librariei

```
RS - Acoustic Guitar 1/
  ├── Chords/                    (acorduri PREINREGISTRATE complete)
  │     ├── A Major/     1_AC.wav ... 8_AC.wav
  │     ├── A Minor/     1_AmC.wav ... 8_AmC.wav
  │     ├── A# Major/    ...
  │     ├── A# Minor/
  │     ├── B Major/ B Minor/ C Major/ C Minor/ C# Major/ C# Minor/
  │     ├── D Major/ D Minor/ D# Major/ D# Minor/ E Major/ E Minor/
  │     ├── E2 Major/ E2 Minor/          (voicing suplimentar pe E)
  │     ├── F Major/ F Minor/ F# Major/ F# Minor/
  │     └── G Major/ G Minor/ G# Major/ G# Minor/
  │
  └── Single Notes/              (note individuale, cate 1 semiton)
        ├── 0 - E2/      1_E2.wav ... 32_E2.wav
        ├── 1 - F2/      1_F2.wav ... 32_F2.wav
        ├── 2 - F#2/
        ├── 3 - G2/ ... 4 - G#2/ 5 - A2/ 6 - A#2/ ...
        ├── 16 - G#3/ ...
        ├── 29 - A4/ 31 - B4/ ... 35 - D#4/
        └── ...
```

## Format audio (din cele 8 WAV-uri analizate in detaliu)

- **44100 Hz, 24-bit, 1 canal (mono)**
- durata: ~7-8 s (sustinere lunga, buna pentru acorduri tinute)
- **fara chunk `smpl`** -> fara loop points in metadate. (De verificat daca
  sample-urile sunt deja loop-uite in audio sau se taie; nu avem loop points.)

## Reguli de parsare (sursa de adevar)

### Single Notes
- Nota = **indexul numeric al folderului**, NU numele notei.
  - `0` = E2 = MIDI **40**; `N` = MIDI `40 + N`.
  - Motiv: vendorul are nume de octava inconsecvente (ex. `10 - D2` ar
    trebui sa fie D3; `35 - D#4` ar trebui D#5). Indexul e consecvent.
- Prefixul numeric al fisierului (`1_` ... `32_`) = **velocity layer** 1..32.
- Range observat: de la `0 - E2` (MIDI 40) pana la cel putin `31 - B4`
  (MIDI 71); exact cat continua mai sus se confirma la parsare completa.

### Chords
- Folderul da acordul: `<Root> <Major|Minor>` (ex. "A Major", "G# Minor").
- Prefixul numeric (`1_` ... `8_`) = **velocity layer** 1..8.
- Codul din nume: `XC` = major, `XmC` = minor (ex. `AC`, `AmC`).
- `E2 Major` / `E2 Minor` = un al doilea voicing pe E (dublura) - de decis
  cum il folosim (probabil ignoram initial sau il tratam ca varianta).

## Ce inseamna pentru sampler

- **Velocity MIDI (0..127) -> layer:**
  - Single Notes: `layer = 1 + round(v/127 * 31)` (1..32).
  - Chords: `layer = 1 + round(v/127 * 7)` (1..8).
- **Single Notes** pot reda ORICE acord din Builder (se suprapun notele).
- **Chords** sunt preinregistrate -> cel mai natural sunet de chitara, dar
  acopera DOAR Major/Minor (24-26 tipuri). Pentru alte tipuri/extensii
  (7, add9, sus, etc.) NU exista mostre -> folosim Single Notes.

## Fisiere instrument

- `.exs` = de fapt binare GigaStudio (scriptul de inspectie le detecteaza si
  nu le mai varsa ca text).
- `.gig` / `.pdf` = doar listate.
- Nu avem nevoie de ele la runtime; le pastram doar ca referinta.

## Total fisiere (din raport)

- **1392 WAV** + 3 `.exs` + 3 alte fisiere (.gig/.pdf).
- (detaliul exact pe foldere se va fixa la parsarea completa a librariei.)

## Decizii de luat (cu userul)

1. **Sursa principala de sunet:** Single Notes (flexibil, orice acord) vs
   Chords (natural, doar Maj/Min) vs **ambele** (Chords cand acordul e Maj/Min,
   altfel Single Notes). Recomand: **ambele**.
2. **DS/US (down/up stroke):** libraria NU pare sa aiba mostre separate DS/US
   in Chords - doar 8 velocity layers. De confirmat cu PDF-ul user guide daca
   exista variante de strum direction undeva. In Auto Vel, DS/US vor fi
   atunci **modele de accent pe velocity** (bas vs acut), nu schimb de sample.
3. **Loop points:** lipsesc din metadate. Daca sample-urile nu sunt loop-uite,
   notele tinute se sting dupa ~7-8s. De confirmat din PDF daca sunt one-shot.
