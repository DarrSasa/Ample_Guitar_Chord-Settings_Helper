# Ghid complet, pas cu pas: pregatirea unei carti pentru analiza AI

Acest ghid te duce de la cartea scanata (PDF) pana la un pachet pe care
agentul AI il poate citi INTEGRAL: **textul** (OCR) + **partiturile** (MusicXML).
Nu trebuie sa faci NICIUN screenshot manual — un script gaseste singur
partiturile din fiecare pagina.

## Ce ai nevoie inainte sa incepi

1. **Python instalat** pe PC (il ai deja — verifica cu `python --version`).
2. Acces la internet pentru instalarea uneltelor (o singura data).
3. Cartea in format **PDF**.

---

## PASUL 1 — Instalezi bibliotecile Python (o singura data)

Deschide **PowerShell** si ruleaza:

```powershell
pip install pymupdf opencv-python-headless numpy ocrmypdf
```

Astepti pana scrie "Successfully installed ...". Nu inchide fereastra pana nu
se termina.

> Daca scrie `pip` nu e gasit: ruleaza `python -m pip install ...` in loc de
> `pip install ...`.

---

## PASUL 2 — Instalezi Tesseract OCR (pt. text) — o singura data

1. Intri pe: `https://github.com/UB-Mannheim/tesseract/wiki`
2. Descarci installer-ul de Windows (`.exe`).
3. Il rulezi. **Important:** la pasul "Choose Components", bifezi limbile:
   - **English** (implicit)
   - **Spanish**
   - **Russian**
4. Il instalezi in locatia default: `C:\Program Files\Tesseract-OCR`.
5. Noteaza calea de instalare (o vei folosi la Pasul 4).

---

## PASUL 3 — Instalezi Ghostscript (cerut de OCRmyPDF) — o singura data

1. Intri pe: `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases`
   (sau direct: `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10071/gs10071w64.exe`)
2. Descarca **Ghostscript 10.07.1 for Windows (64 bit)** = fisierul `gs10071w64.exe`.
3. Il rulezi (dublu-click) si instalezi cu setarile default (Next -> Next -> Finish).

> Confirmare: `gs10071w64.exe` de la `ArtifexSoftware` (GitHub-ul oficial al
> producatorului) e exact ce trebuie — Ghostscript 10.07.1, 64-bit, licenta
> AGPL. NU descarca versiunea de 32-bit.

---

## PASUL 4 — Faci PDF-ul "cautabil" (OCR pe text)

> **Nu se descarca si nu se instaleaza NIMIC la acest pas.** Totul a fost
> instalat la pasii 1-3. Aici doar PORNIȚI uneltele ca sa lucreze.

Pune cartea intr-un folder simplu, fara spatii in nume, ex.:

```
C:\carti\cartea.pdf
```

In PowerShell:

```powershell
# inlocuieste limba cu: eng / spa / rus / rus+eng (in functie de carte)
ocrmypdf -l spa "C:\carti\cartea.pdf" "C:\carti\cartea_searchable.pdf"
```

Ce se intampla cand rulezi comanda (pas cu pas):
1. `ocrmypdf` (instalat la Pasul 1) deschide `cartea.pdf` — care e doar POZE cu
   paginile (text ne-selectabil).
2. Randeaza fiecare pagina ca imagine.
3. Trimite fiecare imagine la **Tesseract** (Pasul 2), care citeste literele
   si scoate text.
4. Pune textul ca un STRAT INVIZIBIL peste fiecare pagina.
5. Salveaza un fisier NOU: `cartea_searchable.pdf` (originalul ramane neatins).

Rezultat: acum `cartea_searchable.pdf` are text selectabil -> scripturile
noastre (si agentul AI) il pot citi.

`-l` = limba cartii: `-l eng` (engleza), `-l spa` (spaniola), `-l rus` (rusa),
`-l rus+eng` (mixta).

> Daca `ocrmypdf` nu e gasit, foloseste calea completa:
> `"C:\Program Files\Tesseract-OCR\ocrmypdf" -l spa "..." "..."`
> (de regula simplu `ocrmypdf` merge dupa Pasul 1).

### Ce faci daca primesti eroarea "TaggedPDFError" / "does not need OCR"

Daca ocrmypdf se opreste cu mesajul:

```
TaggedPDFError: This PDF is marked as a Tagged PDF. ... does not need OCR.
```

NU e o pana: PDF-ul e marcat "Tagged" (are structura logica). De regula inseamna
carte nascuta digital (export din Word/InDesign), DAR uneori e o carte scanata
care a mai trecut printr-un OCR si a primit tagul pe drum. ocrmypdf vrea doar
sa confirmi ca stii ce faci.

**Pasul 0 — afla in ce categorie e cartea** (are text selectabil sau e scan?):

```powershell
py C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\scripts\check-pdf-text.py "cartea.pdf"
```

Apoi, in functie de rezultat:

