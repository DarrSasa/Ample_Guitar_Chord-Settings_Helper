# Instrucțiuni de export pentru secvența .griff / .briff v.3 (8 chitari)

Planul este generat de `scripts/genereaza-secventa-griff.py` din denumirile și
keyswitch‑urile citite **direct din Riffer** (vezi `secventa_v2/catalog_riffer.json`).
Fiecare instrument are propriul folder `secventa_v2/<CODE>/` cu un `.txt`
(plan pe măsuri) și câte un piano‑roll `.png` per măsură.

## Structura unei măsuri (4 secțiuni Riffer)

1. **Articulations** — articulația notei (cu keyswitch, ex. `Palm Mute (D0)`).
2. **To the right of the Articulations** — `No Legato / Legato Slide / Legato HP /
   HO/PO / Slide Out`.
3. **Articulation Sound Single** — sunete de articulație izolate (ex. `Slide Out (D#0)`).
4. **FX Sound Group** — sunetele FX (cu keyswitch, ex. `Pick Scrape (F6)`).

Articulațiile încadrate la *corpul chitarei* **NU** sunt incluse — lista conține
doar cele 4 secțiuni de mai sus.

## Formatul fișierului exportat

- acustice + electrice (AGM, AGLP, AGTC, AME, AEU) → **`.griff`**
- bas (ABJ, ABJF, ABMR5) → **`.briff`**

## Ce exportezi, per chitară

1. Deschizi pluginul și parcurgi măsurile din `secventa_v2/<CODE>/<CODE>.txt`:
   pentru fiecare măsură setezi în Riffer secțiunea + opțiunea indicate (și
   keyswitch‑ul, dacă e listat), apoi cânti notele notate (tempo 90).
2. Exporti **`.griff`/`.briff` și `.mid` din același plugin, în aceeași sesiune**
   (Drag‑and‑Drop / click‑dreapta → `midi` / `griff`), fără modificări între ele.
3. Opțional, un `.wav` (specificații mai jos).
4. Îmi spui: **instrumentul + versiunea + extensia** folosită.

## De ce din plugin, nu din DAW (FL Studio)

`.griff`/`.briff` folosesc convenția de octave a pluginului; în DAW notele apar
cu 2 octave mai sus (+24 semitonuri). Exportând ambele fișiere din plugin,
referențialul rămâne identic.

## Specificații `.wav` (opțional)

WAV PCM 16/24 bit, 44 100 Hz, MONO dacă se poate, fără reverb/limiter/EQ pe
master, același tempo 90; ~1 s liniște la început, coada finală lăsată să sune.

## Ce fac eu cu ele

Perechile urcate în `documente/griff/` → inginerie inversă → `SPEC-griff.md`
(schema completă: ce tag corespunde fiecărei secțiuni/keyswitch) → apoi exportul
complet din program cu butonul „Auto Art”.
