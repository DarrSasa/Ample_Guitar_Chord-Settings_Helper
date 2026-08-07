# Plan grafică custom prin PSD-scan

Ghid pas cu pas: tu faci un singur fișier PSD cu toate layerele, eu îl
scanez automat cu Python și extrag PNG-urile + coordonatele, apoi le
pun în cod.

Termenii tehnici sunt explicați între paranteze la prima folosire.

---

## 0. Vocabular

- **PSD** (Photoshop Document) — format nativ Adobe Photoshop care
  păstrează toate layerele separat (spre deosebire de PNG care e
  turtit).
- **Layer** (strat) — o "foaie transparentă" în Photoshop pe care
  desenezi un singur element (un buton, o iconiță etc.). Poți suprapune
  multe layere.
- **Canvas** (pânză) — dreptunghiul mare în care încape TOATĂ aplicația.
  Noi lucrăm la 1480 × 920 pixeli.
- **Coordonate absolute** — poziția (x, y) a fiecărui element măsurată
  în pixeli de la colțul stânga-sus al canvas-ului.
- **Rasterizare** — transformarea unui layer (care poate fi vector sau
  text) într-o imagine bitmap PNG.
- **Bounding box** (cutie de delimitare) — dreptunghiul minim în care
  încape un layer (are x, y, w, h).
- **JSON** (JavaScript Object Notation) — format text pentru structuri
  de date. Îl folosesc ca să ții evidența coordonatelor.

---

## 1. Ce ai de făcut tu în Photoshop

