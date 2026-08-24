# TODO — Motorul de interpretare chitaristică (progresii → MIDI expresiv)

> **Versiunea 1** — rescrisă de AI din `Articulatii_(si_altele)_Chitara.txt`
> (discuția cu Gemini), legată de programul existent din acest repo.
> **Se va rescrie** (v2, v3...) pe măsură ce citesc cărțile de teorie
> procesate cu `extract_partituri.py` + `package-book.py`.

---

## 0. Ce păstrez și ce schimb față de planul Gemini

**Păstrez** (era bun):
- ideea de pipeline pe etape, de la stil → acorduri → melodie/bas → ritm →
  digitație → articulații → MIDI;
- alocarea cărților pe module;
- tabelul intrări/ieșiri pe module.

**Schimb** (lipsuri pe care le-am văzut):
1. **Nu era legat de programul real.** Repo-ul are deja un program (Ample
   Guitar Chord Progression Helper: progresii, voicing-uri, key switches
   pentru Ample Sound, sampler). Modulele de mai jos se construiesc PESTE
   el, nu de la zero.
2. **Pipeline-ul nu e pur liniar.** Articulația poate cere re-digitație
   (un slide cere aceeași coardă!), ritmul influențează voicing-ul (funk
   = voicing-uri mici pe 3-4 corzi). Am adăugat buclele de reacție.
3. **Lipsea formatul datelor.** Un LLM care „citește cărți" trebuie să
   scrie REGULI într-un format fix, verificabil (JSON), nu proză. Am
   definit schemele mai jos — fără ele nu se poate construi nimic.
4. **Lipsea fluxul de extracție a cunoștințelor** (cine citește ce, ce
   fișier produce, cum se validează). Adăugat la §3.
5. **Lipsea MVP-ul.** Am împărțit în faze: întâi lanțul minim care sună,
   apoi rafinamentele.
6. **Lipseau**: hărțile de keyswitch per VST, micro-timing-ul strumming-ului
   (ms între corzi), pattern-urile reale din partiturile extrase din cărți
   (MusicXML = adevăr de teren!), testarea prin ascultare.

---

## 1. Arhitectura (module + bucle de reacție)

```
M1 Stil/Config ─► M2 Acorduri/Voicing ─► M3 Melodie/Bas/Arp ─► M4 Ritm/Textură
                        ▲                                            │
                        └────────── buclă (ritmul cere alt voicing) ◄┘
                                                                     ▼
M8 Randare/Test ◄─ M7 MIDI Translator ◄─ M6 Articulații ◄─► M5 Digitație/Corzi
                                              (buclă: slide/legato cer aceeași coardă)
```

| Modul | Nume | Intrare | Ieșire |
|---|---|---|---|
| M1 | Global Config | gen, BPM, tip chitară, VST | reguli globale (swing %, plajă velocity, humanize) |
| M2 | Chord Engine | progresie + durate | voicing-uri pe grif `[X,0,5,5,5,X]` |
| M3 | Melody/Bass/Arp | voicing + tip linie | secvență de pitch-uri MIDI |
| M4 | Rhythm Engine | note + pattern | Note-On/Off cu timestamp-uri |
| M5 | Fret Mapper | pitch + viteza pasajului | `{nota, coarda, tasta}` |
| M6 | Articulation | note mapate + context | tag-uri: hammer-on, slide, palm-mute, bend... |
| M7 | MIDI Translator | note + tag-uri | velocity, gate, keyswitch, CC1/CC11/CC65, pitch-bend |
| M8 | Randare & Test | fișier MIDI | audio prin VST + verificare umană |

---

## 2. Schemele de date (contractul dintre cărți și program)

Tot ce extrag din cărți intră în `date_extrase/` ca JSON, cu câmpul
`sursa` obligatoriu (carte + pagina + partitura, ex. `p3-A`):

