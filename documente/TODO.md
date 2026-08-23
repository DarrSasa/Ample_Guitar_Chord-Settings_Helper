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
- [ ] pipeline-ul cărților (`extract_partituri.py` + `package-book.py`)
      = fabrica de cunoștințe pentru §3 ✔ gata
- [ ] `documente/carti/` — de creat pe măsură ce procesezi cărțile

## 6b. Șantier nou: tablaturi + diagrame de acorduri (în lucru)

- [x] detectorul deosebește acum: portativ (5 linii) / tablatură (6) /
      pereche portativ+TAB (unite, cu sub-zone) / diagramă de acorduri
      (grile mici, detector propriu geometric) — testat pe
      `test_pdf/guitar_tablatures_examples.pdf` (9 pagini, toate tipurile)
- [x] nume pe tipuri: `tablatura-p5-A.png`, `diagrama-p8-C.png`,
      `partitura-tab-p6-B.png`; cartea .md le marchează [TAB]/[DIAGRAMA]/
      [SCORE+TAB]; la perechi Audiveris primește doar partea de portativ
- [ ] convertor TAB → MusicXML (cifre din stratul text al PDF-urilor
      digitale → coardă+tastă+acordaj → note cu <string>/<fret>)
- [ ] convertor diagramă → `voicinguri.json` + MusicXML <frame>
      (punctele/x/o/„5fr" citite geometric din grilă)
- [ ] unirea pereche: ritmul din portativ (Audiveris) + digitația din TAB
      într-un singur MusicXML complet
- [ ] pagina scanată cu sisteme dese (Caravan, pg. 3 din test) încă se
      fragmentează — de calibrat separat

## 7. Întrebări deschise / conflicte de rezolvat cu tine

- [ ] Care VST e ținta principală? (presupun Ample Guitar — confirmă)
- [ ] Prima piesă țintă pentru MVP: ce gen? (propun folk/rock simplu)
- [ ] Melodia: generată de program sau dată de tine ca MIDI de intrare?
- [ ] Ce facem cu regulile contradictorii între cărți (clasic vs electric)?
      — propun: regulile poartă etichetă de stil, nu se amestecă
