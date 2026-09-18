# Plan: descoperirea site‑urilor de teorie a chitarei DIN TOATE LIMBILE

Scop: găsim cât mai multe surse în cât mai multe limbi/țări, apoi le colectăm cu
Crawl4AI. Descoperirea e **automată** pe cât posibil.

## Pas 1 — Wikipedia multilingv (acoperă ~300 limbi, automat)
Un singur call MediaWiki `langlinks` pentru un articol‑sămânță întoarce titlul lui
în toate limbile. Scriptul `colectare_crawl4ai.py --wikipedia` face asta automat
pentru sămânțile: Guitar, Chord, Music_theory, Guitar_technique, Strum, Palm_mute,
Harmonic, Vibrato, Tapping, Rasgueado → sute de URL‑uri `https://<limba>.wikipedia.org/…`.

## Pas 2 — Wikidata (etichete în toate limbile)
SPARQL / EntityData pentru concepte (chord, scale, guitar technique) → label‑uri
în fiecare limbă + legături către articole. (De adăugat ca sursă în crawl.)

## Pas 3 — căutare pe domenii naționale (site‑uri locale)
Folosește operatori `site:` cu cuvinte‑cheie în limba respectivă, ex.:
```
site:.ro "teorie chitară" / "acorduri chitară"
site:.de "Gitarre" "Musiktheorie" "Griffe"
site:.fr "guitare" "théorie" "accords"
site:.es "guitarra" "teoría" "acordes"
site:.it "chitarra" "teoria" "accordi"
site:.pt "violão" "teoria" "acordes"
site:.jp / site:.jp "ギター" "コード" "理論"
site:.ru "гитара" "аккорды" "теория"
site:.nl "gitaar" "akkoorden"  ·  site:.pl "gitara" "akordy"
site:.tr "gitar" "akorlar"   ·  site:.ar "جيتار" "أكورد"
```
Adaugă URL‑urile găsite în `colectat/surse-extins.json`.

## Pas 4 — site‑uri regionale cunoscute (de adăugat manual/automat)
Ex.: jguitar, all‑guitar‑chords, oolimo(DE), chordpic, guitar‑tabs/ultimate‑guitar
(restricții), plus echivalente locale (ex. pentru RO: chitara‑acordeon.ro etc.).

## Pas 5 — validare accesibilitate cu Crawl4AI
Rulează crawl pe listă; cele blocate/anti‑bot intră în `surse-esuate.json` și sunt
înlocuite cu oglindi/Archive.org; cele OK rămân în `manifest_crawl.json`.

## Pas 6 — colectare + integrare
Crawl4AI scrie `colectat/crawl/<site>.md/.json`; apoi le parsez și unesc în
`src/music/theory.ts` / `colectat/` ca date structurate.

## Comandă (descoperire + colectare multilingvă)
```
py colectare_crawl4ai.py --wikipedia --max 60
```
(mărește `--max` pentru mai multe limbi; fără `--wikipedia` crawlează doar lista fixă.)
