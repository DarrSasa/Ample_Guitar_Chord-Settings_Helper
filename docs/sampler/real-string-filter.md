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

### Reducerea la voce de chitară (maxVoices)

Înainte de alocarea pe corzi, acordul „pianistic” e redus la max. `maxVoices`
(implicit 4) renunțând, în ordine, la: (1) octăvile dublate, (2) quinta justă,
(3) nota cea mai înaltă — regula standard de voicing (păstrăm rădăcina, terța,
septima/extensia). Astfel un acord de 5 voci devine 4, ca în pluginul Ample.

### Voicingul extensiilor (9 / 4‑11 / 6‑13)

Extensiile aflate în aceeași octavă cu basul sunt **ridicate o octavă**, deasupra
rădăcinii — pe chitară 4th/11th stă deasupra rădăcinii, nu jos lângă ea (altfel
ciocnește și e marcată „gri”/necântabilă). Ex. `G sus4 7` = G2,C3,D3,F3 →
G2,D3,F3,**C4** (C3 dispare). Regula e conformă teoriei de voicing pe 6 corzi
(sus4 = 1‑4‑5, 11th = extensie peste octavă, shell = root‑3rd‑7th‑11th).

## Unde e activ

- **Settings ▸ Sound Sources ▸ Guitar Samples**: checkbox „Real Guitar String
  Filter” lângă numele chitarei; persistat în `localStorage` (`realStringFilter`).
- **Export `.midi`** (`createMidiFile` primește `getNotes` = notele filtrate).
- **Export `.griff/.briff/.uriff`** (`getCurrentGriffBytes` folosește notele filtrate).
- **Redare** în program (`playChordSound` folosește notele filtrate).

Acordaj standard folosit: `E2 A2 D3 G3 B3 E4` = MIDI `[40,45,50,55,59,64]`.

## Structură dinamică per chitară (v2)

Filtrul e **dependent de chitara selectată**: `filterConfigForInstrument()` alege
automat configurația după numele instrumentului — extensibil pentru modele
viitoare:
- `SIX_STRING` (6 corzi) — AGM etc.;
- `TWELVE_STRING` (12 corzi / 6 cursuri, `allowDuplicates=true`: fiecare curs
  dublează nota, deci aceeași înălțime poate apărea de 2 ori) — ex. *Ample Guitar
  Twelve 4.0.1*;
- `BASS_FOUR` (bas 4 corzi).

Filtrul e **implicit ON** când e selectată o librărie (se aplică automat la
selectarea chitarei, inclusiv la export), iar alegerea on/off e memorată
**per librărie** (`localStorage realStringFilterByLib`).

## Corecții de redare (v3)

- **Volum**: normalizarea folosește `sqrt(4/N)` față de un acord de referință de
  4 voci — acordurile de 2 corzi sunt *ridicate*, cele mari coborate, astfel încât
  aceeași velocity = același nivel indiferent de nr. de voci. Aplicată în
  `SamplerEngine.playChord` și în ambele căi soundfont din `playChordSound`.
- **Latență prima redare**: `warmAudioForPlayback()` (apelat la pornirea
  playback-ului) încarcă din timp instrumentul/mostrele, ca prima audiție să nu
  aștepte decodarea (a doua redare era oricum din cache).

## Activ și în „Chords for Progressions”

Filtrul se aplică la previzualizarea/ascultarea acordurilor din tabel și la
drag&drop către Builder (ambele trec prin `notesForExport` → `playChordSound`).

## Normalizare de volum (Builder)

În `SamplerEngine.playChord`, amplitudinea fiecărei note e scalată cu
`1/sqrt(N)` (N = nr. de voci), astfel încât energia totală — și deci volumul
perceput — să depindă doar de bara de velocity, nu de numărul de note (cu sau
fără Auto Vel). Exportul MIDI păstrează velocity-urile brute (pluginul Ample
normează la redare).
