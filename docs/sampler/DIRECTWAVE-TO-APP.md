# Conversia DirectWave -> aplicatia noastra (fara Translator)

## Concluzia (verificata in manualul Translator Pro 2.9.0)

Chicken Systems Translator Pro v2.9.0 **NU suporta DirectWave (.dwp)** ca
format sursa — nu apare in lista de formate suportate (verificat in
`translator.chm`). Si DirectWave din FL Studio **nu poate exporta .gig**
(salveaza doar .dwp/.dwb/monolithic).

Deci lantul `.dwp -> .gig -> .exs` nu functioneaza. **Nu avem nevoie de el.**

## Drumul corect (simplu)

Samplerul nostru citeste **direct foldere cu WAV-uri** (ca libraria
Realsamples). DirectWave salveaza sample-urile ca WAV intr-un subfolder cu
acelasi nume ca .dwp-ul. Deci:

```
DirectWave -> folderul de WAV-uri -> script adaptor -> public/guitar samples/AGM - 4.1.0 (Pick)/
```

Fara Translator, fara .gig, fara .exs.

## Pasii

1. In DirectWave, salveaza programul (`Save as...`). Rezulta `Ample Guitar M.dwp`
   + un subfolder cu WAV-uri.
2. Ruleaza scriptul de inspecție ca sa vedem cum sunt denumite WAV-urile:
   `node --experimental-strip-types scripts/inspect-guitar-library.mjs <cale>`
3. Din raport, eu scriu `scripts/convert-directwave.mjs` care transforma
   folderul DirectWave in structura librariei noastre:
   `Single Notes/<N> - <Nota>/<k>_<nota>.wav` + `library.json` (pitchOffset
   daca e cazul).
4. Copiezi rezultatul in `public/guitar samples/AGM - 4.1.0 (Pick)/` si rebuild.

## Daca vrei totusi .exs (ex. pentru Logic)

Translator poate "auto-mapa" WAV-uri in EXS24 (vezi sectiunea "Single Sound
Files" din manual). Dar pentru aplicatia noastra NU e necesar.
