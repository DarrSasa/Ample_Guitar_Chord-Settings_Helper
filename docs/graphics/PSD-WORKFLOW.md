# Flux de lucru PSD -> SVG pentru butoane grafice

## Cerinte layere in PSD

Fiecare PSD trebuie sa contina EXACT 4 layere, cu nume litere-mici, cratime, fara diacritice:

- `fundal-buton-oranj-off` - fundalul cand butonul e inactiv
- `semn-<numele>-off`      - pictograma peste fundal (Off)
- `fundal-buton-oranj-on`  - fundalul cand butonul e activ / hover
- `semn-<numele>-on`       - pictograma peste fundal (On)

Semnul apare DEASUPRA fundalului (compus in aceasta ordine).

## Locatie fisiere

- PSD-uri sursa:  `docs/graphics/psd/`
- SVG generate:   `src/assets/graphics/svg/` (folosite de aplicatie)
- PNG generate:   `src/assets/graphics/png/` (backup / debug)
- Manifest:       `src/assets/graphics/manifest.json`

## Generare

Din radacina proiectului:

```bash
node scripts/psd-to-svg.mjs docs/graphics/psd/buton-delete.psd delete
```

Sau folosind scripturile npm predefinite:

```bash
npm run psd:delete
```

Scriptul:

1. Deschide PSD-ul.
2. Gaseste cele 4 layere dupa nume.
3. Compune `fundal + semn` pentru Off si On.
4. Taie zona transparenta din jur.
5. Salveaza PNG @rezolutie PSD + SVG cu PNG embedat (base64).
6. Actualizeaza `manifest.json`.

## Cablare in React

Butonul e deja cablat prin componenta `GraphicButton`. In `src/App.tsx`:

```tsx
<GraphicButton
  offSrc={graphic("delete-off")}
  onSrc={graphic("delete-on")}
  active={deleteMode}
  onClick={...}
>
  Delete   {/* fallback HTML daca lipsesc SVG-urile */}
</GraphicButton>
```

Daca SVG-urile lipsesc din `src/assets/graphics/svg/`, aplicatia foloseste
automat butonul HTML clasic din `children` - deci nu se strica nimic pana
generezi assets-urile.

## Adaugare buton nou

1. Salveaza `buton-<nume>.psd` in `docs/graphics/psd/`.
2. Adauga in `package.json`:  `"psd:<nume>": "node scripts/psd-to-svg.mjs docs/graphics/psd/buton-<nume>.psd <nume>"`
3. Ruleaza `npm run psd:<nume>`.
4. In `App.tsx`, inlocuieste butonul HTML cu `<GraphicButton offSrc={graphic("<nume>-off")} onSrc={graphic("<nume>-on")} ...>`.
