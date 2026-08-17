# Guitar Multi-Samples (sampler cu note reale)

Folder pentru **noua optiune de sampler** (se adauga LANGA optiunea SoundFont
existenta, care RAMANE). Aici urci fisierele audio cu note individuale de
chitara, ca sampler-ul sa NU mai transpuna o singura nota pe toate inaltimile,
ci sa foloseasca un **grup de note reale** -> chitara suna mult mai natural.

## Ce punem aici

Cauta si urca fisiere care contin **informatie de nota + loop**, in ordinea
preferintei:

1. **WAV cu chunk `smpl`** (recomandat)
   - contine `MIDI unity note` (nota de baza a sample-ului) + loop points.
   - orice `.wav` (PCM/float/compressed) poate avea acest chunk.
2. **AIFF/AIFC** cu chunk `INST` + `MARK` (echivalentul Apple al lui `smpl`).
3. **SFZ** (`.sfz`) + WAV-urile referite — defineste note/key ranges/velocity.
4. **Decent Sampler** (`.dspreset`), **EXS24** (`.exs`), **GigaStudio** (`.gig`)
   daca gasesti un instrument gata facut (nu e nevoie sa-l reconstruiesti).

## Convenție de nume (folosita ca FALLBACK daca fiserul NU are metadate)

Daca WAV-ul nu are chunk `smpl`, citim nota din NUMELE fisierului. Foloseste
unul dintre formatele de mai jos (nota in notatia internationala):

```
Guitar_C2.wav        Guitar_C2_E2.wav      Guitar_0040.wav   (MIDI note 40 = E2)
Guitar_E2.wav        Guitar_E2_A2.wav      Guitar_0045.wav   (MIDI note 45 = A2)
Guitar_G2.wav        Guitar_G2_C3.wav      Guitar_0050.wav
Guitar_C3.wav        ...                   ...
```

Semnificatie:

- `Guitar_C2.wav`        -> un singur sample, nota C2.
- `Guitar_C2_E2.wav`     -> un sample care acopera ZONA C2..E2 (se transpune
                            doar in interiorul acestei zone mici).
- `Guitar_0040.wav`      -> idem, dar nota data ca numar MIDI (40 = E2).

Cu cat notezi mai multe note reale (ex. din 2 in 2 semitonuri), cu atat
chitara suna mai natural. Nu e nevoie de fiecare semiton — zona mica de
transpus (2-3 semitonuri) e suficienta pentru un sunet realist.

## Ce citim din fiecare fisier (ca sampler)

- **Nota de baza** (MIDI unity note / pitch_keycenter / numele fisierului).
- **Loop points** (start/end) — pentru sustinere naturala fara click.
- Optional, daca exista: key range (lo/hi note), velocity layers,
  round-robin (mai multe sample-uri pe aceeasi nota, alese aleator).

## Structura sugerata

Poti pune fisierele direct aici, sau organizate pe tipuri de chitara:

```
public/guitar-multisamples/
  ├── nylon/            (ex. chitara nylon)
  ├── steel/            (ex. chitara steel acustica)
  ├── electric-clean/   (ex. chitara electrica clean)
  └── ...
```

Ordinea subfolderelor NU conteaza — le citim recursiv. Numele subfolderului
apare ca preset in meniul din **Settings**.

## Atentie la dimensiune

- Fisierele din acest folder SE comiteaza in git (NU sunt in `.gitignore`).
- Daca un fisier depaseste ~100 MB, GitHub il respinge. Pentru seturi mari
  folosim Git LFS sau le descarcam printr-un script dedicat (ca la soundfonts).
  Spune-mi daca setul tau e mare si pregatesc solutia potrivita.
