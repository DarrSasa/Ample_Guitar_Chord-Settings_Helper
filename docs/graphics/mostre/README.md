# Mostre pentru butoane realiste

Aici pui mostrele pe care le gasesti pe web sau le creezi in Photoshop pentru
fiecare buton. Toate au **numele butonului** in denumire (ex: `-play`, `-stop`).

## Straturi (layere) - pun de jos in sus

### Straturi de baza (obligatorii)

- `fundal-buton-<nume>.jpg/png` - **corpul butonului** (stare Off, fara LED).
  Poate fi orice: metal, sticla, lemn, piatra, plastic, cauciuc etc.
- `semn-<nume>.jpg/png` - **pictograma butonului** (X, triunghi, patrat etc.).
  Ideal fundal transparent (PNG) sau fundal neutru (JPG cu key-out negru).

### Straturi optionale (pentru realism sporit)

- `led-<nume>.jpg/png` - **LED-ul aprins** (culoare + halo intern).
  Daca lipseste, il generez eu procedural cu culoarea pe care mi-o spui.
- `halo-<nume>.jpg/png` - **aureola exterioara** in jurul butonului cand e On.
  **Poate fi deformata / asimetrica / cu raze speciale** - o folosesc AS-IS
  (respect forma exacta). Daca lipseste, generez procedural halo circular.
- `reflexie-<nume>.jpg/png` - **highlight top** care simuleaza sticla lucioasa.
- `textura-<nume>.jpg/png` - **textura de material** (metal, plastic, cauciuc,
  piatra, lemn). Se aplica ca overlay peste fundal.
- **`foreground-<nume>.jpg/png`** - **prim-planul** peste TOT butonul.
  Util pentru: sticla care acopera butonul, praf/condens, cadre decorative,
  reflexii speciale, particule. Layer FINAL, deasupra a tot.

### Referinta vizuala (opțional, DAR foarte util)

- `all-<nume>.jpg/png` - **butonul intreg deja compus**, ca ghid vizual.
  Ma uit la el ca sa inteleg cum ai vrea sa arate rezultatul. Nu-l folosesc
  direct in buton, doar ca inspiratie pentru culori/forme/texturi.
- `all-<nume>-off.jpg` + `all-<nume>-on.jpg` - **daca vrei sa folosesc DIRECT**
  aceste 2 poze ca butonul finit (fara sa reconstruiesc din straturi separate),
  imi spui explicit si le folosesc as-is. Dezavantaj: tranzitia Off->On e
  brutala, nu poate fi animata.
- `inspiratie-<nume>.jpg` - o captura de la un buton dintr-un plugin/DAW/hardware
  care iti place. Diferit de `all` prin faptul ca nu tinde neaparat sa arate
  ca butonul tau final - e doar o directie de stil.

## Nume-butoane in aplicatie

- `delete`, `play`, `pause`, `stop`, `drag`
- `save`, `snap`, `undo`, `redo`, `start`
- `scroll-on-off`, `ch-on-off`, `settings`

## Exemplu concret: buton Play futuristic din piatra sticloasa

Tu urci:
```
docs/graphics/mostre/
  ├── all-play.jpg              # butonul intreg cum il vrei tu (referinta)
  ├── fundal-buton-play.jpg     # mostra de piatra sticloasa
  ├── semn-play.jpg             # triunghi Play
  ├── foreground-play.jpg       # sticla peste tot cu reflexii/zgarieturi
  └── halo-play.jpg             # (optional) halo deformat cu forma speciala
```

Eu iti fac:
```
docs/graphics/
  ├── html_SVG/play_svg.html    # preview varianta SVG cu texturi embedded
  └── html_PSD/play_psd.html    # preview varianta PSD cu straturi PNG
```

Fiecare cu **5 variante x 2 stari** (Off / On) + slider scale + toggle fundal.

## Unde sa cauti pe web

- **Fundal buton (materiale)**:
  - Piatra sticloasa: `obsidian texture`, `glass rock texture`, `polished stone`
  - Metal: `brushed aluminum`, `steel plate texture`, `titanium panel`
  - Sticla: `glass button texture`, `black glass pane`
  - Cauciuc: `rubber grip texture`, `silicone matte black`
  - Lemn: `wood grain dark`, `walnut veneer`
  - Site-uri: pixabay.com, unsplash.com, textures.com, pngimg.com
- **Semn/pictograma**: iconify.design, flaticon.com, thenounproject.com
- **LED aprins**: `LED button glow`, `light indicator green red blue amber`
- **Halo custom**: cauta `halo effect PNG`, `glow effect PNG` sau desenezi tu
- **Foreground/sticla**: `glass overlay png`, `scratched glass texture`,
  `dust particles overlay`, `bokeh overlay png`
- **Inspiratie**: capturi cu Snipping Tool din FL Studio, Ableton, Bitwig,
  Serum, FabFilter, Waves, Massive, hardware fotos (Moog, Sequential, EHX pedals).
