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

1. Intri pe: `https://ghostscript.com/releases/gsdnld.html`
2. Descarca **64-bit** pentru Windows (ex. `gs10xxw64.exe`).
3. Il rulezi si instalezi cu setarile default.

---

## PASUL 4 — Faci PDF-ul "cautabil" (OCR pe text)

Pune cartea intr-un folder simplu, fara spatii in nume, ex.:

```
C:\carti\cartea.pdf
```

In PowerShell:

```powershell
# inlocuieste limba cu: eng / spa / rus / rus+eng (in functie de carte)
& "C:\Program Files\Tesseract-OCR\ocrmypdf" -l spa "C:\carti\cartea.pdf" "C:\carti\cartea_searchable.pdf"
```

> Daca nu exista `ocrmypdf.exe` in folderul Tesseract, foloseste direct:
> `ocrmypdf -l spa "C:\carti\cartea.pdf" "C:\carti\cartea_searchable.pdf"`
> (functioneaza daca Pasul 1 a mers).

Rezultat: `cartea_searchable.pdf` — acelasi PDF, dar acum are text selectabil.

---

## PASUL 5 — Instalezi Audiveris (pt. partituri -> MusicXML) — o singura data

1. Intri pe: `https://github.com/Audiveris/audiveris/releases`
2. Descarca installer-ul de Windows (`.msi`).
3. Il rulezi si instalezi cu setarile default.
4. **Audiveris are nevoie de Java.** Daca la prima pornire zice ca lipseste
   Java, instalezi Java de aici: `https://adoptium.net` (versiunea **Temurin 21**, 64-bit).
5. Noteaza calea catre `Audiveris.bat` (de regula
   `C:\Program Files\Audiveris\bin\Audiveris.bat`).

> Daca preferi sa sari peste Audiveris deocamdata: poti. Pasul 6 iti scoate
> partiturile ca **PNG**; le putem converti in MusicXML mai tarziu. Dar ca
> agentul AI sa citeasca notele, e nevoie de Audiveris.

---

## PASUL 6 — Extragi AUTOMAT partiturile (fara screenshot-uri)

Din folderul proiectului (unde e `scripts\`), rulezi:

```powershell
cd C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper
python scripts\extract-scores.py "C:\carti\cartea_searchable.pdf"
```

Ce face scriptul:
- randeaza fiecare pagina la 300 DPI;
- gaseste singur liniile orizontale (= portativele);
- decupeaza fiecare partitura si o salveaza ca:
  ```
  C:\carti\scores\score-p001-a.png   (pagina 1, partitura a)
  C:\carti\scores\score-p001-b.png   (pagina 1, partitura b)
  C:\carti\scores\score-p002-a.png   (pagina 2, partitura a)
  ...
  ```
- scrie `C:\carti\scores\manifest.json` cu lista + legaturile de continuare.

### Cu Audiveris (recomandat — scoate direct MusicXML)

```powershell
python scripts\extract-scores.py "C:\carti\cartea_searchable.pdf" --audiveris "C:\Program Files\Audiveris\bin\Audiveris.bat"
```

Acum, langa fiecare `score-pNNN-a.png` apare si `score-pNNN-a.mxl` (MusicXML)
cu notele + articulatiile.

### Daca vrei sa ajustezi calitatea detecției

```powershell
# dpi mai mare = mai exact, dar mai lent
python scripts\extract-scores.py "C:\carti\cartea_searchable.pdf" --dpi 400
```

---

## PASUL 7 — VERIFICI rezultatul (important!)

Deschide folderul `C:\carti\scores\` si uita-te la cateva PNG-uri:
- Partiturile sunt decupate intregi? (nu taiate)
- Nu s-au decupat bucati de TEXT in loc de partituri?

Daca ceva e gresit (partitura taiata sau text confundat cu partitura), spune-mi
si ajustez pragurile scriptului. **Nu e nevoie sa refaci nimic manual.**

---

## PASUL 8 — Combini textul + partiturile intr-un singur fisier

```powershell
python scripts\package-book.py "C:\carti\cartea_searchable.pdf" "C:\carti\scores"
```

Rezultat: `C:\carti\cartea_searchable.md` — textul pe pagini + marcatori
`[SCORE: scores/score-p001-a.mxl]` acolo unde sunt partiturile.

---

## PASUL 9 — Uploadezi pe GitHub (unde citesc eu)

1. Intri pe:
   `https://github.com/DarrSasa/Ample_Guitar_Chord-Settings_Helper/tree/arena/01a00f12-ample-guitar-chord-settings-he/docs/music-theory`
2. **Add file -> Upload files**.
3. Trage: `cartea_searchable.md` + tot folderul `scores\` (cu `.mxl`-urile).
4. **Commit changes** (direct pe ramura `arena/...`).
5. Imi spui "cartea e pe GitHub" — o citesc integral.

---

## Rezumat rapid (comenzile in ordine)

```powershell
# 1) biblioteci Python
pip install pymupdf opencv-python-headless numpy ocrmypdf

# 2) OCR text (schimba 'spa' cu limba cartii: eng / spa / rus)
ocrmypdf -l spa "C:\carti\cartea.pdf" "C:\carti\cartea_searchable.pdf"

# 3) extragi partiturile (cu MusicXML prin Audiveris)
python scripts\extract-scores.py "C:\carti\cartea_searchable.pdf" --audiveris "C:\Program Files\Audiveris\bin\Audiveris.bat"

# 4) combini totul
python scripts\package-book.py "C:\carti\cartea_searchable.pdf" "C:\carti\scores"

# 5) uploadezi in docs/music-theory/ pe GitHub
```

## Note cinstit (la ce sa te astepti)

- **OCR pe text tiparit** = foarte bun. Pe tabele/diagrame poate fi dezordonat.
- **Detectia partiturilor** = euristica; merge bine pe partituri tiparite
  curate. Verifica vizual rezultatul (Pasul 7).
- **Audiveris (OMR)** = bun pe partituri tiparite; pe notatii foarte dense sau
  scrise de mana poate rata detalii. MusicXML e cel mai bogat rezultat.
- O partitura care **continua pe pagina urmatoare** e marcata in
  `manifest.json` cu `"continuation_of": "previous-page"`, iar numele sunt
  `score-p36-a` (pagina 36) si `score-p37-b` (pagina 37) — adica partile unei
  partituri intinse pe mai multe pagini.
