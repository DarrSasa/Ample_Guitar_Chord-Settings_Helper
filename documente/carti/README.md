# Biblioteca de carti convertite (.md) — 12 foldere tematice

Aici se incarca **cartile convertite in .md** (rezultatul etapelor 2+3:
`extract_partituri.py` + `package-book.py`), sortate pe cele 12 categorii
stabilite in plan (vezi `documente/TODO.md`, sectiunea 3b).

Numele folderelor (la fel ca folderele tale locale cu PDF-uri; `&` a
devenit `and` ca sa nu incurce consola):

    01_Chord_Theory_and_Construction
    02_Chord_Progressions_and_Voice_Leading
    03_Complex_and_Jazz_Chords_Comping
    04_Genre_Specific_Progressions
    05_Bass_Lines_and_Bass_Theory
    06_Arpeggios_and_Pattern_Breakdown
    07_Ostinato_Riffs_and_Motifs
    08_Melody_Lead_and_Chord_Melody
    09_Guitar_Rhythm_and_Groove
    10_Scales_and_Modes
    11_Arrangement_and_MIDI_Orchestration
    12_Guitar_Articulations_FX_and_Playing_Styles

Reguli:
- se incarca **doar .md-ul** (nu PDF-ul: e mare si nu mai e nevoie de el);
  daca la o carte vrei sa verific si imaginile, incarca si un zip cu
  `imagini_partituri/` a acelei carti;
- o carte sta intr-UN singur folder (cel mai potrivit); regulile pe care
  le extrag din ea primesc oricum etichete multiple;
- AI-ul citeste cartile si scrie regulile in `date_extrase/` +
  scripturile de reguli pe genuri si tip de chitara
  (acustica / electrica / bas);
- lipsurile se rezolva dupa protocolul din TODO §8b, cu evidenta in
  `documente/log_rezolvari.md`.

Incarcarea se face pe branch-ul `arena/01a02a61-ample-guitar-chord-settings-he`:
https://github.com/DarrSasa/Ample_Guitar_Chord-Settings_Helper/upload/arena/01a02a61-ample-guitar-chord-settings-he/documente/carti
