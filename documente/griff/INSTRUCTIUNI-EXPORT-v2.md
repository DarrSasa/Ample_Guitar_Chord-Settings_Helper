# Instrucțiuni de export pentru secvența .griff v.2 (8 chitari)

Scop: fiecare dintre cele **8 chitari** Ample produce o pereche `.griff` + `.mid`
(și, opțional, un `.wav`) cu ACEEAȘI secvență de **30 de măsuri** din
`secventa_v2/`, ca să pot lega fiecare tag din `.griff` de articulația / FX‑ul
lui. Lista corectată acoperă **22 de articulații + 30 de sunete FX**; chitara
„Ample Guitar Flamenco” NU există și a fost eliminată.

## Ce exportezi, per chitară

1. Deschizi pluginul chitarii respective: **AGM, AGLP, ABJ** (bază) +
   **AEU, AME, AGTC, ABJF, ABMR5** (completări) — 8 în total.
2. Introduci / cânti secvența din `secventa_v2/plan_secventa.json`
   (30 de măsuri, tempo 90), declanșând în plugin **articulația măsurii** și
   **FX‑ul de pe nota 1**, conform `secventa_exemplu.txt` și piano‑roll‑urilor.
   - Măsurile pe care chitara NU le are (vezi `aplicabilitate_chitari.json`)
     le cânti cu note simple, fără articulație/FX (sau le sari și notezi).
3. Exporti **`.griff` și `.mid` din ACELAȘI plugin, în aceeași sesiune**, prin
   Drag‑and‑Drop (click‑dreapta → `midi` / `griff`), fără să modifici nimic
   între cele două exporturi.
4. Opțional, dar util: un `.wav` scurt randat (vezi specificațiile mai jos).
5. Îmi spui pentru fiecare export: **instrumentul + versiunea pluginului** și
   **transpoziția** folosită (bas −12/−24, ukulele +12 etc.).

## De ce din plugin, NU din DAW (FL Studio)

`.griff` folosește convenția internă de octave a pluginului. În DAW‑ul tău
notele apar cu **2 octave mai sus** (diferența clasică C3‑vs‑C5). Dacă ai
exporta `.mid` din FL Studio, toate înălțimile ar fi deplasate cu **+24 de
semitonuri** față de `.griff`, și potrivirea tag‑cu‑notă ar fi greșită.
Exportând ambele fișiere din plugin, referențialul de octave rămâne identic.

## Specificații `.wav` (dacă îl trimiți)

- WAV PCM, 16 sau 24 bit; 44 100 Hz (spune‑mi care);
- MONO dacă se poate (altfel stereo, dar fără lărgire de stereo);
- fără reverb/limiter/EQ pe master (semnal dry);
- același tempo 90 și aceeași sesiune; ~1 s liniște la început, coada finală
  lăsată să sune; durata așteptată ≈ 80 s (30 măsuri × 4 timpi la tempo 90).

## Ce primesc eu și ce fac

Perechile `.griff` + `.mid` (plus `.wav`‑urile) urcate în `documente/griff/`.
Cu ele scriu `SPEC-griff.md` (schema completă a formatului) și apoi exportul
complet din program, cu butonul „Auto Art”.
