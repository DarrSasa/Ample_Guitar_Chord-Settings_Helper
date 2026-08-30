# Surse de teorie/acorduri colectate (JGuitar + derivate)

## Inventar comparativ

| Sursă | Conținut | Mărime | Licență |
|---|---|---|---|
| **jguitar.com** | calculatoare dinamice: chord (toate digitațiile, Fingers/Max‑gap/open‑strings/bass), scale (~50), orice acordaj/nr. corzi, chord‑namer, tab‑mapper | site | — |
| **T‑vK/chord‑collection** | `chords.json` = 12.852 nume de acorduri (incl. slash/inversiuni) cu **1 formă** fiecare; `chords.complete.json` = aceleași nume cu **TOATE formele** | 1.2 MB / 14.2 MB | GPL |
| **szaza/guitar‑chords‑db‑json** | versiunea **filtrată** a lui T‑vK (~99.230 acorduri), organizată pe foldere per rădăcină | ~38 MB | MIT |
| **tombatossals/chords‑db** (deja vendat) | 828 acorduri cu `midi` precalculat | 0.4 MB | MIT |

Format T‑vK: `{ "nume": [ { "positions": ["x","3","2","0","1","0"], "fingerings": [[...]] } ] }`,
`positions` = corzile E2→E4 („x” = mut). Aceeași listă ca JGuitar, dar statică.

## Ce am vendat (ordonat, mic)

- `documente/baze/tvk-curated.json` (~57 KB, 540 intrări): pentru 24 tipuri de
  acord × 12 rădăcini (×2 forme) + inversiuni slash (major/minor), cu
  `positions` **și** `midi` precalculat. E un subset curat, suficient pt.
  voicing‑uri reale + inversiuni, fără a băga 14 MB în git.
- `documente/baze/chords-db/guitar.json` (existent): 828 acorduri cu `midi`.
- `documente/baze/chords-db/{ukulele,piano,instruments}.json` (adăugate):
  chords‑db e **multi‑instrument** — guitar 828/3283 poziții, ukulele 552/2114,
  piano 528; `instruments.json` dă metadata (strings / fretsOnChord / keys).
  Ukulele = util pt. AEU; piano = referință pt. aranjamente/voicing.

## all‑guitar‑chords.com (inventar)

Finder interactiv cu **>2.700 acorduri**, fiecare cu **mai multe variații pe
grif** (open chords marcate), **audio samples**, buton info cu „steps & notes”,
mod stângaci/vertical. Tipuri: Major/Minor/7/5/dim/dim7/aug/sus2/sus4/maj7/m7/
7sus4 + listă „Advanced” completă. E site (fără dump JSON bulk) — îl folosim ca
**referință vizuală/audio** și pt. variațiile pe poziții; datele structurate le
luăm din chords‑db / T‑vK / szaza.

## Cum se folosesc (pe viitor, după designul tău)

1. **Voicing/playability:** `guitarShapes.ts` (chords‑db) + `tvk-curated.json`
   (mai multe forme/inversiuni) → alegerea formei reale la export/redare.
2. **Inversiuni/slash:** `tvk-curated.json` are `C/E`, `Cm/G` etc. → bass corect.
3. **Orice acord exotic:** se poate extinde curated din `chords.complete.json`
   (GPL) sau din szaza (MIT) — de preferat szaza (MIT) pt. redistribuire.
4. **Game/moduri & acordaje:** formulele din `src/music/theory.ts` (derivate din
   Scale/Chord calculatoarele JGuitar).
