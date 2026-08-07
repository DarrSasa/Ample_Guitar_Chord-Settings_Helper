# Numele exacte ale layerelor din PSD

Fișierul tău PSD trebuie să conțină TOATE layerele de mai jos, cu
numele scrise EXACT ca aici.

Reguli generale:
- litere mici (lowercase)
- cuvintele despărțite cu cratimă `-`
- fără spații, fără diacritice, fără majuscule
- fără extensie (nu `.png`, nu `.psd` la numele layerului)

Fiecare buton "activ / inactiv" trebuie să fie DOUĂ layere separate,
așezate în EXACT aceeași poziție (unul peste altul). Eu decid la runtime
pe care îl afișez. Ele trebuie să aibă EXACT aceleași dimensiuni.

Recomand să grupezi layerele pe secțiuni (folders în Photoshop), dar
nu e obligatoriu — scanner-ul le găsește după nume oriunde ar fi.

---

## 1. Fundal (1 layer)

```
background
```

Layer full canvas 1480 × 920. Poate include textură, gradient, orice.

---

## 2. Fundal pentru cele 3 secțiuni (3 layere)

```
section-scroll-history-bg
section-builder-bg
section-table-bg
```

Sunt dreptunghiuri cu bordură + fill, pentru cele 3 secțiuni mari.

---

## 3. Butoane din secțiunea "Scroll On History" (4 butoane × 2 stări = 8 layere)

```
start-active
start-inactive
undo-history-active
undo-history-inactive
redo-history-active
redo-history-inactive
size-dropdown-active
size-dropdown-inactive
```

**Notă:** Undo/Redo apar DOAR aici — nu le duplic cu Undo/Redo din
Builder pentru că sunt controale diferite (Undo Scroll vs. Undo Builder).

---

## 4. Butoane toolbar "Chord Progression Builder" (14 butoane × 2 stări = 28 layere)

```
multi-select-active
multi-select-inactive
select-active
select-inactive
delete-active
delete-inactive

play-active
play-inactive
pause-active
pause-inactive

stop-active
stop-inactive

length-dropdown-active
length-dropdown-inactive

bpm-active
bpm-inactive

guitar-preset-active
guitar-preset-inactive

save-active
save-inactive
dnd-active
dnd-inactive

volume-active
volume-inactive

undo-builder-active
undo-builder-inactive
redo-builder-active
redo-builder-inactive

ch-onoff-active
ch-onoff-inactive
scroll-onoff-active
scroll-onoff-inactive
```

**Notă importantă despre Play/Pause:**
Ai un singur buton fizic, dar el își schimbă iconița între play și pause.
Așa că faci 4 layere:
- `play-active` (iconița play, radiază)
- `play-inactive` (iconița play, stinsă) — asta apare când NU se cântă
- `pause-active` (iconița pause, radiază) — asta apare când SE cântă
- `pause-inactive` (iconița pause, stinsă) — nu se folosește vizual acum
  dar o desenezi ca simetrie / pentru viitor

Sau, ca să simplifici, doar 2 layere:
- `play-inactive` (apare când NU se cântă) — buton relaxat cu iconița play
- `pause-active` (apare când SE cântă) — buton radiind cu iconița pause

Alege varianta 2 (mai simplă). Ignoră `play-active` și `pause-inactive`
dacă nu le vrei — nu-ți impun.

---

## 5. Block-uri de acord (2 tipuri × 2 stări = 4 layere)

Blocurile astea apar în DOUĂ bare din UI:
- bara "Scroll On History" (deasupra) — un istoric de scroll-uri
- bara "Chord Progression Builder" (dedesubt) — succesiunea de acorduri

Ele arată SIMILAR dar au dimensiuni diferite. Fă:

```
history-block-active
history-block-inactive
chord-block-active
chord-block-inactive
```

Text-ul din interiorul block-ului (ex. "C Maj add11" sau "C3, E3, G3, F4")
NU e desenat în PSD — el se scrie dinamic peste PNG. Tu desenezi doar
fundalul + bordura + glow-ul.

---

## 6. Playhead (1 layer)

```
playhead
```

Micul triunghi portocaliu care se mișcă pe bara de acorduri când
se cântă. Un layer mic (~12×10 px). Poziția lui se schimbă la runtime,
tu doar dai forma.

