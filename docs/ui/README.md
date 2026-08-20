# UI — grafice si previzualizari

Aici tinem fisierele legate de interfata: demo-uri HTML si PSD-uri pentru
graficele programului.

## Unde urci `lock.psd`

Urcă fișierul **`lock.psd`** direct in acest folder (`docs/ui/`), pe ramura
`arena/01a00f12-ample-guitar-chord-settings-he`:

- Nume fisier: `lock.psd`
- Layere (exact aceste nume, litere mici):
  - `lock-close`  — lacătul ÎNCHIS (PNG, alb)
  - `lock-open`   — lacătul DESCHIS (PNG)
- Documentul va avea cele 2 layere ca PNG-uri in interior.

Dupa ce il urci, il convertesc in SVG (scalabil cu marirea programului) cu
culorile stabilite: închis = `#ffffff`, deschis = `#12ff60`, ambele cu contur
negru de 2.5px.

## Fisiere de previzualizare

- `history-lock-demo.html` — demo variante SVG pentru lacăt.
- `color-preview.html` — previzualizarea noilor culori pentru blocurile de
  acorduri + lacăt.
