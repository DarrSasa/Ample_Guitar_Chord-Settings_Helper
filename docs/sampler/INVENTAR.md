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

## Decizii (rezolvate cu userul)

1. **Variante de librarie in Settings / meniu (2 optiuni pe librarie):**
   - `<Prefix> - <Nume> (Single Notes)`
   - `<Prefix> - <Nume> (Single Notes+Chords)`
   Exemplu: `RS - Acoustic Guitar 1 (Single Notes)` si
   `RS - Acoustic Guitar 1 (Single Notes+Chords)`.
2. **Strumming (buton dedicat, pe viitor)** foloseste varianta cu **Chords**
   (libraria completa) -> acorduri preinregistrate, cele mai naturale pentru
   down/up stroke.
3. **Auto Vel** = modele de accent pe velocity (DS = bas accentuat, US = acute
   accentuate etc.), nu schimb de sample. Vezi lista finala mai jos.
4. **Loop points:** lipsesc din metadate (fara chunk `smpl`). De confirmat din
   PDF daca sample-urile sunt loop-uite sau one-shot.

## Auto Vel — strategii (lista finala pentru meniu)

| # | Cod | Nume | Descriere |
|---|-----|------|-----------|
| 1 | DS  | Downstroke | accent pe bas, sunet plin (sweep descendent) |
| 2 | US  | Upstroke | accent pe acute, mai discret (sweep ascendent) |
| 3 | DSU | Down/Up alternat | DS pe acorduri impare, US pe pare |
| 4 | BB  | Backbeat | accent pe bătăile 2 și 4 |
| 5 | MT  | Melody Top | nota cea mai înaltă scoasă în evidență |
| 6 | BR  | Bass Root | rădăcina (basul) accentuată |
| 7 | SW  | Swell | crescendo de la primul la ultimul acord |
| 8 | PL  | Pulse | accent pe bătaia 1 a fiecărei măsuri |

## Auto Vel — design vizual (decis)

- **Buton "split"**: eticheta `Auto Vel` = toggle ON/OFF; săgeata `▾` = deschide
  meniul de sugestii. Cand e activ, badge-ul arata codul (ex. `DS`).
- **Meniu**: rânduri pe 2 linii (număr + cod bold + nume scurt pe linia 1;
  descriere pe linia 2, text mic estompat); panou mai lat decat Snap, fundal
  albastru `#677987` (ca Snap/Guitar); rândul selectat are check ✓.
- Mockup: `docs/sampler/auto-vel-menu-mockup.html`.