---

## 7. Header tabel (7 layere — un dreptunghi pentru fundal + 6 texte etichete)

Dacă vrei ca și header-ul tabelului să fie 100% grafică custom, fă:

```
table-header-bg
table-header-label-hash
table-header-label-root
table-header-label-type
table-header-label-extension
table-header-label-alteration
table-header-label-bass
table-header-label-progressions
```

**Sau, mai simplu**, fă doar `table-header-bg` (fundalul), iar text-ul
etichetelor îl las CSS. Recomand simpla variantă (economie de layere).

---

## 8. Rând tabel (1 layer)

```
row-background
```

Un singur PNG de ~1456 × 42 pixeli care se repetă pentru fiecare
rând. Fă-l cu o textură subtilă și o linie de separare la bază.

---

## 9. Butoane verzi de acorduri din tabel (2 layere)

Sunt sute de butoane verzi ("C Maj", "D min 7", etc.) în coloana
"Chords for Progressions". Nu poți face PNG pentru fiecare.

Fă doar **fundalul generic** al butonului:

```
chord-suggestion-normal
chord-suggestion-selected
```

Text-ul acordului îl scriu eu în cod peste PNG.

Dimensiune tipică: **~85 × 35 px**. Butoanele se fac în cod la această
dimensiune și PNG-ul se întinde peste.

---

## 10. Layere OPȚIONALE (adaugi doar dacă vrei acel efect)

```
title-scroll-history        - text stilizat pentru "Scroll On History"
title-builder               - text stilizat pentru "Chord Progression Builder"
window-frame                - un cadru decorativ în jurul toată app
top-logo                    - un logo/text în colț
```

Dacă NU le pui, folosesc text HTML normal cu font sistem.

---

## Rezumat total: câte layere trebuie să faci

- **Obligatorii:** 47 layere
  - 1 background
  - 3 section backgrounds
  - 8 butoane Scroll On History (4 × 2 stări)
  - 28 butoane Builder toolbar (14 × 2 stări)
  - 4 block-uri (2 × 2 stări)
  - 1 playhead
  - 1 table-header-bg
  - 1 row-background
  - 2 chord suggestion (normal + selected)

- **Opționale:** +4 layere (titluri, cadru, logo)

**Total minim: 47 layere.**

Sună mult, dar multe sunt "duplicate cu efect diferit" (activ / inactiv).
După ce faci un buton, îl duplici, îl decolorezi și ai a doua variantă.
Timp estimat: 4-6 ore de Photoshop.

---

## Layere care NU trebuie să apară în PSD

- Grile, ghiduri, note pentru tine — dezactivează-le (`eye off`) sau
  pune-le într-un folder numit `GUIDES` care începe cu litera mare
  (scanner-ul meu va sări peste layerele/folderele care încep cu
  majusculă).
- Text-ul acordurilor (C Maj, D min etc.) — nu-l pune în PSD, se
  generează dinamic.
- Numerele rândurilor (1, 2, 3, ...) — text dinamic, nu PNG.
- Notele sub acorduri (C3, E3, G3) — text dinamic, nu PNG.
- Sliderele (Volume) — sliderul în sine e HTML nativ; tu faci doar
  fundalul `volume-active` / `volume-inactive` (cutia din spatele lui).

---

## Următorii pași

1. Deschizi Photoshop (sau [Photopea](https://www.photopea.com/) gratis
   în browser).
2. Creezi document 1480 × 920 pixels, RGB, fundal transparent.
3. Creezi layerele conform listei de mai sus.
4. Fiecare layer trebuie să fie **la poziția lui finală în canvas**
   (unde va apărea în UI). Scanner-ul citește coordonatele direct din
   PSD.
5. Când termini, salvezi ca **`.psd`** (NU `.psb`, NU `.tiff`).
6. Îl pui în repo la `public/graphics/ample-graphics.psd`.
7. `git add`, `git commit`, `git push`.
8. Îmi zici "PSD-ul e gata, scanează-l".

Eu scanez PSD-ul, exportez PNG-urile automat, generez `layout.json` cu
coordonatele, modific `src/App.tsx` să le folosească. Îți dau EXE nou
și verifici.
