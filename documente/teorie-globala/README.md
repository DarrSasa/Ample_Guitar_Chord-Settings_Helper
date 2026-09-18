# Teorie globală de chitară (colectată cu DeepAstra) — punct de încărcare

Aici încarci fișierele produse de **DeepAstra** (rulează local prin Codex CLI cu
OpenRouter/DeepSeek), ca eu să le pot interpreta când le urci pe GitHub.

## Adresa de încărcare (upload)

```
https://github.com/DarrSasa/Ample_Guitar_Chord-Settings_Helper/upload/arena/01a034f1-ample-guitar-chord-settings-he/documente/teorie-globala
```

Încarcă aici:
- `siteuri global teorie chitara.txt` (lista ta de adrese din diferite țări);
- fișierele `.json` colectate (din folderul local `…_Details\Web_Guitar_Theory\colectat\`).

## ⚠️ Securitate

- **NU încărca niciodată** `DeepAstra_openrouter_key.txt` (cheia API) pe GitHub.
  Cheia stă DOAR local și se pasează prin `--key-file` / `OPENROUTER_API_KEY`.
- Fișierele colectate conțin doar **fapte muzicale** (intervale, note, taste),
  nu text cu drepturi de autor copiat verbatim.

## Schema așteptată

Vezi `schema-teorie.json`. Fiecare fișier colectat respectă schema și are un
bloc `sursa` (url/țară/limbă/licență). La încărcare, eu le unesc în
`src/music/theory.ts` / bazele existente.

## Cum rulezi colectarea (local, prin Codex/DeepAstra)

```
python3 launch.py doctor --provider openrouter --key-file "C:\...\DeepAstra_openrouter_key.txt"
python3 launch.py exec --provider openrouter ^
  --cwd "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory" ^
  --key-file "C:\...\DeepAstra_openrouter_key.txt" ^
  --prompt-file "PROMPT-DeepAstra-colectare.txt" ^
  --status-file "run-status.json" --timeout 900
```

Promptul corect e în `PROMPT-DeepAstra-colectare.txt`.

## VARIANTĂ FĂRĂ CODEX (recomandată dacă nu ai Codex instalat)

`launch.py` cere Codex CLI; dacă nu‑l ai, folosește `colectare_openrouter.py`
(doar Python standard, fără codex). El trimite `PROMPT-OpenRouter-direct.txt`
către OpenRouter și salvează JSON‑ul în `colectat\`:

```
cd /d C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\documente\teorie-globala
py colectare_openrouter.py ^
  --key-file "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory\DeepAstra_openrouter_key.txt" ^
  --prompt-file "PROMPT-OpenRouter-direct.txt" ^
  --out-dir "C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper_Details\Web_Guitar_Theory\colectat"
```

Afișează progresul în consolă și tokenii consumați. Cheia NU e scrisă nicăieri.

## Colectare AVANSATĂ cu Crawl4AI (recomandat)

Crawl4AI (open-source, Apache-2.0) randează JavaScript și scoate Markdown curat +
JSON structurat — intră pe site-uri pe care curl/requests nu le poate citi,
în orice limbă. Verificat util pentru situația noastră.

Instalare (la tine, o singură dată):
```
cd C:\MY_PYTHON_PROJECTS\Ample_Guitar_Chord-Settings_Helper\documente\teorie-globala
pip install -r requirements-crawl4ai.txt
playwright install chromium
```
Rulare:
```
py colectare_crawl4ai.py
```
Citește `colectat/surse-accesibile.json` (html_parsabil + de_testat) și scrie în
`colectat/crawl/` câte un `<site>.md` + `<site>.json` + `manifest_crawl.json`.
Nu folosește cheia API.
