# Descriptor `library.json` (optional)

Fiecare librarie din `public/guitar samples/<Librarie>/` poate avea un fisier
**`library.json`** cu suprascrieri optionale. Daca lipseste, samplerul deduce
totul automat din structura de foldere (vezi `INVENTAR.md`).

## Locatia

```
public/guitar samples/
└── RS - Acoustic Guitar 1/
      ├── Chords/...
      ├── Single Notes/...
      └── library.json          <- AICI (direct in folderul librariei)
```

## Format

```json
{
  "vendorPrefix": "RS",
  "displayName": "Acoustic Guitar 1",
  "defaultFadeOut": 0.05,
  "loop": {
    "enabled": false,
    "crossfade": 0.015
  }
}
```

### Campuri

| Camp | Tip | Sens |
|---|---|---|
| `vendorPrefix` | string | Prefix vendor afisat in meniu (ex. "RS"). Daca lipseste, se deduce din numele folderului (partea dinainte de " - "). |
| `displayName` | string | Numele afisat fara prefix. Daca lipseste, se deduce din numele folderului (partea de dupa " - "). |
| `defaultFadeOut` | number (secunde) | Fade-out implicit la finalul fiecarui sample redat. Default in motor: 0.02s. |
| `loop.enabled` | boolean | Hint (viitor): sample-urile sunt loop-uite -> notele tinute pot fi sustinute. |
| `loop.crossfade` | number (secunde) | Crossfade pentru loop fara click (viitor). |

## Reguli

- **Tot ce lipseste ramane din parsare.** Descriptorul NU poate schimba
  mapping-ul note/velocity (ala vine din structura de foldere).
- Un `library.json` invalid (JSON stricat) este IGNORAT cu avertisment in log —
  nu blocheaza incarcarea librariei.
- Descriptorul e optional si **local** (nu intra in git, la fel ca libraria).

## De ce exista

Parsarea automata acopera notele + velocity-urile + acordurile. Descriptorul
exista pentru cazurile in care:
1. numele folderului nu respecta conventia "Vendor - Nume";
2. vrei un fade-out diferit pentru o librarie;
3. (viitor) adaugi loop points / articulatii care nu pot fi deduse din nume.
