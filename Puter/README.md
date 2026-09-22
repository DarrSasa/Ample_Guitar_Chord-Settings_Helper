# Puter

Folder dedicat proiectului **Puter** (pagini HTML cu Puter.js). Aici stau doar
fișierele acestui proiect — ce urci tu și ce generez eu.

- `GPT Image 2.5 Flare&Sunburst.html` — generator Text/Image‑to‑Image cu
  `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst`, fără cheie API.
- `puter-tutorial.html` — (urcat de tine) tutorialul de bază cu Puter.js.

## Semnificația opțiunilor (după screenshot‑ul ElevenLabs)

| Opțiune | Ce înseamnă |
|---|---|
| **Number of generations (max 4)** | câte variații de imagine se generează per prompt |
| **Quality: low / medium / high** | compromis viteză ↔ calitate |
| **Resolution: 1k / 2k / 4k** | dimensiunea în pixeli a rezultatului |
| **Aspect ratio** (3:1 … 3:4) | formatul (lat:înalt) al imaginii |
| **Magic wand ✦ on** | **Magic Prompt / Prompt‑enhance**: rescrie/îmbogățește automat promptul cu un LLM înainte de generare |

## Cerințe implementate în HTML

- Casetă de prompt **înaltă (format portret)**, cu scrollbar în dreapta.
- **Switch de modele jos‑stânga** (Flare / Sunburst).
- **Buton de descărcare** pentru fiecare imagine generată.
- Upload referințe (imagini + **PDF**, max 16) pentru Image‑to‑Image.

## Rulare
```
cd <folderul cu repo>
python -m http.server 8000
```
apoi `http://localhost:8000/Puter/GPT%20Image%202.5%20Flare&Sunburst.html`
