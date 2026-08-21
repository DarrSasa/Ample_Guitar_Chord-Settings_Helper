# Ghid: pregatirea unei carti scanate pentru analiza AI

Scop: transformam o carte despre teorie muzicala (chitara) intr-un pachet pe
care agentul AI il poate citi INTEGRAL — textul (OCR) + partiturile (MusicXML,
nu imagini).

## Ce poate si ce nu poate agentul AI

- **Text selectabil** -> il citeste perfect.
- **Imagini / partituri scanate** -> NU le "vede".
- **MusicXML** (`.musicxml` / `.xml` / `.mxl`) -> il parseaza complet:
  note, articulatii, dinamici, legato, ties, acorduri.
- **ABC** -> se poate obtine prin conversie (music21), dar MusicXML e mai bogat
  si preferat.

## Unelte de instalat (o singura data, pe Windows)

1. **Tesseract OCR** (build UB Mannheim):
   https://github.com/UB-Mannheim/tesseract/wiki
2. **Ghostscript** (64-bit, necesar pentru OCRmyPDF):
   https://ghostscript.com/releases/gsdnld.html
3. **Audiveris** (OMR — partituri -> MusicXML):
   https://github.com/Audiveris/audiveris/releases
4. Pachete Python:
   ```powershell
   pip install ocrmypdf pymupdf
   ```

## Pasii de lucru

### A. Faci PDF-ul cautabil (strat de text)
```powershell
ocrmypdf --skip-text carte_scanata.pdf carte_searchable.pdf
```
`--skip-text` pastreaza textul existent; daca PDF-ul e 100% imagini, scoate
flagul ca sa OCR-eze tot.

### B. Partiturile -> MusicXML (semi-manual, dar robust)
1. Decupezi fiecare partitura (Snipping Tool sau din PDF viewer) -> PNG.
2. O deschizi in **Audiveris** -> export **MusicXML** (`.mxl`).
3. O denumesti DUPA PAGINA, in folderul `scores/`:
   ```
   page-014-score-01.mxl    (pagina 14, partitura 1)
   page-014-score-02.mxl
   page-021-score-01.mxl
   ```

> Nu exista o metoda 100% automata care sa detecteze singura partiturile
> dintr-o carte oarecare. Textul e automat; partiturile le decupezi tu (rapid)
> si Audiveris le converteste automat. Audiveris merge bine pe partituri
> tiparite curate; pe notatii dense sau scrise de mana poate rata detalii.

### C. Imbini totul cu scriptul nostru
```powershell
python scripts\package-book.py "C:\carti\carte_searchable.pdf" "C:\carti\scores"
```
Rezultat: `carte_searchable.md` (langa PDF) cu textul pe pagini + marcatori
`[SCORE: scores/page-014-score-01.mxl]` la pagina potrivita.

### D. Uploadezi pe GitHub
1. Creezi/folosesti folderul `docs/music-theory/` pe ramura
   `arena/01a00f12-ample-guitar-chord-settings-he`.
2. Uploadezi: `book.md` + folderul `scores/`.
3. Spui agentului "cartea e pe GitHub" -> el citeste textul + partiturile.

## Structura finala (ce vad eu)

```
docs/music-theory/
  book.md                      <- textul complet + marcatori [SCORE: ...]
  scores/
    page-014-score-01.mxl
    page-014-score-02.mxl
    ...
```

## Nota despre calitate

- OCR pe text tiparit e foarte bun; pe tabele/diagrame poate fi dezordonat.
- MusicXML pastreaza articulatiile si dinamica; ABC ar pierde din ele.
- Daca o partitura e esentiala si Audiveris o citeste prost, poti s-o scrii
  tu ca text/MIDI (ex. "E7 = E3 G#3 B3 D4") si o adaugi manual in book.md.
