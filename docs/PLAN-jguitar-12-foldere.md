# Plan: informația JGuitar → scripturi ordonate → progresii evolutive (cei 12 folderi)

## Ce e pe JGuitar (inventar)

1. **Chord Calculator** – generează dinamic *toate* digitațiile posibile pentru
   orice acord, cu opțiuni: Root, ~70 tipuri de acord, **Bass** (inversiuni),
   **Fingers 2–6**, **Max Gaps 0–2**, **Always open strings**, Sharps/Flats.
2. **Funcționează pe orice instrument/acordaj/nr. de corzi** (6, 12, bas, ukulele,
   acordaje alternative) – acoperă chitarele tale viitoare.
3. **Scale Calculator** – ~50 de game/moduri pe orice acordaj, cu start-fret.
4. **Chord Namer** – inversează: taste → nume acord (etichetare/decodare).
5. **Tab Mapper** – tab de pe web → diagrame.

## Ce am copiat (ordonat) în repo – reprezentare proprie, extensibilă

- `src/music/theory.ts`
  - `CHORD_FORMULAS` (~40 tipuri, intervale), `SCALE_FORMULAS` (~32 game/moduri),
    `TUNINGS` (std/dropD/DADGAD/openG/halfDown/bass4/bass5/12/ukulele),
    + `buildNotes`/`buildNotesCompact`/`degreeNotes`.
- `src/music/progression.ts`
  - `buildProgression(spec)` → straturi evolutive `{chords, rhythm, arpeggio,
    melody, bass, ostinato}`; preseturi de ritm/ostinato per stil
    (rock/pop/funk/blues/jazz) și `PROGRESSION_PRESETS` (popAxis, dooWop,
    blues12, jazz251, andalus).
- (Deja existent) `src/utils/guitarFilter.ts` + `guitarShapes.ts` = digitații
  reale/playability (echivalentul constrângerilor „Fingers/Max‑gap/open‑strings”).

## Plan pe pași (progresii evolutive, mapate pe cei 12 folderi)

1. **Folder 1–4 (teorie & acorduri & progresii & jazz):** alegi tonalitatea +
   gamele + gradele → `buildProgression` generează acordurile diatonice
   (triade/7). Aici aplici și formele reale de chitară (`guitarShapes`).
2. **Folder 9 (Rhythm & Groove):** activezi stratul `rhythm` cu presetul de stil
   (strum/scratch). BPM + swing din `stiluri.json` (pe genuri).
3. **Folder 6 (Arpeggios):** stratul `arpeggio` (8‑imi prin notele acordului).
4. **Folder 5 (Bass Lines):** stratul `bass` (root/5th sau walking pe stil).
5. **Folder 7 (Ostinato/Riffs):** stratul `ostinato` (riff 8‑imi repetabil).
6. **Folder 8 (Melody/Chord Melody):** stratul `melody` (contur pe gama acordului).
7. **Folder 10 (Scales & Modes):** schimbi `scale` în `spec` pt. colorare
   (dorian/lydian/etc.) – afectează acordurile diatonice și melodia.
8. **Folder 11 (Arrangement/MIDI):** straturile devin evenimente MIDI exportabile
   (`.mid`/`.griff`), cu velocity per stil.
9. **Folder 12 (Articulations/FX):** peste evenimentele MIDI se aplică
   keyswitch‑urile Ample (Art&Fx) la export.
10. **Evoluție:** fiecare strat e comutabil independent (`spec.layers`), deci o
    progresie simplă crește pas cu pas spre aranjament complet, exact ca
    parcurgerea celor 12 foldere.

## Etape viitoare (implementare)

- Integrarea `buildProgression` în UI (Builder) ca „adăugare strat” per folder.
- Motor dinamic de digitații în stil JGuitar (orice acordaj/nr. corzi + opțiuni
  Fingers/Max‑gap/open‑strings) în `guitarFilter.ts` – pentru 12‑corzi/bas.
- Folosirea `Chord Namer` pt. etichetarea formelor generate/decodate.