```jsonc
// date_extrase/articulatii.json — o intrare per articulație
{
  "id": "palm_mute",
  "nume": ["palm mute", "P.M.", "pizzicato chitaristic"],
  "context": "electric+acustic; ritmic; frecvent in rock/metal/funk",
  "reguli_aplicare": ["pe corzile groase 4-6", "pasaje de 8-imi/16-imi repetate"],
  "efect_midi": { "gate": 0.35, "velocity_delta": -10, "keyswitch": "per-VST" },
  "sursa": "The Techniques of E-Guitar Playing, p. ..."
}

// date_extrase/voicinguri.json — forme de acord pe grif
{ "acord": "Am7", "forma": [null,0,5,5,5,null], "pozitie": 5,
  "stil": ["jazz","funk"], "sursa": "Encyclopedia of Guitar Chords, p. ..." }

// date_extrase/patternuri_ritm.json — pattern-uri de strumming/picking
{ "id": "funk_16_scratch", "gen": "funk", "grid": "16",
  "pasi": [{"t":0,"dir":"D","accent":1},{"t":0.25,"dir":"U","ghost":true}, "..."],
  "sursa": "Essentials Funk Rhythm Guitar, p. ..." }

// date_extrase/keyswitch_harti/<vst>.json — per VST!
{ "vst": "Ample Guitar M", "articulatii": { "sustain":"C0", "palm_mute":"D#0",
  "legato_slide":"D0", "natural_harmonic":"A#0" } }

// date_extrase/exemple_muzicale/ — MusicXML-urile extrase din cărți
//   (adevăr de teren: fraze reale, cu articulațiile notate în context)
```

---

## 3. Fluxul de extracție a cunoștințelor (cum „citesc" eu cărțile)

- [ ] 3.1 Rulează etapele 2+3 pe fiecare carte din listă → `carte.md`
      (text + MusicXML încorporat) — **fluxul e gata și testat** ✔
- [ ] 3.2 Urcă fiecare `carte.md` în `documente/carti/`
- [ ] 3.3 Eu citesc cartea și scriu/completez JSON-urile din §2, cu sursa
      exactă la fiecare regulă
      *(ÎNCEPUT: Willmott — prima transă, p.5-20 din 247 → 19 reguli în
      `date_extrase/reguli_teorie.json` + 1 nerezolvat NR-0001 în
      `documente/log_rezolvari.md`; continuă cu cap. Tensions → Approach
      Voicings → restul capitolelor)*
- [ ] 3.4 La fiecare carte nouă citită: rescriu acest TODO (versiune nouă),
      mut reguli din „presupuneri" în „confirmate de carte"
- [ ] 3.5 Validare: fiecare regulă nouă trebuie să nu contrazică una veche;
      conflictele se listează la §7 pentru decizia ta

**Ordinea de citit** (de la fundație spre rafinament):
1. `Encyclopedia of Guitar Chords` (M2 — baza de voicing-uri)
2. `Rhythm-Guitar-Encyclopedia` + `Rhythm Guitar Playing Book 1` (M4)
3. `3-phrasing-articulation-and-the-guitar` + `The Techniques of Guitar
   Playing (Josel)` (M6 — atlasul articulațiilor)
4. `The Techniques of E-Guitar Playing` (M6 electric)
5. `Guitar Mode/Scales Encyclopedia` (M3)
6. `Carlevaro` + `Fernandez` + `kiryanov` (M5 — digitație)
7. `Paul Gilreath - MIDI Orchestration` (M7 — deja început: cap. corzi ✔)
8. restul (comping, funk, sweep, tremolo, virtuozitate) — rafinamente

> **Încărcată deja**: `Bret Willmott — Complete Book of Harmony Theory &
> Voicing` în `01_Chord_Theory_and_Construction/` (M2, fundație de
> armonie/voicing — se citește împreună cu pct. 1, înainte de restul).

---

## 3b. Biblioteca pe 12 foldere (planul Gemini, îmbunătățit)

Cărțile convertite în .md se încarcă în **`documente/carti/`**, în cele
12 foldere (aceleași nume ca folderele tale locale cu PDF-uri, cu `&`
scris `and`). Ce am păstrat din planul Gemini: taxonomia celor 12
categorii + trierea cărților — sunt bune. Ce am îmbunătățit:

