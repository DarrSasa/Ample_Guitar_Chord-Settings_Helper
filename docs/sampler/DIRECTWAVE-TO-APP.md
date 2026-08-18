# DirectWave (.dwp) -> aplicatia noastra (FARA conversie)

## Concluzia finala (rezolvata)

**NU mai e nevoie de nicio conversie.** Programul nostru citeste DIRECT
folderul cu sample-uri DirectWave.

De ce: am analizat numele fisierelor generate de DirectWave (din dump-ul
`.dwp`-ului) si am adaugat suport in parser. Numele arata asa:

```
Ample Guitar M_E3_15.wav
Ample Guitar M_E3_30.wav
...
Ample Guitar M_C7_121.wav
```

= `<prefix>_<NotaFL>_<velocity>.wav`, unde:
- **Nota** e in notatia FL Studio (E3 = MIDI 40, C7 = MIDI 84) = inaltimea
  REALA a sunetului (nu e nevoie de pitchOffset);
- **velocity** = valorile reale (15, 30, 45, 60, 76, 91, 106, 121).

## Ce am implementat

- `parseLibrary.ts`: functiile `flNoteNameToMidi` + `parseDirectWaveFileName`
  si o ramura care citeste fisierele "plate" DirectWave ca note individuale
  (fara structura `Single Notes/<N> - <Nota>/`).
- `SingleNoteGroup.layerVelocities`: velocity-urile reale ale straturilor;
  motorul alege acum stratul cu velocity-ul CEL MAI APROPIAT de cel cerut
  (nu mapare uniforma).

## Ce faci tu (nimic tehnic)

1. Copiezi folderul librariei (cel care contine `Ample Guitar M.dwp` +
   subfolderul `Ample Guitar M` cu WAV-urile) in:
   `public/guitar samples/AGM - 4.1.0 (Pick)/`
2. Rebuild EXE (`.\Build-Installer.ps1 -Mode Portable -SkipInstall`).
3. In aplicatie: Settings -> bifa "Guitar Samples"; meniul de chitara va
   arata `AGM - 4.1.0 (Pick) (Single Notes)`.

Nu e nevoie de Chicken Systems Translator, de .gig sau de .exs.

## Nota (verificare pitch)

Numele de nota din fisier (E3..C7 FL = MIDI 40..84) coincide cu inaltimea
realA masurata de tine in Edison (E3-C7 FL = MIDI 40..84). Deci pitchOffset =
0. Daca la ascultare ti se pare totusi transpus (ar trebui sa nu), adaugam un
`library.json` cu `pitchOffset` si rezolvam fara re-esantionare.

## Daca vrei totusi .exs (ex. pentru Logic)

Translator Pro 2.9.0 NU citeste DirectWave. Daca ai nevoie de .exs pentru alt
scop, poti folosi functia de "auto-map" din Translator pe WAV-uri. Dar pentru
aplicatia noastra NU e necesar.
