# Exporturi pe chitari (`.griff` / `.briff` / `.uriff` + `.mid` + `.wav`)

Aici urci, **per chitară**, fișierele exportate din plugin pentru secvența din
`../secventa_v2/<CODE>/`. Folosește subfolderul cu codul instrumentului
(ex. `exporturi/AGM/`).

## Extensia per familie

| Familie | Instrumente | Extensie |
|---|---|---|
| acustice | AGM, AGLP, AGTC | `.griff` |
| electrice | AME | `.griff` |
| ukulele | AEU | **`.uriff`** |
| bas | ABJ, ABJF, ABMR5 | **`.briff`** |

## Devieri față de plan (de știut la decodare)

- **AEU și ABMR5 NU au secțiunea `[Articulation Sound Single] Slide Out`.**
  Dacă în fișiere lipsește acea măsură, e normal — opțiunea nu există în plugin.
- **AEU, măsura 14** (unde planul prevedea `[Articulation Sound Single] Slide Out`):
  utilizatorul a înregistrat **`Strum` de 4 ori, la intervale diferite de timp**.
  La decodare, m14 la AEU = 4 evenimente Strum, nu Slide Out.
- Referința „ce trebuia să fie în fiecare măsură” este
  `../secventa_v2/<CODE>/<CODE>.txt` (și benzile `*_complet.png`).

## Ce urci per chitară

- `<nume>.griff` / `.briff` / `.uriff` (export Drag&Drop din plugin)
- `<nume>.mid` (aceeași sesiune)
- `<nume>.wav` (opțional, specificațiile din `../INSTRUCTIUNI-EXPORT-v2.md`)