1. Deschide Photoshop (sau [Photopea](https://www.photopea.com/) gratis
   în browser — deschide și salvează PSD exact ca Photoshop).
2. **File → New**:
   - Width: 1480 px
   - Height: 920 px
   - Resolution: 72 pixels/inch
   - Color Mode: RGB 8-bit
   - Background: Transparent
3. Creezi layerele conform listei complete din
   **`LAYER-NAMES.md`** (fișier separat, deschide-l acum).
4. Fiecare layer trebuie să fie **la poziția lui finală în canvas**
   (unde vrei să apară în aplicație). Poziția și dimensiunea sunt
   citite direct din PSD, deci NU trebuie să-mi dai coordonate
   manual — le extrag eu din fișier.
5. Când termini, salvezi:
   - **File → Save As → Photoshop (.psd)**
   - Nume: `ample-graphics.psd`
   - Locație: `public/graphics/ample-graphics.psd` (în repo)
6. Faci `git add public/graphics/ample-graphics.psd`, commit, push.
7. Îmi zici "PSD-ul e gata".

---

## 2. Ce fac eu automat

Când îmi zici că e gata, rulez un script Python care:

1. **Deschide PSD-ul** cu biblioteca `psd-tools`
2. Pentru fiecare layer numit (așa cum le-am cerut în `LAYER-NAMES.md`):
   - Extrage numele exact
   - Extrage bounding box-ul (x, y, w, h)
   - Rasterizează layer-ul ca PNG (cu transparență)
   - Salvează PNG-ul la `public/graphics/<nume-layer>.png`
3. Scrie un fișier `public/graphics/layout.json` cu toate coordonatele:
   ```json
   {
     "canvas": { "width": 1480, "height": 920 },
     "layers": {
       "background": { "x": 0, "y": 0, "w": 1480, "h": 920 },
       "multi-select-active": { "x": 220, "y": 154, "w": 95, "h": 32 },
       ...
     }
   }
   ```
4. Modific `src/App.tsx` să:
   - Încarce PNG-urile prin CSS `background-image`
   - Poziționeze fiecare buton cu **coordonate absolute** din
     `layout.json`
   - Comute între `-active` și `-inactive` în funcție de stare
5. Fac build EXE nou, tu îl testezi.

Nu trebuie să faci nimic special ca să pornești scannerul — îl rulez eu.

---

## 3. Cum arată un layer bun în Photoshop

### Buton activ ("radiază lumină")

1. Layer nou (Ctrl+Shift+N)
2. **Shape Tool → Rounded Rectangle**, radius 4 px
3. Desenezi butonul la poziția finală (ex. 220, 154, 95×32)
4. Umple cu culoarea de bază (ex. verde pastel `#d0f5c8`)
5. **Layer → Layer Style → Outer Glow**:
   - Blend Mode: Screen
   - Color: `#ff8827` (orange)
   - Size: 10-15 px
   - Opacity: 75%
6. **Layer → Layer Style → Inner Glow**:
   - Color: alb, opacity 40%, size 3 px
7. **Layer → Layer Style → Bevel & Emboss** (opțional, dacă vrei 3D)
8. Adaugi textul butonului (ex. "Multi Select") ca layer text separat
9. **Selectezi ambele layere → Ctrl+E** (Merge Down) — le combini într-un
   singur layer numit `multi-select-active`

### Buton inactiv (stins, aceeași dimensiune)

1. Duplică layer-ul activ (Ctrl+J)
2. Redenumește-l `multi-select-inactive`
3. **Layer → Layer Style** → dezactivează Outer Glow
4. **Image → Adjustments → Hue/Saturation** → Saturation -70 (decolorat)
5. Text opacity 60%

**Aliniază perfect** cele două layere unul peste altul (folosește
Move Tool cu shift + săgeți). Trebuie să ocupe EXACT aceeași poziție,
altfel butonul va "sări" vizual la comutare între stări.

---

## 4. Verificări înainte de trimitere

Deschide `LAYER-NAMES.md` și bifează fiecare layer după ce e gata în PSD:

- [ ] background
- [ ] section-scroll-history-bg
- [ ] section-builder-bg
- [ ] section-table-bg
- [ ] start-active / -inactive
- [ ] ...

Testul final: în Photoshop, panoul **Layers** trebuie să afișeze toate
cele ~47 nume exact ca în `LAYER-NAMES.md`.

Numele greșite comune de evitat:
- ❌ `Multi Select Active` (cu majuscule și spații)
- ❌ `multi_select_active` (underscore în loc de cratimă)
- ❌ `multi-select-actives` (plural)
- ✅ `multi-select-active`

Dacă vreun layer e denumit greșit, scanner-ul îl va sări și buton-ul nu
va apărea în UI. Îți dau lista layerelor lipsă când scanez.

---

## 5. Layere "GUIDES" (opțional, pentru tine)

Dacă vrei să pui layere pentru grile, note, dimensiuni etc. care să nu
apară în UI:

1. Creează un folder numit `GUIDES` (majuscule)
2. Pune orice layer vrei acolo (etichete, ghiduri, versiuni vechi ale
   butoanelor)
3. Scanner-ul ignoră automat orice layer/folder care începe cu literă
   mare.

---

## 6. Ce se întâmplă când vrei să modifici ceva

**Vrei să muți un buton?**
1. În PSD, cu Move Tool, trage layer-ul la noua poziție.
2. Salvezi, commit, push.
3. Îmi zici "am mutat butonul X" — re-scanez și rebuild.

**Vrei să schimbi culoarea unui buton?**
1. În PSD, modifici layer-ul (Hue/Saturation, sau redesenezi).
2. Salvezi, commit, push.
3. Îmi zici "am schimbat X" — re-scanez.

**Vrei să adaugi un buton nou?**
1. Îmi ceri să adaug în cod comportamentul (ex. "buton nou care face
   randomize acord").
2. Adaug funcționalitatea + un placeholder în UI.
3. Adaugi în PSD layer nou cu numele pe care ți-l dau.
4. Re-scanez.

---

## 7. Ordinea sugerată de lucru pentru tine

Ca să nu faci totul deodată și să vezi progres pe parcurs:

**Faza 1** — testul de canal (30 min)
- Doar `background` + `section-builder-bg` + `multi-select-active`
- Trimiți PSD-ul cu doar aceste 3 layere.
- Eu îl scanez, îl pun în cod.
- Vezi cum arată în EXE.
- Confirmi că stilul îți place / vrei să-l schimbi.

**Faza 2** — Builder toolbar (2-3 ore)
- Adaugi în PSD toate butoanele Builder toolbar (28 layere).
- Salvezi PSD, faci push.
- Eu re-scanez.

**Faza 3** — restul
- Scroll On History header (8 layere).
- Block-uri (4 layere).
- Fundal secțiuni + rând tabel + playhead.

Așa nu investești 6 ore de Photoshop și descoperi la sfârșit că vreun
detaliu nu merge.

---

## 8. Ce trebuie și ce nu

**PSD conține:**
- ✅ Toate layerele grafice cu nume standardizate
- ✅ Fundal transparent (nu alb sub layere)
- ✅ Salvat ca `.psd` (nu `.psb` — PSB e format mare separate)

**PSD NU conține:**
- ❌ Text dinamic (ex. numele acordurilor "C Maj" — se generează în cod)
- ❌ Numere de rând (1, 2, 3, ... — se generează în cod)
- ❌ Butoane verzi de acorduri individual (sunt ~5000, prea multe)
- ❌ Note MIDI sub acorduri (C3, E3, G3 — dinamic)
- ❌ Layere ascunse (dacă ai pus și le-ai făcut invisible, tot vor fi
  scanate — mai bine șterge-le sau pune-le în folderul `GUIDES`)

---

## 9. Ce livrez eu la sfârșit

- `public/graphics/*.png` — toate PNG-urile extrase (~47 fișiere)
- `public/graphics/layout.json` — coordonatele fiecărui element
- `src/App.tsx` modificat să folosească grafica custom
- EXE nou pentru testare

Restul funcționalității rămâne intact — Save, D&D, sound, MIDI, tot.

---

## Următorul pas pentru TINE

1. **Citește `LAYER-NAMES.md`** (fișier separat în același folder).
   Are lista completă de nume.
2. Creezi PSD-ul la 1480×920.
3. Adaugi layerele — poți face doar Faza 1 la început (3 layere).
4. Salvezi la `public/graphics/ample-graphics.psd`.
5. Commit + push.
6. Îmi zici "PSD-ul e gata, faza 1" (sau "faza 2", "toate", etc.).

Când ai orice întrebare pe parcurs, spune-mi.