1. **Legarea de modulele programului** (ca fiecare carte să știe unde
   „varsă" reguli):

   | Folder | Module | Prioritate citire |
   |---|---|---|
   | 01 Chord Theory | M2 | ★★★ (MVP) |
   | 02 Progressions & Voice Leading | M2 | ★★ |
   | 03 Complex/Jazz Comping | M2 | ★★ |
   | 04 Genre Progressions | M1+M2 | ★★★ (MVP) |
   | 05 Bass Lines | M3 | ★★ |
   | 06 Arpeggios | M3 | ★★ |
   | 07 Ostinato/Riffs | M3+M4 | ★ |
   | 08 Melody/Chord Melody | M3 | ★ |
   | 09 Rhythm & Groove | M4 | ★★★ (MVP) |
   | 10 Scales & Modes | M3 | ★★ |
   | 11 Arrangement/MIDI | M1+M7 | ★★ |
   | 12 Articulations/FX/Styles | M6+M7 | ★★★ (MVP) |

2. **O carte stă într-un singur folder**; regulile extrase primesc
   etichete multiple (gen, tip chitară, modul) — evită copiile duble.
3. **Fiecare regulă poartă etichete obligatorii**: `gen` (rock, jazz,
   funk...), `chitara` (acustica / electrica / bas / clasica) și
   `sursa` (carte + pagină). Din ele se nasc scripturile de reguli pe
   genuri și pe tip de chitară.
4. Cărțile noi recomandate de Gemini (Ted Greene, Berklee Harmony, Ed
   Friedland, Mark Levine etc.) — listă bună; le adaugi când le găsești,
   în folderul indicat.
5. Folder 12 este și locul unde regulile se mapează DIRECT pe
   articulațiile/FX-urile **Ample Sound** (vezi §8a).

- [x] cele 12 foldere create în `documente/carti/` ✔
- [x] prima carte .md încărcată: `01_Chord_Theory_and_Construction/Bret
      Willmott - Complete Book of Harmony Theory & Voicing-ocr.md` ✔
      (M2 — se citește prima, împreună cu Encyclopedia of Guitar Chords)
- [ ] la fiecare carte citită: reguli → `date_extrase/` + actualizare
      `documente/log_rezolvari.md` + rescriere TODO
- [ ] mai târziu: restructurarea folderelor dacă practica o cere
      (decizia după primele ~10 cărți citite)

---

## 3c. A doua trecere: re-examinarea cărților cu reguli lipsă (după prima trecere)

- [ ] după ce TOATE cărțile .md din cele 12 foldere au fost examinate o
      dată, revin asupra cărților care au reguli NEREZOLVATE în
      `documente/log_rezolvari.md` (însemnările `NR-xxxx`) și caut
      regulile lipsă DE DATA ASTA ÎN ÎNTREGIME (context complet:
      explicație + exemplu muzical + excepții), nu doar fragmentar cum
      se întâmplă la prima trecere;
- [ ] regulile găsite complete la a doua trecere se folosesc pentru a
      completa fișierele cu reguli lipsă din `date_extrase/`
      (voicing-uri, articulații, pattern-uri etc.) și, prin ele,
      modulele programului care depind de acele reguli;
- [ ] după fiecare regulă completată: `documente/log_rezolvari.md` se
      actualizează (regula mutată din „nerezolvate" la „rezolvate", cu
      sursa precisă) și contorul general se recalculează;
- [ ] dacă o regulă nici la a doua trecere nu se găsește în întregime,
      rămâne la „nerezolvate", cu nota „re-examinată la a doua trecere"
      (ca să nu se reia la nesfârșit).

---

## 4. TODO pe module (cu prioritate)

### M1 — Global Config  `[prioritate: MVP]`
- [ ] schemă JSON `stiluri.json`: gen → {swing%, grid, plajă velocity,
      humanize ms, tip chitară implicit}
- [ ] valori inițiale pentru: rock, pop, folk, funk, jazz, blues, metal,
      clasic/fingerstyle, flamenco (de rafinat din cărți)

### M2 — Chord Engine  `[prioritate: MVP — există parțial în program]`
- [ ] inventar: ce știe deja programul din repo (progresii, voicing-uri?)
- [ ] import `Encyclopedia of Guitar Chords` → `voicinguri.json`
- [ ] reguli de voice-leading între acorduri succesive (comping-ebook)
- [ ] variante per stil: open/barre/power/drop-2/drop-3/shell

### M3 — Melody/Bass/Arp  `[prioritate: faza B]`
- [ ] mapare acord → scări/moduri permise (`acord_scara.json`)
- [ ] generator walking bass (reguli din Bass Fretboard Memorization)
- [ ] generator arpegii (tipare Carcassi/Braid pentru clasic, p-i-m-a)
- [ ] generator melodie simplă pe fraze de 2/4 măsuri (întrebare-răspuns)

### M4 — Rhythm Engine  `[prioritate: MVP]`
- [ ] `patternuri_ritm.json` cu 3-5 pattern-uri per gen ca început
- [ ] strumming realist: decalaj 5-20 ms între corzi, direcția D/U
      inversează ordinea corzilor
- [ ] ghost notes / scratch (X-uri) ca note scurte cu velocity mic
- [ ] staccato/legato ca procent din durata nominală (gate)

### M5 — Fret Mapper  `[prioritate: faza B]`
- [ ] model al grifului: aceeași notă pe mai multe corzi → alegere după
      poziția mâinii, timbru cerut, viteza pasajului
- [ ] cost de tranziție între poziții (reguli Carlevaro/Fernandez)
- [ ] constrângeri fizice: max 4-5 taste întindere, 6 note simultan max,
      corzi blocate de barre

### M6 — Articulation  `[prioritate: faza B, atlasul devreme]`
- [ ] `articulatii.json` — atlasul complet (începe cu: hammer-on,
      pull-off, slide legato, slide portamento, bend 1/2 și 1, vibrato,
      palm mute, staccato, harmonice naturale/pinch, rasgueado, golpe,
      let ring, tremolo picking)
- [ ] reguli de CONTEXT (când se aplică): din `3-phrasing-articulation`
      — ex. legato pe pasaje conjuncte rapide, slide la schimb de poziție
      pe aceeași coardă, palm mute pe pedale de 8-imi în rock
- [ ] buclă M6↔M5: articulația aleasă poate forța re-digitația

### M7 — MIDI Translator  `[prioritate: MVP]`
- [ ] `keyswitch_harti/ample_guitar.json` (programul țintește Ample Sound
      — începem cu el; apoi Shreddage, Ilya Efimov, NI)
- [ ] curbe velocity per stil + accent pe timpi (din Gilreath cap. MIDI)
- [ ] CC-uri: CC1 vibrato, CC11 expresie, CC65/portamento pentru slide,
      pitch-bend pentru bend-uri (interval + curbă)
- [ ] export .mid standard + (opțional) direct în sampler-ul din program

### M8 — Randare & Test  `[prioritate: MVP — altfel nu auzim nimic]`
- [ ] script care randează MIDI-ul prin VST/soundfont și scoate .wav
- [ ] set de teste de ascultare: aceeași progresie în 3 stiluri
- [ ] criteriu: „sună a chitarist, nu a pian cu sunet de chitară"

---

## 5. Fazele de construcție (propunerea mea de drum)

- **Faza A (MVP „sună a chitară")**: M1 minim + M2 existent + M4 (3
  pattern-uri: folk strum, rock 8-imi palm mute, funk 16) + M7 pentru
  Ample Guitar + M8. → prima piesă audibilă cap-coadă.
- **Faza B (expresivitate)**: M6 atlas + reguli de context, M5 digitație,
  bucla M5↔M6, bend/vibrato/slide reale.
- **Faza C (muzicalitate)**: M3 melodie/bas/arp, frazare (întrebare-
  răspuns), dinamică pe fraze, variații între repetări.
- **Faza D (lărgime)**: alte VST-uri, alte genuri, efecte extinse
  (golpe, percuție, harmonice artificiale), micro-timing avansat.

*Tu alegi ideile noi; eu le așez în faza potrivită și îți spun de ce.*

---

## 6. Legătura cu ce există deja

- [ ] inventarul programului din repo (src/): ce module de progresii,
      voicing-uri, keyswitch-uri există deja → să nu construim dublu
- [x] pipeline-ul cărților (`extract_partituri.py` + `package-book.py`)
      = fabrica de cunoștințe pentru §3 ✔ gata — acum cu **oprire
      controlată** (fișier `STOP` sau Ctrl+C), **reluare automată de unde
      a rămas** după oprire/pană de curent/restart (puncte de control:
      etapele 1-2 și fiecare pagină la extract, fiecare partitură la
      package-book) și **jurnal** în folderul parental
      (`jurnal_extract_partituri.log` / `jurnal_package_book.log`)
- [ ] `documente/carti/` — de creat pe măsură ce procesezi cărțile

## 6b. Șantier nou: tablaturi + diagrame de acorduri (în lucru)

- [x] detectorul deosebește acum: portativ (5 linii) / tablatură (6) /
      pereche portativ+TAB (unite, cu sub-zone) / diagramă de acorduri
      (grile mici, detector propriu geometric) — testat pe
      `test_pdf/guitar_tablatures_examples.pdf` (9 pagini, toate tipurile)
- [x] nume pe tipuri: `tablatura-p5-A.png`, `diagrama-p8-C.png`,
      `partitura-tab-p6-B.png`; cartea .md le marchează [TAB]/[DIAGRAMA]/
      [SCORE+TAB]; la perechi Audiveris primește doar partea de portativ
- [x] convertor DIAGRAMĂ → `date_extrase/voicinguri.json` (geometric:
      grila, punctele pline ȘI inelele numerotate, offset din "5fr";
      voicing per coardă când e diagramă de acord) — v1 funcțional,
      141/143 citite pe PDF-ul de test; precizia pe scanuri vechi se va
      rafina pe cărți reale
- [x] convertor TAB → MusicXML cu `<string>/<fret>` + acordaj standard;
      cifrele vin din stratul text al PDF-ului sau din Tesseract
      (opțional, `--tesseract`); acordurile (cifre pe aceeași verticală)
      devin `<chord/>`; ritmul marcat ca aproximativ
- [x] perechi: Audiveris pe portativ + digitația TAB salvată in
      `date_extrase/digitatie/<nume>.json` (unirea completă rămâne)
- [ ] unirea pereche: ritmul din portativ (Audiveris) + digitația din TAB
      într-un singur MusicXML complet
- [x] DICTONAR de terminologie muzicala (`dictionar_muzica.json`, ~980 de
      termeni + tipare: acorduri, numerale romane, măsuri, poziții;
      extensibil oricând de tine) — folosit de `package-book.py` ca
      whitelist NE-DISTRUCTIVĂ: cuvintele recunoscute (tempo, dinamică,
      tehnici de chitară, armonie, instrumente, notație, structură,
      editoriale, termeni străini...) sunt albite IN SIGURANȚĂ doar în
      copia pentru OMR (Audiveris convertește mai curat) și primesc
      eticheta `[categorie]` în marcatorul din carte (`CUVINTE: Allegro
      [tempo]`); cuvintele necunoscute NU se ating niciodată, iar
      PNG-urile finale rămân mereu nemodificate → un dicționar incomplet
      nu poate strica examinarea, cel mult nu o îmbunătățește. Potrivire
      fuzzy tolerantă la OCR („A!legro" → tempo).
- [ ] OCR pe numele acordurilor din cărțile scanate fără strat text
      (paginile Mickey Baker: "Gma7" etc.) — cu Tesseract
- [ ] pagina scanată cu sisteme dese (Caravan, pg. 3 din test) încă se
      fragmentează — de calibrat separat

## 7. Întrebări deschise / conflicte de rezolvat cu tine

- [x] Care VST e ținta principală? → **DECIS: exclusiv chitările Ample
      Sound** (vezi §8a)
- [ ] Prima piesă țintă pentru MVP: ce gen? (propun folk/rock simplu)
- [ ] Melodia: generată de program sau dată de tine ca MIDI de intrare?
- [ ] Ce facem cu regulile contradictorii între cărți (clasic vs electric)?
      — propun: regulile poartă etichetă de stil, nu se amestecă

---

## 8. Decizii și protocoale de lucru (stabilite)

### 8a. Ținta unică: Ample Sound
Tot ce construim în program (articulații, sunete FX, bass, keyswitch-uri,
export) vizează **doar chitările Ample Sound** — nu alte plugin-uri.
Consecințe practice:
- [ ] hărțile de articulații/keyswitch se fac per instrument Ample
      (AGM/AGL acustice, AGE/AGF electrice, ABP/ABJ bas etc.)
- [ ] regulile din cărți se mapează pe ce POATE Ample Sound (ce nu are
      corespondent — ex. un FX exotic — se notează în log ca nerezolvat)

### 8b. Protocolul lipsurilor (când în cartea .md lipsește o secvență /
un exemplu XML unde ar trebui să fie)
Ordinea de rezolvare:
1. reconstruiesc exemplul din explicațiile cărții, prin logică;
2. formule matematice bazate pe informația din carte — DOAR dacă sunt
   convins că rezultatul e corect;
3. caut explicația exactă pe internet;
4. alte surse (alte cărți din bibliotecă, MusicXML-uri deja extrase);
5. dacă nu se rezolvă: **însemnare numerotată** (ex. `NR-0007`) în
   `documente/log_rezolvari.md` — regula NU intră în program, doar se
   ține evidența ei cu o posibilă rezolvare viitoare;
6. orice altă metodă potrivită pe care o consider corectă (documentată).
7. **Log**: `documente/log_rezolvari.md` ✔ creat — conține acțiunile de
   rezolvare + contorul total al regulilor din cele 12 foldere:
   rezolvate (cu metoda) și nerezolvate (cu cauza).

### 8c. Formatul .griff (exportul din program către Ample Sound)
Ample Sound importă/exportă `.mid` și `.griff`; `.griff` e XML (verificat
de tine în Notepad++). Plan:
- [ ] tu creezi în Ample Guitar o secvență-exemplu COMPLETĂ (rețeta în
      `documente/griff/README.md`) și exporți perechea `.griff` + `.mid`
      a aceleiași secvențe → le încarci în `documente/griff/`
- [ ] eu fac ingineria inversă a schemei XML (compar .griff cu .mid și cu
      ce se aude): ce tag corespunde fiecărei articulații, corzi, taste,
      FX, strum etc.
- [ ] scriu specificația `documente/griff/SPEC-griff.md`
- [ ] construiesc exportul `.griff` din program (opțiune completă și
      corectă, validată prin re-import în Ample Sound)