- **Toate paginile au text** -> cartea e nascuta digital: **SARI peste OCR
  complet** si foloseste PDF-ul ORIGINAL direct la Pasul 6 (textul nativ e
  mai bun decat orice OCR; exemplele muzicale sunt aproape mereu imagini,
  deci detectia partiturilor merge oricum). `--deskew` nu-si are rostul aici.
- **Majoritatea paginilor "SCANATA (fara text)"** -> scan cu tag fals (OCR
  vechi doar pe o parte din pagini). OCR-uieste DOAR paginile fara text:
  ```powershell
  py -m ocrmypdf -l eng --skip-text "cartea.pdf" "cartea-ocr.pdf"
  ```
- **Paginile au text, dar e gunoi de OCR vechi** (cuvinte trunchiate, litere
  dezordonate, cautari care nu gasesc nimic) -> refa stratul de text:
  ```powershell
  py -m ocrmypdf -l eng --redo-ocr "cartea.pdf" "cartea-ocr.pdf"
  ```
  ATENTIE: `--redo-ocr` NU se poate combina cu `--deskew` (ocrmypdf refuza
  combinatia) - si nici nu trebuie: `extract_partituri.py` scaneaza oricum
  fiecare pagina la 21 de unghiuri (-10..+10 grade) si exporta partiturile
  deja indreptate.
- `--force-ocr` (rasterizeaza TOT si inlocuieste si textul bun) - doar daca
  chiar vrei asta; pentru cartile cu text nativ NU e recomandat.

---

## PASUL 5 — Instalezi Audiveris (pt. partituri -> MusicXML) — o singura data

1. Intri pe: `https://github.com/Audiveris/audiveris/releases`
2. Descarca installer-ul de Windows: **`Audiveris-5.11.0-windows-x86_64.msi`**
   (cel FARA "Console" in nume — are interfata grafica).
3. Il rulezi si instalezi cu setarile default.
4. **Java:** nu trebuie sa instalezi nimic separat — Audiveris 5.11 isi aduce
   propriul Java in pachet. (Verificare: daca programul SE DESCHIDE si iti
   arata ferestrele, Java merge. Chiar daca `java -version` in PowerShell da
   eroare "nu e recunoscut", NU e o problema — Audiveris nu depinde de un
   Java global.)
5. La prima pornire, iti va cere sa instalezi "limbaje OCR" — bifeaza
   **English, Spanish, Russian** (sunt pentru textul DIN partituri: titluri,
   versuri, indicatii). Notele muzicale se citesc oricum, indiferent de limba.
6. Noteaza calea catre `Audiveris.bat` (de regula
   `C:\Program Files\Audiveris\bin\Audiveris.bat`).

> Daca preferi sa sari peste Audiveris deocamdata: poti. Pasul 6 iti scoate
> partiturile ca **PNG**; le putem converti in MusicXML mai tarziu. Dar ca
> agentul AI sa citeasca notele, e nevoie de Audiveris.

---

## PASUL 6 — Extragi AUTOMAT partiturile (fara screenshot-uri)

Scriptul actual e `extract_partituri.py` (in radacina proiectului). Ruleaza-l
din folderul in care ai cartea (folderul "parental") — acolo iti apar si
rezultatele:

```powershell
cd C:\MY_PYTHON_PROJECTS\Creare_Carti_Chitari
py C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\extract_partituri.py "cartea_searchable.pdf"
```

