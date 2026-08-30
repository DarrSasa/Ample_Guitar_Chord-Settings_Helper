# Real Guitar String Filter (Filtru Limitare La Corzi Reale)

## Ce face

Elimină dintr‑un acord notele care **nu pot fi cântate fizic** pe chitara
selectată (AGM, acordaj standard), transformând redarea/exportul din stil
„pianistic” (toate notele simultan) într‑un voicing realist de chitară.

## De ce (documentare)

O notă e cântabilă pe chitară doar dacă există o coardă pe care tasta ei cade
în intervalul `[0..maxFret]`. Un acord e cântabil doar dacă notele lui pot fi
alocate unor **corzi distincte** simultan (o coardă nu sună de două ori), iar
întinderea mâinii (diferența maximă dintre taste) e limitată. Aceeași înălțime
poate apărea pe mai multe corzi (ex. D4 = coarda 2 tasta 3 = coarda 3 tasta 7 =
coarda 4 liber), deci alegerea corzilor contează — se caută alocarea fezabilă.

## Algoritmul (`src/utils/guitarFilter.ts`)

`filterChordToGuitar(notes, {maxFret=22, maxSpan=6})`:
1. elimină duplicatele exacte și sortează crescător;
2. backtracking (DFS) peste note: pentru fiecare notă încearcă s‑o pună pe o
   coardă liberă cu fret în `[0..maxFret]` și span total `≤ maxSpan`, sau o sare;
3. reține submulțimea **maximă** de note alocabile (apoi span minim);
4. returnează notele păstrate, în ordinea originală, fără duplicate.

Complexitate neglijabilă (≤ 7 note × 6 corzi).

## Unde e activ

- **Settings ▸ Sound Sources ▸ Guitar Samples**: checkbox „Real Guitar String
  Filter” lângă numele chitarei; persistat în `localStorage` (`realStringFilter`).
- **Export `.midi`** (`createMidiFile` primește `getNotes` = notele filtrate).
- **Export `.griff/.briff/.uriff`** (`getCurrentGriffBytes` folosește notele filtrate).
- **Redare** în program (`playChordSound` folosește notele filtrate).

Acordaj standard folosit: `E2 A2 D3 G3 B3 E4` = MIDI `[40,45,50,55,59,64]`.
