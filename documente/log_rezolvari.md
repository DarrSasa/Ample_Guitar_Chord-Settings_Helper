# Log de rezolvari — reguli extrase din cele 12 foldere de carti

> Completat de AI pe masura ce citeste cartile .md din `documente/carti/`.
> Protocolul de rezolvare a lipsurilor: TODO §8b.

## Contor general

| | numar |
|---|---|
| Reguli extrase in total | 19 |
| Rezolvate direct din carte | 16 |
| Rezolvate prin logica / reconstructie din context OCR | 3 |
| NEREZOLVATE (doar evidenta, nu intra in program) | 1 |

## Carti citite (partial sau complet)

| Carte | Folder | Progres | Reguli |
|---|---|---|---|
| Bret Willmott — Complete Book of Harmony Theory & Voicing | 01_Chord_Theory_and_Construction | p.5-20 (din 247) — PRIMA TRANSA | 19 (WIL-001..019) in `date_extrase/reguli_teorie.json` |

## Rezolvate (metoda folosita)

- **WIL-001..004, 007, 009..019** — direct din text clar al cartii (Willmott p.5-20):
  voicing-uri drop 2 pe corzile 2-5, evitarea b9 (cu regula celor 8 semi-tonuri),
  latimi intervoce, substitutii enarmonice, factorii dificultatii digitatiei
  (registru / digitatii vecine / tempo / individual), regulile de simbolistica
  b13-#11 (I, II), preferinta b5/#5, distinctia alt5 vs alt.
- **WIL-005, WIL-006, WIL-008** — reconstructie din context cu incredere (metoda 1
  din §8b): textul are zgomot OCR, dar structura logica si valorile-cheie sunt
  limpezi; marcate `stare: partial-ocr` in JSON.

## Nerezolvate (cauza + posibila rezolvare viitoare)

- **NR-0001** — Tabelul numeric „Low Interval Limits" (Willmott p.16): limita
  inferioara de plasare, pe corda 5, pentru fiecare chord tone / tensiune.
  Cauza: tabelul nu a supravietuit OCR-ului (doar fragmente: „unlimited", „Eb",
  „F (avoid tension 9 on 5th string)", „AVOID: produces b9th interval with
  major 3rd"); cartea .md a fost urcata fara imaginile paginilor.
  Posibile rezolvari: (a) userul verifica pagina 16 din PDF-ul original si
  transcrie tabelul (sau urca un zip cu `imagini_partituri/` cartii); (b) §3c —
  a doua trecere cu surse online (tabelul Berklee e public, dar cartea avertizeaza
  ca limitele ei sunt „putin mai joase" — nu identice); (c) formula aproximata
  din fragmentele ramase. Regula CONCEPTULUI (WIL-008) exista deja; doar
  valorile numerice lipsesc — nu intra in program pana la rezolvare.
