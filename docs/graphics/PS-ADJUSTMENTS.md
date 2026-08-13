# Specificatii Photoshop Adjustments pentru starea "On" a butoanelor

Cand un buton e "On" (activ), aplicam un set de ajustari peste layerul din
starea "Off" ca sa simulam luminarea LED-ului dedesubt. Documentul descrie
FORMULELE EXACTE folosite in Adobe Photoshop, ca sa le pot aplica procedural
in scriptul de conversie (fara sa mai trebuiasca sa creezi layere duplicate
manual in PSD).

## Ajustari pentru layerul "fundal-buton-<nume>" cand e On

**Photoshop panel: Image > Adjustments > Brightness/Contrast**

- `brightness` = **+100** (pe scala Photoshop -150 ... +150)
- `contrast`   = **0** (neschimbat)

### Formula matematica echivalenta

Photoshop foloseste formula "legacy" cand butonul "Use Legacy" e OFF (default
in versiunile moderne). Pentru fiecare pixel RGB (fiecare canal in [0..255]):

```
factor = 1 + brightness / 150     # cand brightness > 0
output = input * factor           # daca inainte scaling
```

Adica pentru `brightness = +100`:
```
factor = 1 + 100/150 = 1.667
output = clamp(input * 1.667, 0, 255)
```

Alternativ (mai apropiat de Photoshop CS6+): un curve tonal care ridica
midtones si preserveaza highlights:
```
if input <= 127.5:
  output = input + (input / 127.5) * brightness
else:
  output = input + ((255 - input) / 127.5) * brightness
```

Pentru simplitate si viteza folosesc formula MULTIPLICATIVA din libraria
`sharp`:
```js
sharp(input).modulate({ brightness: 1 + 100/150 })  // = 1.667
```

## Ajustari pentru layerul "semn-<nume>" cand e On

**Photoshop panels:**
1. `Image > Adjustments > Brightness/Contrast`
   - `brightness` = **+70**
2. `Image > Adjustments > Vibrance`
   - `vibrance`   = **-10**
   - `saturation` = 0 (neschimbat)

### Formula matematica echivalenta

**Brightness +70:**
```
factor = 1 + 70/150 = 1.467
output = clamp(input * 1.467, 0, 255)
```

**Vibrance -10** (Vibrance in Photoshop e o saturatie inteligenta care afecteaza
mai putin culorile deja saturate si mai mult pe cele desaturate; e diferita de
Saturation clasica). Formula aproximativa:

```
per pixel HSL:
  sat_current  = pixel_saturation      # in [0..1]
  boost_factor = (1 - sat_current) ** 2    # cu cat sat e mai mica, cu atat boost e mai mare
  new_sat      = sat_current + (vibrance / 100) * boost_factor
  new_sat      = clamp(new_sat, 0, 1)
```

Pentru `vibrance = -10`:
```
new_sat = sat_current - 0.1 * (1 - sat_current) ** 2
```

In `sharp` folosim aproximatia prin `modulate({ saturation: 0.95 })` (5% mai
putin saturat), sau explicit prin HSL conversion.

## Implementare in codul de conversie

In `scripts/psd-to-svg.mjs` (sau varianta noua pentru butoane realiste), am
adaugat o functie `applyPsAdjustments(image, layerType, state)` care:

```js
async function applyPsAdjustments(sharpImage, layerType, state) {
  if (state === 'off') return sharpImage; // fara modificari

  if (layerType === 'fundal-buton') {
    // brightness: +100
    return sharpImage.modulate({ brightness: 1 + 100/150 });
  }
  if (layerType === 'semn') {
    // brightness: +70, vibrance: -10
    return sharpImage.modulate({
      brightness: 1 + 70/150,
      saturation: 0.95,          // aproximatie pentru vibrance -10
    });
  }
  return sharpImage;
}
```

## De ce e util acest fisier

- Pentru butoane viitoare, poti sa creezi in PSD DOAR layerele Off
  (`fundal-buton-<nume>` + `semn-<nume>`) fara sa mai duplicare pentru On.
- Scriptul va genera automat starea On aplicand ajustarile de mai sus.
- Rezultat: PSD mai mic, mai rapid de creat, si consistenta perfecta intre
  butoane (toate au aceeasi "luminare" fizica cand sunt On).

## Cand vrei sa OVER-RIDE aceste setari

Daca pentru un buton anume vrei alte valori (ex: LED mai puternic la Delete),
poti fie:
1. Sa creezi DUPLICATE in PSD ca pana acum (au precedenta - se folosesc as-is)
2. Sa-mi spui explicit "pentru butonul X vreau brightness +130 pe fundal"
   si adaptez scriptul.

Ordinea de prioritate in script:
1. Daca exista `fundal-buton-<nume>-on` in PSD -> foloseste direct
2. Altfel -> genereaza din `fundal-buton-<nume>-off` + brightness +100