Ce face scriptul (3 etape):
- **etapa 1**: filtreaza textul suprapus (stratul de OCR ghinionis);
- **etapa 2**: sterge imaginile color (foto/ilustratii); pastreaza alb-negru;
- **etapa 3**: gaseste singur partiturile si le exporta in
  `imagini_partituri\`:
  ```
  imagini_partituri\partitura-p3-A.png    (portativ, incepe pe pag. 3)
  imagini_partituri\tablatura-p5.png      (tablatura, 6 linii)
  imagini_partituri\partitura-tab-p6.png  (portativ + TAB lipite)
  imagini_partituri\diagrama-p8-C.png     (grila de acorduri)
  imagini_partituri\manifest.json         (evidenta + cuvintele de langa
                                           partituri + pozitiile in PDF)
  ```
- salveaza si `cartea_searchable-procesat.pdf` (PDF-ul filtrat).

**Oprire, reluare, jurnal** (la cartile mari):
- oprire controlata, oricand: `New-Item STOP -ItemType File` (in alt
  PowerShell, in acelasi folder) sau Ctrl+C — scriptul termina pagina
  curenta, isi salveaza progresul si se opreste;
- reluare dupa oprire / pana de curent / restart: ruleaza DIN NOU aceeasi
  comanda — continua singur de unde a ramas;
- tot ce apare in terminal se scrie si in `jurnal_extract_partituri.log`;
- pornire de la capat: `--de-la-inceput`.

### Daca vrei sa ajustezi calitatea detectiei

```powershell
# dpi mai mare = mai exact, dar mai lent (default 200)
py ...\extract_partituri.py "cartea_searchable.pdf" --dpi 300
```

---

## PASUL 7 — VERIFICI rezultatul (important!)

Deschide folderul `imagini_partituri\` (langa carte) si uita-te la cateva PNG-uri:
- Partiturile sunt decupate intregi? (nu taiate)
- Nu s-au decupat bucati de TEXT in loc de partituri?
- Diagramele de acorduri sunt complete (grila + numele acordului)?

Daca ceva e gresit (partitura taiata sau text confundat cu partitura), spune-mi
si ajustez pragurile scriptului. **Nu e nevoie sa refaci nimic manual.**

---

## PASUL 8 — Combini textul + partiturile intr-un singur fisier

Scriptul actual e `package-book.py` (in radacina proiectului), tot din folderul
cu cartea:

```powershell
py C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\package-book.py "cartea_searchable.pdf" --audiveris "C:\Program Files\Audiveris\Audiveris.exe"
```

> Calea corecta la tine e `C:\Program Files\Audiveris\Audiveris.exe` (NU exista
> un `.bat` — versiunea GUI pornește direct prin `.exe`).

Ce face:
- converteste fiecare PNG in MusicXML prin Audiveris (portativele si perechile
  portativ+TAB; tablaturile simple au convertor propriu, diagramele sunt citite
  geometric — fara Audiveris);
- injecteaza in XML cuvintele de langa partitura ("Vln" -> numele partii,
  legenda de deasupra -> titlul);
- construieste **cartea finala**: `cartea_searchable.md` — textul pe pagini +
  marcatori `[SCORE: imagini_partituri/partitura-p3-A.png | XML: ...]` cu
  XML-ul incorporat direct in carte (un singur fisier de citit);
- salveaza si datele extrase: `date_extrase\voicinguri.json` (diagramele) si
  `date_extrase\digitatie\` (cifrele din TAB).

FARA `--audiveris` merge si asa (PNG-urile raman cu marcator in carte; poti
converti mai tarziu reluand comanda cu `--audiveris`).

**Oprire, reluare, jurnal** — la fel ca la Pasul 6: `New-Item STOP
-ItemType File` sau Ctrl+C; reluarea = aceeasi comanda (partiturile deja
convertite se sar); jurnalul: `jurnal_package_book.log`.

---

## PASUL 9 — Uploadezi pe GitHub (unde citesc eu)

1. Intri pe folderul potrivit din biblioteca de carti, pe ramura de lucru
   curenta:
   `https://github.com/DarrSasa/Ample_Guitar_Chord-Settings_Helper/tree/arena/01a03306-ample-guitar-chord-settings-he/documente/carti`
   (alege folderul tematic: `01_Chord_Theory_and_Construction`,
   `09_Guitar_Rhythm_and_Groove` etc. — vezi `documente/carti/README.md`)
2. **Add file -> Upload files**.
3. Trage: `cartea_searchable.md` (XML-urile sunt deja incorporate in el, deci
   fisierul asta e singurul strict necesar). Daca vrei sa verific si
   imaginile, mai trage un zip cu `imagini_partituri\`.
4. **Commit changes** (direct pe ramura `arena/...`).
5. Imi spui "cartea e pe GitHub" — o citesc integral.

---

## Rezumat rapid (comenzile in ordine)

```powershell
# 1) biblioteci Python (o singura data)
pip install pymupdf opencv-python-headless numpy ocrmypdf

# 2) OCR text (schimba 'eng' cu limba cartii: eng / spa / rus)
#    - daca primesti TaggedPDFError: vezi decizia din Pasul 4
#      (check-pdf-text.py -> sari peste OCR / --skip-text / --redo-ocr)
py -m ocrmypdf -l eng "cartea.pdf" "cartea-ocr.pdf"

# 3) extragi partiturile (etapele 1-3; oprire: New-Item STOP -ItemType File;
#    reluare dupa orice intrerupere: aceeasi comanda)
py C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\extract_partituri.py "cartea-ocr.pdf"

# 4) combini totul intr-un singur .md (+ MusicXML prin Audiveris)
py C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\package-book.py "cartea-ocr.pdf" --audiveris "C:\Program Files\Audiveris\Audiveris.exe"

# 5) uploadezi cartea.md in documente/carti/<folderul potrivit> pe GitHub
```

## Note cinstit (la ce sa te astepti)

- **OCR pe text tiparit** = foarte bun. Pe tabele/diagrame poate fi dezordonat.
- **Detectia partiturilor** = euristica, dar detectorul prinde si partituri
  strambe (21 de unghiuri) si deosebeste portativ / tablatura / pereche /
  diagrama de acorduri. Verifica vizual rezultatul (Pasul 7).
- **Audiveris (OMR)** = bun pe partituri tiparite; pe notatii foarte dense sau
  scrise de mana poate rata detalii. MusicXML e cel mai bogat rezultat.
- O partitura care **continua pe pagina urmatoare** este LIPITA intr-un singur
  PNG (ex. `partitura-p22-23.png`); litera de la final (`-A`, `-B`) deosebeste
  partiturile care impart aceleasi pagini.
- La orice pana de curent sau restart: rulezi din nou ACEEASI comanda si
  scriptul continua de unde a ramas (detalii in jurnalele
  `jurnal_extract_partituri.log` / `jurnal_package_book.log`).
