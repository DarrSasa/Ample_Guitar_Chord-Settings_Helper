# Ghid: conversia Ample Guitar -> DirectWave -> .gig -> .exs

Cum setezi corect **"Create DirectWave instrument"** in FL Studio cand
esantionezi o chitara Ample Sound pentru samplerul nostru.

## Principiul (important)

DirectWave esantioneaza **NOTE INDIVIDUALE** (reda fiecare tasta MIDI si o
inregistreaza). NU face un sample per acord — acordurile din aplicatia noastra
se construiesc din notele individuale (sau, pe viitor, din strumming).

Deci **"key range" = gama de note (inaltimi)** care va fi esantionata, NU
numarul de acorduri. Cele 360 de acorduri (12 radacini x tipuri) sunt doar
combinatii de note din acea gama.

## 1. Key range (Lowest / Highest note)

Nota minima si maxima intre care DirectWave va reda si inregistra note.

**Recomandare: `E2 (40)` → `E6 (88)`**

De ce exact acest interval:

- **Jos (E2 = 40):** e coarda joasa E a chitarei (acelasi punct de plecare ca
  libraria Realsamples `0 - E2` = MIDI 40). Aplicatia nu coboara sub C3 (48)
  pentru radacini, dar E2 lasa loc pentru bas (viitor) si pentru inversiile
  care duc basul mai jos.
- **Sus (E6 = 88):** acopera radacina maxima B3 (59) + extensia add11 (+17)
  = E5 (76), PLUS marja pentru cele 2 inversiuni (care ridica vocea cu pana
  la ~1 octava). E6 (88) e si capatul natural al unei chitare 24 frets.

Daca vrei sa economisesti timp/spatiu, poti opri la **C6 (84)** — tot acopera
acordurile + inversiunile.

> Verificare: uita-te la tastatura din interfata Ample Guitar (clapele colorate).
> Notele reale sunt cele din zona "de cântat". NU esantiona tastele de
> keyswitch (de regula la capatul de jos) — alea declanseaza tehnici (strum,
> slide etc.), nu note curate.

### Note skip (pasul de esantionare, in semitonuri)

- **2 semitonuri** (ton intreg) — echilibru bun calitate/dimensiune. RECOMANDAT.
- **1 semiton** (cromatic) — calitate maxima, dar de ~2 ori mai multe mostre.

Motorul nostru (SamplerEngine) gaseste automat cea mai apropiata nota si
transpune doar diferenta mica ramasa, deci pasul de 2 semitonuri suna aproape
identic cu cel cromatic.

## 2. Velocity layers (Configure settings)

DirectWave inregistreaza fiecare nota de cateva ori, la intensitati diferite.
Cate layere pui, atatea "grade de atac" va avea chitara in aplicatia noastra.

**Recomandare: 8 layere**, cu vitezele:

```
16, 32, 48, 64, 80, 96, 112, 127
```

De ce:

- Motorul nostru mapeaza velocity MIDI 0..127 uniform pe cate layere exista —
  deci merge cu ORICATE layere (nu esti blocat la 32 ca la Realsamples).
- Strategiile "Auto Vel" din aplicatie produc valori in banda ~66..121
  (ex. DS = 114/94/79, MT = 118/82/66). Cele 8 layere de mai sus dau 4 praguri
  in banda asta (80, 96, 112, 127) => tranzitii naturale de dinamica.
- 32 de layere (ca Realsamples) ar suna aproape identic, dar dureaza de 4 ori
  mai mult si ocupa de 4 ori mai mult. 8 e punctul optim.

Daca vrei mai rapid/mic: **4 layere** la `32, 64, 96, 127` e suficient.

## 3. Celelalte setari

| Setare | Valoare | De ce |
|---|---|---|
| **Note length** | 5–6 secunde | Capteaza decaderea naturala a corzii (sample-urile Realsamples sunt ~7–8s). |
| **Loop** | **OFF** (one-shot) | Chitara decade natural; loop-ul artificial ar suna "orga". |
| **Sample rate / bit depth** | 44.1 kHz / 24-bit (sau 32-bit float) | Identic cu librariile existente; 32-bit float = mai mult headroom. |
| **Mono / Stereo** | Stereo (sau Mono pt. spatiu) | Stereo = sunet Ample complet; Mono = fisiere la jumatate. Motorul reda ambele. |

## 4. Modul Ample Guitar inainte de esantionare

Pune Ample Guitar in modul in care **fiecare tasta canta o singura nota curata**
(adica fara strum auto / fara keyswitch-uri active). Altfel DirectWave va
inregistra si sunete de strum/keyswitch ca si cum ar fi note.

## 5. Ce urmeaza (dupa conversie)

`.exs`-ul rezultat din Chicken Systems Translator contine zone cu **root note,
key range si velocity range** — exact ce trebuie. Cand mi-l aduci, scriu
parserul de `.exs` (XML) care citeste direct zonele (mai precis decat parsarea
din numele folderelor, pe care o folosim acum pentru Realsamples).

## Rezumat rapid (copy-paste)

```
Key range:      E2 (40)  →  E6 (88)
Note skip:      every 2 semitones
Velocity:       8 layers @ 16, 32, 48, 64, 80, 96, 112, 127
Note length:    6 s
Loop:           OFF
Quality:        44.1 kHz / 24-bit (sau 32-bit float)
Stereo:         ON (sau mono pt. spatiu)
```
