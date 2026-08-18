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

**Ample Guitar AGM are key range `E1 (28)` → `C5 (72)`** (din manualul PDF).

Deci esantionam **in interiorul gamei instrumentului** — nu are rost sa cerem
note peste C5 (nu exista acolo).

**Setare: `E1 (28)` → `C5 (72)`** (sau `E2 (40)` → `C5 (72)` daca E1 e doar
keyswitch, nu nota reala — vezi verificarea de mai jos).

De ce:

- **Jos:** E1 (28) e foarte jos (sub coarda E standard). Aplicatia nu coboara
  sub C3 (48) la radacini, dar E1/E2 lasa loc pentru **bas (viitor)** si
  **inversii** care duc basul mai jos. Daca E1 e keyswitch (nu suna ca o nota),
  porneste de la E2 (40).
- **Sus:** C5 (72) e capatul natural al instrumentului. Aplicatia poate genera,
  rar, note pana la **E5 (76)** (ex. B Maj add11). Notele 73–76 (C#5..E5) nu
  au sample propriu -> motorul nostru le transpune automat din C5 (diferenta
  de 1–4 semitonuri, neglijabila si doar pe acordurile cele mai acute).

> Verificare: uita-te la tastatura din interfata Ample Guitar (clapele colorate).
> Notele reale sunt cele din zona "de cântat". NU esantiona tastele de
> keyswitch (de regula la capatul de jos) — alea declanseaza tehnici (strum,
> slide etc.), nu note curate.

### Note skip (pasul de esantionare, in semitonuri)

**Setare confirmata: 1 semiton (cromatic) — calitate maxima.**

Motorul nostru gaseste oricum cea mai apropiata nota si transpune diferenta
mica, dar cromatic = zero transpunere (fiecare nota are sample-ul ei exact).

## 2. Velocity layers (Configure settings)

DirectWave inregistreaza fiecare nota de cateva ori, la intensitati diferite.
Cate layere pui, atatea "grade de atac" va avea chitara in aplicatia noastra.

**IMPORTANT (din manualul AGM): velocity NU e doar dinamica la Ample Guitar:**

- **velocity < 127** -> articulatie **Sustain** (nota tinuta normala).
- **velocity = 127** -> articulatie **Pop** (atac scurt, diferit).

Deci **NU esantionam la velocity 127** — altfel layer-ul cel mai tare ar fi
"Pop", nu "Sustain mai tare", iar Auto Vel ar declansa din greseala articulatia
Pop. Vrem ca **velocity layer = dinamica (soft→tare) a articulatiei Sustain**.

**Setare: 8 layere, toate sub 127:**

```
16, 32, 48, 64, 80, 96, 112, 120
```

De ce:

- Toate valorile sunt < 127 -> toate declanseaza **Sustain** (doar dinamica).
- Motorul nostru mapeaza velocity MIDI 0..127 uniform pe cate layere exista —
  deci merge cu ORICATE layere (nu esti blocat la 32 ca la Realsamples).
- Strategiile "Auto Vel" produc valori in banda ~66..121 (ex. DS = 114/94/79,
  MT = 118/82/66). Pragurile 80, 96, 112, 120 dau tranzitii naturale.

Daca vrei mai rapid/mic: **4 layere** la `32, 64, 96, 120` e suficient (tot
sub 127, deci tot Sustain).

### Articulatia "Pop" (pentru viitor)

"Pop"-ul il pastram pentru viitorul buton **"Auto Art"** (articulatii): il vom
esantiona SEPARAT (un set propriu de note la velocity 127), declansat prin
selectie de articulatie, NU prin velocity.

## 3. Celelalte setari

| Setare | Valoare | De ce |
|---|---|---|
| **Stop on** | **Max Length (6 s)** — NU "Silence" | Chitara electrica are hum/zgomot de amplificator la coada; "Silence" poate sa nu detecteze niciodata linistea sau sa taie incorect. "Max Length" = predictibil, toate notele la exact 6 s. |
| **Note length / Max length** | 6 s | Capteaza decaderea naturala a corzii. |
| **Loop** | **OFF** (one-shot) | Chitara decade natural; loop-ul artificial ar suna "orga". |
| **Sample rate** | 44.1 kHz (sau cat e default) | Standard. |
| **Bit depth** | **32-bit float** (NU 16) | Calitate maxima, headroom mare, zero clipping. Fisiere mai mari (~2x), dar am ales calitate maxima. Motorul + Chicken Systems le citesc fara probleme. |
| **Stereo** | **OFF (Mono)** | Fisiere la jumatate din dimensiune; motorul reda mono fara probleme. |
| **Normalize** | **OFF** | Daca e ON, fiecare sample e amplificat la 100% si pierzi dinamica dintre velocity layers. |
| **Mixer/Insert/Master FX** | **OFF (debifate)** | Vrem sunetul brut al chitarei, fara efecte din mixerul FL. |
| **Declick in/out** | **ON (ambele)** | Fade 20 ms ca sa nu apara click la start/final (inofensiv pentru atac). |
| **Root offset** | **0** | Cu Key zones = 1, root-ul e exact tasta. NU e pentru corectat transpunerea de 2 octave (aia o facem in library.json cu pitchOffset). |
| **Cycle layers** | **1** | Round-robin (note repetate diferite). Noi nu-l folosim; fiecare cycle layer inmulteste dimensiunea patch-ului. |
| **Miscellaneous: Open in DirectWave** | optional | Doar deschide patch-ul in editor dupa randare. Nu afecteaza sample-urile. |

## 4. Modul Ample Guitar inainte de esantionare

Ample Guitar are 3 moduri de redare cu timbre diferite: **finger, strum, pick**.

**Pentru samplerul nostru alegem `PICK`** (decis cu userul), pentru ca:

- Samplerul nostru construieste acordurile din **NOTE INDIVIDUALE** (nu inregistram
  acorduri). Din cele 3 moduri, `pick` da cele mai **clare si distincte** note
  individuale — cand suprapui notele intr-un acord, fiecare ramane citita.
- `strum` e gandit pentru acorduri/strumming (nu produce note individuale curate
  pentru esantionare). Va fi util abia la viitorul buton de **Strumming**.
- `finger` e mai muiat/cald — bun ca **varianta separata** de librarie, nu ca
  sursa principala.

**Deocamdata se face DOAR `pick`.** Calibrarile separate (finger/strum) se vor
discuta pe viitor.

### Cum verifici ca pick reda o singura articulatie consecventa

**RASPUNS GASIT (din manualul AGM + test in FL):**

- **velocity < 127** -> articulatie **Sustain**.
- **velocity = 127** -> articulatie **Pop**.

Adica AGM are **2 articulatii legate de velocity**. Consecinta practica:

- Pentru **velocity = dinamica** (ce vrem acum), esantionam **doar Sustain**
  -> toate layerele de velocity trebuie sa fie **< 127** (vezi sectiunea 2).
- "Pop" il lasam pentru viitorul buton "Auto Art" (esantionat separat).

Asadar NU mai e nevoie sa "blochezi" manual o articulatie pentru pick — doar
respecta regula de mai sus: nu esantiona la velocity 127. Daca vrei sa fii
sigur ca nu exista si ALTE comutatoare de articulatie legate de velocity (in
afara de Sustain/Pop), fa testul de mai jos o singura data:

1. **Pune Ample Guitar pe modul Pick.**
2. **Canta aceeasi nota la velocity 20 si la velocity 120** (nu 127) si
   asculta-le: trebuie sa fie ACEEASI articulatie, doar mai incet / mai tare.
3. Daca la 120 suna la fel ca la 20 (doar dinamica), e perfect.
4. Daca la 120 se schimba caracterul (alta articulatie), exista un alt
   comutator -> cauta in manual "articulation" / "velocity switch" si pune-l
   pe o singura articulatie fixa.

De asemenea: fara strum auto / fara keyswitch-uri active, ca fiecare tasta sa
cante o singura nota curata.

### Nume de folder (conventie)

Fiecare mod va fi o **librarie separata** (folder separat in "guitar samples").
Foloseste separatorul ` - ` ca prefixul vendorului sa fie detectat corect:

```
AGM - 4.1.0 (Pick)
```

Asa in meniu apare: `AGM - 4.1.0 (Pick) (Single Notes)` (prefix = "AGM").
Pe viitor: `AGM - 4.1.0 (Finger)`, `AGM - 4.1.0 (Strum)`.

## 5. Ce urmeaza (dupa conversie)

`.exs`-ul rezultat din Chicken Systems Translator contine zone cu **root note,
key range si velocity range** — exact ce trebuie. Cand mi-l aduci, scriu
parserul de `.exs` (XML) care citeste direct zonele (mai precis decat parsarea
din numele folderelor, pe care o folosim acum pentru Realsamples).

**Ce pot verifica eu DUPA conversie (din fisierele rezultate):**

- sample rate, bit depth, **mono/stereo** (din header-ul WAV `fmt`);
- **nota minima/maxima** (din numele folderelor/fisierelor sau din zonele .exs);
- **cate straturi de velocity** (din prefixul numeric al fisierelor sau din
  zonele .exs);
- **durata** sample-urilor (din dimensiunea WAV + sample rate);
- **loop** (din chunk-ul `smpl`, daca exista).

Deci NU trebuie sa notezi setarile manual — cand ai conversia gata, rulezi
`node --experimental-strip-types scripts/inspect-guitar-library.mjs <cale>`
(sau imi trimiti `.exs`-ul + un WAV) si iti confirm daca totul corespunde.

## 6. Offset de inaltime (descoperire: sunetul e cu 2 octave mai sus)

**Constatare (verificata de user in FL Studio Edison, "detect pitch regions"):**

- Ample Guitar AGM **suna** in gama **E3-C7** (Edison).
- Manualul PDF zice gama **E1-C5** (tastatura/notatia).

Deci instrumentul e "transpus": tasta MIDI joaca o nota, dar sunetul iese cu
**2 octave mai sus**. Pentru samplerul nostru asta inseamna ca numele fisierelor
(DirectWave denumeste dupa tasta) NU se potrivesc cu inaltimea reala a sunetului.

**Cum rezolvam (fara re-esantionare):** descriptorul `library.json` accepta
campul `pitchOffset` (semitonuri). Dupa conversie, verific inaltimea reala a
sample-urilor si setez valoarea corecta:

```json
{
  "vendorPrefix": "AGM",
  "displayName": "4.1.0 (Pick)",
  "pitchOffset": 12
}
```

> `pitchOffset` = "cate semitonuri adaugam la MIDI-ul dedus de parser (care
> presupune index 0 = E2 = 40) ca sa obtinem inaltimea REALA a sunetului".
> Valoarea EXACTA o determin eu dupa masurare (probabil **+12** sau **+24**,
> in functie de cum denumeste DirectWave folderele si de ce octava porneste).
> Nu o seta tu din oficiu — imi trimiti conversia si o fixez corect.

**Ce faci tu la conversie:** esantioneaza intreaga gama de TASTE din manual
(E1-C5). NU incerca sa "repari" tu octava in DirectWave — o corectam noi in
`library.json` dupa ce masor pitch-ul real al sample-urilor.

## Rezumat rapid (copy-paste)

```
Key range:      E1 (28)  →  C5 (72)     (sau E2(40)->C5(72) daca E1 e keyswitch)
Note skip:      1 semitone (cromatic)
Velocity:       8 layers @ 16, 32, 48, 64, 80, 96, 112, 120   (TOT < 127 = Sustain)
Stop on:        Max Length
Note length:    6 s
Loop:           OFF
Quality:        44.1 kHz / 32-bit float
Stereo:         OFF (mono)
Normalize:      OFF
Mixer FX:       OFF
Root offset:    0
Cycle layers:   1
```
