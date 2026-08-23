# Secventa-exemplu pentru descifrarea formatului .griff

Aici incarci perechea de fisiere exportate din Ample Guitar pentru
ACEEASI secventa: `exemplu.griff` + `exemplu.mid` (si, daca se poate, un
`exemplu.wav` scurt randat — ma ajuta sa verific ce se aude).

## Reteta secventei (~16-20 masuri, tempo 90, orice tonalitate simpla)

Ideea: **fiecare masura demonstreaza UN singur lucru**, in ordinea de mai
jos, ca sa pot lega fara dubii fiecare tag XML de articulatia lui. Daca
un element nu exista in instrumentul tau Ample, sari peste el si noteaza.

| Masura | Continut |
|---|---|
| 1 | 4 note sustain simple, pe corzi diferite (nota si coarda notate de tine) |
| 2 | aceleasi note cu **Palm Mute** |
| 3 | **Hammer-on** apoi **Pull-off** (doua perechi) |
| 4 | **Legato Slide** intre doua note + **Slide in** si **Slide out** |
| 5 | **Bend** 1/2 ton, bend 1 ton, **bend + release** |
| 6 | nota lunga cu **Vibrato** (si, daca exista, vibrato adanc/wide) |
| 7 | note **Staccato** |
| 8 | **Natural Harmonic** + **Pinch/Artificial Harmonic** (daca exista) |
| 9 | **Dead notes / ghost notes** (mute percutant) |
| 10 | acord deschis, **strum Down** apoi **strum Up** (rar, sa se auda decalajul corzilor) |
| 11 | acord cu barre, strum down/up |
| 12 | acordul din m.10 **arpegiat** (nota cu nota) |
| 13 | **strumming ritmic** 8-imi cu accente (pattern-ul din Strummer, daca il folosesti) |
| 14 | FX: **slide noise / fret noise / string noise** |
| 15 | FX: **body hit / golpe / slap** (ce percutii are instrumentul) |
| 16 | o fraza libera scurta care combina 3-4 articulatii + un acord final lasat sa sune (**let ring**) |

## Foarte important
1. Scrie intr-un .txt (incarcat alaturi) **ordinea exacta**: ce
   articulatie e in fiecare masura si, unde stii, coarda/tasta folosita.
2. Exporta `.griff` si `.mid` din ACEEASI sesiune, fara sa modifici nimic
   intre exporturi.
3. Spune-mi si **ce instrument Ample** ai folosit (ex. AGM II, AGT,
   AME...) si versiunea plugin-ului.

Cu perechea asta fac ingineria inversa a schemei .griff (e XML) si scriu
`SPEC-griff.md`, apoi exportul complet din program.

Upload (branch `arena/01a02a61-ample-guitar-chord-settings-he`):
https://github.com/DarrSasa/Ample_Guitar_Chord-Settings_Helper/upload/arena/01a02a61-ample-guitar-chord-settings-he/documente/griff
